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

// 0. YouTube Education Dynamic Parameters & Widget API from Google Spreadsheet
interface CachedEduData {
  parameterText: string;
  widgetApiSource: string;
  expiresAt: number;
}

let cachedEduData: CachedEduData | null = null;

async function getSpreadsheetEduConfig(force = false): Promise<CachedEduData> {
  if (!force && cachedEduData && cachedEduData.expiresAt > Date.now()) {
    return cachedEduData;
  }

  const sheetId = '1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg';
  const sheetName = 'Youtube-education-parameter';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&range=A1:A2&headers=0`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);

    if (!response.ok) {
      throw new Error(`Spreadsheet fetch failed: ${response.status}`);
    }

    const text = await response.text();
    const prefix = 'google.visualization.Query.setResponse(';
    const n = text.indexOf(prefix);
    const r = text.lastIndexOf(');');
    if (n < 0 || r < n) {
      throw new Error('Invalid spreadsheet response format');
    }

    const data = JSON.parse(text.slice(n + prefix.length, r));
    const paramRaw = data.table?.rows?.[0]?.c?.[0]?.v || '';
    const widgetApiRaw = data.table?.rows?.[1]?.c?.[0]?.v || '';

    let parameterText = String(paramRaw).replace(/&amp;/g, '&').trim();
    if (parameterText && !parameterText.startsWith('?')) {
      parameterText = '?' + parameterText;
    }

    cachedEduData = {
      parameterText: parameterText || '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1',
      widgetApiSource: String(widgetApiRaw || ''),
      expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour cache
    };
    return cachedEduData;
  } catch (err: any) {
    console.warn('Failed to fetch education param from spreadsheet:', err.message);
    if (cachedEduData) {
      return cachedEduData;
    }
    return {
      parameterText: '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1',
      widgetApiSource: '',
      expiresAt: Date.now() + 60 * 1000
    };
  }
}

// 0-1. YouTube Education Stream URL Generator (/api/stream/youtubeeducation/:videoId)
app.get('/api/stream/youtubeeducation/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'videoId must be an 11-character YouTube video ID' });
  }

  try {
    const config = await getSpreadsheetEduConfig();
    const param = config.parameterText || '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
    
    // YouTube Education / restriction bypass embed URL
    const embedUrl = `https://www.youtubeeducation.com/embed/${videoId}${param}`;

    return res.json({
      url: embedUrl,
      videoId,
      param
    });
  } catch (err: any) {
    console.error('Error generating youtubeeducation stream url:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate YouTube Education URL' });
  }
});

// 0-2. YouTube Education Dynamic Parameters & Widget API
app.get('/api/education-param', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const config = await getSpreadsheetEduConfig(force);
    return res.json({
      success: true,
      param: config.parameterText,
      widgetApiSource: config.widgetApiSource,
      hasWidgetApi: Boolean(config.widgetApiSource && config.widgetApiSource.length > 100)
    });
  } catch (err: any) {
    return res.json({
      success: false,
      param: '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1',
      widgetApiSource: '',
      hasWidgetApi: false
    });
  }
});

// 0-3. Stream status ping
app.get('/api/stream/status', (req, res) => {
  res.json({
    status: 'ok',
    generatedAt: new Date().toISOString(),
    processing: {
      count: 0,
      ids: []
    }
  });
});

// 0-4. Google Apps Script (GAS) Sync & Code Generator
app.get('/api/gas/code', (req, res) => {
  const gasScript = `/**
 * しあTube - Google Apps Script (GAS) サーバーコード
 * 学校・組織のフィルタリング回避 & Webアプリ配信用
 */

function doGet(e) {
  if (e && e.parameter && e.parameter.url) {
    return handleProxy(e);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('しあTube')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5');
}

function handleProxy(e) {
  var targetUrl = e.parameter.url;
  var callback = e.parameter.callback;
  if (!targetUrl) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing url parameter" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var response = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    var text = response.getContentText();
    var code = response.getResponseCode();
    if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      var data = { ok: code >= 200 && code < 300, status: code, data: null };
      try { data.data = JSON.parse(text); } catch (p) { data.data = text; }
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(text)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var errData = { error: err.toString(), code: 'GAS_FETCH_FAILED', ok: false, status: 502 };
    if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(errData) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(errData))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function refreshHtmlToDocs() {
  try {
    var sourceUrl = 'https://raw.githubusercontent.com/ajgpw/siatube/refs/heads/main/siatube-full.html.txt';
    var res = UrlFetchApp.fetch(sourceUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return { success: true, bytes: res.getContentText().length, syncedAt: new Date().toISOString() };
    }
    return { success: false, code: res.getResponseCode() };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
`;
  if (req.query.format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(gasScript);
  }
  return res.json({
    success: true,
    code: gasScript,
    functionNames: ['doGet', 'handleProxy', 'refreshHtmlToDocs']
  });
});

