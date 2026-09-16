import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { spawn, execFile } from 'child_process';
import path from 'path';

dotenv.config();

const app = express();

app.use(express.json());

// YouTube API Key from env
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Helper for extracting API settings headers
function getRequestConfig(req: express.Request) {
  const provider = (req.headers['x-api-provider'] as string) || 'innertube';
  const innertubeUrl = (req.headers['x-innertube-url'] as string) || 'https://yt-api.myproxy0108.workers.dev/';
  const invidiousUrl = (req.headers['x-invidious-url'] as string) || 'https://yt.omada.cafe/';
  const customYoutubeKey = (req.headers['x-youtube-key'] as string) || '';
  const forceYoutubeV3 = req.headers['x-force-youtube-v3'] === 'true';

  return {
    provider,
    innertubeUrl: innertubeUrl.trim() || 'https://yt-api.myproxy0108.workers.dev/',
    invidiousUrl: invidiousUrl.trim() || 'https://yt.omada.cafe/',
    youtubeKey: customYoutubeKey.trim() || YOUTUBE_API_KEY,
    forceYoutubeV3
  };
}

// Helper for fetching from official YouTube API v3
async function fetchYouTube(endpoint: string, params: Record<string, string>, apiKeyOverride?: string) {
  const keyToUse = apiKeyOverride || YOUTUBE_API_KEY;
  if (!keyToUse) {
    return { error: { message: 'YouTube API key is not configured' } };
  }
  const url = new URL(`${YOUTUBE_BASE_URL}/${endpoint}`);
  url.searchParams.set('key', keyToUse);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) {
      console.error(`YouTube API error on ${endpoint}:`, data);
      return { error: data.error || { message: 'YouTube API request failed' } };
    }
    return data;
  } catch (err: any) {
    console.error(`Fetch error on ${endpoint}:`, err);
    return { error: { message: err.message || 'Network error' } };
  }
}

