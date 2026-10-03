/**
 * indexedDbStorage.ts
 * IndexedDB (VideoHistory / PlaylistsDB) による容量無制限保存エンジン
 *
 * - 履歴を VideoHistory DB、マイ再生リストを PlaylistsDB DB に保存
 * - サムネイル画像 (Base64 または URL) を ArrayBuffer (バイナリデータ) に変換して格納
 * - 数千件の履歴やプレイリストを画像付きで保存しても localStorage (上限約5MB) の制限に達しません
 */

import { YouTubeVideoItem, UserCustomPlaylist } from '../types';

const HISTORY_DB_NAME = 'VideoHistory';
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE_NAME = 'history';

const PLAYLISTS_DB_NAME = 'PlaylistsDB';
const PLAYLISTS_DB_VERSION = 1;
const PLAYLISTS_STORE_NAME = 'playlists';

// Active Blob URL cache for ArrayBuffer thumbnails
const _thumbnailBlobUrlMap = new Map<string, string>();

/**
 * Base64 Data URI -> ArrayBuffer + mimeType
 */
export function base64ToArrayBuffer(dataUri: string): { buffer: ArrayBuffer; mime: string } | null {
  try {
    if (!dataUri || !dataUri.startsWith('data:')) return null;
    const [meta, base64Data] = dataUri.split(',');
    if (!base64Data) return null;
    const mimeMatch = meta.match(/data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return { buffer: bytes.buffer, mime };
  } catch {
    return null;
  }
}

/**
 * ArrayBuffer -> Blob URL (cached in memory per videoId)
 */
export function arrayBufferToThumbnailUrl(key: string, buffer: ArrayBuffer, mime = 'image/jpeg'): string {
  const existing = _thumbnailBlobUrlMap.get(key);
  if (existing) return existing;
  try {
    const blob = new Blob([buffer], { type: mime });
    const url = URL.createObjectURL(blob);
    _thumbnailBlobUrlMap.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/**
 * Fetch thumbnail URL (via proxy if external) and convert to ArrayBuffer binary
 */
export async function fetchThumbnailAsArrayBuffer(
  rawUrl?: string
): Promise<{ buffer: ArrayBuffer; mime: string } | null> {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('data:')) {
    return base64ToArrayBuffer(rawUrl);
  }
  if (rawUrl.startsWith('blob:')) return null;

  try {
    const fetchUrl =
      rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
        ? `/api/proxy/thumbnail?url=${encodeURIComponent(rawUrl)}`
        : rawUrl;
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

function getVideoIdKey(video: YouTubeVideoItem): string {
  if (!video) return '';
  if (video.playlistId) return video.playlistId;
  if (typeof video.id === 'string') return video.id;
  return (video.id as any)?.videoId || (video.id as any)?.playlistId || '';
}

// ====================================================
// 1. VideoHistory IndexedDB
// ====================================================
let historyDbPromise: Promise<IDBDatabase> | null = null;

function openHistoryDb(): Promise<IDBDatabase> {
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const store = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'videoId' });
        store.createIndex('watchedAtMs', 'watchedAtMs', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return historyDbPromise;
}

export async function saveVideoToHistoryIDB(video: YouTubeVideoItem): Promise<void> {
  const videoId = getVideoIdKey(video);
  if (!videoId) return;
  try {
    const db = await openHistoryDb();
    const rawThumb =
      video.snippet?.thumbnails?.high?.url ||
      video.snippet?.thumbnails?.medium?.url ||
      video.snippet?.thumbnails?.default?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const binaryThumb = await fetchThumbnailAsArrayBuffer(rawThumb);
    const watchedAt = video.watchedAt || new Date().toISOString();
    const watchedAtMs = new Date(watchedAt).getTime() || Date.now();

    const record = {
      videoId,
      watchedAt,
      watchedAtMs,
      videoData: {
        ...video,
        watchedAt
      },
      thumbnailBuffer: binaryThumb?.buffer || null,
      thumbnailMime: binaryThumb?.mime || 'image/jpeg'
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[VideoHistory IDB] save error:', err);
  }
}

export async function loadAllHistoryFromIDB(): Promise<YouTubeVideoItem[]> {
  try {
    const db = await openHistoryDb();
    const records = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE_NAME, 'readonly');
      const store = tx.objectStore(HISTORY_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    records.sort((a, b) => (b.watchedAtMs || 0) - (a.watchedAtMs || 0));

    return records.map((rec) => {
      const item: YouTubeVideoItem = { ...(rec.videoData || {}) };
      if (rec.thumbnailBuffer instanceof ArrayBuffer && rec.thumbnailBuffer.byteLength > 0) {
        const blobUrl = arrayBufferToThumbnailUrl(`hist_${rec.videoId}`, rec.thumbnailBuffer, rec.thumbnailMime);
        if (blobUrl && item.snippet) {
          item.snippet = {
            ...item.snippet,
            thumbnails: {
              ...item.snippet.thumbnails,
              high: { url: blobUrl },
              medium: { url: blobUrl },
              default: { url: blobUrl }
            }
          };
        }
      }
      return item;
    });
  } catch {
    return [];
  }
}

export async function removeHistoryItemFromIDB(videoId: string): Promise<void> {
  if (!videoId) return;
  try {
    const db = await openHistoryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
      tx.objectStore(HISTORY_STORE_NAME).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function clearAllHistoryFromIDB(): Promise<void> {
  try {
    const db = await openHistoryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
      tx.objectStore(HISTORY_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// ====================================================
// 2. PlaylistsDB IndexedDB
// ====================================================
let playlistsDbPromise: Promise<IDBDatabase> | null = null;

function openPlaylistsDb(): Promise<IDBDatabase> {
  if (playlistsDbPromise) return playlistsDbPromise;
  playlistsDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = window.indexedDB.open(PLAYLISTS_DB_NAME, PLAYLISTS_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE_NAME)) {
        db.createObjectStore(PLAYLISTS_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return playlistsDbPromise;
}

export async function savePlaylistsToIDB(playlists: UserCustomPlaylist[]): Promise<void> {
  try {
    const db = await openPlaylistsDb();

    // Prepare playlists with ArrayBuffer binary thumbnails for cover videos
    const prepared = await Promise.all(
      playlists.map(async (pl) => {
        const videoBuffers: Record<string, { buffer: ArrayBuffer; mime: string }> = {};
        const videosToCache = (pl.videos || []).slice(0, 30);
        await Promise.all(
          videosToCache.map(async (v) => {
            const vId = getVideoIdKey(v);
            if (!vId) return;
            const rawThumb =
              v.snippet?.thumbnails?.high?.url ||
              v.snippet?.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
            const bin = await fetchThumbnailAsArrayBuffer(rawThumb);
            if (bin) {
              videoBuffers[vId] = bin;
            }
          })
        );
        return {
          id: pl.id,
          title: pl.title,
          description: pl.description,
          createdAt: pl.createdAt,
          visibility: pl.visibility || (pl.isPublic ? 'public' : 'private'),
          isPublic: Boolean(pl.isPublic || pl.visibility === 'public'),
          authorName: pl.authorName || '',
          sharedId: pl.sharedId || pl.id,
          cloneCount: pl.cloneCount || 0,
          sourcePlaylistId: pl.sourcePlaylistId || '',
          videos: pl.videos || [],
          videoBuffers,
          updatedAt: Date.now()
        };
      })
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PLAYLISTS_STORE_NAME);
      store.clear();
      for (const item of prepared) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[PlaylistsDB IDB] save error:', err);
  }
}

export async function loadPlaylistsFromIDB(): Promise<UserCustomPlaylist[]> {
  try {
    const db = await openPlaylistsDb();
    const records = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(PLAYLISTS_STORE_NAME, 'readonly');
      const store = tx.objectStore(PLAYLISTS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return records.map((rec) => {
      const videoBuffers = rec.videoBuffers || {};
      const hydratedVideos: YouTubeVideoItem[] = (rec.videos || []).map((v: YouTubeVideoItem) => {
        const vId = getVideoIdKey(v);
        const bin = vId ? videoBuffers[vId] : null;
        if (bin && bin.buffer instanceof ArrayBuffer && bin.buffer.byteLength > 0) {
          const blobUrl = arrayBufferToThumbnailUrl(`pl_${rec.id}_${vId}`, bin.buffer, bin.mime || 'image/jpeg');
          if (blobUrl && v.snippet) {
            return {
              ...v,
              snippet: {
                ...v.snippet,
                thumbnails: {
                  ...v.snippet.thumbnails,
                  high: { url: blobUrl },
                  medium: { url: blobUrl },
                  default: { url: blobUrl }
                }
              }
            };
          }
        }
        return v;
      });

      return {
        id: rec.id,
        title: rec.title,
        description: rec.description || '',
        createdAt: rec.createdAt || '',
        visibility: rec.visibility || (rec.isPublic ? 'public' : 'private'),
        isPublic: Boolean(rec.isPublic || rec.visibility === 'public'),
        authorName: rec.authorName || '',
        sharedId: rec.sharedId || rec.id,
        cloneCount: rec.cloneCount || 0,
        sourcePlaylistId: rec.sourcePlaylistId || '',
        videos: hydratedVideos
      };
    });
  } catch {
    return [];
  }
}
