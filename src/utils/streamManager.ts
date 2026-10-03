/**
 * streamManager.ts
 *
 * 海斗tube (KaitoTube) 自前ストリーム取得アーキテクチャモジュール
 * - Proof of Work 匿名セッション認証 (guard_sid / /api/__guard/challenge / /api/__guard/verify)
 * - /api/stream/:videoId?origin=kaitotube による自前ストリーム抽出 (Ci)
 * - /api/stream/status によるリアルタイム処理待ちキュー状況取得・待ち時間算出 (eh / hc / ig)
 * - 言語・音声トラック点数評価アルゴリズム (Vo / ta)
 * - 解像度別フォーマット正規化・MediaSource/canPlayType 判定・品質マップ生成 (r0 / ks / o0 / og / rg / i0)
 * - 手動/自動生成字幕抽出 & VTT Blob URL 生成・メモリ解放 (ac / lg / ag / yo)
 * - Request Coalescing (_r Map) & 5分間キャッシュ (Bu = 5分)
 */

import { customFetch, getCustomProxyUrl, getApiSettings } from './apiClient';

export interface TrackItem {
  id?: string;
  url: string;
  src?: string;
  objectUrl?: string;
  lang?: string;
  srclang?: string;
  label?: string;
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
  isDefault?: boolean;
  default?: boolean;
  isOriginal?: boolean;
  isDrc?: boolean;
  automatic?: boolean;
  mimeType?: string;
  ext?: string;
  bitrate?: number;
}

export interface KaitoFormatSource {
  url: string;
  mimeType?: string | null;
  isM3u8?: boolean;
}

export interface KaitoQualityEntry {
  url?: string;
  mimeType?: string | null;
  isM3u8?: boolean;
  sources?: KaitoFormatSource[];
  video?: {
    url: string;
    mimeType?: string | null;
    sources?: KaitoFormatSource[];
  } | null;
  audio?: {
    url: string;
    mimeType?: string | null;
  } | null;
}

export interface KaitoDownloadGroups {
  muxed: Array<{ url: string; resolution: string; ext?: string }>;
  audio: Array<{ url: string; ext: string; language: string }>;
  video: Array<{ url: string; resolution: string; ext: string }>;
  hls: Array<{ url: string; resolution: string }>;
  subtitles: TrackItem[];
}

export interface KaitoStreamStatus {
  status: 'ok' | 'unknown';
  generatedAt: string;
  processing: {
    count: number;
    ids: string[];
    longest: { videoid?: string; durationMs?: number } | null;
  };
}

export interface StreamSourcesResult {
  videoId: string;
  title?: string;
  engine?: string;
  streams: {
    v1080?: string;
    v720?: string;
    v480?: string;
    v360?: string;
    audio?: string;
    omadaV1080?: string;
    omadaV720?: string;
    omadaV360?: string;
    omadaAudio?: string;
    invidious1080?: string;
    invidious720?: string;
    invidious360?: string;
    invidiousAudio?: string;
    direct1080?: string;
    direct720?: string;
    direct360?: string;
    directAudio?: string;
    combined720?: string;
    combined360?: string;
    ytdlp1080?: string;
    ytdlp720?: string;
    ytdlp360?: string;
    ytdlpAudio?: string;
    rawV1080?: string;
    rawV720?: string;
    rawV360?: string;
    rawAudio?: string;
    m3u8Url?: string;
  };
  qualitySources?: Record<string, KaitoQualityEntry>;
  availableQualities?: string[];
  qualityLabels?: Record<string, string>;
  defaultQuality?: string;
  hasM3u8?: boolean;
  downloadGroups?: KaitoDownloadGroups;
  audioTracks?: TrackItem[];
  subtitleTracks?: TrackItem[];
  premiereScheduled?: boolean;
  premiereExpiresAt?: number;
  errorMessage?: string;
  cachedAt?: number;
}

export const KAITOTUBE_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const GUARD_SESSION_STORAGE_KEY = 'kaito.guard.session.v1';
const GUARD_SESSION_VERSION = 1;
const GUARD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// 5分間のキャッシュ有効期限 (Bu = 5分)
export const Bu = 5 * 60 * 1000;

// 同一動画の重複リクエスト合体用 Map (_r)
const _r = new Map<string, Promise<StreamSourcesResult>>();

// メモリ内ストリームキャッシュ (Ls)
const _streamCache = new Map<string, { data: StreamSourcesResult; expiresAt: number }>();

// -------------------------------------------------------------
// 1. Pure JS SHA-256 & Proof of Work (client/src/guard/hash.js 準拠)
// -------------------------------------------------------------
const textEncoder = new TextEncoder();

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

export function sha256(input: string | Uint8Array): Uint8Array {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : new Uint8Array(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const upper = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + upper + choice + ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const lower = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (lower + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  state.forEach((value, index) => digestView.setUint32(index * 4, value));
  return digest;
}

export function hasLeadingZeroBits(bytes: Uint8Array, difficultyBits: number): boolean {
  if (!Number.isInteger(difficultyBits) || difficultyBits < 0 || difficultyBits > bytes.length * 8) {
    return false;
  }
  const wholeBytes = Math.floor(difficultyBits / 8);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== 0) return false;
  }
  const remainingBits = difficultyBits % 8;
  if (remainingBits === 0) return true;
  return (bytes[wholeBytes] & (0xff << (8 - remainingBits))) === 0;
}

export function proofMatches(nonce: string, counter: number, difficultyBits: number, version = 1): boolean {
  return hasLeadingZeroBits(sha256(`v${version}:${nonce}:${counter}`), difficultyBits);
}

// -------------------------------------------------------------
// 2. KaitoTube Guard Session 管理 (guard-session 準拠)
// -------------------------------------------------------------
interface GuardSession {
  version: number;
  sessionId: string;
  expiresAt: number;
  verifiedUntil: number;
}

let memoryGuardSession: GuardSession | null = null;
let activeChallengePromise: Promise<void> | null = null;

export function isValidGuardSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

function normalizeGuardSession(raw: any, now = Date.now()): GuardSession | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!isValidGuardSessionId(raw.sessionId)) return null;
  const expiresAt = Number(raw.expiresAt);
  const verifiedUntil = Number(raw.verifiedUntil) || 0;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return {
    version: GUARD_SESSION_VERSION,
    sessionId: raw.sessionId,
    expiresAt,
    verifiedUntil: Number.isFinite(verifiedUntil) && verifiedUntil > 0 ? verifiedUntil : 0
  };
}

export function loadGuardSession(now = Date.now()): GuardSession | null {
  if (memoryGuardSession) {
    const valid = normalizeGuardSession(memoryGuardSession, now);
    if (valid) return valid;
    memoryGuardSession = null;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(GUARD_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = normalizeGuardSession(JSON.parse(raw), now);
        if (parsed) {
          memoryGuardSession = parsed;
          return parsed;
        }
        localStorage.removeItem(GUARD_SESSION_STORAGE_KEY);
      }
    }
  } catch {}
  return null;
}

export function saveGuardSession(session: any): GuardSession | null {
  const normalized = normalizeGuardSession(session);
  if (!normalized) {
    memoryGuardSession = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(GUARD_SESSION_STORAGE_KEY);
      }
    } catch {}
    return null;
  }
  memoryGuardSession = normalized;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GUARD_SESSION_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {}
  return normalized;
}

export function acceptReturnedSession(payload: any, renew = false): GuardSession | null {
  const now = Date.now();
  if (!payload || !isValidGuardSessionId(payload.sessionId)) {
    return loadGuardSession(now);
  }
  const current = loadGuardSession(now);
  const changed = current?.sessionId !== payload.sessionId;
  const verifiedUntil = Number(payload.verifiedUntil) * 1000;
  return saveGuardSession({
    version: GUARD_SESSION_VERSION,
    sessionId: payload.sessionId,
    expiresAt: changed || renew || !current ? now + GUARD_SESSION_TTL_MS : current.expiresAt,
    verifiedUntil:
      Number.isFinite(verifiedUntil) && verifiedUntil > 0
        ? verifiedUntil
        : changed
        ? 0
        : current?.verifiedUntil || 0
  });
}

export function withGuardSession(inputUrl: string, sessionId?: string | null): string {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const url = new URL(inputUrl, baseOrigin);
  if (isValidGuardSessionId(sessionId)) {
    url.searchParams.set('guard_sid', sessionId);
  } else {
    url.searchParams.delete('guard_sid');
  }
  return `${url.pathname}${url.search}`;
}

