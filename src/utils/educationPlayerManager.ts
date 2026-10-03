/**
 * YouTube Education Player Engine & Dynamic Parameter Management
 * Compatible with Google Spreadsheet GViz Engine & Educational Stream
 */

export interface SpreadsheetEduConfig {
  parameterText: string;
  widgetApiSource: string;
}

export interface EducationStreamResponse {
  url: string;
  videoId?: string;
  param?: string;
}

const SPREADSHEET_ID = '1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg';
const SHEET_NAME = 'Youtube-education-parameter';
const CACHE_KEY = 'kaito_edu_spreadsheet_cache_v1';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const WIDGET_SCRIPT_ID = 'youtube-education-widget-api';
export const USER_GESTURE_KEY = 'yt_user_gesture_v1';

let inMemoryConfig: SpreadsheetEduConfig | null = null;
let inMemoryConfigTimestamp = 0;
let widgetApiPromise: Promise<any> | null = null;

export function normalizeEduParameter(
  rawParam: string,
  options: { autoplay?: boolean; start?: number; origin?: string } = {}
): string {
  const normalizedParameterText = String(rawParam || '')
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/^\?/, '');

  const params = new URLSearchParams(
    normalizedParameterText ||
      'enablejsapi=1&rel=0&controls=1&showinfo=0&start=0&autoplay=1&playsinline=1&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1'
  );
  params.set('enablejsapi', '1');
  params.set('controls', '1');
  params.set('playsinline', '1');
  params.set('autoplay', options.autoplay === false ? '0' : '1');
  if (typeof options.start === 'number' && options.start > 0) {
    params.set('start', String(Math.floor(options.start)));
  }
  if (!params.has('widgetid')) {
    params.set('widgetid', '1');
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ) {
    if (!params.has('origin') && !params.has('embed_config')) {
      params.set('origin', options.origin || window.location.origin);
    }
    if (!params.has('forigin') && !params.has('embed_config')) {
      params.set('forigin', window.location.href);
    }
  }
  return `?${params.toString()}`;
}

export function createYoutubeEducationEmbedUrl(
  videoId: string,
  parameterText: string,
  options: { autoplay?: boolean; start?: number; origin?: string } = {}
): string {
  const cleanId = encodeURIComponent(String(videoId || '').trim());
  const query = normalizeEduParameter(parameterText, options);
  return `https://www.youtubeeducation.com/embed/${cleanId}${query}`;
}

/**
 * 1. Fetch YouTube Education Embed URL from Backend API
 * Request to /api/stream/youtubeeducation/{videoId}
 */
export async function fetchEducationStreamUrl(videoId: string): Promise<string> {
  const cleanId = String(videoId || '').trim();
  if (!cleanId || cleanId.length !== 11) {
    throw new Error('videoId must be an 11-character YouTube video ID');
  }

  // Try backend endpoint first
  try {
    const res = await fetch(`/api/stream/youtubeeducation/${encodeURIComponent(cleanId)}?origin=kaitotube`, {
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      const streamUrl = typeof data === 'string' ? data : data?.url;
      if (typeof streamUrl === 'string' && streamUrl.trim()) {
        let safeUrl = streamUrl.trim().replace('youtube-nocookie.com', 'youtubeeducation.com');
        const qIdx = safeUrl.indexOf('?');
        if (qIdx >= 0) {
          safeUrl = safeUrl.slice(0, qIdx) + normalizeEduParameter(safeUrl.slice(qIdx));
        } else {
          safeUrl = safeUrl + normalizeEduParameter('');
        }
        return safeUrl;
      }
    }
  } catch (err) {
    console.warn('[EducationEngine] Backend /api/stream/youtubeeducation failed, trying fallback:', err);
  }

  // Fallback: build embed URL using dynamic spreadsheet parameter
  try {
    const config = await fetchSpreadsheetEducationConfig();
    const param = normalizeEduParameter(config.parameterText);
    return `https://www.youtubeeducation.com/embed/${cleanId}${param}`;
  } catch {
    const defaultParam = normalizeEduParameter('');
    return `https://www.youtubeeducation.com/embed/${cleanId}${defaultParam}`;
  }
}

/**
 * Parse Google Spreadsheet gviz JSON response
 */
function parseGvizResponse(text: string): any {
  const prefix = 'google.visualization.Query.setResponse(';
  const startIndex = text.indexOf(prefix);
  const endIndex = text.lastIndexOf(');');
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('スプレッドシートのレスポンス形式が不正です');
  }
  const jsonString = text.slice(startIndex + prefix.length, endIndex);
  return JSON.parse(jsonString);
}

