/**
 * ============================================================================
 * 海斗tube 自作 InnerTube API Cloudflare Worker (worker.js)
 * ============================================================================
 * - APIキー不要 / クォータ無制限 / 外部ライブラリ依存ゼロ (1ファイル完結)
 * - YouTube公式内部プロトコル (youtubei/v1) WEB / ANDROID / IOS クライアント対応
 * - デプロイコマンド: npx wrangler deploy
 * ============================================================================
 */

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-api-provider, x-innertube-url, x-invidious-url',
  'Access-Control-Max-Age': '86400'
};

const CLIENTS = {
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20250220.01.00',
    hl: 'ja',
    gl: 'JP',
    utcOffsetMinutes: 540,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    clientId: '1'
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '20.03.02',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.2.1.22C161',
    hl: 'ja',
    gl: 'JP',
    utcOffsetMinutes: 540,
    userAgent: 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X; ja_JP)',
    clientId: '5'
  },
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '19.44.38',
    androidSdkVersion: 34,
    osName: 'Android',
    osVersion: '14',
    hl: 'ja',
    gl: 'JP',
    utcOffsetMinutes: 540,
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14; ja_JP) gzip',
    clientId: '3'
  },
  ANDROID_VR: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.60.19',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    osName: 'Android',
    osVersion: '12L',
    androidSdkVersion: 32,
    hl: 'ja',
    gl: 'JP',
    utcOffsetMinutes: 540,
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    clientId: '28'
  }
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

async function callInnerTube(endpoint, payload = {}, clientType = 'WEB') {
  const clientCfg = CLIENTS[clientType] || CLIENTS.WEB;
  const isMobilePlayer = endpoint === 'player' && clientType !== 'WEB';
  const url = isMobilePlayer
    ? `https://youtubei.googleapis.com/youtubei/v1/${endpoint}?prettyPrint=false`
    : `https://www.youtube.com/youtubei/v1/${endpoint}?key=${INNERTUBE_KEY}&prettyPrint=false`;
  const body = {
    context: {
      client: {
        hl: clientCfg.hl,
        gl: clientCfg.gl,
        clientName: clientCfg.clientName,
        clientVersion: clientCfg.clientVersion,
        utcOffsetMinutes: clientCfg.utcOffsetMinutes,
        ...(clientCfg.deviceMake ? { deviceMake: clientCfg.deviceMake, deviceModel: clientCfg.deviceModel, osName: clientCfg.osName, osVersion: clientCfg.osVersion } : {}),
        ...(clientCfg.androidSdkVersion ? { androidSdkVersion: clientCfg.androidSdkVersion, osName: clientCfg.osName, osVersion: clientCfg.osVersion } : {})
      }
    },
    ...(endpoint === 'player' ? { contentCheckOk: true, racyCheckOk: true } : {}),
    ...payload
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': clientCfg.userAgent,
    'X-YouTube-Client-Name': clientCfg.clientId,
    'X-YouTube-Client-Version': clientCfg.clientVersion,
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
  };
  if (isMobilePlayer) {
    headers['X-Goog-Api-Format-Version'] = '2';
  } else {
    headers['Origin'] = 'https://www.youtube.com';
    headers['Referer'] = 'https://www.youtube.com/';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`InnerTube ${endpoint} HTTP ${res.status}`);
  }
  return res.json();
}

function getText(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj.simpleText === 'string') return obj.simpleText;
  if (Array.isArray(obj.runs)) return obj.runs.map((r) => r.text || '').join('');
  if (typeof obj.content === 'string') return obj.content;
  return '';
}