// -------------------------------------------------------------
// 3. 自作 Cloudflare Worker & Web Worker 並列 PoW Challenge Solver
// -------------------------------------------------------------
interface GuardTransportResponse {
  status: number;
  ok: boolean;
  payload: any;
}

export interface PoWDiagnosticReport {
  ok: boolean;
  sessionId: string;
  challengeId: string;
  nonce: string;
  difficultyBits: number;
  counter: number;
  hash: string;
  solveTimeMs: number;
  totalTimeMs: number;
  usedWebWorker: boolean;
  verifiedUntil: number;
  workerEndpoint: string;
  message?: string;
}

let lastPoWDiagnostic: PoWDiagnosticReport | null = null;

export function getLastPoWDiagnostic(): PoWDiagnosticReport | null {
  return lastPoWDiagnostic;
}

export function resetPoWGuardSession(): void {
  saveGuardSession(null);
  lastPoWDiagnostic = null;
}

export function getPoWGuardSessionStatus(): {
  hasSession: boolean;
  verified: boolean;
  sessionId: string;
  verifiedUntil: number;
  expiresAt: number;
} {
  const s = loadGuardSession();
  const now = Date.now();
  return {
    hasSession: Boolean(s),
    verified: Boolean(s && s.verifiedUntil > now),
    sessionId: s?.sessionId || '',
    verifiedUntil: s?.verifiedUntil || 0,
    expiresAt: s?.expiresAt || 0
  };
}

function getPreferredGuardWorkerPaths(relativePath: string): string[] {
  const candidates: string[] = [];
  try {
    const settings = getApiSettings();
    const rawWorker = (settings.innertubeUrl || '/api/worker').trim().replace(/\/+$/, '');
    if (rawWorker.startsWith('http://') || rawWorker.startsWith('https://')) {
      candidates.push(`${rawWorker}${relativePath}`);
    }
  } catch {}
  if (relativePath.startsWith('/api/__guard/')) {
    candidates.push(`/api/worker${relativePath}`);
  }
  candidates.push(relativePath);
  return Array.from(new Set(candidates));
}

async function sendGuardTransport(targetUrl: string, signal?: AbortSignal): Promise<GuardTransportResponse> {
  const tryFetchJson = async (urlToCall: string): Promise<GuardTransportResponse> => {
    const res = await customFetch(urlToCall, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal
    });
    const text = await res.text();
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.ok === 'boolean' &&
      typeof payload.status === 'number' &&
      'data' in payload
    ) {
      return {
        status: payload.status,
        ok: payload.ok,
        payload: payload.data
      };
    }
    return {
      status: res.status || 200,
      ok: res.ok ?? (res.status >= 200 && res.status < 300),
      payload
    };
  };

  let relativePath = targetUrl;
  try {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      const u = new URL(targetUrl);
      relativePath = `${u.pathname}${u.search}`;
    }
  } catch {}

  if (relativePath.startsWith('/api/__guard/')) {
    const paths = getPreferredGuardWorkerPaths(relativePath);
    let lastResp: GuardTransportResponse | null = null;
    for (const candidate of paths) {
      try {
        const resp = await tryFetchJson(candidate);
        lastResp = resp;
        if (resp.status !== 404 && resp.payload && !resp.payload.error) {
          return resp;
        }
      } catch {}
    }
    if (lastResp) return lastResp;
  }

  return await tryFetchJson(relativePath);
}

// Inline Web Worker script for non-blocking background SHA-256 Proof of Work calculation
const POW_WEB_WORKER_SOURCE = `
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const enc = new TextEncoder();
function rotr(v, s) { return (v >>> s) | (v << (32 - s)); }
function sha256(str) {
  const bytes = enc.encode(str);
  const bitLen = bytes.length * 8;
  const padLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padLen - 4, bitLen >>> 0);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const words = new Uint32Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const x = words[i - 15], y = words[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
    for (let i = 0; i < 64; i += 1) {
      const up = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + up + ch + ROUND_CONSTANTS[i] + words[i]) >>> 0;
      const lo = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (lo + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, state[i]);
  return out;
}
function hasZeroBits(bytes, bits) {
  const whole = Math.floor(bits / 8);
  for (let i = 0; i < whole; i += 1) if (bytes[i] !== 0) return false;
  const rem = bits % 8;
  if (rem === 0) return true;
  return (bytes[whole] & (0xff << (8 - rem))) === 0;
}
function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}
self.onmessage = function(ev) {
  const { id, nonce, difficultyBits, version, expiresAt } = ev.data || {};
  const t0 = performance.now();
  const ver = version || 1;
  const diff = Number(difficultyBits) || 12;
  const prefix = 'v' + ver + ':' + nonce + ':';
  for (let counter = 0; counter <= 0x7fffffff; counter += 1) {
    if ((counter & 8191) === 0 && Date.now() >= expiresAt - 1000) {
      self.postMessage({ id, ok: false, error: 'LOCAL_CHALLENGE_EXPIRED' });
      return;
    }
    const digest = sha256(prefix + counter);
    if (hasZeroBits(digest, diff)) {
      self.postMessage({
        id,
        ok: true,
        counter,
        hash: toHex(digest),
        elapsedMs: Math.max(1, Math.round(performance.now() - t0))
      });
      return;
    }
  }
  self.postMessage({ id, ok: false, error: 'COUNTER_EXHAUSTED' });
};
`;

let powWorkerBlobUrl: string | null = null;

function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function solveChallengeCounterAsync(
  nonce: string,
  difficultyBits: number,
  version = 1,
  expiresAt = Date.now() + 60000,
  signal?: AbortSignal
): Promise<{ counter: number; hash: string; elapsedMs: number; usedWebWorker: boolean }> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // 1. Primary: Dedicated Web Worker (Off-main-thread SHA-256 PoW solver)
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      if (!powWorkerBlobUrl) {
        const blob = new Blob([POW_WEB_WORKER_SOURCE], { type: 'application/javascript' });
        powWorkerBlobUrl = URL.createObjectURL(blob);
      }
      const workerResult = await new Promise<{ counter: number; hash: string; elapsedMs: number; usedWebWorker: boolean }>(
        (resolve, reject) => {
          const worker = new Worker(powWorkerBlobUrl!);
          const jobId = Math.random().toString(36).slice(2);
          const cleanup = () => {
            try {
              worker.terminate();
            } catch {}
          };
          if (signal) {
            if (signal.aborted) {
              cleanup();
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener(
              'abort',
              () => {
                cleanup();
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          }
          worker.onmessage = (ev) => {
            const data = ev.data;
            if (!data || data.id !== jobId) return;
            cleanup();
            if (data.ok && typeof data.counter === 'number') {
              resolve({
                counter: data.counter,
                hash: data.hash || bytesToHexString(sha256(`v${version}:${nonce}:${data.counter}`)),
                elapsedMs: data.elapsedMs || 1,
                usedWebWorker: true
              });
            } else {
              reject(new Error(data.error || 'POW_WORKER_FAILED'));
            }
          };
          worker.onerror = (err) => {
            cleanup();
            reject(err);
          };
          worker.postMessage({
            id: jobId,
            nonce,
            difficultyBits,
            version,
            expiresAt
          });
        }
      );
      return workerResult;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message === 'LOCAL_CHALLENGE_EXPIRED') {
        throw err;
      }
      // Fallback to main-thread chunked solver if CSP blocks blob Worker
    }
  }

  // 2. Fallback: Main-thread non-blocking chunked SHA-256 solver
  for (let counter = 0; counter <= Number.MAX_SAFE_INTEGER; counter += 1) {
    if ((counter & 4095) === 0) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (Date.now() >= expiresAt - 1500) {
        throw new Error('LOCAL_CHALLENGE_EXPIRED');
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const digest = sha256(`v${version}:${nonce}:${counter}`);
    if (hasLeadingZeroBits(digest, difficultyBits)) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        counter,
        hash: bytesToHexString(digest),
        elapsedMs: Math.max(1, Math.round(now - t0)),
        usedWebWorker: false
      };
    }
  }
  throw new Error('COUNTER_EXHAUSTED');
}