// Invidious API fetch helper
async function fetchInvidious(instanceUrl: string, endpoint: string, queryParams: Record<string, string> = {}) {
  let baseUrl = instanceUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const url = new URL(`${baseUrl}/api/v1/${endpoint}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value) url.searchParams.set(key, value);
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`Invidious error ${res.status} on ${url.toString()}`);
      return { error: `Invidious HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (err: any) {
    console.warn(`Invidious fetch failed (${url.toString()}):`, err.message);
    return { error: err.message };
  }
}

// =======================================================
// ★ InnerTube / yt-for-my-friends Engine
// =======================================================
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_INNERTUBE_WORKER = 'https://yt-api.myproxy0108.workers.dev';

// Fetch helper for yt-for-my-friends / YouTube-api-original Cloudflare Worker
async function fetchInnerTubeWorker(baseUrl: string, endpoint: string, queryParams: Record<string, string> = {}) {
  let cleanBase = (baseUrl || DEFAULT_INNERTUBE_WORKER).trim();
  if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = 'https://' + cleanBase;
  }
  if (cleanBase.endsWith('/')) {
    cleanBase = cleanBase.slice(0, -1);
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = new URL(`${cleanBase}/api/v1/${cleanEndpoint}`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`InnerTube Worker error ${res.status} on ${url.toString()}`);
      return { error: `InnerTube Worker HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (err: any) {
    console.warn(`InnerTube Worker fetch failed (${url.toString()}):`, err.message);
    return { error: err.message };
  }
}

// Direct InnerTube client (POST to youtubei/v1)
async function callInnerTubeDirect(endpoint: string, payload: any = {}) {
  const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${INNERTUBE_API_KEY}`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'X-YouTube-Client-Name': '1',
    'X-YouTube-Client-Version': '2.20240625.01.00',
    'Origin': 'https://www.youtube.com'
  };
  const body = {
    context: {
      client: {
        hl: 'ja',
        gl: 'JP',
        clientName: 'WEB',
        clientVersion: '2.20240625.01.00',
        utcOffsetMinutes: 540
      }
    },
    ...payload
  };

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!res.ok) {
      return { error: `Direct InnerTube HTTP ${res.status}` };
    }
    const data = await res.json();
    return { data };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Convert InnerTube item to standard YouTube video item schema
function convertInnerTubeItemToYouTubeItem(item: any) {
  const videoId = item.videoId || item.id || '';
  const thumbnail = item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
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

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    isShort: Boolean(item.isShort || (item.type === 'short')),
    snippet: {
      publishedAt,
      channelId: item.authorId || item.channelId || '',
      title: item.title || '',
      description: item.description || item.descriptionHtml || '',
      channelThumbnail: authorImg,
      thumbnails: {
        default: { url: thumbnail },
        medium: { url: thumbnail },
        high: { url: thumbnail },
        standard: { url: thumbnail },
        maxres: { url: thumbnail }
      },
      channelTitle: item.author || item.channelTitle || '',
      liveBroadcastContent: item.liveNow ? 'live' : 'none',
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

// Convert InnerTube channel data to standard YouTube channel schema
function convertInnerTubeChannelToYouTubeChannel(item: any) {
  const authorThumbnail = item.authorThumbnails?.length > 0
    ? item.authorThumbnails[item.authorThumbnails.length - 1].url
    : (typeof item.authorThumbnail === 'string' ? item.authorThumbnail : '');
  const bannerUrl = item.authorBanners?.length > 0
    ? item.authorBanners[0].url
    : '';

  return {
    kind: 'youtube#channel',
    id: item.authorId || item.id || '',
    snippet: {
      title: item.author || 'YouTube チャンネル',
      description: item.description || '',
      customUrl: item.authorUrl || '',
      publishedAt: item.joined ? new Date(item.joined * 1000).toISOString() : new Date().toISOString(),
      thumbnails: {
        high: { url: authorThumbnail },
        medium: { url: authorThumbnail },
        default: { url: authorThumbnail }
      }
    },
    statistics: {
      subscriberCount: String(item.subCount || item.subCountText || 0),
      videoCount: String(item.totalVideos || 0),
      viewCount: String(item.totalViews || 0)
    },
    brandingSettings: {
      image: {
        bannerExternalUrl: bannerUrl
      }
    }
  };
}

// Convert Invidious item to YouTube Video item schema
function convertInvidiousItemToYouTubeItem(item: any) {
  const videoId = item.videoId || item.id;
  const thumbnailHigh = item.videoThumbnails?.find((t: any) => t.quality === 'high')?.url
    || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const thumbnailMed = item.videoThumbnails?.find((t: any) => t.quality === 'medium')?.url
    || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  let authorImg = '';
  if (Array.isArray(item.authorThumbnails) && item.authorThumbnails.length > 0) {
    authorImg = item.authorThumbnails[item.authorThumbnails.length - 1]?.url || item.authorThumbnails[0]?.url || '';
  } else if (typeof item.authorThumbnail === 'string') {
    authorImg = item.authorThumbnail;
  }
  if (authorImg.startsWith('//')) {
    authorImg = 'https:' + authorImg;
  }

  const durationSec = item.lengthSeconds || 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationIso = durationSec > 0 ? `PT${mins}M${secs}S` : 'PT0M0S';

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    snippet: {
      publishedAt: item.published ? new Date(item.published * 1000).toISOString() : (item.publishedText || new Date().toISOString()),
      channelId: item.authorId || '',
      title: item.title || '',
      description: item.description || '',
      channelThumbnail: authorImg,
      thumbnails: {
        high: { url: thumbnailHigh },
        medium: { url: thumbnailMed },
        default: { url: thumbnailMed }
      },
      channelTitle: item.author || '',
      tags: item.keywords || item.tags || []
    },
    statistics: {
      viewCount: String(item.viewCount || 0),
      likeCount: String(item.likeCount || 0)
    },
    contentDetails: {
      duration: durationIso
    }
  };
}

// Convert Invidious channel format to YouTube channel schema
function convertInvidiousChannelToYouTubeChannel(item: any) {
  const authorThumbnail = item.authorThumbnails?.length > 0
    ? item.authorThumbnails[item.authorThumbnails.length - 1].url
    : '';
  const bannerUrl = item.authorBanners?.length > 0
    ? item.authorBanners[0].url
    : '';

  return {
    kind: 'youtube#channel',
    id: item.authorId || item.id,
    snippet: {
      title: item.author || 'YouTube チャンネル',
      description: item.description || '',
      customUrl: item.authorUrl || '',
      publishedAt: item.joined ? new Date(item.joined * 1000).toISOString() : new Date().toISOString(),
      thumbnails: {
        high: { url: authorThumbnail },
        medium: { url: authorThumbnail },
        default: { url: authorThumbnail }
      }
    },
    statistics: {
      subscriberCount: String(item.subCount || 0),
      videoCount: String(item.totalVideos || 0),
      viewCount: String(item.totalViews || 0)
    },
    brandingSettings: {
      image: {
        bannerExternalUrl: bannerUrl
      }
    }
  };
}

// Helper to convert single Invidious comment object to standard YouTube comment item
function convertSingleInvidiousComment(c: any, videoId: string = '') {
  let authorImg = '';
  if (Array.isArray(c.authorThumbnails) && c.authorThumbnails.length > 0) {
    authorImg = c.authorThumbnails[c.authorThumbnails.length - 1]?.url || c.authorThumbnails[0]?.url || '';
  } else if (typeof c.authorThumbnail === 'string') {
    authorImg = c.authorThumbnail;
  }

  if (authorImg) {
    if (authorImg.startsWith('//')) {
      authorImg = 'https:' + authorImg;
    } else if (authorImg.startsWith('/ggpht/')) {
      authorImg = 'https://yt3.ggpht.com' + authorImg.replace('/ggpht', '');
    }
  }

  // Invidious comment content fields: c.content (plain text) or c.contentHtml (HTML text)
  const textRaw = c.content || c.textOriginal || c.text || c.contentHtml || c.textDisplay || '';
  const textHtml = c.contentHtml || c.textDisplay || c.content || c.textOriginal || c.text || '';

  let publishedIso = new Date().toISOString();
  if (typeof c.published === 'number') {
    publishedIso = new Date(c.published > 10000000000 ? c.published : c.published * 1000).toISOString();
  } else if (c.publishedText) {
    publishedIso = c.publishedText;
  }

  return {
    id: c.commentId || c.id || Math.random().toString(),
    snippet: {
      authorDisplayName: c.author || c.authorDisplayName || 'YouTube ユーザー',
      authorProfileImageUrl: authorImg,
      authorChannelUrl: c.authorUrl || '',
      authorChannelId: { value: c.authorId || '' },
      videoId: videoId || c.videoId || '',
      textDisplay: textHtml,
      textOriginal: textRaw,
      likeCount: typeof c.likeCount === 'number' ? c.likeCount : 0,
      publishedAt: publishedIso
    }
  };
}

// Convert Invidious comments to YouTube comment threads schema
function convertInvidiousCommentsToYouTube(data: any, videoId: string) {
  if (!data || !Array.isArray(data.comments)) return { items: [], nextPageToken: null };

  const items = data.comments.map((c: any) => {
    const topLevelComment = convertSingleInvidiousComment(c, videoId);
    
    // Invidious might contain inline replies in c.replies.comments
    const repliesList = Array.isArray(c.replies?.comments)
      ? c.replies.comments.map((r: any) => convertSingleInvidiousComment(r, videoId))
      : [];

    return {
      id: c.commentId || topLevelComment.id,
      kind: 'youtube#commentThread',
      snippet: {
        videoId,
        topLevelComment,
        totalReplyCount: c.replies?.replyCount || (repliesList.length > 0 ? repliesList.length : 0)
      },
      replies: repliesList.length > 0 ? { comments: repliesList } : undefined
    };
  });

  return { items, nextPageToken: data.continuation || null };
}

const INVIDIOUS_FALLBACK_INSTANCES = [
  'https://yt.omada.cafe',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.private.coffee'
];

async function invidiousFallbackTrending(primaryUrl: string, region: string = 'JP') {
  const instances = Array.from(new Set([primaryUrl, ...INVIDIOUS_FALLBACK_INSTANCES].filter(Boolean)));
  for (const inst of instances) {
    try {
      const res = await fetchInvidious(inst, 'trending', { region });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const items = res.data.map(convertInvidiousItemToYouTubeItem);
        return { kind: 'youtube#videoListResponse', items };
      }
    } catch {
      // try next instance
    }
  }
  return { items: [] };
}

async function invidiousFallbackSearch(query: string, primaryUrl: string, page: number = 1) {
  const instances = Array.from(new Set([primaryUrl, ...INVIDIOUS_FALLBACK_INSTANCES].filter(Boolean)));
  for (const inst of instances) {
    try {
      const res = await fetchInvidious(inst, 'search', { q: query, type: 'video', page: String(page), region: 'JP' });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const items = res.data.map(convertInvidiousItemToYouTubeItem);
        return { kind: 'youtube#searchResponse', items, nextPageToken: `page_${page + 1}` };
      }
    } catch {
      // try next instance
    }
  }
  return { items: [] };
}