function parseDurationToSeconds(text) {
  if (!text) return 0;
  const parts = String(text).trim().split(':').map((n) => parseInt(n, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseCount(text) {
  if (!text) return 0;
  const raw = String(text).replace(/,/g, '').trim();
  const num = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
  if (raw.includes('億')) return Math.round(num * 100000000);
  if (raw.includes('万')) return Math.round(num * 10000);
  if (raw.toLowerCase().includes('b')) return Math.round(num * 1000000000);
  if (raw.toLowerCase().includes('m')) return Math.round(num * 1000000);
  if (raw.toLowerCase().includes('k')) return Math.round(num * 1000);
  return Math.round(num);
}

function extractAnimatedThumbnail(r) {
  return (
    r?.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails?.[0]?.url ||
    r?.animatedThumbnailOverlayViewModel?.thumbnail?.sources?.[0]?.url ||
    undefined
  );
}

function parseVideoRenderer(r, fallbackAuthor = {}) {
  if (!r) return null;
  const videoId = r.videoId || r.playlistVideoRenderer?.videoId || r.compactVideoRenderer?.videoId || r.gridVideoRenderer?.videoId;
  if (!videoId || typeof videoId !== 'string') return null;

  const title = getText(r.title) || getText(r.headline) || '';
  const authorRun =
    r.ownerText?.runs?.[0] ||
    r.longBylineText?.runs?.[0] ||
    r.shortBylineText?.runs?.[0] ||
    null;

  const author = authorRun?.text || getText(r.ownerText) || getText(r.shortBylineText) || fallbackAuthor.author || '';
  const authorId =
    authorRun?.navigationEndpoint?.browseEndpoint?.browseId ||
    r.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint?.browseEndpoint?.browseId ||
    fallbackAuthor.authorId ||
    '';

  const authorThumb =
    r.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
    r.channelThumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
    fallbackAuthor.authorThumbnail ||
    '';

  const thumbs = r.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.slice(-1)?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const durationText =
    getText(r.lengthText) ||
    getText(r.thumbnailOverlays?.find((o) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text) ||
    '';
  const lengthSeconds = parseDurationToSeconds(durationText);

  const viewText = getText(r.viewCountText) || getText(r.shortViewCountText) || '0';
  const viewCount = parseCount(viewText);
  const publishedText = getText(r.publishedTimeText) || '';
  const description =
    getText(r.detailedMetadataSnippets?.[0]?.snippetText) ||
    getText(r.descriptionSnippet) ||
    '';

  const navUrl = r.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  const isShort = Boolean(
    navUrl.includes('/shorts/') ||
    r.thumbnailOverlays?.some((o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS')
  );

  return {
    videoId,
    id: videoId,
    title,
    description,
    author,
    channelTitle: author,
    authorId,
    channelId: authorId,
    authorThumbnail: authorThumb,
    authorThumbnails: authorThumb ? [{ url: authorThumb }] : [],
    thumbnail,
    videoThumbnails: [{ quality: 'high', url: thumbnail }],
    animatedThumbnailUrl: extractAnimatedThumbnail(r),
    lengthSeconds,
    duration: durationText,
    viewCount,
    views: viewCount,
    publishedText,
    isShort
  };
}

function parseShortsLockup(lockup, fallbackAuthor = {}) {
  const entityId = lockup?.entityId || '';
  const videoId =
    lockup?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
    (entityId.startsWith('shorts-shelf-item-') ? entityId.replace('shorts-shelf-item-', '') : '');
  if (!videoId) return null;

  const title = lockup?.overlayMetadata?.primaryText?.content || 'YouTube Short';
  const viewText = lockup?.overlayMetadata?.secondaryText?.content || '0';
  const thumb =
    lockup?.thumbnail?.sources?.slice(-1)?.[0]?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    id: videoId,
    title,
    description: '',
    author: fallbackAuthor.author || '',
    channelTitle: fallbackAuthor.author || '',
    authorId: fallbackAuthor.authorId || '',
    channelId: fallbackAuthor.authorId || '',
    authorThumbnail: fallbackAuthor.authorThumbnail || '',
    thumbnail: thumb,
    lengthSeconds: 60,
    viewCount: parseCount(viewText),
    publishedText: '',
    isShort: true
  };
}

function collectVideosFromTree(root, fallbackAuthor = {}) {
  const results = [];
  const seen = new Set();
  let continuation = null;

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 22) return;

    if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
      continuation = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
    }

    const vRenderer =
      node.videoRenderer ||
      node.gridVideoRenderer ||
      node.compactVideoRenderer ||
      node.playlistVideoRenderer ||
      node.reelItemRenderer;

    if (vRenderer) {
      const parsed = parseVideoRenderer(vRenderer, fallbackAuthor);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
    }

    if (node.shortsLockupViewModel) {
      const parsedShort = parseShortsLockup(node.shortsLockupViewModel, fallbackAuthor);
      if (parsedShort && !seen.has(parsedShort.videoId)) {
        seen.add(parsedShort.videoId);
        results.push(parsedShort);
      }
    }

    if (node.lockupViewModel && typeof node.lockupViewModel.contentId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(node.lockupViewModel.contentId)) {
      const vid = node.lockupViewModel.contentId;
      if (!seen.has(vid)) {
        seen.add(vid);
        const lMeta = node.lockupViewModel.metadata?.lockupMetadataViewModel;
        const lTitle = lMeta?.title?.content || '';
        const metaRows = lMeta?.metadata?.contentMetadataViewModel?.metadataRows || [];
        const lAuthor = metaRows[0]?.metadataParts?.[0]?.text?.content || fallbackAuthor.author || '';
        const viewPart = metaRows[1]?.metadataParts?.[0]?.text?.content || '0';
        const pubPart = metaRows[1]?.metadataParts?.[1]?.text?.content || '';
        const lThumb =
          node.lockupViewModel.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)?.[0]?.url ||
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        results.push({
          videoId: vid,
          id: vid,
          title: lTitle,
          description: '',
          author: lAuthor,
          channelTitle: lAuthor,
          authorId: fallbackAuthor.authorId || '',
          channelId: fallbackAuthor.authorId || '',
          authorThumbnail: fallbackAuthor.authorThumbnail || '',
          thumbnail: lThumb,
          videoThumbnails: [{ quality: 'high', url: lThumb }],
          lengthSeconds: 0,
          viewCount: parseCount(viewPart),
          views: parseCount(viewPart),
          publishedText: pubPart,
          isShort: false
        });
      }
    }

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
    } else {
      for (const key of Object.keys(node)) {
        if (key === 'responseContext' || key === 'trackingParams') continue;
        walk(node[key], depth + 1);
      }
    }
  }

  walk(root, 0);
  return { results, continuation };
}

function collectPlaylistsFromTree(root, fallbackAuthor = {}) {
  const playlists = [];
  const seen = new Set();

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 20) return;

    const pl = node.playlistRenderer || node.gridPlaylistRenderer || node.compactPlaylistRenderer;
    if (pl && pl.playlistId && !seen.has(pl.playlistId)) {
      seen.add(pl.playlistId);
      const thumb =
        pl.thumbnails?.[0]?.thumbnails?.slice(-1)?.[0]?.url ||
        pl.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ||
        '';
      playlists.push({
        playlistId: pl.playlistId,
        id: pl.playlistId,
        title: getText(pl.title) || '再生リスト',
        author: getText(pl.shortBylineText) || fallbackAuthor.author || '',
        playlistThumbnail: thumb,
        videoCount: parseCount(getText(pl.videoCountText) || getText(pl.videoCountShortText) || '0')
      });
    }

    if (node.lockupViewModel && node.lockupViewModel.contentId && !seen.has(node.lockupViewModel.contentId)) {
      const cid = node.lockupViewModel.contentId;
      if (cid.startsWith('PL') || cid.startsWith('UU') || cid.startsWith('OL') || cid.startsWith('RD')) {
        seen.add(cid);
        const title = node.lockupViewModel.metadata?.lockupMetadataViewModel?.title?.content || '再生リスト';
        const thumb =
          node.lockupViewModel.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.slice(-1)?.[0]?.url ||
          '';
        playlists.push({
          playlistId: cid,
          id: cid,
          title,
          author: fallbackAuthor.author || '',
          playlistThumbnail: thumb,
          videoCount: 0
        });
      }
    }

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
    } else {
      for (const key of Object.keys(node)) {
        if (key === 'responseContext' || key === 'trackingParams') continue;
        walk(node[key], depth + 1);
      }
    }
  }

  walk(root, 0);
  return playlists;
}

// ============================================================================
// ★ SHA-256 Proof of Work (PoW) Guard Authentication Engine (Worker Native)
// ============================================================================
const POW_GUARD_SECRET = 'kaito-tube-pow-guard-v1-secret-2026';
const POW_DEFAULT_DIFFICULTY_BITS = 12;
const POW_CHALLENGE_TTL_SEC = 120;
const POW_SESSION_TTL_SEC = 24 * 3600;
const POW_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const powTextEncoder = new TextEncoder();
const verifiedSessionMemory = new Map();
const activeChallengeMemory = new Map();
const workerPlayerCache = new Map();
const workerPlayerInFlight = new Map();
const WORKER_PLAYER_CACHE_TTL_MS = 15 * 60 * 1000;