// Premium Gate Authentication (ID & Password verification)
app.post('/api/auth/verify', (req, res) => {
  const expectedId = (process.env.PREMIUM_ID || process.env.KAITO_ID || 'kaito').trim();
  const expectedPassword = (process.env.PREMIUM_PASSWORD || process.env.KAITO_PASSWORD || '@0726kaito').trim();

  const { username = '', password = '' } = req.body || {};
  const trimmedUser = String(username).trim();
  const trimmedPass = String(password).trim();

  if (trimmedUser === expectedId && trimmedPass === expectedPassword) {
    return res.json({ success: true });
  }

  return res.status(401).json({
    success: false,
    message: '会員IDまたはパスワードが一致しません。正しい認証情報を入力してください。'
  });
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
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const queryTitle = (req.query.q as string) || '';

  // 1. Try InnerTube Worker videos/:id for recommended videos
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `videos/${id}`);
    const recs = itRes.data?.recommendedVideos || itRes.data?.relatedVideos || itRes.data?.related;
    if (Array.isArray(recs) && recs.length > 0) {
      const items = recs.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('InnerTube related error:', err);
  }

  // 2. Invidious fallback for related videos (Invidious /api/v1/videos/:id always has recommendedVideos)
  try {
    const invRes = await fetchInvidious(invidiousUrl, `videos/${id}`);
    if (invRes.data && Array.isArray(invRes.data.recommendedVideos) && invRes.data.recommendedVideos.length > 0) {
      const items = invRes.data.recommendedVideos.map(convertInvidiousItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('Invidious related error:', err);
  }

  // 3. Title Search fallback: search for similar videos using the title query
  if (queryTitle) {
    try {
      const searchRes = await fetchInnerTubeWorker(innertubeUrl, 'search', { q: queryTitle, limit: '20' });
      if (searchRes.data && Array.isArray(searchRes.data.results) && searchRes.data.results.length > 0) {
        const filtered = searchRes.data.results
          .filter((item: any) => item.videoId !== id && item.id !== id)
          .map(convertInnerTubeItemToYouTubeItem);
        if (filtered.length > 0) {
          return res.json({
            kind: 'youtube#searchResponse',
            items: filtered,
            nextPageToken: null
          });
        }
      }
    } catch (err) {
      console.warn('InnerTube title search fallback error:', err);
    }
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
  const { innertubeUrl, invidiousUrl, youtubeKey } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, maxResults = '20' } = req.query;

  // 1. Try InnerTube Worker
  try {
    const itParams: Record<string, string> = { limit: String(maxResults) };
    if (pageToken) itParams.continuation = String(pageToken);
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `comments/replies/${id}`, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && itRes.data.comments.length > 0) {
      const items = itRes.data.comments.map((c: any) => convertSingleInvidiousComment(c));
      return res.json({ items, nextPageToken: itRes.data.continuation || null });
    }
  } catch (err) {}

  // 2. Official YouTube API
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

  // 3. Fallback: Invidious
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

// 8b. Channel Uploaded Videos Endpoint (Supports All Videos via Uploads & Pagination)
app.get('/api/youtube/channel/videos/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;
  const { pageToken, page = '1' } = req.query;

  // 1. Try InnerTube Worker channels/:id/videos
  try {
    const queryParams: Record<string, string> = {};
    if (pageToken && typeof pageToken === 'string') {
      queryParams.continuation = pageToken;
    }
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/videos`, queryParams);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      const items = itRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: itRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('InnerTube channel videos error:', err);
  }

  // 2. Try Invidious channels/:id/videos (robust fallback supporting all uploads & continuation)
  try {
    const invQueryParams: Record<string, string> = {};
    if (pageToken && typeof pageToken === 'string') {
      invQueryParams.continuation = pageToken;
    } else if (page) {
      invQueryParams.page = String(page);
    }
    const invRes = await fetchInvidious(invidiousUrl, `channels/${id}/videos`, invQueryParams);
    if (invRes.data && (Array.isArray(invRes.data.videos) || Array.isArray(invRes.data))) {
      const vList = Array.isArray(invRes.data.videos) ? invRes.data.videos : invRes.data;
      const items = vList.map(convertInvidiousItemToYouTubeItem);
      return res.json({
        kind: 'youtube#searchResponse',
        items,
        nextPageToken: invRes.data.continuation || null
      });
    }
  } catch (err) {
    console.warn('Invidious channel videos error:', err);
  }

  // 3. Try Invidious uploads playlist (replace UC with UU)
  if (id.startsWith('UC')) {
    const uploadsPlaylistId = 'UU' + id.slice(2);
    try {
      const itPlRes = await fetchInnerTubeWorker(innertubeUrl, `playlists/${uploadsPlaylistId}`);
      if (itPlRes.data && Array.isArray(itPlRes.data.videos) && itPlRes.data.videos.length > 0) {
        const items = itPlRes.data.videos.map(convertInnerTubeItemToYouTubeItem);
        return res.json({
          kind: 'youtube#searchResponse',
          items,
          nextPageToken: null
        });
      }
    } catch (err) {}
  }

  return res.json({
    items: [],
    nextPageToken: null
  });
});

// 8b2. Channel Playlists Endpoint (Fetch all playlists created by this channel)
app.get('/api/youtube/channel/playlists/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Try Invidious channel playlists
  try {
    const invRes = await fetchInvidious(invidiousUrl, `channels/playlists/${id}`);
    if (invRes.data && Array.isArray(invRes.data.playlists) && invRes.data.playlists.length > 0) {
      const items = invRes.data.playlists.map((pl: any) => ({
        id: pl.playlistId || pl.id,
        snippet: {
          title: pl.title || '再生リスト',
          description: pl.description || '',
          channelTitle: pl.author || '',
          channelId: id,
          publishedAt: '',
          thumbnails: {
            medium: { url: pl.playlistThumbnail || `https://i.ytimg.com/vi/${pl.videoCount ? 'default' : ''}/hqdefault.jpg` },
            high: { url: pl.playlistThumbnail || `https://i.ytimg.com/vi/${pl.videoCount ? 'default' : ''}/hqdefault.jpg` }
          }
        },
        contentDetails: {
          itemCount: pl.videoCount || 0
        }
      }));
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {
    console.warn('Invidious channel playlists error:', err);
  }

  // 2. Try InnerTube channel playlists
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/playlists`);
    if (itRes.data && Array.isArray(itRes.data.playlists) && itRes.data.playlists.length > 0) {
      const items = itRes.data.playlists.map((pl: any) => ({
        id: pl.playlistId || pl.id,
        snippet: {
          title: pl.title || '再生リスト',
          description: pl.description || '',
          channelTitle: pl.author || '',
          channelId: id,
          publishedAt: '',
          thumbnails: {
            medium: { url: pl.thumbnail || '' },
            high: { url: pl.thumbnail || '' }
          }
        },
        contentDetails: {
          itemCount: pl.videoCount || 0
        }
      }));
      return res.json({ items, nextPageToken: null });
    }
  } catch (err) {}

  return res.json({ items: [], nextPageToken: null });
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
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Try InnerTube Worker
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `playlists/${id}`);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
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

  // 2. Try Invidious playlists/:id
  try {
    const invRes = await fetchInvidious(invidiousUrl, `playlists/${id}`);
    if (invRes.data && Array.isArray(invRes.data.videos)) {
      const items = invRes.data.videos.map(convertInvidiousItemToYouTubeItem);
      return res.json({
        playlist: {
          id,
          snippet: {
            title: invRes.data.title || '再生リスト',
            description: invRes.data.description || '',
            channelTitle: invRes.data.author || ''
          }
        },
        items,
        nextPageToken: null
      });
    }
  } catch (err) {
    console.warn('Invidious playlist error:', err);
  }

  return res.json({
    playlist: null,
    items: [],
    nextPageToken: null,
    error: 'PLAYLIST_NOT_FOUND',
    message: '再生リストの取得に失敗しました。'
  });
});

// 8e. Search Suggestions Endpoint (Google Suggest / YouTube autocomplete API)
app.get('/api/youtube/suggest', async (req, res) => {
  const { q = '' } = req.query;
  const trimmed = String(q).trim();
  if (!trimmed) {
    return res.json([]);
  }

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=ja&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return res.json(data[1]);
      }
      return res.json(data);
    }
  } catch (err) {
    console.warn('Suggest fetch error:', err);
  }

  return res.json([]);
});

// 8f. Channel Playlists Endpoint
app.get('/api/youtube/channel/playlists/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl, youtubeKey } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Try InnerTube
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/playlists`);
    if (itRes.data && Array.isArray(itRes.data.playlists) && itRes.data.playlists.length > 0) {
      const items = itRes.data.playlists.map((pl: any) => ({
        id: pl.playlistId || pl.id,
        title: pl.title,
        thumbnail: pl.thumbnail || pl.thumbnails?.[0]?.url,
        videoCount: pl.videoCount || pl.itemCount || 0,
        snippet: {
          title: pl.title,
          thumbnails: {
            high: { url: pl.thumbnail || pl.thumbnails?.[0]?.url || '' },
            medium: { url: pl.thumbnail || pl.thumbnails?.[0]?.url || '' }
          }
        },
        contentDetails: {
          itemCount: pl.videoCount || pl.itemCount || 0
        }
      }));
      return res.json({ items });
    }
  } catch (err) {}

  // 2. Official YouTube API
  if (youtubeKey) {
    try {
      const data = await fetchYouTube('playlists', {
        part: 'snippet,contentDetails',
        channelId: id,
        maxResults: '24'
      }, youtubeKey);
      if (!data.error && data.items) {
        return res.json(data);
      }
    } catch (err) {}
  }

  // 3. Try Invidious
  try {
    const invRes = await fetchInvidious(invidiousUrl, `channels/playlists/${id}`);
    if (invRes.data && Array.isArray(invRes.data.playlists)) {
      const items = invRes.data.playlists.map((pl: any) => ({
        id: pl.playlistId || pl.id,
        title: pl.title,
        thumbnail: pl.playlistThumbnail,
        videoCount: pl.videoCount || 0,
        snippet: {
          title: pl.title,
          thumbnails: {
            high: { url: pl.playlistThumbnail || '' },
            medium: { url: pl.playlistThumbnail || '' }
          }
        },
        contentDetails: {
          itemCount: pl.videoCount || 0
        }
      }));
      return res.json({ items });
    }
  } catch (err) {}

  return res.json({ items: [] });
});