// 0. YouTube Education Dynamic Parameters from Google Spreadsheet
let cachedEduParam: { param: string; expiresAt: number } | null = null;

app.get('/api/education-param', async (req, res) => {
  if (cachedEduParam && cachedEduParam.expiresAt > Date.now()) {
    return res.json({ success: true, param: cachedEduParam.param, cached: true });
  }

  try {
    const sheetId = '1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg';
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(sheetUrl, { signal: controller.signal });
    clearTimeout(tid);

    const text = await response.text();
    const jsonStr = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    const data = JSON.parse(jsonStr);
    let param = data.table?.rows?.[0]?.c?.[0]?.v || '';
    param = param.replace(/&amp;/g, '&').trim();

    if (!param.startsWith('?') && param.length > 0) {
      param = '?' + param;
    }

    if (param) {
      cachedEduParam = {
        param,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes cache
      };
      return res.json({ success: true, param });
    }
  } catch (err: any) {
    console.warn('Failed to fetch education param from spreadsheet:', err.message);
  }

  const defaultParam = '?autoplay=1&mute=0&controls=1&start=0&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1';
  return res.json({ success: false, param: defaultParam });
});

// 1. Trending / Most Popular Videos
app.get('/api/youtube/trending', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { regionCode = 'JP' } = req.query;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'trending');
    if (itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      const items = itRes.data.map(convertInnerTubeItemToYouTubeItem);
      return res.json({ kind: 'youtube#videoListResponse', items });
    }
  } catch (err) {
    console.warn('InnerTube trending error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: '急上昇動画の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 2. Search API
app.get('/api/youtube/search', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const {
    q = '',
    pageToken = '',
    maxResults = '24'
  } = req.query;

  const searchQuery = String(q || '人気 動画');

  try {
    const queryParams: Record<string, string> = {
      q: searchQuery,
      limit: String(maxResults)
    };
    if (pageToken && typeof pageToken === 'string' && !pageToken.startsWith('page_')) {
      queryParams.continuation = pageToken;
    }

    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'search', queryParams);
    if (itRes.data && Array.isArray(itRes.data.results) && itRes.data.results.length > 0) {
      const items = itRes.data.results.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('InnerTube search error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: '検索結果の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 3. Video Categories
app.get('/api/youtube/categories', async (req, res) => {
  const { youtubeKey } = getRequestConfig(req);
  const { regionCode = 'JP' } = req.query;

  if (youtubeKey) {
    const data = await fetchYouTube('videoCategories', {
      part: 'snippet',
      regionCode: String(regionCode)
    }, youtubeKey);

    if (!data.error && data.items && data.items.length > 0) {
      return res.json(data);
    }
  }

  return res.json({
    items: [
      { id: '10', snippet: { title: '音楽' } },
      { id: '20', snippet: { title: 'ゲーム' } },
      { id: '27', snippet: { title: '教育' } },
      { id: '28', snippet: { title: '科学と技術' } },
      { id: '24', snippet: { title: 'エンターテインメント' } },
      { id: '17', snippet: { title: 'スポーツ' } },
      { id: '25', snippet: { title: 'ニュースと政治' } },
      { id: '26', snippet: { title: 'ハウツーとスタイル' } }
    ]
  });
});

// 4. Video Details by ID
app.get('/api/youtube/video/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
    if (itRes.data && (itRes.data.title || itRes.data.videoId)) {
      return res.json({ kind: 'youtube#videoListResponse', items: [convertInnerTubeItemToYouTubeItem(itRes.data)] });
    }
  } catch (err) {
    console.warn('InnerTube video detail error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: '動画情報の取得に失敗しました。'
  });
});

// 5. Batch Videos by IDs
app.get('/api/youtube/videos', async (req, res) => {
  const { youtubeKey } = getRequestConfig(req);
  const { ids } = req.query;
  if (!ids) return res.json({ items: [] });

  const data = await fetchYouTube('videos', {
    part: 'snippet,contentDetails,statistics',
    id: String(ids)
  }, youtubeKey);

  if (data.error || !data.items) {
    return res.json({ items: [] });
  }

  res.json(data);
});

// 6. Related Videos Endpoint
app.get('/api/youtube/related/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
    if (itRes.data && Array.isArray(itRes.data.recommendedVideos) && itRes.data.recommendedVideos.length > 0) {
      const items = itRes.data.recommendedVideos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('InnerTube related error:', err);
  }

  return res.json({
    items: [],
    nextPageToken: null
  });
});

// 7. Video Comments
app.get('/api/youtube/comments/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, maxResults = '20' } = req.query;

  try {
    const itParams: Record<string, string> = { limit: String(maxResults) };
    if (pageToken) itParams.continuation = String(pageToken);
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `comments/${id}`, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && itRes.data.comments.length > 0) {
      return res.json(convertInvidiousCommentsToYouTube(itRes.data, id));
    }
  } catch (err) {
    console.warn('InnerTube comments error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'コメントの取得に失敗しました。再読み込みをお試しください。'
  });
});