export async function ensureGuardChallenge(signal?: AbortSignal): Promise<void> {
  if (activeChallengePromise) return activeChallengePromise;

  activeChallengePromise = (async () => {
    const overallStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const current = loadGuardSession();
      const challengeUrl = withGuardSession(`${KAITOTUBE_ORIGIN}/api/__guard/challenge`, current?.sessionId);
      const chRes = await sendGuardTransport(challengeUrl, signal);
      acceptReturnedSession(chRes.payload, true);

      if (!chRes.ok || !chRes.payload) {
        throw new Error(chRes.payload?.message || 'PoW Worker challenge fetch failed');
      }

      const ch = chRes.payload;
      const expiresAt = Number(ch.expiresAt) * 1000;
      const sessionId = loadGuardSession()?.sessionId || ch.sessionId;
      if (
        !isValidGuardSessionId(sessionId) ||
        !CHALLENGE_ID_PATTERN.test(ch.challengeId || '') ||
        typeof ch.nonce !== 'string' ||
        !ch.nonce
      ) {
        throw new Error('Invalid PoW Worker challenge payload');
      }

      const diffBits = Number(ch.difficultyBits) || 12;
      const solved = await solveChallengeCounterAsync(
        ch.nonce,
        diffBits,
        Number(ch.version) || 1,
        expiresAt,
        signal
      );

      const verifyUrl = new URL('/api/__guard/verify', KAITOTUBE_ORIGIN);
      verifyUrl.searchParams.set('guard_sid', sessionId);
      verifyUrl.searchParams.set('challenge_id', ch.challengeId);
      verifyUrl.searchParams.set('counter', String(solved.counter));

      const verRes = await sendGuardTransport(verifyUrl.toString(), signal);
      const updatedSession = acceptReturnedSession(verRes.payload);

      if (verRes.ok && verRes.payload?.ok === true) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        lastPoWDiagnostic = {
          ok: true,
          sessionId: updatedSession?.sessionId || verRes.payload.sessionId || sessionId,
          challengeId: ch.challengeId,
          nonce: ch.nonce,
          difficultyBits: diffBits,
          counter: solved.counter,
          hash: verRes.payload.hash || solved.hash,
          solveTimeMs: solved.elapsedMs,
          totalTimeMs: Math.max(1, Math.round(now - overallStart)),
          usedWebWorker: solved.usedWebWorker,
          verifiedUntil: updatedSession?.verifiedUntil || Number(verRes.payload.verifiedUntil || 0) * 1000,
          workerEndpoint: getPreferredGuardWorkerPaths('/api/__guard/verify')[0] || '/api/worker'
        };
        return;
      }
      if (verRes.payload?.code !== 'CHALLENGE_EXPIRED' || attempt === 1) {
        throw new Error(verRes.payload?.message || 'PoW Worker verification failed');
      }
    }
  })().finally(() => {
    activeChallengePromise = null;
  });

  return activeChallengePromise;
}

export async function runPoWWorkerDiagnostic(signal?: AbortSignal): Promise<PoWDiagnosticReport> {
  await ensureGuardChallenge(signal);
  if (lastPoWDiagnostic) {
    return lastPoWDiagnostic;
  }
  const st = getPoWGuardSessionStatus();
  return {
    ok: st.verified,
    sessionId: st.sessionId,
    challengeId: '',
    nonce: '',
    difficultyBits: 12,
    counter: 0,
    hash: '',
    solveTimeMs: 1,
    totalTimeMs: 1,
    usedWebWorker: true,
    verifiedUntil: st.verifiedUntil,
    workerEndpoint: '/api/worker'
  };
}

export async function guardedStreamGet(
  apiPath: string,
  query: Record<string, string | undefined> = {},
  signal?: AbortSignal
): Promise<any> {
  // Proactively run Worker PoW authentication if no verified session exists yet
  const existing = loadGuardSession();
  if (!existing || !existing.verifiedUntil || existing.verifiedUntil <= Date.now()) {
    try {
      await ensureGuardChallenge(signal);
    } catch {}
  }

  const buildUrl = () => {
    const u = new URL(apiPath, KAITOTUBE_ORIGIN);
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        u.searchParams.set(k, v);
      }
    });
    return withGuardSession(u.toString(), loadGuardSession()?.sessionId);
  };

  let res = await sendGuardTransport(buildUrl(), signal);
  acceptReturnedSession(res.payload);

  if (res.payload?.code === 'CHALLENGE_REQUIRED') {
    await ensureGuardChallenge(signal);
    res = await sendGuardTransport(buildUrl(), signal);
    acceptReturnedSession(res.payload);
  }

  if (!res.ok) {
    const err: any = new Error(
      res.payload?.message || res.payload?.reason || res.payload?.error || `Stream HTTP ${res.status}`
    );
    err.status = res.status;
    err.code = res.payload?.code || res.payload?.error || 'HTTP_ERROR';
    err.payload = res.payload;
    throw err;
  }

  return res.payload;
}

// -------------------------------------------------------------
// 4. サーバー処理待ち状況取得 (eh / hc / ig 準拠)
// -------------------------------------------------------------
const DEFAULT_WAIT_STEP_MS = 5000;

export function normalizeStreamStatus(raw: any): KaitoStreamStatus {
  const proc = raw?.processing;
  const ids = Array.isArray(proc?.ids) ? proc.ids.filter((id: any) => typeof id === 'string' && id) : [];
  const countNum = Number(proc?.count);
  return {
    status: raw?.status === 'ok' ? 'ok' : 'unknown',
    generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : '',
    processing: {
      count: Number.isFinite(countNum) && countNum >= 0 ? Math.max(Math.floor(countNum), ids.length) : ids.length,
      ids,
      longest: proc?.longest && typeof proc.longest === 'object' ? proc.longest : null
    }
  };
}

export function estimateStreamWaitMs(statusObj: KaitoStreamStatus | null, videoId: string, elapsedMs = 0): number {
  if (!statusObj) return DEFAULT_WAIT_STEP_MS;
  const { count, ids, longest } = statusObj.processing;
  const idx = ids.indexOf(videoId);
  if (count === 0) return DEFAULT_WAIT_STEP_MS;
  const dur = Number(longest?.durationMs);
  const offset =
    (ids.length === 0 || !longest?.videoid || longest.videoid === ids[0]) && Number.isFinite(dur)
      ? Math.max(0, dur) + Math.max(0, elapsedMs)
      : 0;
  const base = Math.max(0, DEFAULT_WAIT_STEP_MS - offset);
  return idx >= 0 ? base + idx * DEFAULT_WAIT_STEP_MS : base + count * DEFAULT_WAIT_STEP_MS;
}

export async function fetchStreamStatus(signal?: AbortSignal): Promise<KaitoStreamStatus> {
  try {
    const res = await customFetch('/api/stream/status', { signal });
    if (res.ok) {
      const raw = await res.json();
      return normalizeStreamStatus(raw);
    }
  } catch {}
  return normalizeStreamStatus({ status: 'ok', generatedAt: new Date().toISOString(), processing: { count: 0, ids: [], longest: null } });
}

// -------------------------------------------------------------
// 5. 自前ストリームレスポンス解析 (Vo / ta / o0 / ks / r0 / og / rg / ac / i0 準拠)
// -------------------------------------------------------------
function normalizeLangCode(code?: string): string {
  return String(code || 'ja').replace('_', '-').toLowerCase();
}

function isSameLanguage(a?: string, b?: string): boolean {
  const na = normalizeLangCode(a);
  const nb = normalizeLangCode(b);
  return na === nb || na.split('-')[0] === nb.split('-')[0];
}

function scoreLanguageEntry(
  entry: { key: string; value: any },
  browserLang = 'ja',
  preferredLangKey = ''
): number {
  const langObj = entry?.value?.language || {};
  const code = entry?.key || langObj.code || '';
  let score = Number(langObj.preference) || 0;
  if (preferredLangKey && isSameLanguage(code, preferredLangKey)) score += 2000;
  if (langObj.isDefault) score += 1000;
  if (langObj.isOriginal) score += 900;
  if (isSameLanguage(code, browserLang)) score += 700;
  if (isSameLanguage(code, 'ja')) score += 500;
  if (code === 'und') score += 100;
  if (langObj.isDrc) score -= 20;
  return score;
}

function selectBestLanguageGroup(
  byLanguageMap: Record<string, any> | undefined,
  browserLang = 'ja',
  preferredLangKey = ''
): { key: string; value: any } | null {
  if (!byLanguageMap || typeof byLanguageMap !== 'object') return null;
  const entries = Object.entries(byLanguageMap).map(([key, value]) => ({ key, value }));
  entries.sort((a, b) => scoreLanguageEntry(b, browserLang, preferredLangKey) - scoreLanguageEntry(a, browserLang, preferredLangKey));
  return entries[0] || null;
}

