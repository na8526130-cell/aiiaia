import { ApiSettings } from '../types';

export const DEFAULT_SETTINGS: ApiSettings = {
  provider: 'innertube',
  innertubeUrl: 'https://yt-api.myproxy0108.workers.dev/',
  invidiousUrl: 'https://yt.omada.cafe/',
  youtubeApiKey: '',
  forceYoutubeV3: false
};

export const PRESET_INVIDIOUS_INSTANCES = [
  { name: 'omada.cafe (推奨)', url: 'https://yt.omada.cafe/' },
  { name: 'nadeko.net', url: 'https://inv.nadeko.net' },
  { name: 'privacydev.net', url: 'https://invidious.privacydev.net' },
  { name: 'drgns.space', url: 'https://invidious.drgns.space' },
  { name: 'nerdvpn.de', url: 'https://invidious.nerdvpn.de' }
];

export function getApiSettings(): ApiSettings {
  try {
    const saved = localStorage.getItem('kaito_tube_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        provider: parsed.provider || 'innertube',
        innertubeUrl: parsed.innertubeUrl || 'https://yt-api.myproxy0108.workers.dev/',
        invidiousUrl: parsed.invidiousUrl || 'https://yt.omada.cafe/',
        youtubeApiKey: parsed.youtubeApiKey || '',
        forceYoutubeV3: Boolean(parsed.forceYoutubeV3)
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

export function setEmergencyYoutubeV3(enable: boolean): void {
  const current = getApiSettings();
  saveApiSettings({
    ...current,
    forceYoutubeV3: enable
  });
}

export function notifyEmergencyV3Available(available: boolean = true): void {
  try {
    window.dispatchEvent(new CustomEvent('kaito_emergency_v3_available', { detail: { available } }));
  } catch (e) {
    console.error('Failed to dispatch emergency event:', e);
  }
}

export async function customFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const settings = getApiSettings();
  const headers = new Headers(options.headers || {});
  headers.set('x-api-provider', settings.provider || 'innertube');
  headers.set('x-innertube-url', settings.innertubeUrl || 'https://yt-api.myproxy0108.workers.dev/');
  headers.set('x-invidious-url', settings.invidiousUrl || 'https://yt.omada.cafe/');
  if (settings.youtubeApiKey) {
    headers.set('x-youtube-key', settings.youtubeApiKey);
  }
  if (settings.forceYoutubeV3) {
    headers.set('x-force-youtube-v3', 'true');
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  // Check if primary and secondary providers both failed
  if (res.status === 503) {
    try {
      const cloned = res.clone();
      const data = await cloned.json();
      if (data.error === 'BOTH_PRIMARY_FAILED' || data.emergencyV3Available) {
        notifyEmergencyV3Available(true);
      }
    } catch {
      // ignore JSON parse error on non-json error responses
    }
  }

  return res;
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
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (typeof urlStr === 'string' && urlStr.startsWith('/api/') && win.google?.script?.run) {
        return callGasApi(urlStr, init);
      }
      return originalFetch.call(this, input, init);
    };
  }
}