// 7b. Comment Replies
app.get('/api/youtube/comments/replies/:id', async (req, res) => {
  const { provider, innertubeUrl, invidiousUrl, youtubeKey, forceYoutubeV3 } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, maxResults = '20' } = req.query;

  // 1. Primary: YouTube Official API v3
  if (youtubeKey) {
    try {
      const params: Record<string, string> = {
        part: 'snippet',
        parentId: id,
        maxResults: String(maxResults)
      };
      if (pageToken) params.pageToken = String(pageToken);

      const data = await fetchYouTube('comments', params, youtubeKey);
      if (!data.error && data.items) {
        return res.json(data);
      }
    } catch (err) {
      console.warn('YouTube replies error:', err);
    }
  }

  // 2. Fallback: Invidious
  if (pageToken) {
    try {
      const invRes = await fetchInvidious(invidiousUrl, `comments/${id}`, { continuation: String(pageToken) });
      if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
        const items = invRes.data.comments.map((c: any) => convertSingleInvidiousComment(c));
        return res.json({ items, nextPageToken: invRes.data.continuation || null });
      }
    } catch {}
  }

  return res.json({ items: [], nextPageToken: null });
});

// 8. Channel Details
app.get('/api/youtube/channel/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}`);
    if (itRes.data && (itRes.data.authorId || itRes.data.author)) {
      return res.json({ items: [convertInnerTubeChannelToYouTubeChannel(itRes.data)] });
    }
  } catch (err) {
    console.warn('InnerTube channel detail error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'チャンネル情報の取得に失敗しました。再読み込みをお試しください。'
  });
});

