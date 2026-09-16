import { getApiSettings } from './apiClient';

// In-memory cache for Base64 thumbnails to avoid duplicate conversions
const base64Cache = new Map<string, string>();

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
 * Defaults to true to avoid YouTube CDN blocks
 */
export function isInvidiousThumbnailsEnabled(): boolean {
  try {
    const val = localStorage.getItem('kaito_thumb_invidious');
    if (val === null) return true; // Default enabled
    return val === 'true';
  } catch {
    return true;
  }
}

/**
 * Update Invidious thumbnail preference
 */
export function setInvidiousThumbnailsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('kaito_thumb_invidious', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('kaito_invidious_thumb_changed', { detail: { enabled } }));
  } catch (e) {
    console.warn('Failed to save invidious thumbnail preference', e);
  }
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
 * Extract the primary thumbnail URL for a video or channel item,
 * preferring Invidious instance thumbnail to avoid YouTube CDN block.
 */
export function extractThumbnailUrl(
  video: any,
  quality: 'high' | 'medium' | 'default' = 'high'
): { url: string; videoId: string } {
  if (!video) return { url: '', videoId: '' };

  const videoId =
    typeof video.id === 'string'
      ? video.id
      : video.id?.videoId || video.id?.channelId || video.videoId || '';

  // If videoId is found, construct Invidious thumbnail URL directly
  if (videoId && video.type !== 'channel') {
    return {
      url: getInvidiousThumbnailUrl(videoId, quality),
      videoId
    };
  }

  // Fallback to snippet/thumbnail object
  const snippet = video.snippet || {};
  const high = snippet.thumbnails?.high?.url;
  const med = snippet.thumbnails?.medium?.url;
  const def = snippet.thumbnails?.default?.url;
  const invThumb = video.videoThumbnails?.find?.((t: any) => t.quality === quality)?.url
    || video.videoThumbnails?.[0]?.url;
  const authorThumb = video.authorThumbnails?.[0]?.url;

  let raw = high || med || def || invThumb || authorThumb || '';

  // If URL is a relative path from Invidious (e.g. /vi/...)
  if (raw.startsWith('/')) {
    const settings = getApiSettings();
    const inst = (settings.invidiousUrl || 'https://yt.omada.cafe/').replace(/\/$/, '');
    raw = `${inst}${raw}`;
  }

  // If URL is i.ytimg.com and we have a videoId, rewrite to Invidious thumbnail
  if (videoId && raw.includes('i.ytimg.com')) {
    raw = getInvidiousThumbnailUrl(videoId, quality);
  }

  return { url: raw, videoId };
}

/**
 * Converts an image URL to Base64 (data URI).
 * Uses GAS google.script.run.fetchAsBase64 if in Apps Script Web App environment,
 * otherwise browser fetch + FileReader with backend proxy fallback.
 * @reference https://github.com/na8526130-cell/kaitotube
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:')) return imageUrl;

  // 1. Check in-memory cache
  if (base64Cache.has(imageUrl)) {
    return base64Cache.get(imageUrl)!;
  }

  // 2. Google Apps Script Web App environment check
  const win = typeof window !== 'undefined' ? (window as any) : null;
  if (win?.google?.script?.run) {
    try {
      const gasBase64 = await new Promise<string | null>((resolve) => {
        win.google.script.run
          .withSuccessHandler((res: string | null) => resolve(res))
          .withFailureHandler(() => resolve(null))
          .fetchAsBase64(imageUrl);
      });
      if (gasBase64 && gasBase64.startsWith('data:')) {
        base64Cache.set(imageUrl, gasBase64);
        return gasBase64;
      }
    } catch (e) {
      console.warn('GAS fetchAsBase64 error:', e);
    }
  }

  // 3. Client fetch + FileReader (Invidious instances support CORS: Access-Control-Allow-Origin: *)
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(imageUrl);
        reader.readAsDataURL(blob);
      });
      if (b64 && b64.startsWith('data:')) {
        base64Cache.set(imageUrl, b64);
        return b64;
      }
    }
  } catch {
    // Client CORS/network restricted, proceed to server proxy fallback
  }

  // 4. Server API Proxy Fallback (/api/fetchAsBase64 or /api/proxy/thumbnail?format=json)
  try {
    const proxyRes = await fetch(`/api/proxy/thumbnail?format=json&url=${encodeURIComponent(imageUrl)}`);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data?.dataUri && data.dataUri.startsWith('data:')) {
        base64Cache.set(imageUrl, data.dataUri);
        return data.dataUri;
      }
    }
  } catch {
    // Silently continue to fallback
  }

  return imageUrl;
}
