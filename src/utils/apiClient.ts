import { ApiSettings } from '../types';

export const DEFAULT_SETTINGS: ApiSettings = {
  provider: 'innertube',
  innertubeUrl: '/api/worker',
  invidiousUrl: 'https://yt.omada.cafe/'
};

export const PRESET_INNERTUBE_INSTANCES = [
  { name: 'サーバー内蔵 InnerTube Worker (/api/worker・推奨・最速)', url: '/api/worker' },
  { name: '自作 Cloudflare Worker (proxy.wa0260966.workers.dev)', url: 'https://proxy.wa0260966.workers.dev/' }
];

export const PRESET_INVIDIOUS_INSTANCES = [
  { name: 'omada.cafe (推奨)', url: 'https://yt.omada.cafe/' },
  { name: 'nadeko.net', url: 'https://inv.nadeko.net' },
  { name: 'privacydev.net', url: 'https://invidious.privacydev.net' },
  { name: 'drgns.space', url: 'https://invidious.drgns.space' },
  { name: 'nerdvpn.de', url: 'https://invidious.nerdvpn.de' }
];

export function getCustomProxyUrl(): string {
  try {
    return (localStorage.getItem('kaito_custom_proxy') || '').trim();
  } catch {
    return '';
  }
}

export function saveCustomProxyUrl(url: string): void {
  try {
    const clean = url.trim();
    if (clean) {
      localStorage.setItem('kaito_custom_proxy', clean);
    } else {
      localStorage.removeItem('kaito_custom_proxy');
    }
    window.dispatchEvent(new CustomEvent('kaito_custom_proxy_changed', { detail: clean }));
  } catch (e) {
    console.error('Failed to save custom proxy:', e);
  }
}