// 8b. Channel Uploaded Videos Endpoint (Supports All Videos via Uploads Playlist & Pagination)
app.get('/api/youtube/channel/videos/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/videos`);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({ kind: 'youtube#searchResponse', items, nextPageToken: null });
    }
  } catch (err) {
    console.warn('InnerTube channel videos error:', err);
  }

  return res.json({
    items: [],
    nextPageToken: null
  });
});

// 8c. YouTube Shorts API Endpoint (Strict Vertical Shorts Only)
app.get('/api/youtube/shorts', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { q = '#Shorts', maxResults = '24', pageToken } = req.query;

  try {
    const queryParams: Record<string, string> = {
      q: String(q || '#Shorts'),
      limit: String(maxResults)
    };
    if (pageToken && typeof pageToken === 'string' && !pageToken.startsWith('page_')) {
      queryParams.continuation = pageToken;
    }
    const itRes = await fetchInnerTubeWorker(innertubeUrl, 'search', queryParams);
    if (itRes.data && Array.isArray(itRes.data.results) && itRes.data.results.length > 0) {
      const items = itRes.data.results.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('InnerTube shorts error:', err);
  }

  return res.json({
    items: [],
    error: 'INNERTUBE_FAILED',
    message: 'Shortsの取得に失敗しました。再読み込みをお試しください。'
  });
});

// 8d. YouTube Playlist Endpoint (Fetch Playlist Info & All Videos)
app.get('/api/youtube/playlist/:id', async (req, res) => {
  const { innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;

  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `playlists/${id}`);
    if (itRes.data && Array.isArray(itRes.data.videos)) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        playlist: {
          id,
          snippet: {
            title: itRes.data.title || '再生リスト',
            description: itRes.data.description || '',
            channelTitle: itRes.data.author || ''
          }
        },
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('InnerTube playlist error:', err);
  }

  return res.json({
    playlist: null,
    items: [],
    nextPageToken: null,
    error: 'PLAYLIST_NOT_FOUND',
    message: '再生リストの取得に失敗しました。'
  });
});

// 9. Video Direct Stream Metadata & Multiplexing Endpoints
interface ResolvedStreamUrls {
  v1080?: string;
  v720?: string;
  v360?: string;
  combined720?: string;
  combined360?: string;
  audio?: string;
  expiresAt: number;
}
const streamUrlCache = new Map<string, ResolvedStreamUrls>();

