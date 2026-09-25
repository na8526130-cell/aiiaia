/**
 * streamManager.ts
 * 
 * 高度なストリーム取得・キャッシュ・言語トラック評価・字幕Blob管理モジュール
 * 
 * 1. Request Coalescing (_r Map):
 *    同一動画へのストリーム取得リクエストがほぼ同時に複数回発生した場合、
 *    2回目のリクエストは通信を行わず、1回目の通信 Promise を合体・共有。
 * 
 * 2. 5分間キャッシュ (Bu = 5分):
 *    取得したストリームURL・ソース情報を5分間メモリ内にキャッシュし、期限切れは自動破棄。
 * 
 * 3. 言語・音声トラック点数加算アルゴリズム (Vo):
 *    端末優先言語(+2000)、デフォルト(+1000)、オリジナル(+900)、ブラウザ言語(+700)、
 *    日本語(+500)、未定義(+100)、DRC音量圧縮(-20) で自動評価し最適トラックを決定。
 * 
 * 4. 字幕 Blob URL 生成 & メモリ解放 (ag, yo):
 *    外部VTT字幕データを一旦 Blob に変換して createObjectURL を生成し、
 *    動画変更時やアンマウント時に revokeObjectURL でメモリリークを完全防止。
 */

export interface TrackItem {
  id?: string;
  url: string;
  lang?: string;
  label?: string;
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
  isDefault?: boolean;
  isOriginal?: boolean;
  isDrc?: boolean;
  mimeType?: string;
  bitrate?: number;
}

export interface StreamSourcesResult {
  videoId: string;
  title?: string;
  streams: {
    v1080?: string;
    v720?: string;
    v360?: string;
    audio?: string;
    invidious720?: string;
    invidious360?: string;
    direct720?: string;
    direct360?: string;
    directAudio?: string;
    combined720?: string;
    combined360?: string;
  };
  audioTracks?: TrackItem[];
  subtitleTracks?: TrackItem[];
  cachedAt?: number;
}

// 5分間のキャッシュ有効期限 (Bu = 5分)
export const Bu = 5 * 60 * 1000;

// 同一動画の重複リクエスト合体用 Map (_r)
const _r = new Map<string, Promise<StreamSourcesResult>>();

// メモリ内ストリームキャッシュ
const _streamCache = new Map<string, { data: StreamSourcesResult; expiresAt: number }>();

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

// 1分ごとに期限切れキャッシュを掃除
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredCache, 60 * 1000);
}

/**
 * fetchStreamSourcesCoalesced
 * 重複リクエストを合体 (_r Map) し、5分間キャッシュ (Bu) を利用してストリームを取得
 */
export async function fetchStreamSourcesCoalesced(
  videoId: string,
  forceRefresh = false
): Promise<StreamSourcesResult> {
  const now = Date.now();

  // 1. キャッシュの確認 (期限切れでなければキャッシュを即時返却)
  if (!forceRefresh) {
    const cached = _streamCache.get(videoId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

  // 2. 進行中の通信がある場合は Promise を合体共有 (_r Map)
  if (_r.has(videoId)) {
    return _r.get(videoId)!;
  }

  // 3. 新規通信を開始し、_r に Promise を登録
  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/youtube/stream-sources/${videoId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: StreamSourcesResult = await res.json();
      data.cachedAt = Date.now();

      // 5分間のキャッシュに保存
      _streamCache.set(videoId, {
        data,
        expiresAt: Date.now() + Bu
      });

      return data;
    } finally {
      // 通信完了時に合体用 Map から削除
      _r.delete(videoId);
    }
  })();

  _r.set(videoId, fetchPromise);
  return fetchPromise;
}

/**
 * 言語・音声トラック点数加算アルゴリズム (Vo)
 * 
 * 端末の優先言語一致: +2000点
 * デフォルトトラック指定: +1000点
 * オリジナル言語トラック: +900点
 * ブラウザの言語一致: +700点
 * 日本語（ja）: +500点
 * 未定義（und）: +100点
 * DRC（夜間用等の音量圧縮）付きトラック: -20点
 */
