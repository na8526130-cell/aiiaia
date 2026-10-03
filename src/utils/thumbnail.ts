import { getApiSettings } from './apiClient';
import {
  getMemoryCachedThumbnail,
  getThumbnailFromIndexedDB,
  saveBase64ThumbnailToIndexedDB
} from './indexedDbThumbnailStorage';

// In-memory cache for Base64 thumbnails to avoid duplicate conversions
const base64Cache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

export function getCachedBase64Thumbnail(url: string, videoId?: string): string | null {
  if (!url && !videoId) return null;
  if (url && url.startsWith('data:')) return url;
  if (url && base64Cache.has(url)) return base64Cache.get(url)!;
  if (videoId && base64Cache.has(videoId)) return base64Cache.get(videoId)!;
  const memUrl = url ? getMemoryCachedThumbnail(url) : null;
  if (memUrl && memUrl.startsWith('data:')) return memUrl;
  const memVid = videoId ? getMemoryCachedThumbnail(videoId) : null;
  if (memVid && memVid.startsWith('data:')) return memVid;
  return null;
}

/**
 * Check if Base64 thumbnail conversion is enabled
 * Defaults to true per user configuration (reference: na8526130-cell/kaitotube)
 */
export function isBase64ThumbnailsEnabled(): boolean {
  try {
    const val = localStorage.getItem('kaito_use_base64');
    if (val === null) return true; // Default enabled
    return val === 'true';
  } catch {
    return true;
  }
}

/**
 * Update Base64 thumbnail conversion setting
 */
export function setBase64ThumbnailsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('kaito_use_base64', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('kaito_base64_changed', { detail: { enabled } }));
  } catch (e) {
    console.warn('Failed to save base64 thumbnail preference', e);
  }
}

/**
 * Check if Invidious thumbnail routing is enabled
 * Defaults to false so YouTube/InnerTube thumbnails are used first and Invidious is only used on error fallback
 */
export function isInvidiousThumbnailsEnabled(): boolean {
  try {
    const val = localStorage.getItem('kaito_thumb_invidious_v2');
    if (val === null) return false; // Default disabled (use InnerTube/ytimg first, Invidious only on error)
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Update Invidious thumbnail preference
 */
export function setInvidiousThumbnailsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('kaito_thumb_invidious_v2', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('kaito_invidious_thumb_changed', { detail: { enabled } }));
  } catch (e) {
    console.warn('Failed to save invidious thumbnail preference', e);
  }
}

function isElevenCharVideoId(id: string): boolean {
  return Boolean(
    id &&
    /^[a-zA-Z0-9_-]{11}$/.test(id) &&
    !id.startsWith('PL') &&
    !id.startsWith('UU') &&
    !id.startsWith('VL') &&
    !id.startsWith('OL')
  );
}

/**
 * Get Invidious instance thumbnail URL for a given video ID
 * @param videoId YouTube video ID (e.g. "cbqvxD321g4")
 * @param quality 'high' | 'medium' | 'default'
 * @param customInstance optional instance URL override
 */
export function getInvidiousThumbnailUrl(
  videoId: string,
  quality: 'high' | 'medium' | 'default' = 'high',
  customInstance?: string
): string {
  if (!videoId) return '';
  const settings = getApiSettings();
  let instance = (customInstance || settings.invidiousUrl || 'https://yt.omada.cafe/').trim();
  if (!instance.startsWith('http://') && !instance.startsWith('https://')) {
    instance = 'https://' + instance;
  }
  instance = instance.replace(/\/$/, '');

  const file =
    quality === 'high' ? 'hqdefault.jpg' : quality === 'medium' ? 'mqdefault.jpg' : 'default.jpg';

  return `${instance}/vi/${videoId}/${file}`;
}

/**
 * Extract the primary thumbnail URL for a video, playlist, or channel item,
 * preferring Invidious instance thumbnail to avoid YouTube CDN block.
 */