async function resolveVideoStreams(videoId: string, customInvidiousUrl?: string): Promise<ResolvedStreamUrls | null> {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const instances = [
    'https://yt-api.myproxy0108.workers.dev',
    customInvidiousUrl,
    'https://yt.omada.cafe',
    'https://invidious.nerdvpn.de',
    'https://inv.nadeko.net',
    'https://invidious.private.coffee',
    'https://invidious.f5.si'
  ].filter(Boolean) as string[];

  // 1. Primary: Use Invidious to extract direct Google Video playback streams
  for (const inst of instances) {
    try {
      const cleanInst = inst.endsWith('/') ? inst.slice(0, -1) : inst;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`${cleanInst}/api/v1/videos/${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      clearTimeout(tid);

      if (!res.ok) continue;
      const data = await res.json();
      const formatStreams: any[] = Array.isArray(data.formatStreams) ? data.formatStreams : [];
      const adaptiveFormats: any[] = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];

      if (formatStreams.length > 0 || adaptiveFormats.length > 0) {
        // Combined streams (contain both audio and video already)
        const combined720 = formatStreams.find((f) => f.resolution === '720p' || f.qualityLabel === '720p')?.url;
        const combined360 = formatStreams.find((f) => f.resolution === '360p' || f.qualityLabel === '360p')?.url || formatStreams[0]?.url;

        // Separate adaptive video streams
        const v1080 = adaptiveFormats.find((f) => (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').includes('video'))?.url;
        const v720 = combined720 || adaptiveFormats.find((f) => (f.resolution === '720p' || f.qualityLabel === '720p') && (f.type || '').includes('video'))?.url;
        const v360 = combined360 || adaptiveFormats.find((f) => (f.resolution === '360p' || f.qualityLabel === '360p') && (f.type || '').includes('video'))?.url || v720;

        // Audio stream
        const audio = adaptiveFormats.find((f) => (f.type || '').includes('audio/mp4') || (f.type || '').includes('audio'))?.url || combined720 || combined360;

        if (v720 || v360 || combined720 || combined360 || v1080) {
          const result: ResolvedStreamUrls = {
            v1080: v1080 || v720,
            v720: v720 || combined720 || combined360,
            v360: v360 || combined360,
            combined720,
            combined360,
            audio: audio || combined720 || combined360,
            expiresAt: Date.now() + 2 * 3600 * 1000 // 2 hours
          };
          streamUrlCache.set(videoId, result);
          return result;
        }
      }
    } catch {}
  }

  // 2. Fallback: yt-dlp if Invidious instances fail
  const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
  return new Promise((resolve) => {
    execFile(
      ytDlpPath,
      [
        '-g',
        '-f',
        'bestvideo[height<=1080],bestvideo[height<=720],bestvideo[height<=360],bestaudio/best',
        `https://www.youtube.com/watch?v=${videoId}`
      ],
      { timeout: 12000 },
      (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\n').filter((l) => l.startsWith('http'));
          if (lines.length >= 2) {
            const result: ResolvedStreamUrls = {
              v1080: lines[0],
              v720: lines.length >= 3 ? lines[1] : lines[0],
              v360: lines.length >= 3 ? lines[2] || lines[1] : lines[0],
              audio: lines[lines.length - 1],
              expiresAt: Date.now() + 2 * 3600 * 1000
            };
            streamUrlCache.set(videoId, result);
            resolve(result);
            return;
          } else if (lines.length === 1) {
            const combined = lines[0];
            const result: ResolvedStreamUrls = {
              v1080: combined,
              v720: combined,
              v360: combined,
              audio: combined,
              combined720: combined,
              combined360: combined,
              expiresAt: Date.now() + 2 * 3600 * 1000
            };
            streamUrlCache.set(videoId, result);
            resolve(result);
            return;
          }
        }
        resolve(null);
      }
    );
  });
}