function buildFormatMimeType(fmt: any, hasVideo: boolean, hasAudio: boolean, isM3u8: boolean): string {
  if (isM3u8) return 'application/vnd.apple.mpegurl';
  const ext = String(fmt?.ext || fmt?.videoExt || fmt?.audioExt || '').toLowerCase();
  let base: string;
  if (hasVideo) {
    base = ext === 'webm' ? 'video/webm' : 'video/mp4';
  } else if (ext === 'webm') {
    base = 'audio/webm';
  } else if (ext === 'mp3') {
    base = 'audio/mpeg';
  } else if (ext === 'aac') {
    base = 'audio/aac';
  } else {
    base = 'audio/mp4';
  }
  const codecs: string[] = [];
  if (hasVideo && fmt?.vcodec && fmt.vcodec !== 'none') codecs.push(fmt.vcodec);
  if (hasAudio && fmt?.acodec && fmt.acodec !== 'none') codecs.push(fmt.acodec);
  return codecs.length ? `${base}; codecs="${codecs.join(', ')}"` : base;
}

function normalizeStreamFormat(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const url = raw.streamUrl || raw.url || '';
  if (!url || raw.hasDrm) return null;
  const isM3u8 = Boolean(raw.isM3u8 || String(raw.protocol || '').startsWith('m3u8'));
  const hasVideo =
    raw.mediaType !== 'audio_only' &&
    Boolean((raw.vcodec && raw.vcodec !== 'none') || raw.width || raw.height);
  const hasAudio =
    raw.mediaType !== 'video_only' &&
    Boolean((raw.acodec && raw.acodec !== 'none') || raw.mediaType === 'muxed' || isM3u8);
  return {
    ...raw,
    url,
    itag: raw.formatId || raw.itag || '',
    hasVideo,
    hasAudio,
    isM3u8,
    resolution: raw.resolution || (raw.height ? `0x${raw.height}` : 'audio only'),
    mimeType: buildFormatMimeType(raw, hasVideo, hasAudio, isM3u8)
  };
}

function dedupeByUrl<T extends { url?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function extractStreamFormats(payload: any, browserLang = 'ja'): any[] {
  const bestAudioGroup = selectBestLanguageGroup(payload?.streams?.audioByLanguage, browserLang);
  const bestAudioKey = bestAudioGroup?.key || '';
  const bestM3u8Group = selectBestLanguageGroup(payload?.m3u8?.byLanguage, browserLang, bestAudioKey);
  const m3u8FromLang = Array.isArray(bestM3u8Group?.value?.streams) ? bestM3u8Group.value.streams : [];
  const m3u8List = m3u8FromLang.length
    ? m3u8FromLang
    : Array.isArray(payload?.m3u8?.list)
    ? payload.m3u8.list
    : [];

  const muxed = Array.isArray(payload?.streams?.muxed) ? payload.streams.muxed : [];
  const videoOnly = Array.isArray(payload?.streams?.videoOnly) ? payload.streams.videoOnly : [];
  const audioStreams = Array.isArray(bestAudioGroup?.value?.streams) ? bestAudioGroup.value.streams : [];

  const combined = [...muxed, ...videoOnly, ...audioStreams, ...m3u8List]
    .map(normalizeStreamFormat)
    .filter(Boolean);
  return dedupeByUrl(combined);
}

function parseResolutionLabel(fmt: any): string {
  // Handle vertical Shorts (e.g. 1080x1920 where formatNote is "1080p" or resolution is "1080x1920")
  if (typeof fmt?.formatNote === 'string' && /^\d{3,4}p/.test(fmt.formatNote.trim())) {
    const m = fmt.formatNote.trim().match(/^(\d{3,4}p)/);
    if (m) return m[1];
  }
  const res = typeof fmt === 'string' ? fmt : String(fmt?.resolution || '');
  const trimmed = res.trim();
  if (!trimmed) return 'unknown';
  if (trimmed === 'audio only') return 'audio';
  const match = trimmed.match(/(\d+)\s*[xX]\s*(\d+)/);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    // For vertical videos (w < h, e.g., 1080x1920 -> 1080p, 720x1280 -> 720p, 360x640 -> 360p)
    const shortSide = Math.min(w, h);
    if (w < h && [144, 240, 360, 480, 720, 1080, 1440, 2160].includes(shortSide)) {
      return `${shortSide}p`;
    }
    return `${h}p`;
  }
  return trimmed;
}

function canBrowserPlayFormat(fmt: any): string {
  if (typeof document === 'undefined') return 'probably';
  try {
    if (fmt.isM3u8) {
      const v = document.createElement('video');
      return v.canPlayType('application/vnd.apple.mpegurl') || v.canPlayType('application/x-mpegURL') || 'probably';
    }
    const mime = fmt.mimeType;
    if (!mime) return 'maybe';
    if (typeof window !== 'undefined' && window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
      if (window.MediaSource.isTypeSupported(mime)) return 'probably';
    }
    const el = document.createElement(fmt.hasVideo === false ? 'audio' : 'video');
    const support = el.canPlayType(mime);
    if (
      support === 'maybe' &&
      typeof navigator !== 'undefined' &&
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
      mime.includes('av01')
    ) {
      return '';
    }
    return support || 'maybe';
  } catch {
    return 'maybe';
  }
}

function sortVideoFormatsByPreference(formats: any[], preferredExts = ['mp4', 'webm']): any[] {
  if (!Array.isArray(formats) || formats.length === 0) return [];
  const scored = formats.map((fmt) => {
    const ext = String(fmt.ext || '').toLowerCase();
    const extRank = preferredExts.indexOf(ext);
    const isAvc1 = String(fmt.vcodec || '').startsWith('avc1') ? 1 : 0;
    const supportScore = fmt._supportLevel === 'probably' ? 2 : fmt._supportLevel === 'maybe' ? 1 : 0;
    return {
      fmt,
      rank: extRank === -1 ? preferredExts.length : extRank,
      isAvc1,
      itag: parseInt(String(fmt.itag || '0'), 10) || 0,
      supportScore
    };
  });
  scored.sort((a, b) => {
    if (a.supportScore !== b.supportScore) return b.supportScore - a.supportScore;
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.isAvc1 !== b.isAvc1) return b.isAvc1 - a.isAvc1;
    return b.itag - a.itag;
  });
  return scored.map((s) => s.fmt);
}

function selectBestAudioFormatForHeight(audioFormats: any[], height: number): any | null {
  if (!Array.isArray(audioFormats) || audioFormats.length === 0) return null;
  // Prioritize itag=140 (129kbps M4A AAC-LC mp4a.40.2) for all HD/FHD heights (do not use minItag=141 which excludes itag=140!)
  const minItag = height >= 720 ? 140 : 139;
  const filtered = audioFormats.filter((f) => {
    const numItag = parseInt(String(f.itag || f.formatId || '0'), 10) || 0;
    return numItag >= minItag;
  });
  const pool = filtered.length > 0 ? filtered : audioFormats;
  const extOrder: Record<string, number> = { m4a: 0, mp4: 0, aac: 1, webm: 2, mp3: 3 };
  const scored = pool.map((fmt) => {
    const ext = String(fmt.ext || '').toLowerCase();
    const rawId = String(fmt.formatId || fmt.itag || '');
    const numItag = parseInt(rawId, 10) || 0;
    const isDrc = Boolean(fmt?.language?.isDrc || rawId.includes('drc'));
    const isAacLc140 = numItag === 140 || String(fmt.acodec || '').includes('mp4a.40.2');
    const bitrate = Number(fmt.abr || fmt.tbr || 0) || 0;
    return {
      fmt,
      isDrc: isDrc ? 1 : 0,
      isAacLc140: isAacLc140 ? 1 : 0,
      bitrate,
      itag: numItag,
      extRank: extOrder[ext] ?? 4,
      supportScore: fmt._supportLevel === 'probably' ? 2 : fmt._supportLevel === 'maybe' ? 1 : 0
    };
  });
  scored.sort((a, b) => {
    if (a.isDrc !== b.isDrc) return a.isDrc - b.isDrc;
    if (a.isAacLc140 !== b.isAacLc140) return b.isAacLc140 - a.isAacLc140;
    if (a.extRank !== b.extRank) return a.extRank - b.extRank;
    if (a.supportScore !== b.supportScore) return b.supportScore - a.supportScore;
    if (Math.abs(b.bitrate - a.bitrate) > 5) return b.bitrate - a.bitrate;
    return b.itag - a.itag;
  });
  return scored[0]?.fmt || null;
}

function sortQualityKeysDesc(keys: string[]): string[] {
  const toNum = (k: string) => {
    const m = k.replace(/_\d+$/, '').match(/^(\d+)p$/);
    return m ? parseInt(m[1], 10) : -1;
  };
  return keys.slice().sort((a, b) => {
    const na = toNum(a);
    const nb = toNum(b);
    if (na !== nb) return nb - na;
    return a.localeCompare(b);
  });
}