// 8g. Channel Community Posts Endpoint
app.get('/api/youtube/channel/community/:id', async (req, res) => {
  const { innertubeUrl, invidiousUrl } = getRequestConfig(req);
  const { id } = req.params;

  // 1. Try InnerTube
  try {
    const itRes = await fetchInnerTubeWorker(innertubeUrl, `channels/${id}/community`);
    if (itRes.data && Array.isArray(itRes.data.posts) && itRes.data.posts.length > 0) {
      const items = itRes.data.posts.map((post: any) => ({
        id: post.postId || post.id,
        contentText: post.text || post.contentText || '',
        publishedTimeText: post.publishedTimeText || post.published || '',
        attachmentImage: post.attachmentImage || post.image || null,
        voteCount: post.voteCount || post.likes || 0,
        replyCount: post.replyCount || 0
      }));
      return res.json({ items });
    }
  } catch (err) {}

  // 2. Try Invidious
  try {
    const invRes = await fetchInvidious(invidiousUrl, `channels/community/${id}`);
    if (invRes.data && Array.isArray(invRes.data.comments)) {
      const items = invRes.data.comments.map((post: any) => ({
        id: post.commentId || post.id,
        contentText: post.content || post.text || '',
        publishedTimeText: post.publishedText || '',
        attachmentImage: post.attachmentImage || null,
        voteCount: post.likeCount || 0,
        replyCount: post.replyCount || 0
      }));
      return res.json({ items });
    }
  } catch (err) {}

  return res.json({ items: [] });
});