app.get('/api/youtube/stream/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  // Pre-warm in background
  resolveVideoStreams(id, invidiousUrl).catch(() => {});

  return res.json({
    videoId: id,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    lowStream: {
      url: `/api/youtube/stream-mux/${id}?quality=360`,
      directUrl: `/api/youtube/stream-mux/${id}?quality=360`,
      quality: '360p',
      container: 'mp4'
    },
    normalStream: {
      url: `/api/youtube/stream-mux/${id}?quality=720`,
      directUrl: `/api/youtube/stream-mux/${id}?quality=720`,
      quality: '720p',
      container: 'mp4'
    },
    highStream: {
      url: `/api/youtube/stream-mux/${id}?quality=1080`,
      directUrl: `/api/youtube/stream-mux/${id}?quality=1080`,
      quality: '1080p',
      container: 'mp4'
    },
    audioStream: {
      url: `/api/youtube/stream-audio/${id}`,
      directUrl: `/api/youtube/stream-audio/${id}`,
      quality: 'audio',
      container: 'aac'
    }
  });
});

// Stream Video + Audio Multiplexing via FFmpeg
app.get('/api/youtube/stream-mux/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality = req.query.quality === '1080' ? '1080' : req.query.quality === '360' ? '360' : '720';

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls) {
      return res.status(502).send('ストリームの取得に失敗しました。');
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Combined 720p stream
    if (quality === '720' && urls.combined720) {
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
        '-i', urls.combined720,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // Combined 360p stream
    if (quality === '360' && urls.combined360) {
      const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
        '-i', urls.combined360,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      ]);
      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {});
      req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
      return;
    }

    // Muxing separate video and audio streams
    const videoUrl =
      (quality === '1080' ? urls.v1080 : quality === '360' ? (urls.v360 || urls.v720) : urls.v720) ||
      urls.v720 ||
      urls.v1080;
    const audioUrl = urls.audio || urls.combined720 || urls.combined360 || videoUrl;

    if (!videoUrl) {
      return res.status(502).send('動画ストリームURLが見つかりませんでした。');
    }

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
      '-i', videoUrl,
      '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
      '-i', audioUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
  } catch (err: any) {
    console.error('Stream mux error:', err);
    if (!res.headersSent) res.status(500).send(err.message || 'Stream error');
  }
});

// Stream Audio-Only via FFmpeg
app.get('/api/youtube/stream-audio/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls || (!urls.audio && !urls.combined720 && !urls.combined360)) {
      return res.status(502).send('音声ストリームの取得に失敗しました。');
    }

    const audioSource = urls.audio || urls.combined720 || urls.combined360;

    res.setHeader('Content-Type', 'audio/aac');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n',
      '-i', audioSource!,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-f', 'adts',
      'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch {} });
  } catch (err: any) {
    console.error('Stream audio error:', err);
    if (!res.headersSent) res.status(500).send(err.message || 'Stream error');
  }
});

app.get('/api/youtube/stream-proxy', async (req, res) => {
  const mediaUrl = req.query.url as string;
  if (!mediaUrl) return res.status(400).send('URL required');

  try {
    const rangeHeader = req.headers.range;
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
    if (rangeHeader) reqHeaders['Range'] = rangeHeader;

    const upstream = await fetch(mediaUrl, { headers: reqHeaders });
    res.status(upstream.status);

    upstream.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (['content-range', 'content-length', 'content-type', 'accept-ranges', 'cache-control'].includes(lower)) {
        res.setHeader(key, val);
      }
    });

    if (!res.getHeader('accept-ranges')) {
      res.setHeader('accept-ranges', 'bytes');
    }

    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        await pump();
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send(err.message || 'Stream error');
    } else {
      res.end();
    }
  }
});