export function buildQualitySourcesMap(formats: any[]): {
  sources: Record<string, KaitoQualityEntry>;
  availableQualities: string[];
  qualityLabels: Record<string, string>;
  defaultQuality: string;
  hasM3u8: boolean;
} {
  const supported = (Array.isArray(formats) ? formats : []).reduce((acc: any[], fmt) => {
    const level = canBrowserPlayFormat(fmt);
    if (level === 'probably' || level === 'maybe') {
      fmt._supportLevel = level;
      acc.push(fmt);
    }
    return acc;
  }, []);

  const byResolution: Record<string, any[]> = {};
  for (const fmt of supported) {
    if (!fmt?.url) continue;
    const label = parseResolutionLabel(fmt);
    if (!byResolution[label]) byResolution[label] = [];
    byResolution[label].push(fmt);
  }

  const allAudioOnly = supported.filter((f) => !f.hasVideo && f.hasAudio);
  const sources: Record<string, KaitoQualityEntry> = {};
  const qualityLabels: Record<string, string> = {};
  let hasM3u8 = false;

  for (const [resKey, list] of Object.entries(byResolution)) {
    const muxedList = sortVideoFormatsByPreference(
      list.filter((f) => f.hasVideo && f.hasAudio),
      ['mp4', 'webm']
    );
    if (muxedList.length > 0) {
      const mapped = muxedList.map((m) => {
        if (m.isM3u8) hasM3u8 = true;
        return { url: m.url, mimeType: m.mimeType, isM3u8: Boolean(m.isM3u8) };
      });
      sources[resKey] = {
        url: mapped[0].url,
        mimeType: mapped[0].mimeType,
        isM3u8: mapped[0].isM3u8,
        sources: mapped
      };
      qualityLabels[resKey] = resKey === 'audio' ? 'Audio (音声のみ)' : resKey;
      continue;
    }

    const videoOnlyList = sortVideoFormatsByPreference(
      list.filter((f) => f.hasVideo && !f.hasAudio),
      ['mp4', 'webm']
    );
    let audioCandidates = list.filter((f) => !f.hasVideo && f.hasAudio);
    if (audioCandidates.length === 0) audioCandidates = allAudioOnly;

    const heightNum = parseInt(resKey.replace('p', ''), 10) || 0;
    const bestVideo = videoOnlyList[0] || null;
    const bestAudio = selectBestAudioFormatForHeight(audioCandidates, heightNum);

    if (bestVideo || bestAudio) {
      if (bestVideo && !bestAudio) {
        const isM3u8 = Boolean(bestVideo.isM3u8);
        if (isM3u8) hasM3u8 = true;
        sources[resKey] = {
          url: bestVideo.url,
          mimeType: bestVideo.mimeType,
          isM3u8,
          sources: videoOnlyList.map((v) => ({
            url: v.url,
            mimeType: v.mimeType,
            isM3u8: Boolean(v.isM3u8)
          }))
        };
        qualityLabels[resKey] = resKey === 'audio' ? 'Audio (音声のみ)' : resKey;
        continue;
      }

      const entry: KaitoQualityEntry = {};
      if (bestVideo) {
        if (bestVideo.isM3u8) hasM3u8 = true;
        entry.video = {
          url: bestVideo.url,
          mimeType: bestVideo.mimeType,
          sources: videoOnlyList.map((v) => ({
            url: v.url,
            mimeType: v.mimeType,
            isM3u8: Boolean(v.isM3u8)
          }))
        };
      }
      if (bestAudio) {
        if (bestAudio.isM3u8) hasM3u8 = true;
        entry.audio = {
          url: bestAudio.url,
          mimeType: bestAudio.mimeType
        };
      }
      sources[resKey] = entry;
      qualityLabels[resKey] = resKey === 'audio' ? 'Audio (音声のみ)' : resKey;
    }
  }

  const availableQualities = sortQualityKeysDesc(Object.keys(sources));
  const muxedQualities = availableQualities.filter((k) => Boolean(sources[k]?.url));
  const defaultQuality = muxedQualities[0]
    ? muxedQualities[0]
    : availableQualities.includes('1080p')
    ? '1080p'
    : availableQualities[0] || '';

  return {
    sources,
    availableQualities,
    qualityLabels,
    defaultQuality,
    hasM3u8
  };
}

export function extractStreamSubtitles(payload: any, browserLang = 'ja'): TrackItem[] {
  const parseTrackEntry = (entry: { key: string; value: any }, automatic: boolean): TrackItem | null => {
    const captions = Array.isArray(entry?.value?.captions) ? entry.value.captions : [];
    const vtt = captions.find((c: any) => c?.ext === 'vtt' && c.url);
    if (!vtt || entry.key === 'live_chat') return null;
    const langObj = entry?.value?.language || vtt.language || {};
    const code = langObj.code || entry.key || 'ja';
    const label = `${langObj.name || vtt.name || entry.key}${automatic ? '（自動生成）' : ''}`;
    return {
      id: `sub-${code}-${automatic ? 'auto' : 'manual'}`,
      url: vtt.url,
      src: vtt.url,
      lang: code,
      srclang: code,
      label,
      kind: 'subtitles',
      isDefault: isSameLanguage(code, 'ja'),
      default: isSameLanguage(code, 'ja'),
      automatic
    };
  };

  const manualEntries = Object.entries(payload?.subtitles?.manualByLanguage || {}).map(([key, value]) => ({
    key,
    value
  }));
  const autoEntries = Object.entries(payload?.subtitles?.automaticByLanguage || {}).map(([key, value]) => ({
    key,
    value
  }));

  const manualTracks = manualEntries.map((e) => parseTrackEntry(e, false)).filter(Boolean) as TrackItem[];
  const seenLangs = new Set(manualTracks.map((t) => normalizeLangCode(t.srclang || t.lang)));

  autoEntries.sort((a, b) => scoreLanguageEntry(b, browserLang) - scoreLanguageEntry(a, browserLang));
  const autoTracks = autoEntries
    .map((e) => parseTrackEntry(e, true))
    .filter((t): t is TrackItem => {
      if (!t) return false;
      const norm = normalizeLangCode(t.srclang || t.lang);
      if (seenLangs.has(norm)) return false;
      seenLangs.add(norm);
      return true;
    })
    .slice(0, 5);

  return [...manualTracks, ...autoTracks];
}

export function extractStreamDownloadGroups(payload: any, browserLang = 'ja'): KaitoDownloadGroups {
  const muxedRaw: any[] = dedupeByUrl(
    (Array.isArray(payload?.streams?.muxed) ? payload.streams.muxed : [])
      .map(normalizeStreamFormat)
      .filter(Boolean)
  );
  const muxed360 = muxedRaw.filter((v: any) => Number(v.height) === 360 || v.formatNote === '360p');
  const muxed = (muxed360.length ? muxed360 : muxedRaw).map((v: any) => ({
    url: v.url,
    resolution: v.formatNote || v.resolution || '360p',
    ext: v.ext || 'mp4'
  }));

  const audioRaw: any[] = dedupeByUrl(
    Object.values(payload?.streams?.audioByLanguage || {})
      .flatMap((g: any) => (Array.isArray(g?.streams) ? g.streams : []))
      .map(normalizeStreamFormat)
      .filter(Boolean)
  );
  // Sort audioRaw so non-DRC itag=140 (M4A AAC-LC) comes first before low-bitrate 139 or DRC tracks
  audioRaw.sort((a: any, b: any) => {
    const aId = String(a.formatId || a.itag || '');
    const bId = String(b.formatId || b.itag || '');
    const aDrc = Boolean(a?.language?.isDrc || aId.includes('drc')) ? 1 : 0;
    const bDrc = Boolean(b?.language?.isDrc || bId.includes('drc')) ? 1 : 0;
    if (aDrc !== bDrc) return aDrc - bDrc;
    const a140 = aId === '140' || String(a.acodec || '').includes('mp4a.40.2') ? 1 : 0;
    const b140 = bId === '140' || String(b.acodec || '').includes('mp4a.40.2') ? 1 : 0;
    if (a140 !== b140) return b140 - a140;
    const aM4a = a.ext === 'm4a' || a.ext === 'mp4' ? 1 : 0;
    const bM4a = b.ext === 'm4a' || b.ext === 'mp4' ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (Number(b.abr || b.tbr || 0) || 0) - (Number(a.abr || a.tbr || 0) || 0);
  });
  const audio = audioRaw.map((a: any) => ({
    ext: a.ext || 'm4a',
    url: a.url,
    language: a?.language?.name || ''
  }));

  const videoRaw: any[] = dedupeByUrl(
    (Array.isArray(payload?.streams?.videoOnly) ? payload.streams.videoOnly : [])
      .map(normalizeStreamFormat)
      .filter(Boolean)
  );
  const video = videoRaw.map((v: any) => ({
    resolution: v.formatNote || v.resolution || '',
    ext: v.ext || 'mp4',
    url: v.url
  }));

  const hlsRaw: any[] = dedupeByUrl(
    (Array.isArray(payload?.m3u8?.list) ? payload.m3u8.list : [])
      .map(normalizeStreamFormat)
      .filter(Boolean)
  );
  const hls = hlsRaw.map((h: any) => ({
    url: h.url,
    resolution: h.formatNote || h.resolution || 'HLS'
  }));

  const subtitles = extractStreamSubtitles(payload, browserLang);
  return { muxed, audio, video, hls, subtitles };
}

