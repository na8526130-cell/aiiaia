// Channel Avatar in-memory and session storage cache
import { customFetch } from './apiClient';

const avatarCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();

// Preload from sessionStorage
try {
  const saved = sessionStorage.getItem('kaito_channel_avatars');
  if (saved) {
    const parsed = JSON.parse(saved);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') avatarCache.set(k, v);
    }
  }
} catch {
  // ignore
}

function persistCache() {
  try {
    const obj: Record<string, string> = {};
    let count = 0;
    for (const [k, v] of avatarCache.entries()) {
      if (count++ > 200) break;
      obj[k] = v;
    }
    sessionStorage.setItem('kaito_channel_avatars', JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export function getCachedChannelAvatar(channelId?: string): string | undefined {
  if (!channelId) return undefined;
  return avatarCache.get(channelId);
}

export function setCachedChannelAvatar(channelId: string, url: string) {
  if (!channelId || !url) return;
  avatarCache.set(channelId, url);
  persistCache();
  window.dispatchEvent(new CustomEvent('kaito_avatar_cached', { detail: { channelId, url } }));
}

export async function fetchChannelAvatar(channelId: string): Promise<string> {
  if (!channelId) return '';
  if (avatarCache.has(channelId)) {
    return avatarCache.get(channelId)!;
  }

  if (pendingFetches.has(channelId)) {
    return pendingFetches.get(channelId)!;
  }

  const promise = (async () => {
    try {
      const res = await customFetch(`/api/youtube/channel/${channelId}`);
      const data = await res.json();
      const item = data.items?.[0];
      const thumb =
        item?.snippet?.thumbnails?.high?.url ||
        item?.snippet?.thumbnails?.medium?.url ||
        item?.snippet?.thumbnails?.default?.url ||
        '';
      if (thumb) {
        avatarCache.set(channelId, thumb);
        persistCache();
        window.dispatchEvent(new CustomEvent('kaito_avatar_cached', { detail: { channelId, url: thumb } }));
        return thumb;
      }
    } catch {
      // ignore
    } finally {
      pendingFetches.delete(channelId);
    }
    return '';
  })();

  pendingFetches.set(channelId, promise);
  return promise;
}