export function scoreTrack(
  track: TrackItem,
  devicePreferredLang: string = 'ja',
  browserLang: string = typeof navigator !== 'undefined' ? navigator.language : 'ja'
): number {
  let score = 0;
  const lang = (track.lang || '').toLowerCase();
  const label = (track.label || '').toLowerCase();
  const devLang = devicePreferredLang.toLowerCase();
  const bLang = browserLang.toLowerCase();

  // 端末の優先言語一致: +2000点
  if (lang && (lang === devLang || devLang.startsWith(lang) || lang.startsWith(devLang))) {
    score += 2000;
  }

  // デフォルトトラック指定: +1000点
  if (track.isDefault || label.includes('default') || label.includes('既定') || label.includes('標準')) {
    score += 1000;
  }

  // オリジナル言語トラック: +900点
  if (track.isOriginal || label.includes('original') || label.includes('オリジナル')) {
    score += 900;
  }

  // ブラウザの言語一致: +700点
  if (lang && (lang === bLang || bLang.startsWith(lang) || lang.startsWith(bLang))) {
    score += 700;
  }

  // 日本語（ja）: +500点
  if (lang.includes('ja') || lang.includes('jpn') || label.includes('日本語') || label.includes('japanese')) {
    score += 500;
  }

  // 未定義（und）: +100点
  if (lang === 'und' || lang === '' || lang === 'undefined') {
    score += 100;
  }

  // DRC（夜間用等の音量圧縮）付きトラック: -20点（音質劣化防止のため減点）
  if (track.isDrc || label.includes('drc') || label.includes('夜間') || label.includes('compressed')) {
    score -= 20;
  }

  return score;
}

/**
 * 複数のトラックから Vo アルゴリズムで最適なトラックを自動選定
 */
export function selectBestTrack(
  tracks: TrackItem[],
  deviceLang = 'ja'
): TrackItem | null {
  if (!tracks || tracks.length === 0) return null;

  const scored = tracks.map((track) => ({
    track,
    score: scoreTrack(track, deviceLang)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.track || null;
}

// -------------------------------------------------------------
// 字幕 Blob URL 生成 & メモリ解放管理 (ag, yo)
// -------------------------------------------------------------

// 現在アクティブな Blob URL の追跡セット
const _activeBlobUrls = new Set<string>();

/**
 * ag: 外部サーバーのVTT字幕データをそのまま読み込まず、
 * ブラウザ内で一旦 Blob に変換して URL.createObjectURL を生成
 */
export async function ag(vttTextOrUrl: string): Promise<string> {
  let vttContent = vttTextOrUrl;

  // URLの場合は fetch して中身のテキストを取得
  if (vttTextOrUrl.startsWith('http://') || vttTextOrUrl.startsWith('https://') || vttTextOrUrl.startsWith('/api/')) {
    try {
      const res = await fetch(vttTextOrUrl);
      if (res.ok) {
        vttContent = await res.text();
      }
    } catch (e) {
      console.warn('ag: Failed to fetch external VTT, using original text/url', e);
    }
  }

  // WEBVTT ヘッダーの確認と正規化
  if (!vttContent.trim().startsWith('WEBVTT')) {
    vttContent = 'WEBVTT\n\n' + vttContent;
  }

  const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  _activeBlobUrls.add(objectUrl);
  return objectUrl;
}

/**
 * yo: 生成した字幕 Blob URL を revokeObjectURL で安全に破棄・メモリ解放
 */
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

/**
 * 全てのアクティブな字幕 Blob URL を一括破棄（コンポーネント破棄時やページ遷移時）
 */
export function cleanupAllSubtitleBlobs(): void {
  for (const url of _activeBlobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  _activeBlobUrls.clear();
}