/**
 * 2. Fetch dynamic parameters and Player API code from Google Spreadsheet (gviz range A1:A2)
 */
export async function fetchSpreadsheetEducationConfig(forceRefresh = false): Promise<SpreadsheetEduConfig> {
  const now = Date.now();

  // Check in-memory cache
  if (!forceRefresh && inMemoryConfig && now - inMemoryConfigTimestamp < CACHE_TTL) {
    return {
      ...inMemoryConfig,
      parameterText: normalizeEduParameter(inMemoryConfig.parameterText)
    };
  }

  // Check localStorage cache
  if (!forceRefresh) {
    try {
      const cachedStr = localStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (parsed && parsed.timestamp && now - parsed.timestamp < CACHE_TTL && parsed.config) {
          inMemoryConfig = {
            ...parsed.config,
            parameterText: normalizeEduParameter(parsed.config.parameterText)
          };
          inMemoryConfigTimestamp = parsed.timestamp;
          return inMemoryConfig;
        }
      }
    } catch {}
  }

  // Fetch directly from Google Spreadsheet Visualization API
  try {
    const params = new URLSearchParams({
      tqx: 'out:json',
      sheet: SHEET_NAME,
      range: 'A1:A2',
      headers: '0'
    });
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`スプレッドシートの取得に失敗しました (${res.status})`);
    }

    const rawText = await res.text();
    const gviz = parseGvizResponse(rawText);

    if (gviz?.status === 'error') {
      throw new Error('スプレッドシートからプレイヤー設定を取得できませんでした');
    }

    const row0Value = gviz?.table?.rows?.[0]?.c?.[0]?.v;
    const row1Value = gviz?.table?.rows?.[1]?.c?.[0]?.v;

    let paramText = typeof row0Value === 'string' ? row0Value.replace(/&amp;/g, '&').trim() : '';
    const widgetApi = typeof row1Value === 'string' ? row1Value : '';

    if (!paramText) {
      throw new Error('スプレッドシートのA1にパラメータがありません');
    }
    if (!widgetApi) {
      throw new Error('スプレッドシートのA2にPlayer APIコードがありません');
    }

    paramText = normalizeEduParameter(paramText);

    const result: SpreadsheetEduConfig = {
      parameterText: paramText,
      widgetApiSource: widgetApi
    };

    inMemoryConfig = result;
    inMemoryConfigTimestamp = now;

    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          config: result,
          timestamp: now
        })
      );
    } catch {}

    return result;
  } catch (err: any) {
    console.warn('[EducationEngine] Direct spreadsheet fetch failed, trying local proxy /api/education-param:', err.message);
    // Try backend proxy fallback
    try {
      const res = await fetch('/api/education-param');
      if (res.ok) {
        const data = await res.json();
        if (data.param) {
          const fallbackConfig: SpreadsheetEduConfig = {
            parameterText: normalizeEduParameter(data.param),
            widgetApiSource: data.widgetApiSource || ''
          };
          return fallbackConfig;
        }
      }
    } catch {}

    if (inMemoryConfig) return inMemoryConfig;

    throw err;
  }
}

/**
 * 3. Dynamic injection of YouTube IFrame Player API (widgetApiSource) into <head>
 */