export function parseStructuredStreamPayload(videoId: string, payload: any): StreamSourcesResult | null {
  if (!payload || typeof payload !== 'object') return null;

  const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'ja';
  const formats = extractStreamFormats(payload, browserLang);
  const qualityMap = buildQualitySourcesMap(formats);
  const subtitleTracks = extractStreamSubtitles(payload, browserLang);
  const downloadGroups = extractStreamDownloadGroups(payload, browserLang);

  const src = qualityMap.sources;
  const rawStreams = payload.streams || {};
  const v1080 =
    src['1080p']?.video?.url ||
    src['1080p']?.url ||
    rawStreams.v1080 ||
    src['720p']?.video?.url ||
    src['720p']?.url ||
    src['480p']?.video?.url ||
    src['360p']?.url;
  const v720 =
    src['720p']?.video?.url ||
    src['720p']?.url ||
    rawStreams.v720 ||
    src['480p']?.video?.url ||
    src['360p']?.url ||
    v1080;
  const v480 = src['480p']?.video?.url || src['480p']?.url || rawStreams.v480 || src['360p']?.url;
  const combined360 =
    src['360p']?.url ||
    downloadGroups.muxed[0]?.url ||
    rawStreams.combined360 ||
    rawStreams.v360 ||
    src['360p']?.video?.url ||
    v720;
  const combined720 = src['720p']?.url || rawStreams.combined720 || undefined;
  const bestAudio =
    src['1080p']?.audio?.url ||
    src['720p']?.audio?.url ||
    src['480p']?.audio?.url ||
    src['audio']?.audio?.url ||
    src['audio']?.url ||
    downloadGroups.audio.find((a) => a.ext === 'm4a' || a.ext === 'mp4')?.url ||
    downloadGroups.audio[0]?.url ||
    rawStreams.audio ||
    combined360;
  const m3u8Url = downloadGroups.hls[0]?.url || rawStreams.m3u8Url || undefined;

  if (!combined360 && !v1080 && !v720 && !bestAudio && !m3u8Url) {
    return null;
  }

  const audioTracks: TrackItem[] = downloadGroups.audio.map((a, idx) => ({
    id: `audio-kaito-${idx}`,
    url: a.url,
    lang: 'ja',
    label: `${a.language ? `${a.language} ` : ''}高音質音声 (${a.ext.toUpperCase()})`,
    ext: a.ext,
    isDefault: idx === 0,
    isOriginal: idx === 0
  }));

  return {
    videoId,
    title: payload.title || `video-${videoId}`,
    engine: payload.engine || 'kaitotube-self',
    streams: {
      v1080: v1080 || v720 || combined360,
      v720: v720 || combined360,
      v480: v480 || combined360,
      v360: combined360,
      audio: bestAudio,
      combined720,
      combined360,
      omadaV1080: rawStreams.omadaV1080 || v1080 || v720 || combined360,
      omadaV720: rawStreams.omadaV720 || v720 || combined360,
      omadaV360: rawStreams.omadaV360 || combined360,
      omadaAudio: rawStreams.omadaAudio || bestAudio,
      invidious1080: v1080,
      invidious720: v720,
      invidious360: combined360,
      invidiousAudio: bestAudio,
      direct1080: `/api/youtube/stream-direct/${videoId}?quality=1080`,
      direct720: `/api/youtube/stream-direct/${videoId}?quality=720`,
      direct360: `/api/youtube/stream-direct/${videoId}?quality=360`,
      directAudio: `/api/youtube/stream-direct/${videoId}?quality=audio`,
      ytdlp1080: `/api/youtube/stream-ytdlp/${videoId}?quality=1080`,
      ytdlp720: `/api/youtube/stream-ytdlp/${videoId}?quality=720`,
      ytdlp360: `/api/youtube/stream-ytdlp/${videoId}?quality=360`,
      ytdlpAudio: `/api/youtube/stream-ytdlp/${videoId}?quality=audio`,
      rawV1080: rawStreams.rawV1080 || v1080,
      rawV720: rawStreams.rawV720 || v720,
      rawV360: rawStreams.rawV360 || combined360,
      rawAudio: rawStreams.rawAudio || bestAudio,
      m3u8Url
    },
    qualitySources: qualityMap.sources,
    availableQualities: qualityMap.availableQualities,
    qualityLabels: qualityMap.qualityLabels,
    defaultQuality: qualityMap.defaultQuality,
    hasM3u8: qualityMap.hasM3u8,
    downloadGroups,
    audioTracks,
    subtitleTracks,
    cachedAt: Date.now()
  };
}

/**
 * 自前ストリーム API (/api/stream/:id?origin=kaitotube) からストリーム一式を取得して StreamSourcesResult に変換
 */
export async function fetchSelfStreamDirect(
  videoId: string,
  signal?: AbortSignal
): Promise<StreamSourcesResult | null> {
  const payload = await guardedStreamGet(
    `/api/stream/${encodeURIComponent(videoId)}`,
    { origin: 'kaitotube' },
    signal
  );
  return parseStructuredStreamPayload(videoId, payload);
}

/**
 * 定期的に期限切れキャッシュを自動クリーンアップ
 */
function cleanupExpiredCache() {
  const now = Date.now();
  for (const [key, item] of _streamCache.entries()) {
    if (item.expiresAt <= now) {
      _streamCache.delete(key);
    }
  }
}

export function clearClientStreamCache(): number {
  const count = _streamCache.size;
  _streamCache.clear();
  _r.clear();
  return count;
}

export function getCachedStreamSources(videoId: string): StreamSourcesResult | null {
  if (!videoId) return null;
  const cached = _streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

export function prefetchStreamSources(videoId: string): void {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
  const cached = _streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return;
  if (_r.has(videoId)) return;
  fetchStreamSourcesCoalesced(videoId).catch(() => {});
}

if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredCache, 60 * 1000);
  window.addEventListener('kaito_settings_changed', () => {
    clearClientStreamCache();
  });
  window.addEventListener('kaito_custom_proxy_changed', () => {
    clearClientStreamCache();
  });
  // Pre-warm PoW Guard Session in background immediately on app load so first stream request has 0ms PoW wait
  const existingSession = loadGuardSession();
  if (!existingSession || !existingSession.verifiedUntil || existingSession.verifiedUntil <= Date.now()) {
    setTimeout(() => {
      ensureGuardChallenge().catch(() => {});
    }, 10);
  }
}

/**
 * googlevideo.com の URL を https://yt.omada.cafe/videoplayback?...&host=rr...googlevideo.com に変換
 */