export function extractThumbnailUrl(
  video: any,
  quality: 'high' | 'medium' | 'default' = 'high'
): { url: string; videoId: string } {
  if (!video) return { url: '', videoId: '' };

  const rawId =
    typeof video.id === 'string'
      ? video.id
      : video.id?.videoId || video.videoId || '';

  const isPlaylistObj =
    Boolean(video.isPlaylist) ||
    Boolean(video.playlistId && !video.id?.videoId && !isElevenCharVideoId(rawId)) ||
    rawId.startsWith('PL') ||
    rawId.startsWith('UU') ||
    rawId.startsWith('OLAK') ||
    rawId.startsWith('VL') ||
    rawId.startsWith('RD');

  const validVideoId = isElevenCharVideoId(rawId)
    ? rawId
    : isElevenCharVideoId(video.firstVideoId || '')
      ? video.firstVideoId
      : '';

  // Extract raw thumbnail from snippet or item fields
  const snippet = video.snippet || {};
  const high = snippet.thumbnails?.high?.url;
  const med = snippet.thumbnails?.medium?.url;
  const def = snippet.thumbnails?.default?.url;
  const directThumb = typeof video.thumbnail === 'string' ? video.thumbnail : '';
  const invThumb =
    video.videoThumbnails?.find?.((t: any) => t.quality === quality)?.url ||
    video.videoThumbnails?.[0]?.url;
  const authorThumb = video.authorThumbnails?.[0]?.url;

  let raw = high || med || def || directThumb || invThumb || authorThumb || '';

  // Also check if raw URL itself contains a /vi/VIDEO_ID/
  let extractedVidFromUrl = validVideoId;
  if (!extractedVidFromUrl && raw) {
    const m = raw.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    if (m && m[1]) extractedVidFromUrl = m[1];
  }

  // If we have a valid 11-char videoId and it's not a channel or custom external cover
  if (extractedVidFromUrl && video.type !== 'channel' && !isPlaylistObj) {
    return {
      url: isInvidiousThumbnailsEnabled()
        ? getInvidiousThumbnailUrl(extractedVidFromUrl, quality)
        : `https://i.ytimg.com/vi/${extractedVidFromUrl}/hqdefault.jpg`,
      videoId: extractedVidFromUrl
    };
  }

  // For playlists that have a firstVideoId or /vi/VIDEO_ID/ thumbnail
  if (isPlaylistObj && extractedVidFromUrl && (!raw || raw.includes('/vi/'))) {
    return {
      url: isInvidiousThumbnailsEnabled()
        ? getInvidiousThumbnailUrl(extractedVidFromUrl, quality)
        : `https://i.ytimg.com/vi/${extractedVidFromUrl}/hqdefault.jpg`,
      videoId: extractedVidFromUrl
    };
  }

  // If URL is a relative path from Invidious (e.g. /vi/...)
  if (raw.startsWith('/')) {
    const settings = getApiSettings();
    const inst = (settings.invidiousUrl || 'https://yt.omada.cafe/').replace(/\/$/, '');
    raw = `${inst}${raw}`;
  }

  // If URL is i.ytimg.com and we have a valid 11-char videoId, rewrite to Invidious thumbnail
  if (extractedVidFromUrl && raw.includes('i.ytimg.com') && isInvidiousThumbnailsEnabled()) {
    raw = getInvidiousThumbnailUrl(extractedVidFromUrl, quality);
  }

  return { url: raw, videoId: extractedVidFromUrl };
}

/**
 * Converts an image URL to Base64 (data URI: data:image/jpeg;base64,...).
 * Uses:
 * 1. In-memory & IndexedDB Base64 cache
 * 2. GAS google.script.run.fetchAsBase64 if in Apps Script Web App environment
 * 3. Server API Proxy (/api/proxy/thumbnail?format=json) with automatic i.ytimg.com fallback
 * 4. Client CORS fetch + FileReader
 */