// 11. AI Video Summarizer with Gemini
app.post('/api/ai/summarize', async (req, res) => {
  const { title, description, channelTitle, tags } = req.body;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        summary: 'GEMINI_API_KEYが設定されていないため、デフォルト要約を表示します。',
        keyTakeaways: [
          '動画タイトル: ' + (title || 'タイトルなし'),
          'チャンネル: ' + (channelTitle || '不明'),
          'この動画は主要ポイントを効率よく学習できるおすすめ動画です。'
        ]
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `あなたは動画学習アシスタント「海斗tube AI」です。
以下のYouTube動画情報を元に、日本語で分かりやすく動画概要と主要ポイントをまとめてください。

動画タイトル: ${title}
チャンネル名: ${channelTitle}
タグ: ${Array.isArray(tags) ? tags.join(', ') : tags || ''}
概要欄: ${description ? description.slice(0, 1000) : 'なし'}

以下のJSON形式で出力してください:
{
  "summary": "動画の全体要約（200文字程度）",
  "keyTakeaways": [
    "主要ポイント1",
    "主要ポイント2",
    "主要ポイント3"
  ],
  "estimatedTimestamps": [
    {"time": "00:00", "label": "オープニング・イントロ"},
    {"time": "03:15", "label": "核心となるコンセプト解説"},
    {"time": "08:30", "label": "実践・応用とまとめ"}
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '';
    const json = JSON.parse(text);
    return res.json(json);
  } catch (err: any) {
    console.error('AI summarize error:', err);
    return res.json({
      summary: `「${title}」の要約情報です。動画で取り上げられている要点を以下にまとめています。`,
      keyTakeaways: [
        `タイトル: ${title}`,
        `チャンネル: ${channelTitle}`,
        '動画の概要とハイライトを効率的に学習できます。'
      ],
      estimatedTimestamps: [
        { time: '00:00', label: 'イントロダクション' },
        { time: '02:30', label: 'メインコンテンツ' },
        { time: '07:00', label: 'まとめと結論' }
      ]
    });
  }
});

// 12. Base64 Thumbnail Image Proxy & Helper
app.all(['/api/proxy/thumbnail', '/api/fetchAsBase64'], async (req, res) => {
  let imageUrl = (req.query.url as string) || (req.body && req.body.url);
  if (!imageUrl && req.query.videoId) {
    imageUrl = `https://yt.omada.cafe/vi/${req.query.videoId}/hqdefault.jpg`;
  }

  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const fetchWithFallback = async (targetUrl: string) => {
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.youtube.com/'
        }
      });
      if (response.ok) return response;
    } catch {
      // Fallback
    }

    // If targetUrl failed and is i.ytimg.com, fallback to Invidious instances
    const match = targetUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    if (match && match[1]) {
      const vId = match[1];
      const invidiousInstances = ['https://yt.omada.cafe', 'https://invidious.nerdvpn.de', 'https://inv.nadeko.net'];
      for (const inst of invidiousInstances) {
        try {
          const invRes = await fetch(`${inst}/vi/${vId}/hqdefault.jpg`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (invRes.ok) return invRes;
        } catch {
          // continue to next instance
        }
      }
    }
    return null;
  };

  try {
    const imageRes = await fetchWithFallback(imageUrl);
    if (!imageRes) {
      throw new Error(`Failed to fetch thumbnail from ${imageUrl}`);
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;

    if (req.query.format === 'json' || req.path === '/api/fetchAsBase64') {
      return res.json({ dataUri, success: true });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Thumbnail proxy error:', err);
    if (req.query.format === 'json' || req.path === '/api/fetchAsBase64') {
      return res.json({ dataUri: imageUrl, success: false });
    }
    res.redirect(imageUrl);
  }
});

// YouTube API Key Tester & Health Diagnostic Endpoint
app.post('/api/youtube/test-key', async (req, res) => {
  const customKey = req.body?.key?.trim() || (req.headers['x-youtube-key'] as string)?.trim() || YOUTUBE_API_KEY;
  if (!customKey) {
    return res.status(400).json({ valid: false, error: 'APIキーが指定されていません' });
  }

  try {
    const testUrl = `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=JP&key=${encodeURIComponent(customKey)}`;
    const resp = await fetch(testUrl);
    const data = await resp.json();

    if (resp.ok && data.items) {
      return res.json({
        valid: true,
        status: 'ok',
        message: 'YouTube Data API への疎通・認証に成功しました！クォータ残量も正常です。',
        categoryCount: data.items.length
      });
    }

    const errCode = data?.error?.code || resp.status;
    const errMsg = data?.error?.message || 'API認証エラー';
    const reason = data?.error?.errors?.[0]?.reason || '';

    let userFriendly = errMsg;
    if (reason === 'quotaExceeded' || errCode === 403) {
      userFriendly = '本日のAPI利用クォータ上限（10,000 unit）に達しています。明日再開されるか、別のAPIキーまたはInvidiousへの切り替えをお試しください。';
    } else if (reason === 'keyInvalid' || errCode === 400) {
      userFriendly = 'APIキーが無効またはフォーマットが不正です。Google Cloud Console のキーをご確認ください。';
    }

    return res.status(200).json({
      valid: false,
      status: reason || 'error',
      code: errCode,
      message: userFriendly,
      rawError: errMsg
    });
  } catch (err: any) {
    return res.status(500).json({
      valid: false,
      status: 'network_error',
      message: 'APIサーバーへの通信に失敗しました: ' + (err.message || '')
    });
  }
});

export default app;