export function wrapWithCustomProxy(targetUrl: string): string {
  if (!targetUrl) return targetUrl;
  const custom = getCustomProxyUrl();
  if (!custom) return targetUrl;
  if (targetUrl.startsWith('/api/')) return targetUrl;
  if (custom.includes('script.google.com')) {
    const sep = custom.includes('?') ? '&' : '?';
    return `${custom}${sep}url=${encodeURIComponent(targetUrl)}`;
  }
  const cleanCustom = custom.replace(/\/+$/, '');
  if (cleanCustom.includes('workers.dev') || cleanCustom === '/api/worker') {
    return `${cleanCustom}/api/youtube/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
  }
  const sep = cleanCustom.includes('?') ? '&' : '?';
  return `${cleanCustom}${sep}url=${encodeURIComponent(targetUrl)}`;
}

export function getApiSettings(): ApiSettings {
  try {
    const saved = localStorage.getItem('kaito_tube_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const rawUrl = (parsed.innertubeUrl || '').trim();
      const isLegacyDead =
        rawUrl.includes('myproxy0108.workers.dev') ||
        rawUrl.includes('yt-proxy.workers.dev');
      const migratedUrl = !rawUrl || isLegacyDead ? '/api/worker' : rawUrl;
      return {
        provider: 'innertube',
        innertubeUrl: migratedUrl,
        invidiousUrl: parsed.invidiousUrl || 'https://yt.omada.cafe/'
      };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveApiSettings(settings: ApiSettings): void {
  try {
    localStorage.setItem('kaito_tube_settings', JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('kaito_settings_changed', { detail: settings }));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function convertWorkerVideoItem(item: any) {
  const videoId = item.videoId || item.id || '';
  const thumbnail = item.thumbnail || item.videoThumbnails?.[0]?.url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
  const durationSec = typeof item.lengthSeconds === 'number' ? item.lengthSeconds : (item.duration ? parseInt(item.duration, 10) : 0);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationIso = durationSec > 0 ? `PT${mins}M${secs}S` : 'PT0M0S';

  let authorImg = '';
  if (Array.isArray(item.authorThumbnails) && item.authorThumbnails.length > 0) {
    authorImg = item.authorThumbnails[item.authorThumbnails.length - 1]?.url || item.authorThumbnails[0]?.url || '';
  } else if (typeof item.authorThumbnail === 'string') {
    authorImg = item.authorThumbnail;
  }

  let publishedAt = new Date().toISOString();
  if (typeof item.published === 'number') {
    publishedAt = new Date(item.published > 10000000000 ? item.published : item.published * 1000).toISOString();
  } else if (item.publishedText) {
    publishedAt = item.publishedText;
  }

  const views = item.viewCount !== undefined ? String(item.viewCount) : (item.views ? String(item.views) : '0');

  const isActuallyLive = Boolean(item.liveNow && (!durationSec || durationSec === 0));

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    liveNow: isActuallyLive,
    lengthSeconds: durationSec,
    isShort: Boolean(item.isShort || item.type === 'short'),
    snippet: {
      publishedAt,
      channelId: item.authorId || item.channelId || '',
      title: item.title || '',
      description: item.description || item.descriptionHtml || '',
      channelThumbnail: authorImg,
      animatedThumbnailUrl: item.animatedThumbnailUrl || undefined,
      thumbnails: {
        default: { url: thumbnail },
        medium: { url: thumbnail },
        high: { url: thumbnail },
        standard: { url: thumbnail },
        maxres: { url: thumbnail }
      },
      channelTitle: item.author || item.channelTitle || '',
      liveBroadcastContent: isActuallyLive ? 'live' : 'none',
      tags: item.keywords || item.tags || []
    },
    statistics: {
      viewCount: views,
      likeCount: item.likeCount !== undefined ? String(item.likeCount) : '0',
      commentCount: item.commentCount !== undefined ? String(item.commentCount) : '0'
    },
    contentDetails: {
      duration: durationIso,
      dimension: '2d',
      definition: 'hd',
      caption: 'false',
      licensedContent: false
    }
  };
}

async function fetchDirectInvidiousJson(invBase: string, endpoint: string, params: Record<string, string> = {}) {
  let base = (invBase || 'https://yt.omada.cafe').trim().replace(/\/+$/, '');
  if (!base.startsWith('http')) base = 'https://' + base;
  const cleanEp = endpoint.replace(/^\/+/, '');
  const url = new URL(`${base}/api/v1/${cleanEp}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const nativeFetch = (window as any).__originalFetch || window.fetch;
  const res = await nativeFetch.call(window, url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Invidious HTTP ${res.status}`);
  return res.json();
}

async function fetchDirectWorkerJson(workerBase: string, endpoint: string, params: Record<string, string> = {}) {
  let base = (workerBase || 'https://proxy.wa0260966.workers.dev').trim().replace(/\/+$/, '');
  if (base.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    base = `${origin}${base}`;
  } else if (!base.startsWith('http')) {
    base = 'https://' + base;
  }
  const cleanEp = endpoint.replace(/^\/+/, '');
  const url = new URL(`${base}/api/v1/${cleanEp}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const nativeFetch = (window as any).__originalFetch || window.fetch;
  try {
    const res = await nativeFetch.call(window, url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // If trending endpoint returns 400/500 on an older worker script, seamlessly fallback to search on the same worker
      if (cleanEp === 'trending') {
        const searchUrl = new URL(`${base}/api/v1/search`);
        searchUrl.searchParams.set('q', '急上昇 人気 動画 日本');
        searchUrl.searchParams.set('limit', '28');
        const sRes = await nativeFetch.call(window, searchUrl.toString(), { headers: { Accept: 'application/json' } });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (Array.isArray(sData?.results)) return sData.results;
        }
      }
      throw new Error(`Worker HTTP ${res.status}`);
    }
    return await res.json();
  } catch (workerErr) {
    // Only if InnerTube Worker (https://proxy.wa0260966.workers.dev/) fails with an error, fallback to Invidious
    const settings = getApiSettings();
    const invBase = settings.invidiousUrl || 'https://yt.omada.cafe/';
    const invData = await fetchDirectInvidiousJson(invBase, cleanEp, params);
    if (cleanEp === 'search' && Array.isArray(invData)) {
      return { results: invData, continuation: null };
    }
    return invData;
  }
}

async function resolveClientInnerTubeFallback(urlStr: string): Promise<any | null> {
  try {
    const settings = getApiSettings();
    const workerBase = settings.innertubeUrl || 'https://proxy.wa0260966.workers.dev';
    const [pathPart, queryPart] = urlStr.split('?');
    const searchParams = new URLSearchParams(queryPart || '');

    // 1. Related Videos (/api/youtube/related/:id)
    if (pathPart.startsWith('/api/youtube/related/')) {
      const id = decodeURIComponent(pathPart.replace('/api/youtube/related/', ''));
      const rawQ = searchParams.get('q') || '';
      const pageToken = searchParams.get('pageToken') || '';
      const seen = new Set<string>([id]);
      const items: any[] = [];
      let resolvedTitle = rawQ === 'YouTube Video' || rawQ === 'YouTube Short' ? '' : rawQ;
      let resolvedAuthor = '';
      let nextContinuation: string | null = null;

      const addUnique = (list: any[]) => {
        for (const it of list) {
          const vId = typeof it.id === 'string' ? it.id : it.id?.videoId;
          if (vId && !seen.has(vId)) {
            seen.add(vId);
            items.push(it);
          }
        }
      };

      if (!pageToken || pageToken.startsWith('page_')) {
        try {
          const vData = await fetchDirectWorkerJson(workerBase, `videos/${id}`);
          if (vData) {
            if (!resolvedTitle && vData.title) resolvedTitle = vData.title;
            if (vData.author) resolvedAuthor = vData.author;
            const recs = vData.recommendedVideos || vData.relatedVideos || vData.related || [];
            if (Array.isArray(recs) && recs.length > 0) {
              addUnique(recs.map(convertWorkerVideoItem));
            }
          }
        } catch {}
      }

      const cleanQ = (resolvedTitle || resolvedAuthor)
        .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）|#\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 45) || resolvedTitle || resolvedAuthor;

      if (cleanQ && (items.length < 10 || pageToken)) {
        try {
          const sp: Record<string, string> = { q: cleanQ, limit: '20' };
          if (pageToken && !pageToken.startsWith('page_')) sp.continuation = pageToken;
          const sData = await fetchDirectWorkerJson(workerBase, 'search', sp);
          if (sData && Array.isArray(sData.results) && sData.results.length > 0) {
            const sItems = sData.results.map(convertWorkerVideoItem);
            if (items.length > 0 && !items[0]?.snippet?.channelTitle) {
              const old = [...items];
              items.length = 0;
              seen.clear();
              seen.add(id);
              addUnique(sItems);
              addUnique(old);
            } else {
              addUnique(sItems);
            }
            nextContinuation = sData.continuation || null;
          }
        } catch {}
      }

      if (items.length === 0) {
        try {
          const tData = await fetchDirectWorkerJson(workerBase, 'trending');
          if (Array.isArray(tData)) addUnique(tData.map(convertWorkerVideoItem));
        } catch {}
      }

      if (items.length > 0) {
        return { kind: 'youtube#searchResponse', items, nextPageToken: nextContinuation };
      }
    }

    // 2. Video Detail (/api/youtube/video/:id)
    if (pathPart.startsWith('/api/youtube/video/')) {
      const id = decodeURIComponent(pathPart.replace('/api/youtube/video/', ''));
      const vData = await fetchDirectWorkerJson(workerBase, `videos/${id}`);
      if (vData && (vData.title || vData.videoId)) {
        const recs = vData.recommendedVideos || vData.relatedVideos || [];
        return {
          kind: 'youtube#videoListResponse',
          items: [convertWorkerVideoItem(vData)],
          relatedItems: Array.isArray(recs) ? recs.map(convertWorkerVideoItem) : []
        };
      }
    }

    // 3. Trending (/api/youtube/trending)
    if (pathPart === '/api/youtube/trending') {
      const tData = await fetchDirectWorkerJson(workerBase, 'trending');
      if (Array.isArray(tData) && tData.length > 0) {
        return { kind: 'youtube#videoListResponse', items: tData.map(convertWorkerVideoItem) };
      }
    }

    // 4. Search & Shorts (/api/youtube/search, /api/youtube/shorts)
    if (pathPart === '/api/youtube/search' || pathPart === '/api/youtube/shorts') {
      const q = searchParams.get('q') || (pathPart.includes('shorts') ? '#Shorts' : '人気 動画');
      const limit = searchParams.get('maxResults') || '28';
      const pageToken = searchParams.get('pageToken') || '';
      const sp: Record<string, string> = { q, limit };
      if (pageToken && !pageToken.startsWith('page_')) sp.continuation = pageToken;
      const sData = await fetchDirectWorkerJson(workerBase, 'search', sp);
      if (sData && Array.isArray(sData.results) && sData.results.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: sData.results.map(convertWorkerVideoItem),
          nextPageToken: sData.continuation || null
        };
      }
    }

    // 5. Channel Shorts (/api/youtube/channel/shorts/:id)
    if (pathPart.startsWith('/api/youtube/channel/shorts/')) {
      const chId = decodeURIComponent(pathPart.replace('/api/youtube/channel/shorts/', ''));
      const title = searchParams.get('title') || '';
      try {
        const cData = await fetchDirectWorkerJson(workerBase, `channels/${chId}/shorts`);
        const vids = Array.isArray(cData?.videos) ? cData.videos : Array.isArray(cData) ? cData : [];
        if (vids.length > 0) {
          return { items: vids.map(convertWorkerVideoItem), nextPageToken: cData?.continuation || null };
        }
      } catch {}
      const sData = await fetchDirectWorkerJson(workerBase, 'search', { q: `${title || chId} #shorts`, limit: '24' });
      if (sData && Array.isArray(sData.results)) {
        return { items: sData.results.map(convertWorkerVideoItem), nextPageToken: null };
      }
    }

    // 6. Comments (/api/youtube/comments/:id)
    if (pathPart.startsWith('/api/youtube/comments/') && !pathPart.includes('/replies/')) {
      const id = decodeURIComponent(pathPart.replace('/api/youtube/comments/', ''));
      const pageToken = searchParams.get('pageToken') || '';
      const live = searchParams.get('live') || '';
      const sp: Record<string, string> = { limit: '20' };
      if (pageToken) sp.continuation = pageToken;
      if (live === '1' || live === 'true' || pageToken.startsWith('livechat')) sp.mode = 'live';
      let cData = await fetchDirectWorkerJson(workerBase, `comments/${id}`, sp).catch(() => null);
      if ((!cData || !Array.isArray(cData.comments) || (cData.comments.length === 0 && !cData.isLiveChat)) && !workerBase.startsWith('/api/worker')) {
        try {
          cData = await fetchDirectWorkerJson('/api/worker', `comments/${id}`, sp);
        } catch {}
      }
      if (cData && Array.isArray(cData.comments)) {
        const items = cData.comments.map((c: any) => ({
          id: c.commentId || c.id || String(Math.random()),
          kind: 'youtube#commentThread',
          snippet: {
            videoId: id,
            topLevelComment: {
              id: c.commentId || c.id || String(Math.random()),
              snippet: {
                authorDisplayName: c.author || 'YouTube ユーザー',
                authorProfileImageUrl: c.authorThumbnails?.[0]?.url || c.authorThumbnail || '',
                authorChannelId: { value: c.authorId || '' },
                videoId: id,
                textDisplay: c.contentHtml || c.content || c.text || '',
                textOriginal: c.content || c.text || '',
                likeCount: c.likeCount || 0,
                publishedAt: c.publishedText || new Date().toISOString()
              }
            },
            totalReplyCount: 0
          }
        }));
        return { items, nextPageToken: cData.continuation || null, isLiveChat: Boolean(cData.isLiveChat) };
      }
    }

    // 7. Channel Playlists (/api/youtube/channel/playlists/:id)
    if (pathPart.startsWith('/api/youtube/channel/playlists/')) {
      const chId = decodeURIComponent(pathPart.replace('/api/youtube/channel/playlists/', ''));
      // 7-1. Try InnerTube Worker (https://proxy.wa0260966.workers.dev/) first
      try {
        const wPl = await fetchDirectWorkerJson(workerBase, `channels/${chId}/playlists`);
        if (wPl && Array.isArray(wPl.playlists) && wPl.playlists.length > 0) {
          const items = wPl.playlists.map((pl: any) => ({
            id: pl.playlistId || pl.id,
            playlistId: pl.playlistId || pl.id,
            isPlaylist: true,
            title: pl.title || '再生リスト',
            thumbnail: pl.thumbnail || pl.playlistThumbnail || pl.thumbnails?.[0]?.url || '',
            videoCount: pl.videoCount || pl.itemCount || 0,
            snippet: {
              title: pl.title || '再生リスト',
              description: pl.description || '',
              channelTitle: pl.author || '',
              channelId: chId,
              publishedAt: '',
              thumbnails: {
                medium: { url: pl.thumbnail || pl.playlistThumbnail || pl.thumbnails?.[0]?.url || '' },
                high: { url: pl.thumbnail || pl.playlistThumbnail || pl.thumbnails?.[0]?.url || '' }
              }
            },
            contentDetails: {
              itemCount: pl.videoCount || pl.itemCount || 0
            }
          }));
          return { items, nextPageToken: null };
        }
      } catch {}

      // 7-2. Only if InnerTube Worker failed/empty, fallback to Invidious
      const invBase = (settings.invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
      const nativeFetch = (window as any).__originalFetch || window.fetch;
      for (const ep of [`${invBase}/api/v1/channels/${chId}/playlists`, `${invBase}/api/v1/channels/playlists/${chId}`]) {
        try {
          const r = await nativeFetch.call(window, ep, { headers: { Accept: 'application/json' } });
          if (r.ok) {
            const pData = await r.json();
            if (pData && Array.isArray(pData.playlists) && pData.playlists.length > 0) {
              const items = pData.playlists.map((pl: any) => ({
                id: pl.playlistId || pl.id,
                playlistId: pl.playlistId || pl.id,
                isPlaylist: true,
                title: pl.title || '再生リスト',
                thumbnail: pl.playlistThumbnail || '',
                videoCount: pl.videoCount || 0,
                snippet: {
                  title: pl.title || '再生リスト',
                  description: pl.description || '',
                  channelTitle: pl.author || '',
                  channelId: chId,
                  publishedAt: '',
                  thumbnails: {
                    medium: { url: pl.playlistThumbnail || '' },
                    high: { url: pl.playlistThumbnail || '' }
                  }
                },
                contentDetails: {
                  itemCount: pl.videoCount || 0
                }
              }));
              return { items, nextPageToken: null };
            }
          }
        } catch {}
      }
    }

    // 8. Playlist Detail (/api/youtube/playlist/:id)
    if (pathPart.startsWith('/api/youtube/playlist/')) {
      const plId = decodeURIComponent(pathPart.replace('/api/youtube/playlist/', ''));
      try {
        const wPl = await fetchDirectWorkerJson(workerBase, `playlists/${plId}`);
        if (wPl && Array.isArray(wPl.videos) && wPl.videos.length > 0) {
          return {
            playlist: {
              id: plId,
              snippet: {
                title: wPl.title || '再生リスト',
                description: wPl.description || '',
                channelTitle: wPl.author || ''
              }
            },
            items: wPl.videos.map(convertWorkerVideoItem),
            nextPageToken: null
          };
        }
      } catch {}
    }

    // 9. Channel Videos (/api/youtube/channel/videos/:id)
    if (pathPart.startsWith('/api/youtube/channel/videos/')) {
      const chId = decodeURIComponent(pathPart.replace('/api/youtube/channel/videos/', ''));
      const merged = new Map<string, any>();
      const addList = (arr: any[]) => {
        for (const raw of arr) {
          const item = convertWorkerVideoItem(raw);
          const vId = typeof item.id === 'string' ? item.id : item.id?.videoId;
          if (vId && !merged.has(vId)) merged.set(vId, item);
        }
      };
      try {
        const cVids = await fetchDirectWorkerJson(workerBase, `channels/${chId}/videos`);
        if (cVids && Array.isArray(cVids.videos)) addList(cVids.videos);
      } catch {}
      if (chId.startsWith('UC')) {
        try {
          const uuPl = await fetchDirectWorkerJson(workerBase, `playlists/UU${chId.slice(2)}`);
          if (uuPl && Array.isArray(uuPl.videos)) addList(uuPl.videos);
        } catch {}
      }
      if (merged.size > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: Array.from(merged.values()),
          nextPageToken: null
        };
      }
    }

    // 10. Stream Sources & yt-dlp Stream (/api/youtube/stream-sources/:id, /api/youtube/stream-ytdlp/:id)
    if (pathPart.startsWith('/api/youtube/stream-sources/') || pathPart.startsWith('/api/youtube/stream-ytdlp/')) {
      const vid = decodeURIComponent(
        pathPart.replace('/api/youtube/stream-sources/', '').replace('/api/youtube/stream-ytdlp/', '')
      );
      const invBase = (settings.invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
      const nativeFetch = (window as any).__originalFetch || window.fetch;

      const toOmadaLocalUrl = (rawUrl?: string, base = 'https://yt.omada.cafe'): string | undefined => {
        if (!rawUrl) return undefined;
        try {
          if (rawUrl.startsWith('/')) return `${base}${rawUrl}`;
          const parsed = new URL(rawUrl);
          if (parsed.hostname.endsWith('.googlevideo.com')) {
            parsed.searchParams.set('host', parsed.host);
            return `${base}/videoplayback?${parsed.searchParams.toString()}`;
          }
          return rawUrl;
        } catch {
          return rawUrl;
        }
      };

      const toRawGoogleUrl = (rawUrl?: string): string | undefined => {
        if (!rawUrl) return undefined;
        try {
          const parsed = new URL(rawUrl);
          if (parsed.hostname.endsWith('.googlevideo.com')) return rawUrl;
          const hostParam = parsed.searchParams.get('host');
          if (hostParam && hostParam.endsWith('.googlevideo.com')) {
            const copy = new URL(rawUrl);
            copy.searchParams.delete('host');
            return `https://${hostParam}/videoplayback?${copy.searchParams.toString()}`;
          }
          return rawUrl;
        } catch {
          return rawUrl;
        }
      };

      // 10-1. Primary: Fetch from https://yt.omada.cafe (360p formatStreams + 1080p/audio adaptiveFormats)
      for (const base of Array.from(new Set(['https://yt.omada.cafe', invBase]))) {
        for (const suffix of ['?local=true', '']) {
          try {
            const r = await nativeFetch.call(window, `${base}/api/v1/videos/${encodeURIComponent(vid)}${suffix}`, {
              headers: { Accept: 'application/json' }
            });
            if (r.ok) {
              const vData = await r.json();
              const formats = Array.isArray(vData.formatStreams) ? vData.formatStreams : [];
              const adaptive = Array.isArray(vData.adaptiveFormats) ? vData.adaptiveFormats : [];
              if (formats.length > 0 || adaptive.length > 0) {
                const rawComb360 =
                  formats.find((f: any) => String(f.itag) === '18')?.url ||
                  formats.find((f: any) => f.resolution === '360p' || f.qualityLabel === '360p')?.url ||
                  formats[0]?.url;
                const rawComb720 =
                  formats.find((f: any) => String(f.itag) === '22')?.url ||
                  formats.find((f: any) => f.resolution === '720p' || f.qualityLabel === '720p')?.url;
                const raw1080 =
                  adaptive.find((f: any) => String(f.itag) === '137')?.url ||
                  adaptive.find((f: any) => (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').includes('avc1'))?.url ||
                  adaptive.find((f: any) => (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').includes('video/mp4'))?.url ||
                  adaptive.find((f: any) => (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').includes('video'))?.url;
                const raw720 =
                  rawComb720 ||
                  adaptive.find((f: any) => String(f.itag) === '136')?.url ||
                  adaptive.find((f: any) => (f.resolution === '720p' || f.qualityLabel === '720p') && (f.type || '').includes('video/mp4'))?.url ||
                  adaptive.find((f: any) => (f.resolution === '720p' || f.qualityLabel === '720p') && (f.type || '').includes('video'))?.url;
                const rawAdap360 =
                  adaptive.find((f: any) => String(f.itag) === '134')?.url ||
                  adaptive.find((f: any) => (f.resolution === '360p' || f.qualityLabel === '360p') && (f.type || '').includes('video'))?.url;
                const rawAud =
                  adaptive.find((f: any) => String(f.itag) === '140')?.url ||
                  adaptive.find((f: any) => (f.type || '').includes('audio/mp4'))?.url ||
                  adaptive.find((f: any) => (f.type || '').includes('audio'))?.url;

                const omada360 = toOmadaLocalUrl(rawComb360 || rawAdap360, base);
                const omada720 = toOmadaLocalUrl(raw720, base) || omada360;
                const omada1080 = toOmadaLocalUrl(raw1080, base) || omada720;
                const omadaAudio = toOmadaLocalUrl(rawAud, base) || omada360;

                const google360 = toRawGoogleUrl(rawComb360 || rawAdap360);
                const google1080 = toRawGoogleUrl(raw1080);
                const google720 = toRawGoogleUrl(raw720);
                const googleAudio = toRawGoogleUrl(rawAud);

                if (omada360 || omada1080 || omadaAudio) {
                  return {
                    videoId: vid,
                    title: vData.title || `video-${vid}`,
                    engine: 'omada-invidious',
                    streams: {
                      v1080: omada1080,
                      v720: omada720,
                      v360: omada360,
                      audio: omadaAudio,
                      combined720: toOmadaLocalUrl(rawComb720, base),
                      combined360: omada360,
                      omadaV1080: omada1080,
                      omadaV720: omada720,
                      omadaV360: omada360,
                      omadaAudio: omadaAudio,
                      invidious1080: `${base}/companion/latest_version?id=${vid}&itag=137&local=true`,
                      invidious720: `${base}/companion/latest_version?id=${vid}&itag=136&local=true`,
                      invidious360: `${base}/companion/latest_version?id=${vid}&itag=18&local=true`,
                      invidiousAudio: `${base}/companion/latest_version?id=${vid}&itag=140&local=true`,
                      rawV1080: google1080 || omada1080,
                      rawV720: google720 || omada720,
                      rawV360: google360 || omada360,
                      rawAudio: googleAudio || omadaAudio,
                      ytdlp1080: omada1080,
                      ytdlp720: omada720,
                      ytdlp360: omada360,
                      ytdlpAudio: omadaAudio
                    }
                  };
                }
              }
            }
          } catch {}
        }
      }

      // 10-2. Fallback: Worker
      try {
        const vData = await fetchDirectWorkerJson(workerBase, `videos/${vid}`);
        if (vData) {
          const formats = Array.isArray(vData.formatStreams) ? vData.formatStreams : [];
          const adaptive = Array.isArray(vData.adaptiveFormats) ? vData.adaptiveFormats : [];
          const combined720 = formats.find((f: any) => f.resolution === '720p' || f.qualityLabel === '720p')?.url;
          const combined360 = formats.find((f: any) => f.resolution === '360p' || f.qualityLabel === '360p')?.url || formats[0]?.url;
          const v1080 = adaptive.find((f: any) => (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').includes('video'))?.url;
          const v720 = combined720 || adaptive.find((f: any) => (f.resolution === '720p' || f.qualityLabel === '720p') && (f.type || '').includes('video'))?.url;
          const v360 = combined360 || adaptive.find((f: any) => (f.resolution === '360p' || f.qualityLabel === '360p') && (f.type || '').includes('video'))?.url || v720;
          const audio = adaptive.find((f: any) => (f.type || '').includes('audio/mp4') || (f.type || '').includes('audio'))?.url || combined360;

          if (v1080 || v720 || v360 || audio) {
            return {
              videoId: vid,
              title: vData.title || `video-${vid}`,
              engine: 'yt-dlp-worker',
              streams: {
                v1080: v1080 || v720 || v360,
                v720: v720 || v360 || v1080,
                v360: v360 || v720,
                audio: audio || v360,
                combined720,
                combined360,
                rawV1080: v1080,
                rawV720: v720,
                rawV360: combined360 || v360,
                rawAudio: audio,
                ytdlp1080: v1080 || combined360,
                ytdlp720: combined720 || v720 || combined360,
                ytdlp360: combined360 || v360,
                ytdlpAudio: audio || combined360
              }
            };
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('Client InnerTube fallback error:', e);
  }
  return null;
}

export async function customFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const settings = getApiSettings();
  const customProxy = getCustomProxyUrl();
  const headers = new Headers(options.headers || {});
  headers.set('x-api-provider', 'innertube');
  headers.set('x-innertube-url', settings.innertubeUrl || '/api/worker');
  headers.set('x-invidious-url', settings.invidiousUrl || 'https://yt.omada.cafe/');
  if (customProxy) {
    headers.set('x-custom-proxy-url', customProxy);
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (url.startsWith('/api/youtube/')) {
      try {
        const data = typeof res.clone === 'function' ? await res.clone().json() : await res.json();
        const isEmptyItems = !data || (Array.isArray(data.items) && data.items.length === 0);
        if (!res.ok || isEmptyItems) {
          const fallbackData = await resolveClientInnerTubeFallback(url);
          if (fallbackData && Array.isArray(fallbackData.items) && fallbackData.items.length > 0) {
            return new Response(JSON.stringify(fallbackData), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
        if (typeof res.clone !== 'function') {
          return new Response(JSON.stringify(data), {
            status: res.status || 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch {}
    }

    return res;
  } catch (err) {
    if (url.startsWith('/api/youtube/')) {
      const fallbackData = await resolveClientInnerTubeFallback(url);
      if (fallbackData) {
        return new Response(JSON.stringify(fallbackData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    throw err;
  }
}

// Google Apps Script (GAS) Web App Environment Bridge
function callGasApi(urlStr: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    try {
      const method = (init?.method || 'GET').toUpperCase();
      const headersMap: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((val, key) => { headersMap[key.toLowerCase()] = val; });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => { headersMap[k.toLowerCase()] = v; });
        } else {
          Object.entries(init.headers).forEach(([k, v]) => { headersMap[k.toLowerCase()] = String(v); });
        }
      }

      let bodyStr: string | null = null;
      if (init?.body) {
        bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      }

      const win = window as any;
      win.google.script.run
        .withSuccessHandler((resObj: any) => {
          const status = resObj?.status || 200;
          const data = resObj?.data !== undefined ? resObj.data : resObj;
          const bodyText = typeof data === 'string' ? data : JSON.stringify(data);

          try {
            resolve(new Response(bodyText, {
              status,
              statusText: status === 200 ? 'OK' : 'Status ' + status,
              headers: { 'Content-Type': 'application/json' }
            }));
          } catch {
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: status === 200 ? 'OK' : 'Error',
              json: async () => (typeof data === 'string' ? JSON.parse(data) : data),
              text: async () => bodyText,
              headers: new Headers({ 'Content-Type': 'application/json' })
            } as any);
          }
        })
        .withFailureHandler((err: any) => {
          console.error('GAS API Error:', err);
          const errBody = JSON.stringify({ error: { message: err?.message || 'GAS request failed' } });
          try {
            resolve(new Response(errBody, { status: 500, headers: { 'Content-Type': 'application/json' } }));
          } catch {
            resolve({
              ok: false,
              status: 500,
              json: async () => ({ error: { message: err?.message || 'GAS request failed' } }),
              text: async () => errBody,
              headers: new Headers({ 'Content-Type': 'application/json' })
            } as any);
          }
        })
        .handleGasApiRequest(urlStr, method, headersMap, bodyStr);
    } catch (err) {
      reject(err);
    }
  });
}

// Global fetch interceptor for Google Apps Script Web App
if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.__gasFetchHookInstalled) {
    win.__gasFetchHookInstalled = true;
    const originalFetch = window.fetch;
    win.__originalFetch = originalFetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (typeof urlStr === 'string' && urlStr.startsWith('/api/') && win.google?.script?.run) {
        return callGasApi(urlStr, init);
      }
      return originalFetch.call(this, input, init);
    };
  }
}