export async function fetchImageAsBase64(imageUrl: string, fallbackVideoId?: string): Promise<string> {
  if (!imageUrl && !fallbackVideoId) return '';
  if (imageUrl && imageUrl.startsWith('data:')) return imageUrl;

  const effectiveVid =
    fallbackVideoId ||
    imageUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1] ||
    '';

  const cacheKey = imageUrl || effectiveVid;

  // 1. Check synchronous memory cache
  const memCached = getCachedBase64Thumbnail(imageUrl, effectiveVid);
  if (memCached && memCached.startsWith('data:')) {
    return memCached;
  }

  // Deduplicate concurrent requests for the same URL
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)!;
  }

  const promise = (async (): Promise<string> => {
    try {
      // 2. Check IndexedDB Base64 cache
      const idbCached =
        (imageUrl ? await getThumbnailFromIndexedDB(imageUrl) : null) ||
        (effectiveVid ? await getThumbnailFromIndexedDB(effectiveVid) : null);
      if (idbCached && idbCached.startsWith('data:')) {
        if (imageUrl) base64Cache.set(imageUrl, idbCached);
        if (effectiveVid) base64Cache.set(effectiveVid, idbCached);
        return idbCached;
      }

      // 3. Google Apps Script Web App environment check
      const win = typeof window !== 'undefined' ? (window as any) : null;
      if (win?.google?.script?.run) {
        try {
          const gasBase64 = await new Promise<string | null>((resolve) => {
            win.google.script.run
              .withSuccessHandler((res: string | null) => resolve(res))
              .withFailureHandler(() => resolve(null))
              .fetchAsBase64(imageUrl || `https://i.ytimg.com/vi/${effectiveVid}/hqdefault.jpg`);
          });
          if (gasBase64 && gasBase64.startsWith('data:')) {
            if (imageUrl) base64Cache.set(imageUrl, gasBase64);
            if (effectiveVid) base64Cache.set(effectiveVid, gasBase64);
            saveBase64ThumbnailToIndexedDB(imageUrl || effectiveVid, gasBase64, effectiveVid);
            return gasBase64;
          }
        } catch (e) {
          console.warn('GAS fetchAsBase64 error:', e);
        }
      }

      // 4. Server API Proxy (/api/proxy/thumbnail?format=json) — works for both Invidious & i.ytimg.com without CORS issues
      try {
        const proxyUrl = `/api/proxy/thumbnail?format=json&url=${encodeURIComponent(imageUrl)}&videoId=${encodeURIComponent(effectiveVid)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          if (data?.dataUri && typeof data.dataUri === 'string' && data.dataUri.startsWith('data:')) {
            if (imageUrl) base64Cache.set(imageUrl, data.dataUri);
            if (effectiveVid) base64Cache.set(effectiveVid, data.dataUri);
            saveBase64ThumbnailToIndexedDB(imageUrl || effectiveVid, data.dataUri, effectiveVid);
            return data.dataUri;
          }
        }
      } catch {
        // Proceed to client CORS fetch fallback
      }

      // 5. Client fetch + FileReader (Try i.ytimg.com first, fallback to Invidious only if needed)
      const candidateUrls = [
        imageUrl,
        effectiveVid ? `https://i.ytimg.com/vi/${effectiveVid}/hqdefault.jpg` : '',
        effectiveVid ? getInvidiousThumbnailUrl(effectiveVid, 'high') : ''
      ].filter(Boolean);

      for (const candidate of candidateUrls) {
        try {
          const res = await fetch(candidate, { mode: 'cors' });
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 100) {
              const b64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || '');
                reader.onerror = () => resolve('');
                reader.readAsDataURL(blob);
              });
              if (b64 && b64.startsWith('data:')) {
                if (imageUrl) base64Cache.set(imageUrl, b64);
                if (effectiveVid) base64Cache.set(effectiveVid, b64);
                saveBase64ThumbnailToIndexedDB(imageUrl || effectiveVid, b64, effectiveVid);
                return b64;
              }
            }
          }
        } catch {
          // Try next candidate
        }
      }

      return imageUrl;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}