export function injectEducationPlayerApi(widgetApiSource: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));

  const win = window as any;

  if (win.YT && typeof win.YT.Player === 'function') {
    return Promise.resolve(win.YT);
  }

  if (widgetApiPromise) {
    return widgetApiPromise;
  }

  if (!widgetApiSource || typeof widgetApiSource !== 'string' || !widgetApiSource.trim()) {
    // If widgetApiSource is missing, fallback to official iframe_api script tag
    return new Promise((resolve, reject) => {
      let existing = document.getElementById(WIDGET_SCRIPT_ID) as HTMLScriptElement | null;
      if (!existing) {
        existing = document.createElement('script');
        existing.id = WIDGET_SCRIPT_ID;
        existing.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(existing);
      }
      const prevCallback = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        if (win.YT && typeof win.YT.Player === 'function') {
          resolve(win.YT);
        }
      };
      setTimeout(() => {
        if (win.YT && typeof win.YT.Player === 'function') {
          resolve(win.YT);
        } else {
          reject(new Error('YouTube Player API load timeout'));
        }
      }, 5000);
    });
  }

  widgetApiPromise = new Promise((resolve, reject) => {
    let resolved = false;
    let pollInterval: number | null = null;
    let timeoutTimer: number | null = null;

    const cleanup = () => {
      if (pollInterval !== null) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }
      if (timeoutTimer !== null) {
        window.clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    const checkReady = () => {
      if (resolved) return true;
      if (win.YT && typeof win.YT.Player === 'function') {
        resolved = true;
        cleanup();
        resolve(win.YT);
        return true;
      }
      return false;
    };

    const previousReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = (...args: any[]) => {
      if (typeof previousReady === 'function') {
        try {
          previousReady(...args);
        } catch {}
      }
      checkReady();
    };

    pollInterval = window.setInterval(checkReady, 50);

    timeoutTimer = window.setTimeout(() => {
      if (!checkReady()) {
        resolved = true;
        cleanup();
        document.getElementById(WIDGET_SCRIPT_ID)?.remove();
        reject(new Error('IFrame Player APIの初期化がタイムアウトしました'));
      }
    }, 5000);

    let scriptTag = document.getElementById(WIDGET_SCRIPT_ID) as HTMLScriptElement | null;
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = WIDGET_SCRIPT_ID;
      scriptTag.textContent = widgetApiSource;
      document.head.appendChild(scriptTag);
    }

    checkReady();
  }).catch((err) => {
    widgetApiPromise = null;
    throw err;
  });

  return widgetApiPromise;
}

/**
 * 4. Bind window.YT.Player to the rendered iframe element
 */
export interface PlayerBindOptions {
  onReady?: (player: any) => void;
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: (errCode: number) => void;
  onStateChange?: (state: number) => void;
}

export function bindEducationPlayer(
  iframeElement: HTMLIFrameElement,
  options: PlayerBindOptions = {}
): any {
  const win = window as any;
  if (!win.YT || typeof win.YT.Player !== 'function') {
    console.warn('[EducationEngine] window.YT.Player is not initialized yet');
    return null;
  }

  try {
    const player = new win.YT.Player(iframeElement, {
      events: {
        onReady: (event: any) => {
          options.onReady?.(event.target);
        },
        onStateChange: (event: any) => {
          options.onStateChange?.(event.data);
          // State: 1 = PLAYING, 5 = CUED, 0 = ENDED
          if (event.data === 1) {
            options.onPlaying?.();
          } else if (event.data === 0) {
            options.onEnded?.();
          }
        },
        onError: (event: any) => {
          console.warn('YouTube Education Player API error:', event.data);
          options.onError?.(event.data);
        }
      }
    });
    return player;
  } catch (err) {
    console.warn('[EducationEngine] Failed to bind YT.Player:', err);
    return null;
  }
}