// 8h. Video Transcript / Captions Endpoint (Interactive Timestamps)
app.get('/api/youtube/transcript/:id', async (req, res) => {
  const { invidiousUrl, innertubeUrl } = getRequestConfig(req);
  const { id } = req.params;
  const lang = (req.query.lang as string) || 'ja';

  interface TranscriptItem {
    start: number;
    duration: number;
    text: string;
  }

  // Helper: parse seconds from timestamp string like 00:01:23.450 or 01:23.450
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr) || 0;
  };

  // Helper: parse WebVTT text into TranscriptItem array
  const parseVtt = (vttText: string): TranscriptItem[] => {
    const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const items: TranscriptItem[] = [];
    let currentStart = 0;
    let currentDuration = 0;
    let currentText = '';

    const timeRegex = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(timeRegex);
      if (match) {
        if (currentText) {
          items.push({
            start: Math.round(currentStart * 10) / 10,
            duration: Math.round(currentDuration * 10) / 10,
            text: currentText.replace(/<[^>]+>/g, '').trim()
          });
          currentText = '';
        }
        const s = parseTime(match[1]);
        const e = parseTime(match[2]);
        currentStart = s;
        currentDuration = Math.max(1, e - s);
      } else if (line && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !/^\d+$/.test(line)) {
        currentText = currentText ? `${currentText} ${line}` : line;
      }
    }
    if (currentText) {
      items.push({
        start: Math.round(currentStart * 10) / 10,
        duration: Math.round(currentDuration * 10) / 10,
        text: currentText.replace(/<[^>]+>/g, '').trim()
      });
    }
    return items;
  };

  // 1. Try Invidious Captions
  try {
    const invRes = await fetchInvidious(invidiousUrl, `captions/${id}`);
    if (invRes.data && Array.isArray(invRes.data.captions) && invRes.data.captions.length > 0) {
      const caps = invRes.data.captions;
      // Find requested language or fallback to first
      const targetCap = caps.find((c: any) => c.languageCode === lang) ||
        caps.find((c: any) => c.languageCode?.startsWith(lang.slice(0, 2))) ||
        caps.find((c: any) => c.languageCode === 'en') ||
        caps[0];

      if (targetCap?.url) {
        const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
        const vttUrl = targetCap.url.startsWith('http') ? targetCap.url : `${cleanInst}${targetCap.url}`;
        const vttRes = await fetch(vttUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (vttRes.ok) {
          const vttText = await vttRes.text();
          const items = parseVtt(vttText);
          if (items.length > 0) {
            return res.json({
              language: targetCap.label || targetCap.languageCode,
              languageCode: targetCap.languageCode,
              items
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Invidious caption error:', err);
  }

  // 2. Try Direct YouTube Timedtext as fallback
  try {
    const ttRes = await fetch(`https://www.youtube.com/api/timedtext?v=${id}&lang=${lang}&fmt=vtt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (ttRes.ok) {
      const vttText = await ttRes.text();
      if (vttText.includes('-->')) {
        const items = parseVtt(vttText);
        if (items.length > 0) {
          return res.json({ language: lang, languageCode: lang, items });
        }
      }
    }
  } catch (err) {}

  return res.json({
    language: lang,
    languageCode: lang,
    items: [],
    message: 'この動画の字幕・文字起こしは利用できません。'
  });
});

// 9. Video Direct Stream Metadata & Multiplexing Endpoints
interface ResolvedStreamUrls {
  title?: string;
  v1080?: string;
  v720?: string;
  v480?: string;
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
    // Specifically request 1080p video stream and best audio stream separately for muxing
    execFile(
      ytDlpPath,
      [
        '-g',
        '-f',
        'bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]/bestvideo,bestaudio[ext=m4a]/bestaudio',
        `https://www.youtube.com/watch?v=${videoId}`
      ],
      { timeout: 25000 },
      (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\n').filter((l) => l.startsWith('http'));
          if (lines.length >= 2) {
            const v1080 = lines[0];
            const audio = lines[1];
            const result: ResolvedStreamUrls = {
              v1080,
              v720: v1080,
              v360: v1080,
              audio,
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
      directUrl: `/api/youtube/stream-direct/${id}?quality=audio`,
      quality: 'audio',
      container: 'aac'
    }
  });
});

// Direct Invidious Google Video Streams (Resolves direct googlevideo.com URLs & Invidious proxy streams)
app.get('/api/youtube/stream-sources/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');

    return res.json({
      videoId: id,
      title: urls?.title || `video-${id}`,
      streams: {
        v1080: urls?.v1080 || `/api/youtube/stream-direct/${id}?quality=1080`,
        v720: urls?.v720 || urls?.combined720 || `/api/youtube/stream-direct/${id}?quality=720`,
        v360: urls?.v360 || urls?.combined360 || `/api/youtube/stream-direct/${id}?quality=360`,
        audio: urls?.audio || `/api/youtube/stream-direct/${id}?quality=audio`,
        invidious720: `${cleanInst}/latest_version?id=${id}&itag=22`,
        invidious360: `${cleanInst}/latest_version?id=${id}&itag=18`,
        direct720: `/api/youtube/stream-direct/${id}?quality=720`,
        direct360: `/api/youtube/stream-direct/${id}?quality=360`,
        directAudio: `/api/youtube/stream-direct/${id}?quality=audio`
      },
      audioTracks: [
        { id: 'audio-ja-std', url: urls?.audio || `/api/youtube/stream-direct/${id}?quality=audio`, lang: 'ja', label: '日本語（標準音声）', isDefault: true, isOriginal: true },
        { id: 'audio-orig', url: urls?.audio || `/api/youtube/stream-direct/${id}?quality=audio`, lang: 'und', label: 'オリジナル音声', isOriginal: true },
        { id: 'audio-drc', url: `/api/youtube/stream-direct/${id}?quality=audio&drc=1`, lang: 'ja', label: '夜間音量圧縮 (DRC)', isDrc: true }
      ],
      subtitleTracks: [
        { id: 'sub-ja', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=ja`, lang: 'ja', label: '日本語字幕', isDefault: true },
        { id: 'sub-en', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=en`, lang: 'en', label: '英語字幕' },
        { id: 'sub-auto', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=auto`, lang: 'und', label: '自動生成字幕' }
      ]
    });
  } catch (err: any) {
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
    return res.json({
      videoId: id,
      streams: {
        v720: `${cleanInst}/latest_version?id=${id}&itag=22`,
        v360: `${cleanInst}/latest_version?id=${id}&itag=18`,
        direct720: `/api/youtube/stream-direct/${id}?quality=720`,
        direct360: `/api/youtube/stream-direct/${id}?quality=360`,
        directAudio: `/api/youtube/stream-direct/${id}?quality=audio`
      },
      audioTracks: [
        { id: 'audio-ja-std', url: `/api/youtube/stream-direct/${id}?quality=audio`, lang: 'ja', label: '日本語（標準）', isDefault: true, isOriginal: true }
      ],
      subtitleTracks: [
        { id: 'sub-ja', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=ja`, lang: 'ja', label: '日本語字幕', isDefault: true }
      ]
    });
  }
});

// Direct Stream Redirect Endpoint (Redirects 302 to Invidious Google Video stream for instant playback)
app.get('/api/youtube/stream-direct/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality = req.query.quality === '1080' ? '1080' : req.query.quality === '360' ? '360' : req.query.quality === 'audio' ? 'audio' : '720';

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    let targetUrl: string | undefined;

    if (quality === 'audio') {
      targetUrl = urls?.audio || urls?.combined720 || urls?.combined360;
    } else if (quality === '360') {
      targetUrl = urls?.combined360 || urls?.v360 || urls?.combined720 || urls?.v720;
    } else if (quality === '1080') {
      targetUrl = urls?.v1080 || urls?.v720 || urls?.combined720;
    } else {
      targetUrl = urls?.combined720 || urls?.v720 || urls?.combined360;
    }

    if (targetUrl && targetUrl.startsWith('http')) {
      return res.redirect(302, targetUrl);
    }

    // Fallback directly to Invidious latest_version
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
    const itag = quality === '360' ? '18' : '22';
    return res.redirect(302, `${cleanInst}/latest_version?id=${id}&itag=${itag}`);
  } catch {
    const cleanInst = (invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
    const itag = quality === '360' ? '18' : '22';
    return res.redirect(302, `${cleanInst}/latest_version?id=${id}&itag=${itag}`);
  }
});

// Stream Video + Audio Multiplexing via FFmpeg
app.get('/api/youtube/stream-mux/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl } = getRequestConfig(req);
  const quality = req.query.quality === '1080' ? '1080' : req.query.quality === '360' ? '360' : '720';

  activeMuxStreams++;
  totalProcessedStreams++;
  let hasClosed = false;
  const decrement = () => {
    if (!hasClosed) {
      hasClosed = true;
      activeMuxStreams = Math.max(0, activeMuxStreams - 1);
    }
  };
  req.on('close', decrement);
  res.on('finish', decrement);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls) {
      decrement();
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

  activeMuxStreams++;
  totalProcessedStreams++;
  let hasClosed = false;
  const decrement = () => {
    if (!hasClosed) {
      hasClosed = true;
      activeMuxStreams = Math.max(0, activeMuxStreams - 1);
    }
  };
  req.on('close', decrement);
  res.on('finish', decrement);

  try {
    const urls = await resolveVideoStreams(id, invidiousUrl);
    if (!urls || (!urls.audio && !urls.combined720 && !urls.combined360)) {
      decrement();
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

// Server Stream & Queue Status Tracker
let activeMuxStreams = 0;
let totalProcessedStreams = 0;

app.get('/api/stream/status', (req, res) => {
  const queueLength = Math.max(0, activeMuxStreams - 2);
  const estimatedWaitSeconds = queueLength * 3;
  let status: 'idle' | 'busy' | 'processing' = 'idle';
  let message = 'サーバーは空いています';

  if (activeMuxStreams > 3) {
    status = 'busy';
    message = `サーバーで${activeMuxStreams}件を処理中です（待ち時間: 約${estimatedWaitSeconds}秒）`;
  } else if (activeMuxStreams > 0) {
    status = 'processing';
    message = `サーバーで${activeMuxStreams}件を処理中です`;
  }

  res.json({
    status,
    activeStreams: activeMuxStreams,
    queueLength,
    estimatedWaitSeconds,
    totalProcessed: totalProcessedStreams,
    message
  });
});

// Download Info Endpoint for Type 3 Download Modal
app.get('/api/download/info/:id', async (req, res) => {
  const { id } = req.params;
  const { invidiousUrl, innertubeUrl } = getRequestConfig(req);

  try {
    const streamData = await resolveVideoStreams(id, invidiousUrl);
    const m3u8Url = `https://yt-api.myproxy0108.workers.dev/api/stream/${id}.m3u8`;

    res.json({
      videoId: id,
      title: streamData?.title || `video-${id}`,
      m3u8Url,
      m3u8DevUrl: `https://m3u8.dev/?url=${encodeURIComponent(m3u8Url)}`,
      standard360: `/api/youtube/stream-mux/${id}?quality=360`,
      videoOnly: [
        { label: '1080p (FHD)', quality: '1080p', url: streamData?.v1080 || `/api/youtube/stream-mux/${id}?quality=1080` },
        { label: '720p (HD)', quality: '720p', url: streamData?.v720 || `/api/youtube/stream-mux/${id}?quality=720` },
        { label: '480p', quality: '480p', url: streamData?.v480 || `/api/youtube/stream-mux/${id}?quality=480` },
        { label: '360p', quality: '360p', url: streamData?.combined360 || streamData?.v360 || `/api/youtube/stream-mux/${id}?quality=360` },
      ],
      audioOnly: [
        { label: '音声 AAC/M4A (標準)', format: 'm4a', url: `/api/youtube/stream-audio/${id}` },
        { label: '音声 MP3 変換ストリーム', format: 'mp3', url: `/api/youtube/stream-audio/${id}?format=mp3` },
        { label: '音声 WebM 原音', format: 'webm', url: streamData?.audio || `/api/youtube/stream-audio/${id}` }
      ],
      subtitles: [
        { label: '日本語字幕 (VTT)', lang: 'ja', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=ja` },
        { label: '英語字幕 (VTT)', lang: 'en', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=en` },
        { label: '自動生成字幕 (VTT)', lang: 'auto', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=auto` }
      ]
    });
  } catch (err: any) {
    res.json({
      videoId: id,
      title: `video-${id}`,
      m3u8Url: `https://yt-api.myproxy0108.workers.dev/api/stream/${id}.m3u8`,
      m3u8DevUrl: `https://m3u8.dev/?url=${encodeURIComponent(`https://yt-api.myproxy0108.workers.dev/api/stream/${id}.m3u8`)}`,
      standard360: `/api/youtube/stream-mux/${id}?quality=360`,
      videoOnly: [
        { label: '720p (HD)', quality: '720p', url: `/api/youtube/stream-mux/${id}?quality=720` },
        { label: '360p', quality: '360p', url: `/api/youtube/stream-mux/${id}?quality=360` }
      ],
      audioOnly: [
        { label: '音声 AAC/M4A', format: 'm4a', url: `/api/youtube/stream-audio/${id}` }
      ],
      subtitles: [
        { label: '日本語字幕 (VTT)', lang: 'ja', url: `https://yt-api.myproxy0108.workers.dev/api/subtitles/${id}?lang=ja` }
      ]
    });
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