async function fastResolvePlayerData(videoId) {
  const now = Date.now();
  const cached = workerPlayerCache.get(videoId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  if (workerPlayerInFlight.has(videoId)) {
    return workerPlayerInFlight.get(videoId);
  }
  const job = (async () => {
    try {
      const requireStreaming = async (clientType) => {
        const res = await callInnerTube('player', { videoId }, clientType);
        const sd = res?.streamingData;
        if (
          sd &&
          ((Array.isArray(sd.formats) && sd.formats.length > 0) ||
            (Array.isArray(sd.adaptiveFormats) && sd.adaptiveFormats.length > 0) ||
            sd.hlsManifestUrl)
        ) {
          return res;
        }
        throw new Error(`No streamingData from ${clientType}`);
      };

      let playerRes = null;
      try {
        playerRes = await Promise.any([
          requireStreaming('ANDROID_VR'),
          requireStreaming('IOS')
        ]);
      } catch {
        // Fallback to yt.omada.cafe when datacenter InnerTube returns LOGIN_REQUIRED
        const [omadaData, webRes] = await Promise.all([
          fetch(`https://yt.omada.cafe/api/v1/videos/${encodeURIComponent(videoId)}?local=true`, {
            headers: { Accept: 'application/json' }
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          callInnerTube('player', { videoId }, 'WEB').catch(() => null)
        ]);

        if (omadaData && (Array.isArray(omadaData.formatStreams) || Array.isArray(omadaData.adaptiveFormats))) {
          const toAbsOmada = (u) => {
            if (!u) return u;
            if (u.startsWith('/')) return `https://yt.omada.cafe${u}`;
            try {
              const p = new URL(u);
              if (p.hostname.endsWith('.googlevideo.com')) {
                p.searchParams.set('host', p.host);
                p.searchParams.set('local', 'true');
                return `https://yt.omada.cafe/videoplayback?${p.searchParams.toString()}`;
              }
            } catch {}
            return u;
          };
          playerRes = {
            ...(webRes || {}),
            videoDetails: {
              videoId,
              title: omadaData.title || webRes?.videoDetails?.title || '',
              shortDescription: omadaData.description || webRes?.videoDetails?.shortDescription || '',
              author: omadaData.author || webRes?.videoDetails?.author || '',
              channelId: omadaData.authorId || webRes?.videoDetails?.channelId || '',
              viewCount: String(omadaData.viewCount || webRes?.videoDetails?.viewCount || '0'),
              lengthSeconds: String(omadaData.lengthSeconds || webRes?.videoDetails?.lengthSeconds || '0'),
              keywords: omadaData.keywords || webRes?.videoDetails?.keywords || [],
              isLive: Boolean(omadaData.liveNow)
            },
            streamingData: {
              formats: (omadaData.formatStreams || []).map((f) => ({
                url: toAbsOmada(f.url),
                itag: Number(f.itag) || 18,
                mimeType: f.type || 'video/mp4',
                quality: f.quality || 'medium',
                qualityLabel: f.qualityLabel || f.resolution || '360p'
              })),
              adaptiveFormats: (omadaData.adaptiveFormats || []).map((f) => ({
                url: toAbsOmada(f.url),
                itag: Number(f.itag) || 0,
                mimeType: f.type || 'video/mp4',
                qualityLabel: f.qualityLabel || f.resolution,
                audioQuality: f.audioQuality
              }))
            }
          };
        } else {
          playerRes = webRes;
        }
      }

      if (playerRes && (playerRes.streamingData || playerRes.videoDetails)) {
        if (workerPlayerCache.size > 500) {
          const oldest = workerPlayerCache.keys().next().value;
          if (oldest) workerPlayerCache.delete(oldest);
        }
        workerPlayerCache.set(videoId, {
          data: playerRes,
          expiresAt: Date.now() + WORKER_PLAYER_CACHE_TTL_MS
        });
      }
      return playerRes;
    } finally {
      workerPlayerInFlight.delete(videoId);
    }
  })();

  workerPlayerInFlight.set(videoId, job);
  return job;
}

function powRotateRight(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}

function sha256Bytes(input) {
  const bytes = typeof input === 'string' ? powTextEncoder.encode(input) : new Uint8Array(input);
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
      const s0 = powRotateRight(x, 7) ^ powRotateRight(x, 18) ^ (x >>> 3);
      const s1 = powRotateRight(y, 17) ^ powRotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const upper = powRotateRight(e, 6) ^ powRotateRight(e, 11) ^ powRotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + upper + choice + POW_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const lower = powRotateRight(a, 2) ^ powRotateRight(a, 13) ^ powRotateRight(a, 22);
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

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str) {
  try {
    const base64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function randomBytes(length) {
  const arr = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return arr;
}

function hasLeadingZeroBits(bytes, difficultyBits) {
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

function createGuardSessionId(verifiedUntilSec = 0, existingRandom12 = null) {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  view.setUint32(0, Math.max(0, Math.floor(verifiedUntilSec)) >>> 0);
  const rand12 = existingRandom12 && existingRandom12.length === 12 ? existingRandom12 : randomBytes(12);
  payload.set(rand12, 4);
  const payloadB64 = bytesToBase64Url(payload);
  const sig = sha256Bytes(`${POW_GUARD_SECRET}:sid:${payloadB64}`).slice(0, 16);
  const full = new Uint8Array(32);
  full.set(payload, 0);
  full.set(sig, 16);
  const sid = bytesToBase64Url(full);
  if (verifiedUntilSec > 0) {
    verifiedSessionMemory.set(sid, verifiedUntilSec);
  }
  return sid;
}

function inspectGuardSessionId(sid) {
  if (typeof sid !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sid)) {
    return { validFormat: false, verified: false, verifiedUntil: 0, rand12: null };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const memUntil = verifiedSessionMemory.get(sid) || 0;
  const raw = base64UrlToBytes(sid);
  if (!raw || raw.length !== 32) {
    return {
      validFormat: true,
      verified: memUntil > nowSec,
      verifiedUntil: memUntil,
      rand12: null
    };
  }
  const payload = raw.slice(0, 16);
  const sig = raw.slice(16, 32);
  const expectedSig = sha256Bytes(`${POW_GUARD_SECRET}:sid:${bytesToBase64Url(payload)}`).slice(0, 16);
  let sigMatch = true;
  for (let i = 0; i < 16; i += 1) {
    if (sig[i] !== expectedSig[i]) sigMatch = false;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const embeddedUntil = sigMatch ? view.getUint32(0) : 0;
  const verifiedUntil = Math.max(memUntil, embeddedUntil);
  return {
    validFormat: true,
    verified: verifiedUntil > nowSec,
    verifiedUntil,
    rand12: payload.slice(4, 16)
  };
}

function deriveChallengeNonce(sessionId, challengeId) {
  return bytesToBase64Url(sha256Bytes(`${POW_GUARD_SECRET}:nonce:${sessionId}:${challengeId}`)).slice(0, 24);
}

function createGuardChallenge(existingSid, requestedDifficulty) {
  const inspected = inspectGuardSessionId(existingSid);
  const sessionId = inspected.validFormat ? existingSid : createGuardSessionId(0);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + POW_CHALLENGE_TTL_SEC;
  const difficultyBits = Math.min(20, Math.max(8, Number(requestedDifficulty) || POW_DEFAULT_DIFFICULTY_BITS));

  const header10 = new Uint8Array(10);
  const view = new DataView(header10.buffer);
  view.setUint32(0, expiresAt >>> 0);
  header10[4] = difficultyBits;
  header10.set(randomBytes(5), 5);

  const headerB64 = bytesToBase64Url(header10);
  const tag6 = sha256Bytes(`${POW_GUARD_SECRET}:cid:${sessionId}:${headerB64}`).slice(0, 6);
  const full16 = new Uint8Array(16);
  full16.set(header10, 0);
  full16.set(tag6, 10);

  const challengeId = bytesToBase64Url(full16);
  const nonce = deriveChallengeNonce(sessionId, challengeId);

  activeChallengeMemory.set(challengeId, {
    sessionId,
    nonce,
    difficultyBits,
    version: 1,
    expiresAt
  });
  if (activeChallengeMemory.size > 1000) {
    const oldestKey = activeChallengeMemory.keys().next().value;
    if (oldestKey) activeChallengeMemory.delete(oldestKey);
  }

  return {
    version: 1,
    sessionId,
    challengeId,
    nonce,
    difficultyBits,
    expiresAt
  };
}

function verifyGuardChallenge(sessionId, challengeId, counterRaw) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
    return { ok: false, status: 400, code: 'INVALID_SESSION', message: 'Invalid guard_sid format' };
  }
  if (typeof challengeId !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(challengeId)) {
    return { ok: false, status: 400, code: 'INVALID_CHALLENGE', message: 'Invalid challenge_id format' };
  }
  const counter = Number(counterRaw);
  if (!Number.isInteger(counter) || counter < 0 || counter > Number.MAX_SAFE_INTEGER) {
    return { ok: false, status: 400, code: 'INVALID_COUNTER', message: 'Invalid PoW counter value' };
  }

  let nonce = '';
  let difficultyBits = POW_DEFAULT_DIFFICULTY_BITS;
  let expiresAt = 0;
  let version = 1;

  const memCh = activeChallengeMemory.get(challengeId);
  if (memCh && memCh.sessionId === sessionId) {
    nonce = memCh.nonce;
    difficultyBits = memCh.difficultyBits;
    expiresAt = memCh.expiresAt;
    version = memCh.version || 1;
  } else {
    const raw16 = base64UrlToBytes(challengeId);
    if (!raw16 || raw16.length !== 16) {
      return { ok: false, status: 400, code: 'INVALID_CHALLENGE', message: 'Cannot decode challenge_id' };
    }
    const header10 = raw16.slice(0, 10);
    const tag6 = raw16.slice(10, 16);
    const expectedTag6 = sha256Bytes(`${POW_GUARD_SECRET}:cid:${sessionId}:${bytesToBase64Url(header10)}`).slice(0, 6);
    for (let i = 0; i < 6; i += 1) {
      if (tag6[i] !== expectedTag6[i]) {
        return { ok: false, status: 403, code: 'CHALLENGE_MISMATCH', message: 'Challenge signature mismatch' };
      }
    }
    const view = new DataView(header10.buffer, header10.byteOffset, header10.byteLength);
    expiresAt = view.getUint32(0);
    difficultyBits = Math.min(24, Math.max(4, header10[4] || POW_DEFAULT_DIFFICULTY_BITS));
    nonce = deriveChallengeNonce(sessionId, challengeId);
  }

  if (nowSec > expiresAt) {
    activeChallengeMemory.delete(challengeId);
    return { ok: false, status: 400, code: 'CHALLENGE_EXPIRED', message: 'PoW challenge has expired' };
  }

  const digest = sha256Bytes(`v${version}:${nonce}:${counter}`);
  if (!hasLeadingZeroBits(digest, difficultyBits)) {
    return {
      ok: false,
      status: 403,
      code: 'INVALID_PROOF',
      message: `PoW verification failed for counter=${counter} (required ${difficultyBits} zero bits)`
    };
  }

  activeChallengeMemory.delete(challengeId);
  const verifiedUntil = nowSec + POW_SESSION_TTL_SEC;
  const inspected = inspectGuardSessionId(sessionId);
  const signedSid = createGuardSessionId(verifiedUntil, inspected.rand12);
  verifiedSessionMemory.set(sessionId, verifiedUntil);
  verifiedSessionMemory.set(signedSid, verifiedUntil);

  return {
    ok: true,
    status: 200,
    verified: true,
    sessionId: signedSid,
    verifiedUntil,
    difficultyBits,
    counter,
    nonce,
    hash: bytesToHex(digest)
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      // 0-A. PoW Guard Challenge Endpoint (/api/__guard/challenge, /api/v1/guard/challenge)
      if (path === '/api/__guard/challenge' || path === '/api/v1/guard/challenge') {
        const existingSid = url.searchParams.get('guard_sid') || '';
        const diffParam = url.searchParams.get('difficulty');
        const ch = createGuardChallenge(existingSid, diffParam);
        return jsonResponse(ch, 200);
      }

      // 0-B. PoW Guard Verify Endpoint (/api/__guard/verify, /api/v1/guard/verify)
      if (path === '/api/__guard/verify' || path === '/api/v1/guard/verify') {
        const sid = url.searchParams.get('guard_sid') || '';
        const cid = url.searchParams.get('challenge_id') || '';
        const counter = url.searchParams.get('counter');
        const result = verifyGuardChallenge(sid, cid, counter);
        return jsonResponse(result, result.status || 200);
      }

      // 0-C. PoW Guard Session Status Endpoint (/api/__guard/status, /api/v1/guard/status)
      if (path === '/api/__guard/status' || path === '/api/v1/guard/status') {
        const sid = url.searchParams.get('guard_sid') || '';
        const info = inspectGuardSessionId(sid);
        return jsonResponse({
          ok: true,
          verified: info.verified,
          sessionId: info.validFormat ? sid : createGuardSessionId(0),
          verifiedUntil: info.verifiedUntil,
          defaultDifficultyBits: POW_DEFAULT_DIFFICULTY_BITS,
          engine: 'KaitoTube PoW Guard Worker v2.8.0'
        });
      }

      // 0-D. Stream Queue Status Endpoint (/api/stream/status)
      if (path === '/api/stream/status') {
        return jsonResponse({
          status: 'ok',
          generatedAt: new Date().toISOString(),
          processing: {
            count: 0,
            ids: [],
            longest: null
          },
          activeStreams: 0,
          queueLength: 0,
          estimatedWaitSeconds: 0,
          message: '海斗tube Worker ストリーム＆PoW認証エンジン稼働中'
        });
      }

      if (path === '/' || path === '/api/v1/health' || path === '/health') {
        const proxyTargetOnRoot = url.searchParams.get('url');
        if (proxyTargetOnRoot && path === '/') {
          const rangeHeader = request.headers.get('range');
          const proxyHeaders = {
            'User-Agent': CLIENTS.WEB.userAgent,
            'Referer': 'https://www.youtube.com/'
          };
          if (rangeHeader) proxyHeaders['Range'] = rangeHeader;
          const upRes = await fetch(proxyTargetOnRoot, { headers: proxyHeaders, redirect: 'follow' });
          const respHeaders = { ...CORS_HEADERS };
          ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach((k) => {
            const v = upRes.headers.get(k);
            if (v) respHeaders[k] = v;
          });
          return new Response(upRes.body, { status: upRes.status, headers: respHeaders });
        }

        return jsonResponse({
          status: 'ok',
          valid: true,
          powEnabled: true,
          engine: 'KaitoTube Self-Hosted InnerTube & PoW Guard Cloudflare Worker',
          version: '2.8.0',
          timestamp: new Date().toISOString()
        });
      }

      if (path === '/api/proxy' || path === '/api/youtube/stream-proxy' || path === '/api/v1/stream-proxy' || path === '/proxy') {
        const targetUrl = url.searchParams.get('url') || '';
        if (!targetUrl) return jsonResponse({ error: 'Missing url parameter' }, 400);
        const rangeHeader = request.headers.get('range');
        const reqHeaders = {
          'User-Agent': CLIENTS.WEB.userAgent,
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        };
        if (rangeHeader) reqHeaders['Range'] = rangeHeader;
        const upstream = await fetch(targetUrl, {
          method: request.method === 'POST' ? 'POST' : 'GET',
          headers: reqHeaders,
          body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
          redirect: 'follow'
        });
        const outHeaders = { ...CORS_HEADERS };
        ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach((k) => {
          const v = upstream.headers.get(k);
          if (v) outHeaders[k] = v;
        });
        if (!outHeaders['accept-ranges']) outHeaders['accept-ranges'] = 'bytes';
        return new Response(upstream.body, {
          status: upstream.status,
          headers: outHeaders
        });
      }

      if (path === '/api/v1/trending') {
        let data = await callInnerTube('browse', { browseId: 'FEtrending' }).catch(() => null);
        let results = data ? collectVideosFromTree(data).results : [];
        if (results.length === 0) {
          const searchFallback = await callInnerTube('search', { query: '急上昇 人気 動画 日本' });
          results = collectVideosFromTree(searchFallback).results;
        }
        return jsonResponse(results);
      }

      if (path === '/api/v1/search') {
        const q = url.searchParams.get('q') || '人気 動画';
        const continuation = url.searchParams.get('continuation') || '';
        const limit = parseInt(url.searchParams.get('limit') || '30', 10);

        const payload = continuation ? { continuation } : { query: q };
        const data = await callInnerTube('search', payload);
        const { results, continuation: nextCont } = collectVideosFromTree(data);
        return jsonResponse({
          results: results.slice(0, limit),
          continuation: nextCont
        });
      }

      const videoMatch = path.match(/^\/api\/v1\/videos\/([^/]+)$/);
      if (videoMatch) {
        const videoId = decodeURIComponent(videoMatch[1]);
        const [playerRes, nextRes] = await Promise.all([
          fastResolvePlayerData(videoId),
          callInnerTube('next', { videoId }, 'WEB').catch(() => null)
        ]);

        const vd = playerRes?.videoDetails || {};
        const micro = playerRes?.microformat?.playerMicroformatRenderer || {};
        const streamingData = playerRes?.streamingData || {};

        let authorThumb = '';
        const primaryInfo =
          nextRes?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find((c) => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
        const secondaryInfo =
          nextRes?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find((c) => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;

        const ownerRenderer = secondaryInfo?.owner?.videoOwnerRenderer;
        if (ownerRenderer?.thumbnail?.thumbnails?.length) {
          authorThumb = ownerRenderer.thumbnail.thumbnails.slice(-1)[0].url;
        }

        const { results: relatedVideos } = nextRes
          ? collectVideosFromTree(nextRes?.contents?.twoColumnWatchNextResults?.secondaryResults)
          : { results: [] };

        const formatStreams = (streamingData.formats || []).map((f) => ({
          url: f.url,
          itag: f.itag,
          type: f.mimeType,
          quality: f.quality,
          qualityLabel: f.qualityLabel || `${f.height || 360}p`,
          resolution: f.qualityLabel || `${f.height || 360}p`,
          container: 'mp4'
        })).filter((f) => f.url);

        const adaptiveFormats = (streamingData.adaptiveFormats || []).map((f) => ({
          url: f.url,
          itag: f.itag,
          type: f.mimeType,
          qualityLabel: f.qualityLabel || (f.height ? `${f.height}p` : undefined),
          resolution: f.qualityLabel || (f.height ? `${f.height}p` : undefined),
          audioQuality: f.audioQuality
        })).filter((f) => f.url);

        const captions =
          playerRes?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map((t) => ({
            label: getText(t.name),
            languageCode: t.languageCode,
            baseUrl: t.baseUrl
          })) || [];

        return jsonResponse({
          videoId: vd.videoId || videoId,
          title: vd.title || getText(primaryInfo?.title) || '',
          description: vd.shortDescription || getText(secondaryInfo?.attributedDescription) || '',
          author: vd.author || getText(ownerRenderer?.title) || '',
          authorId: vd.channelId || ownerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || '',
          authorThumbnails: authorThumb ? [{ url: authorThumb }] : [],
          viewCount: parseInt(vd.viewCount || '0', 10),
          lengthSeconds: parseInt(vd.lengthSeconds || '0', 10),
          publishedText: getText(primaryInfo?.dateText) || micro.publishDate || '',
          keywords: vd.keywords || [],
          liveNow: Boolean(
            vd.isLive === true ||
            micro.liveBroadcastDetails?.isLiveNow === true ||
            primaryInfo?.viewCount?.videoViewCountRenderer?.isLive === true
          ),
          hlsUrl: streamingData.hlsManifestUrl || null,
          formatStreams,
          adaptiveFormats,
          captions,
          recommendedVideos: relatedVideos.filter((v) => v.videoId !== videoId)
        });
      }

      const channelMatch = path.match(/^\/api\/v1\/channels\/([^/]+)(?:\/(videos|shorts|playlists))?$/);
      if (channelMatch) {
        const channelId = decodeURIComponent(channelMatch[1]);
        const subTab = channelMatch[2] || '';

        const TAB_PARAMS = {
          videos: 'EgZ2aWRlb3PyBgQKAjoA',
          shorts: 'EgZzaG9ydHPyBgUKA5oBAA%3D%3D',
          playlists: 'EglwbGF5bGlzdHPyBgQKAkIA'
        };

        const browsePayload = { browseId: channelId };
        if (subTab && TAB_PARAMS[subTab]) {
          browsePayload.params = TAB_PARAMS[subTab];
        }

        const data = await callInnerTube('browse', browsePayload);
        const meta = data?.metadata?.channelMetadataRenderer || {};
        const header = data?.header?.c4TabbedHeaderRenderer || data?.header?.pageHeaderRenderer || {};

        const author = meta.title || getText(header.title) || '';
        const authorThumb =
          meta.avatar?.thumbnails?.slice(-1)?.[0]?.url ||
          header.avatar?.thumbnails?.slice(-1)?.[0]?.url ||
          '';
        const bannerUrl =
          header.banner?.thumbnails?.slice(-1)?.[0]?.url ||
          '';
        const subCountText = getText(header.subscriberCountText) || '';

        const fallbackAuthor = { author, authorId: channelId, authorThumbnail: authorThumb };

        if (subTab === 'playlists') {
          const playlists = collectPlaylistsFromTree(data, fallbackAuthor);
          return jsonResponse({ playlists });
        }

        const { results: videos, continuation } = collectVideosFromTree(data, fallbackAuthor);
        if (subTab === 'shorts') {
          return jsonResponse({
            videos: videos.map((v) => ({ ...v, isShort: true })),
            continuation
          });
        }
        if (subTab === 'videos') {
          return jsonResponse({ videos, continuation });
        }

        return jsonResponse({
          id: channelId,
          authorId: channelId,
          author,
          description: meta.description || '',
          subCountText,
          authorThumbnail: authorThumb,
          authorThumbnails: authorThumb ? [{ url: authorThumb }] : [],
          authorBanners: bannerUrl ? [{ url: bannerUrl }] : [],
          latestVideos: videos,
          continuation
        });
      }

      const playlistMatch = path.match(/^\/api\/v1\/playlists\/([^/]+)$/);
      if (playlistMatch) {
        const rawPlaylistId = decodeURIComponent(playlistMatch[1]);

        if (rawPlaylistId.includes('====')) {
          const channelIds = Array.from(new Set(rawPlaylistId.split('====').map((s) => s.trim()).filter(Boolean))).slice(0, 25);
          const perChannel = await Promise.all(
            channelIds.map(async (cid) => {
              const uuId = cid.startsWith('UC') ? 'VL' + 'UU' + cid.slice(2) : cid.startsWith('VL') ? cid : 'VL' + cid;
              try {
                let plData = await callInnerTube('browse', { browseId: uuId }).catch(() => null);
                if (!plData && cid.startsWith('UC')) {
                  plData = await callInnerTube('browse', { browseId: cid, params: 'EgZ2aWRlb3PyBgQKAjoA' }).catch(() => null);
                }
                return plData ? collectVideosFromTree(plData, { authorId: cid }).results.slice(0, 15) : [];
              } catch {
                return [];
              }
            })
          );
          const mergedMap = new Map();
          for (const list of perChannel) {
            for (const v of list) {
              if (v.videoId && !mergedMap.has(v.videoId)) mergedMap.set(v.videoId, v);
            }
          }
          return jsonResponse({
            playlistId: rawPlaylistId,
            title: `登録チャンネル合同タイムライン (${channelIds.length}ch)`,
            author: '合同タイムライン',
            videos: Array.from(mergedMap.values())
          });
        }

        const browseId = rawPlaylistId.startsWith('VL') ? rawPlaylistId : `VL${rawPlaylistId}`;
        let data = await callInnerTube('browse', { browseId }).catch(() => null);
        if (!data && rawPlaylistId.startsWith('UU')) {
          const chId = 'UC' + rawPlaylistId.slice(2);
          data = await callInnerTube('browse', { browseId: chId, params: 'EgZ2aWRlb3PyBgQKAjoA' }).catch(() => null);
        }
        const title =
          data?.metadata?.playlistMetadataRenderer?.title ||
          data?.metadata?.channelMetadataRenderer?.title ||
          getText(data?.header?.playlistHeaderRenderer?.title) ||
          '再生リスト';
        const author =
          getText(data?.header?.playlistHeaderRenderer?.ownerText) ||
          data?.metadata?.channelMetadataRenderer?.title ||
          '';
        const { results: videos, continuation } = data ? collectVideosFromTree(data) : { results: [], continuation: null };

        return jsonResponse({
          playlistId: rawPlaylistId,
          title,
          author,
          videos,
          continuation
        });
      }

      const commentsMatch = path.match(/^\/api\/v1\/(comments|livechat)\/([^/]+)$/);
      if (commentsMatch) {
        const endpointType = commentsMatch[1];
        const videoId = decodeURIComponent(commentsMatch[2]);
        let continuation = url.searchParams.get('continuation') || '';
        const mode = url.searchParams.get('mode') || (endpointType === 'livechat' ? 'live' : '');

        function extractLiveRunsText(runs) {
          if (!Array.isArray(runs)) return '';
          return runs
            .map((r) => {
              if (typeof r.text === 'string') return r.text;
              if (r.emoji) {
                if (!r.emoji.isCustomEmoji && r.emoji.emojiId) return r.emoji.emojiId;
                return r.emoji.shortcuts?.[0] || '';
              }
              return '';
            })
            .join('');
        }

        function parseLiveChatActions(actions) {
          const list = [];
          const seen = new Set();
          if (!Array.isArray(actions)) return list;
          for (const act of actions) {
            const item =
              act?.addChatItemAction?.item ||
              act?.replayChatItemAction?.actions?.[0]?.addChatItemAction?.item ||
              act?.addLiveChatTickerItemAction?.item;
            if (!item) continue;
            const msg =
              item.liveChatTextMessageRenderer ||
              item.liveChatPaidMessageRenderer ||
              item.liveChatPaidStickerRenderer ||
              item.liveChatMembershipItemRenderer;
            if (!msg) continue;
            const id = msg.id || `${msg.authorExternalChannelId || ''}_${msg.timestampUsec || Math.random()}`;
            if (seen.has(id)) continue;
            seen.add(id);

            const rawText =
              extractLiveRunsText(msg.message?.runs) ||
              extractLiveRunsText(msg.headerSubtext?.runs) ||
              extractLiveRunsText(msg.headerPrimaryText?.runs) ||
              getText(msg.message) ||
              '';
            const paidAmount = getText(msg.purchaseAmountText) || '';
            const content = paidAmount ? `[スパチャ ${paidAmount}] ${rawText}`.trim() : rawText;
            if (!content) continue;

            const tsMs = msg.timestampUsec ? Math.floor(Number(msg.timestampUsec) / 1000) : Date.now();
            const publishedText = getText(msg.timestampText) || new Date(tsMs).toISOString();

            list.push({
              commentId: id,
              author: getText(msg.authorName) || 'YouTube ユーザー',
              authorId: msg.authorExternalChannelId || '',
              authorThumbnail: msg.authorPhoto?.thumbnails?.slice(-1)?.[0]?.url || '',
              content,
              publishedText,
              likeCount: 0,
              isLiveChat: true,
              paidAmount: paidAmount || undefined
            });
          }
          return list;
        }

        async function fetchLiveChatByToken(liveToken, isReplay = false) {
          const ep = isReplay ? 'live_chat/get_live_chat_replay' : 'live_chat/get_live_chat';
          const payload = isReplay
            ? { continuation: liveToken, currentPlayerState: { playerOffsetMs: '0' } }
            : { continuation: liveToken };
          const chatData = await callInnerTube(ep, payload, 'WEB');
          const lcc = chatData?.continuationContents?.liveChatContinuation;
          const liveComments = parseLiveChatActions(lcc?.actions);
          const nextContObj = lcc?.continuations?.[0];
          const rawNext =
            nextContObj?.invalidationContinuationData?.continuation ||
            nextContObj?.timedContinuationData?.continuation ||
            nextContObj?.reloadContinuationData?.continuation ||
            nextContObj?.liveChatReplayContinuationData?.continuation ||
            null;
          const nextPrefix = isReplay ? 'livechat_replay:' : 'livechat:';
          return {
            comments: liveComments,
            continuation: rawNext ? `${nextPrefix}${rawNext}` : null,
            isLiveChat: true
          };
        }

        if (continuation.startsWith('livechat:') || continuation.startsWith('livechat_replay:')) {
          const isReplay = continuation.startsWith('livechat_replay:');
          const rawToken = continuation.replace(/^livechat(_replay)?:/, '');
          const liveRes = await fetchLiveChatByToken(rawToken, isReplay);
          return jsonResponse(liveRes);
        }

        let nextData = null;
        let liveChatToken = '';
        let isLiveReplay = false;

        if (!continuation) {
          nextData = await callInnerTube('next', { videoId }, 'WEB');

          const convBar =
            nextData?.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer ||
            nextData?.engagementPanels?.find(
              (p) => p.engagementPanelSectionListRenderer?.panelIdentifier === 'engagement-panel-live-chat-item-section'
            )?.engagementPanelSectionListRenderer?.content?.liveChatRenderer;
          if (convBar) {
            const c0 = convBar.continuations?.[0];
            const activeTok =
              c0?.reloadContinuationData?.continuation ||
              c0?.invalidationContinuationData?.continuation ||
              c0?.timedContinuationData?.continuation;
            const replayTok =
              c0?.liveChatReplayContinuationData?.continuation ||
              c0?.playerSeekContinuationData?.continuation;
            if (activeTok) {
              liveChatToken = activeTok;
              isLiveReplay = false;
            } else if (replayTok) {
              liveChatToken = replayTok;
              isLiveReplay = true;
            }
          }

          if (mode === 'live' && liveChatToken) {
            const liveRes = await fetchLiveChatByToken(liveChatToken, isLiveReplay);
            return jsonResponse(liveRes);
          }

          function findCommentToken(node, depth = 0) {
            if (!node || typeof node !== 'object' || depth > 22) return null;
            if (node.itemSectionRenderer?.sectionIdentifier === 'comment-item-section') {
              const t = node.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (t) return t;
            }
            const cmd = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand;
            if (cmd?.token && (cmd.request === 'CONTINUATION_REQUEST_TYPE_WATCH_NEXT' || depth > 6)) return cmd.token;
            for (const k of Object.keys(node)) {
              const found = findCommentToken(node[k], depth + 1);
              if (found) return found;
            }
            return null;
          }
          continuation = findCommentToken(nextData?.contents) || findCommentToken(nextData) || '';
        }

        const comments = [];
        const seenCommentIds = new Set();

        if (continuation) {
          const commData = await callInnerTube('next', { continuation });
          function walkComments(node, depth = 0) {
            if (!node || typeof node !== 'object' || depth > 22) return;
            const c = node.commentRenderer;
            if (c && c.commentId && !seenCommentIds.has(c.commentId)) {
              seenCommentIds.add(c.commentId);
              comments.push({
                commentId: c.commentId,
                author: getText(c.authorText) || 'YouTube ユーザー',
                authorId: c.authorEndpoint?.browseEndpoint?.browseId || '',
                authorThumbnail: c.authorThumbnail?.thumbnails?.slice(-1)?.[0]?.url || '',
                content: getText(c.contentText),
                publishedText: getText(c.publishedTimeText),
                likeCount: parseCount(getText(c.voteCount) || '0')
              });
            }
            const ep = node.commentEntityPayload;
            if (ep && ep.properties?.commentId && !seenCommentIds.has(ep.properties.commentId)) {
              seenCommentIds.add(ep.properties.commentId);
              comments.push({
                commentId: ep.properties.commentId,
                author: ep.author?.displayName || 'YouTube ユーザー',
                authorId: ep.author?.channelId || '',
                authorThumbnail: ep.author?.avatarThumbnailUrl || '',
                content: ep.properties?.content?.content || '',
                publishedText: ep.properties?.publishedTime || '',
                likeCount: parseCount(ep.toolbar?.likeCountNotliked || ep.toolbar?.likeCountA11y || '0')
              });
            }
            for (const k of Object.keys(node)) {
              walkComments(node[k], depth + 1);
            }
          }
          walkComments(commData);
        }

        // If normal comments are empty (e.g. Live stream in progress or Live archive) and liveChatToken is available, fetch Live Chat!
        if (comments.length === 0 && liveChatToken) {
          try {
            const liveRes = await fetchLiveChatByToken(liveChatToken, isLiveReplay);
            if (liveRes.comments.length > 0) {
              return jsonResponse(liveRes);
            }
          } catch {}
        }

        return jsonResponse({ comments, continuation: null, isLiveChat: false });
      }

      if (path === '/api/v1/suggestions') {
        const q = url.searchParams.get('q') || '';
        if (!q) return jsonResponse({ suggestions: [] });
        const sugUrl = `https://suggestqueries-clients6.youtube.com/complete/search?client=firefox&hl=ja&gl=jp&ds=yt&q=${encodeURIComponent(q)}`;
        const res = await fetch(sugUrl);
        const parsed = await res.json().catch(() => null);
        if (Array.isArray(parsed?.[1])) {
          const suggestions = parsed[1].map((item) => (Array.isArray(item) ? item[0] : item)).filter(Boolean);
          return jsonResponse({ suggestions });
        }
        return jsonResponse({ suggestions: [] });
      }

      const subMatch = path.match(/^\/api\/subtitles\/([^/]+)$/);
      if (subMatch) {
        const videoId = decodeURIComponent(subMatch[1]);
        const lang = url.searchParams.get('lang') || 'ja';
        let playerRes = await fastResolvePlayerData(videoId);
        if (!playerRes?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          playerRes = await callInnerTube('player', { videoId }, 'IOS').catch(() => callInnerTube('player', { videoId }, 'WEB'));
        }
        const tracks = playerRes?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const track =
          tracks.find((t) => t.languageCode === lang) ||
          tracks.find((t) => t.languageCode?.startsWith(lang)) ||
          tracks[0];

        if (!track || !track.baseUrl) {
          return new Response('WEBVTT\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/vtt; charset=utf-8', ...CORS_HEADERS }
          });
        }
        const vttUrl = track.baseUrl.includes('fmt=vtt') ? track.baseUrl : `${track.baseUrl}&fmt=vtt`;
        const vttRes = await fetch(vttUrl);
        const vttText = await vttRes.text();
        return new Response(vttText, {
          status: 200,
          headers: { 'Content-Type': 'text/vtt; charset=utf-8', ...CORS_HEADERS }
        });
      }

      const m3u8Match = path.match(/^\/api\/stream\/([^/.]+)\.m3u8$/);
      if (m3u8Match) {
        const videoId = decodeURIComponent(m3u8Match[1]);
        const playerRes = await callInnerTube('player', { videoId }, 'IOS');
        const hlsUrl = playerRes?.streamingData?.hlsManifestUrl;
        if (hlsUrl) {
          return Response.redirect(hlsUrl, 302);
        }
        return jsonResponse({ error: 'HLS manifest not available for this video' }, 404);
      }

      const streamJsonMatch = path.match(/^\/api\/stream\/([^/.]+)$/);
      if (streamJsonMatch && streamJsonMatch[1] !== 'status') {
        const videoId = decodeURIComponent(streamJsonMatch[1]);
        const guardSid = url.searchParams.get('guard_sid') || '';
        const requirePow = url.searchParams.get('require_pow') === '1' || url.searchParams.get('origin') === 'kaitotube';
        const sessionInfo = inspectGuardSessionId(guardSid);

        if (requirePow && !sessionInfo.verified) {
          const freshSid = sessionInfo.validFormat ? guardSid : createGuardSessionId(0);
          return jsonResponse(
            {
              ok: false,
              code: 'CHALLENGE_REQUIRED',
              sessionId: freshSid,
              message: 'PoW challenge verification required before fetching stream sources'
            },
            403
          );
        }

        const verifiedSid = sessionInfo.validFormat ? guardSid : createGuardSessionId(Math.floor(Date.now() / 1000) + POW_SESSION_TTL_SEC);
        const verifiedUntil = sessionInfo.verifiedUntil || (Math.floor(Date.now() / 1000) + POW_SESSION_TTL_SEC);

        const playerRes = await fastResolvePlayerData(videoId);
        const sd = playerRes?.streamingData || {};
        const vd = playerRes?.videoDetails || {};
        const formats = Array.isArray(sd.formats) ? sd.formats : [];
        const adaptive = Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [];

        const comb360 =
          formats.find((f) => Number(f.itag) === 18)?.url ||
          formats.find((f) => f.qualityLabel === '360p')?.url ||
          formats[0]?.url ||
          `https://yt.omada.cafe/latest_version?id=${videoId}&itag=18&local=true`;
        const comb720 =
          formats.find((f) => Number(f.itag) === 22)?.url ||
          formats.find((f) => f.qualityLabel === '720p')?.url ||
          '';
        const v1080 =
          adaptive.find((f) => Number(f.itag) === 137)?.url ||
          adaptive.find((f) => (f.qualityLabel || '').startsWith('1080p') && (f.mimeType || '').includes('mp4'))?.url ||
          adaptive.find((f) => (f.qualityLabel || '').startsWith('1080p'))?.url ||
          comb720 ||
          comb360;
        const v720 =
          adaptive.find((f) => Number(f.itag) === 136)?.url ||
          adaptive.find((f) => (f.qualityLabel || '').startsWith('720p') && (f.mimeType || '').includes('mp4'))?.url ||
          comb720 ||
          comb360;
        const v480 =
          adaptive.find((f) => Number(f.itag) === 135)?.url ||
          adaptive.find((f) => (f.qualityLabel || '').startsWith('480p'))?.url ||
          v720;
        const audio140 =
          adaptive.find((f) => Number(f.itag) === 140)?.url ||
          adaptive.find((f) => (f.mimeType || '').includes('audio/mp4'))?.url ||
          adaptive.find((f) => (f.mimeType || '').includes('audio'))?.url ||
          `https://yt.omada.cafe/latest_version?id=${videoId}&itag=140&local=true`;

        return jsonResponse({
          ok: true,
          sessionId: verifiedSid,
          verifiedUntil,
          videoId,
          title: vd.title || `video-${videoId}`,
          engine: 'kaitotube-pow-worker',
          streams: {
            muxed: [
              ...(comb720 ? [{ formatId: '22', itag: 22, ext: 'mp4', resolution: '1280x720', formatNote: '720p', width: 1280, height: 720, vcodec: 'avc1.64001F', acodec: 'mp4a.40.2', mediaType: 'muxed', streamUrl: comb720, url: comb720 }] : []),
              { formatId: '18', itag: 18, ext: 'mp4', resolution: '640x360', formatNote: '360p', width: 640, height: 360, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', mediaType: 'muxed', streamUrl: comb360, url: comb360 }
            ],
            videoOnly: [
              { formatId: '137', itag: 137, ext: 'mp4', resolution: '1920x1080', formatNote: '1080p', width: 1920, height: 1080, vcodec: 'avc1.640028', acodec: 'none', mediaType: 'video_only', streamUrl: v1080, url: v1080 },
              { formatId: '136', itag: 136, ext: 'mp4', resolution: '1280x720', formatNote: '720p', width: 1280, height: 720, vcodec: 'avc1.4d401f', acodec: 'none', mediaType: 'video_only', streamUrl: v720, url: v720 }
            ],
            audioByLanguage: {
              ja: {
                language: { code: 'ja', name: '日本語', isDefault: true, isOriginal: true },
                streams: [
                  { formatId: '140', itag: 140, ext: 'm4a', resolution: 'audio only', formatNote: 'medium', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129.5, mediaType: 'audio_only', streamUrl: audio140, url: audio140 }
                ]
              }
            },
            v1080,
            v720,
            v480,
            v360: comb360,
            audio: audio140,
            combined720: comb720 || undefined,
            combined360: comb360
          }
        });
      }

      if (path === '/api/proxy/thumbnail') {
        const videoId = url.searchParams.get('videoId') || '';
        const targetUrl = url.searchParams.get('url') || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
        if (!targetUrl) return jsonResponse({ error: 'Missing url or videoId' }, 400);

        const imgRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': CLIENTS.WEB.userAgent,
            'Referer': 'https://www.youtube.com/'
          }
        });
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await imgRes.arrayBuffer();

        if (url.searchParams.get('format') === 'json') {
          const bytes = new Uint8Array(arrayBuf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          return jsonResponse({ dataUri: `data:${contentType};base64,${base64}`, success: true });
        }

        return new Response(arrayBuf, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            ...CORS_HEADERS
          }
        });
      }

      const rawMatch = path.match(/^\/api\/v1\/raw\/([^/]+)$/);
      if (rawMatch && request.method === 'POST') {
        const endpoint = rawMatch[1];
        const body = await request.json();
        const clientType = url.searchParams.get('client') || 'WEB';
        const rawData = await callInnerTube(endpoint, body, clientType);
        return jsonResponse(rawData);
      }

      return jsonResponse({ error: 'Not Found', path }, 404);
    } catch (err) {
      return jsonResponse({ error: err?.message || 'Internal Worker Error', path }, 500);
    }
  }
};