export function toOmadaLocalUrl(rawUrl: string | undefined, instanceBase = 'https://yt.omada.cafe'): string | undefined {
  if (!rawUrl) return undefined;
  const cleanInst = (instanceBase || 'https://yt.omada.cafe').replace(/\/+$/, '');
  try {
    if (rawUrl.startsWith('/')) {
      return `${cleanInst}${rawUrl}`;
    }
    const parsed = new URL(rawUrl);
    if (parsed.hostname.endsWith('.googlevideo.com')) {
      parsed.searchParams.set('host', parsed.host);
      return `${cleanInst}/videoplayback?${parsed.searchParams.toString()}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function toRawGoogleVideoUrlClient(urlStr: string | undefined): string | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr, 'https://yt.omada.cafe');
    if (parsed.hostname.endsWith('.googlevideo.com')) {
      return parsed.toString();
    }
    const hostParam = parsed.searchParams.get('host');
    if (hostParam && hostParam.endsWith('.googlevideo.com')) {
      const copy = new URL(parsed.toString());
      copy.searchParams.delete('host');
      return `https://${hostParam}/videoplayback?${copy.searchParams.toString()}`;
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

/**
 * 補助フォールバック: yt.omada.cafe から取得
 */
async function fetchOmadaDirectFromBrowser(videoId: string): Promise<StreamSourcesResult | null> {
  const omadaBase = 'https://yt.omada.cafe';
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(`${omadaBase}/api/v1/videos/${encodeURIComponent(videoId)}?local=true`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(tid);
    if (!res.ok) return null;

    const data = await res.json();
    const formatStreams: any[] = Array.isArray(data?.formatStreams) ? data.formatStreams : [];
    const adaptiveFormats: any[] = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
    if (formatStreams.length === 0 && adaptiveFormats.length === 0) return null;

    const rawComb360 =
      formatStreams.find((f) => String(f.itag) === '18')?.url ||
      formatStreams.find((f) => f.resolution === '360p' || f.qualityLabel === '360p')?.url ||
      formatStreams[0]?.url;
    const rawComb720 =
      formatStreams.find((f) => String(f.itag) === '22')?.url ||
      formatStreams.find((f) => f.resolution === '720p' || f.qualityLabel === '720p')?.url;
    const raw1080 =
      adaptiveFormats.find((f) => String(f.itag) === '137' || String(f.itag) === '299')?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '1080p' || String(f.qualityLabel || '').startsWith('1080p')) &&
          String(f.type || '').includes('video/mp4')
      )?.url;
    const raw720 =
      rawComb720 ||
      adaptiveFormats.find((f) => String(f.itag) === '136' || String(f.itag) === '298')?.url ||
      adaptiveFormats.find(
        (f) =>
          (f.resolution === '720p' || String(f.qualityLabel || '').startsWith('720p')) &&
          String(f.type || '').includes('video/mp4')
      )?.url;
    const rawAud =
      adaptiveFormats.find((f) => String(f.itag) === '140')?.url ||
      adaptiveFormats.find((f) => String(f.type || '').includes('audio/mp4'))?.url ||
      adaptiveFormats.find((f) => String(f.type || '').includes('audio'))?.url;

    const omadaV360 = toOmadaLocalUrl(rawComb360, omadaBase);
    const omadaV720 = toOmadaLocalUrl(raw720 || rawComb360, omadaBase);
    const omadaV1080 = toOmadaLocalUrl(raw1080 || raw720 || rawComb360, omadaBase);
    const omadaAudio = toOmadaLocalUrl(rawAud || rawComb360, omadaBase);

    if (omadaV360 || omadaV1080 || omadaAudio) {
      return {
        videoId,
        title: data?.title || `video-${videoId}`,
        engine: 'yt.omada.cafe',
        streams: {
          v1080: omadaV1080,
          v720: omadaV720,
          v360: omadaV360,
          audio: omadaAudio,
          combined720: toOmadaLocalUrl(rawComb720, omadaBase) || undefined,
          combined360: omadaV360,
          omadaV1080,
          omadaV720,
          omadaV360,
          omadaAudio,
          invidious1080: omadaV1080,
          invidious720: omadaV720,
          invidious360: omadaV360,
          invidiousAudio: omadaAudio
        },
        audioTracks: omadaAudio
          ? [
              {
                id: 'audio-omada-140',
                url: omadaAudio,
                lang: 'ja',
                label: '高音質 AAC音声 (yt.omada.cafe)',
                isDefault: true,
                isOriginal: true
              }
            ]
          : [],
        subtitleTracks: Array.isArray(data?.captions)
          ? data.captions.map((c: any, idx: number) => ({
              id: `sub-${c.languageCode || idx}`,
              url: String(c.url || '').startsWith('http') ? c.url : `${omadaBase}${c.url}`,
              src: String(c.url || '').startsWith('http') ? c.url : `${omadaBase}${c.url}`,
              lang: c.languageCode || 'ja',
              srclang: c.languageCode || 'ja',
              label: c.label || c.languageCode || '字幕',
              isDefault: c.languageCode === 'ja'
            }))
          : []
      };
    }
  } catch {}
  return null;
}

export function isPlayableFromAnyIp(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/api/')) return true;
  if (url.includes('yt.omada.cafe/videoplayback') || url.includes('yt.omada.cafe/latest_version')) return true;
  if (url.includes('.googlevideo.com/videoplayback')) {
    return url.includes('ipbypass=yes') || url.includes('ipbypass%3Dyes');
  }
  return true;
}

/**
 * fetchStreamSourcesCoalesced (自前ストリームエンジン)
 * 重複リクエストを合体 (_r Map) し、5分間キャッシュ (Bu) を利用してストリームを取得
 * 1. Primary: 自作サーバー / GAS /api/youtube/stream-sources/:id および /api/stream/:id
 * 2. Secondary: ブラウザ直接 yt.omada.cafe (?local=true HTTP 206 local proxy)
 */
function mergeStreamSourcesResults(
  videoId: string,
  selfStructuredRes: StreamSourcesResult | null,
  omadaDirect: StreamSourcesResult | null,
  serverRes: StreamSourcesResult | null,
  selfStreamErr: any
): { data: StreamSourcesResult; hasValidStream: boolean } {
  const selfStreams = selfStructuredRes?.streams || {};
  const srvStreams = serverRes?.streams || {};
  const omaStreams = omadaDirect?.streams || {};

  const bestOmadaV1080 = omaStreams.omadaV1080 || srvStreams.omadaV1080 || selfStreams.omadaV1080;
  const bestOmadaV720 = omaStreams.omadaV720 || srvStreams.omadaV720 || selfStreams.omadaV720;
  const bestOmadaV360 = omaStreams.omadaV360 || srvStreams.omadaV360 || selfStreams.omadaV360;
  const bestOmadaAudio = omaStreams.omadaAudio || srvStreams.omadaAudio || selfStreams.omadaAudio;

  const playableSelfV1080 = isPlayableFromAnyIp(selfStreams.v1080) ? selfStreams.v1080 : undefined;
  const playableSelfV720 = isPlayableFromAnyIp(selfStreams.v720) ? selfStreams.v720 : undefined;
  const playableSelfComb360 = isPlayableFromAnyIp(selfStreams.combined360) ? selfStreams.combined360 : undefined;
  const playableSelfAudio = isPlayableFromAnyIp(selfStreams.audio) ? selfStreams.audio : undefined;

  const finalComb360 = playableSelfComb360 || bestOmadaV360 || srvStreams.combined360 || selfStreams.combined360;
  const finalV1080 = bestOmadaV1080 || playableSelfV1080 || srvStreams.v1080 || selfStreams.v1080 || finalComb360;
  const finalV720 = bestOmadaV720 || playableSelfV720 || srvStreams.v720 || selfStreams.v720 || finalComb360;
  const finalAudio =
    bestOmadaAudio ||
    playableSelfAudio ||
    (isPlayableFromAnyIp(srvStreams.audio) ? srvStreams.audio : undefined) ||
    playableSelfComb360 ||
    bestOmadaV360 ||
    selfStreams.audio ||
    finalComb360;

  const mergedStreams: StreamSourcesResult['streams'] = {
    ...srvStreams,
    ...selfStreams,
    ...omaStreams,
    v1080: finalV1080,
    v720: finalV720,
    v360: finalComb360,
    combined720:
      omaStreams.combined720 ||
      srvStreams.combined720 ||
      (isPlayableFromAnyIp(selfStreams.combined720) ? selfStreams.combined720 : undefined),
    combined360: finalComb360,
    audio: finalAudio,
    omadaV1080: bestOmadaV1080 || finalV1080,
    omadaV720: bestOmadaV720 || finalV720,
    omadaV360: bestOmadaV360 || finalComb360,
    omadaAudio: bestOmadaAudio || finalAudio
  };

  const hasValidStream = Boolean(
    mergedStreams.v1080 ||
      mergedStreams.v720 ||
      mergedStreams.v360 ||
      mergedStreams.combined360 ||
      mergedStreams.audio
  );

  const combinedAudioTracks: TrackItem[] = [];
  if (bestOmadaAudio) {
    combinedAudioTracks.push({
      id: 'audio-omada-140',
      url: bestOmadaAudio,
      lang: 'ja',
      label: '日本語 高音質音声 (AAC 129kbps)',
      ext: 'm4a',
      isDefault: true,
      isOriginal: true
    });
  }
  if (selfStructuredRes?.audioTracks) {
    for (const t of selfStructuredRes.audioTracks) {
      if (t.url && !combinedAudioTracks.some((x) => x.url === t.url)) {
        combinedAudioTracks.push({
          ...t,
          isDefault: combinedAudioTracks.length === 0 ? true : false
        });
      }
    }
  }
  if (serverRes?.audioTracks) {
    for (const t of serverRes.audioTracks) {
      if (t.url && !combinedAudioTracks.some((x) => x.url === t.url)) {
        combinedAudioTracks.push(t);
      }
    }
  }

  const data: StreamSourcesResult = {
    videoId,
    title: selfStructuredRes?.title || serverRes?.title || omadaDirect?.title || `video-${videoId}`,
    engine: selfStructuredRes?.engine || serverRes?.engine || omadaDirect?.engine || 'kaitotube-self',
    streams: mergedStreams,
    qualitySources: selfStructuredRes?.qualitySources || serverRes?.qualitySources,
    availableQualities: selfStructuredRes?.availableQualities || serverRes?.availableQualities,
    qualityLabels: selfStructuredRes?.qualityLabels || serverRes?.qualityLabels,
    defaultQuality: selfStructuredRes?.defaultQuality || serverRes?.defaultQuality,
    hasM3u8: selfStructuredRes?.hasM3u8 ?? serverRes?.hasM3u8,
    downloadGroups: selfStructuredRes?.downloadGroups || serverRes?.downloadGroups,
    audioTracks: combinedAudioTracks,
    subtitleTracks:
      selfStructuredRes?.subtitleTracks && selfStructuredRes.subtitleTracks.length > 0
        ? selfStructuredRes.subtitleTracks
        : serverRes?.subtitleTracks && serverRes.subtitleTracks.length > 0
        ? serverRes.subtitleTracks
        : omadaDirect?.subtitleTracks || [],
    errorMessage: !hasValidStream && selfStreamErr ? selfStreamErr.message : undefined,
    cachedAt: Date.now()
  };

  return { data, hasValidStream };
}

export async function fetchStreamSourcesCoalesced(
  videoId: string,
  forceRefresh = false
): Promise<StreamSourcesResult> {
  const now = Date.now();

  if (!forceRefresh) {
    const cached = _streamCache.get(videoId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  } else {
    _streamCache.delete(videoId);
  }

  if (_r.has(videoId)) {
    return _r.get(videoId)!;
  }

  const fetchPromise = (async () => {
    try {
      let selfStreamErr: any = null;
      let latestSelf: StreamSourcesResult | null = null;
      let latestServer: StreamSourcesResult | null = null;
      let latestOmada: StreamSourcesResult | null = null;

      const updateCacheInBackground = () => {
        const { data, hasValidStream } = mergeStreamSourcesResults(
          videoId,
          latestSelf,
          latestOmada,
          latestServer,
          selfStreamErr
        );
        if (hasValidStream) {
          _streamCache.set(videoId, {
            data,
            expiresAt: Date.now() + Bu
          });
        }
      };

      const selfStreamPromise = (async () => {
        try {
          const res = await fetchSelfStreamDirect(videoId);
          if (res) {
            latestSelf = res;
            updateCacheInBackground();
            return res;
          }
        } catch (err: any) {
          selfStreamErr = err;
        }
        throw new Error('selfStream empty');
      })();

      const serverStreamPromise = (async () => {
        try {
          const r = await customFetch(`/api/youtube/stream-sources/${videoId}`);
          if (r.ok) {
            const raw = await r.json();
            const parsed = parseStructuredStreamPayload(videoId, raw) || (raw as StreamSourcesResult);
            if (parsed && (parsed.streams?.v1080 || parsed.streams?.v720 || parsed.streams?.combined360 || parsed.streams?.audio)) {
              latestServer = parsed;
              updateCacheInBackground();
              return parsed;
            }
          }
        } catch {}
        throw new Error('serverStream empty');
      })();

      const omadaBrowserPromise = (async () => {
        try {
          const res = await fetchOmadaDirectFromBrowser(videoId);
          if (res) {
            latestOmada = res;
            updateCacheInBackground();
            return res;
          }
        } catch {}
        throw new Error('omadaBrowser empty');
      })();

      // Resolve as soon as the FASTEST source yields valid streams (do NOT block on slow 14s browser timeouts!)
      try {
        await Promise.any([selfStreamPromise, serverStreamPromise, omadaBrowserPromise]);
        // Brief 60ms coalescing window in case a sibling promise resolves on the same tick
        await Promise.race([
          Promise.allSettled([selfStreamPromise, serverStreamPromise]),
          new Promise((r) => setTimeout(r, 60))
        ]);
      } catch {
        // All 3 rejected
      }

      if (latestSelf?.premiereScheduled) {
        return latestSelf;
      }

      const { data, hasValidStream } = mergeStreamSourcesResults(
        videoId,
        latestSelf,
        latestOmada,
        latestServer,
        selfStreamErr
      );

      if (hasValidStream) {
        _streamCache.set(videoId, {
          data,
          expiresAt: Date.now() + Bu
        });
      }

      return data;
    } finally {
      _r.delete(videoId);
    }
  })();

  _r.set(videoId, fetchPromise);
  return fetchPromise;
}

/**
 * 言語・音声トラック点数加算アルゴリズム (Vo)
 */
export function scoreTrack(
  track: TrackItem,
  devicePreferredLang = 'ja',
  browserLang: string = typeof navigator !== 'undefined' ? navigator.language : 'ja'
): number {
  let score = 0;
  const lang = (track.lang || track.srclang || '').toLowerCase();
  const label = (track.label || '').toLowerCase();
  const devLang = devicePreferredLang.toLowerCase();
  const bLang = browserLang.toLowerCase();

  if (lang && (lang === devLang || devLang.startsWith(lang) || lang.startsWith(devLang))) {
    score += 2000;
  }
  if (track.isDefault || track.default || label.includes('default') || label.includes('既定') || label.includes('標準')) {
    score += 1000;
  }
  if (track.isOriginal || label.includes('original') || label.includes('オリジナル')) {
    score += 900;
  }
  if (lang && (lang === bLang || bLang.startsWith(lang) || lang.startsWith(bLang))) {
    score += 700;
  }
  if (lang.includes('ja') || lang.includes('jpn') || label.includes('日本語') || label.includes('japanese')) {
    score += 500;
  }
  if (lang === 'und' || lang === '' || lang === 'undefined') {
    score += 100;
  }
  if (track.isDrc || label.includes('drc') || label.includes('夜間') || label.includes('compressed')) {
    score -= 20;
  }

  return score;
}

export function selectBestTrack(tracks: TrackItem[], deviceLang = 'ja'): TrackItem | null {
  if (!tracks || tracks.length === 0) return null;
  const scored = tracks.map((track) => ({
    track,
    score: scoreTrack(track, deviceLang)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.track || null;
}

// -------------------------------------------------------------
// 字幕 Blob URL 生成 & メモリ解放管理 (ag, yo 準拠)
// -------------------------------------------------------------
const _activeBlobUrls = new Set<string>();

export async function ag(vttTextOrUrl: string): Promise<string> {
  let vttContent = vttTextOrUrl;
  const customProxy = getCustomProxyUrl();

  if (
    vttTextOrUrl.startsWith('http://') ||
    vttTextOrUrl.startsWith('https://') ||
    vttTextOrUrl.startsWith('/api/')
  ) {
    const fetchTarget =
      customProxy && vttTextOrUrl.startsWith('http')
        ? `${customProxy}${customProxy.includes('?') ? '&' : '?'}url=${encodeURIComponent(vttTextOrUrl)}`
        : vttTextOrUrl;
    try {
      const res = await fetch(fetchTarget, {
        headers: { Accept: 'text/vtt,text/plain;q=0.9' },
        credentials: 'omit'
      });
      if (res.ok) {
        vttContent = await res.text();
      }
    } catch (e) {
      console.warn('ag: Failed to fetch external VTT, using original text/url', e);
    }
  }

  if (!vttContent.trim().startsWith('WEBVTT')) {
    vttContent = 'WEBVTT\n\n' + vttContent;
  }

  const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  _activeBlobUrls.add(objectUrl);
  return objectUrl;
}

export function yo(blobUrl?: string | null): void {
  if (!blobUrl) return;
  try {
    if (blobUrl.startsWith('blob:') && _activeBlobUrls.has(blobUrl)) {
      URL.revokeObjectURL(blobUrl);
      _activeBlobUrls.delete(blobUrl);
    }
  } catch (e) {
    console.warn('yo: Error revoking object URL', e);
  }
}

export function cleanupAllSubtitleBlobs(): void {
  for (const url of _activeBlobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  _activeBlobUrls.clear();
}
