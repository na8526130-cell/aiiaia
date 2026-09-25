/**
 * Google Apps Script (GAS) Sync & Deployment Engine
 * Handles synchronization between KaitoTube and GAS Web App environments
 */

export interface GasSyncStatus {
  isGasEnv: boolean;
  deploymentId: string | null;
  gasUrl: string | null;
  hasGoogleScriptRun: boolean;
  lastSyncTime: number | null;
}

const GAS_PROXY_STORAGE_KEY = 'kaito_gas_proxy_url';
const GAS_DEPLOYMENT_ID_KEY = 'kaito_gas_deployment_id';

/**
 * Detect if running inside Google Apps Script iframe sandbox
 */
export function isGasEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  const isGoogleHost = host.includes('script.google.com') || host.includes('googleusercontent.com');
  const hasGoogScript = typeof (window as any).google?.script?.run !== 'undefined' || typeof (window as any).goog?.script !== 'undefined';
  return isGoogleHost || hasGoogScript;
}

/**
 * Get saved or detected GAS deployment URL
 */
export function getSavedGasProxyUrl(): string {
  try {
    return localStorage.getItem(GAS_PROXY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Save GAS deployment URL
 */
export function saveGasProxyUrl(url: string): void {
  try {
    localStorage.setItem(GAS_PROXY_STORAGE_KEY, url.trim());
    window.dispatchEvent(new CustomEvent('kaito_gas_config_changed', { detail: { url } }));
  } catch {}
}

/**
 * Call GAS server-side function if running inside GAS Web App
 */
export function callGasFunction<T = any>(functionName: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google || !google.script || !google.script.run) {
      return reject(new Error('google.script.run is not available outside Google Apps Script'));
    }

    const runner = google.script.run
      .withSuccessHandler((res: T) => resolve(res))
      .withFailureHandler((err: any) => reject(new Error(err?.message || String(err))));

    if (typeof runner[functionName] === 'function') {
      runner[functionName](...args);
    } else {
      reject(new Error(`Function ${functionName} is not defined in Google Apps Script`));
    }
  });
}

/**
 * Generate complete Code.gs script for Google Apps Script deployment
 */
export function generateGasCode(): string {
  return `/**
 * しあTube (Siatube) - Google Apps Script (GAS) サーバーコード
 * 学校・組織のフィルタリング回避 & Webアプリ配信用
 */

// 1. Webアプリのエントリーポイント
function doGet(e) {
  // プロキシ中継リクエストの場合 (?url=https://...)
  if (e && e.parameter && e.parameter.url) {
    return handleProxy(e);
  }

  // しあTube アプリケーション本体の配信
  var htmlOutput = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('しあTube')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5')
    .addMetaTag('description', 'YouTube動画を匿名で、広告なし・追跡なしで視聴');

  return htmlOutput;
}

// 2. プロキシ中継処理 (UrlFetchApp によるフィルタリング・CORS回避)
function handleProxy(e) {
  var targetUrl = e.parameter.url;
  var callback = e.parameter.callback; // JSONP用コールバック

  if (!targetUrl) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing url parameter" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var response = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    var responseText = response.getContentText();
    var responseCode = response.getResponseCode();

    // JSONP対応
    if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      var jsonpData = {
        ok: responseCode >= 200 && responseCode < 300,
        status: responseCode,
        data: null
      };
      try {
        jsonpData.data = JSON.parse(responseText);
      } catch (parseErr) {
        jsonpData.data = responseText;
      }
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(jsonpData) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // 通常のJSONレスポンス
    return ContentService.createTextOutput(responseText)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var errObj = {
      error: err.toString(),
      code: 'GAS_FETCH_FAILED',
      ok: false,
      status: 502
    };

    if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(errObj) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService.createTextOutput(JSON.stringify(errObj))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 3. 最新HTMLビルドとの同期関数
function refreshHtmlToDocs() {
  try {
    var sourceUrl = 'https://raw.githubusercontent.com/ajgpw/siatube/refs/heads/main/siatube-full.html.txt';
    var res = UrlFetchApp.fetch(sourceUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var content = res.getContentText();
      return {
        success: true,
        bytes: content.length,
        syncedAt: new Date().toISOString()
      };
    }
    return { success: false, code: res.getResponseCode() };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
`;
}

/**
 * Generate index.html snippet for Google Apps Script HTML Service
 */
export function generateGasIndexHtml(appOrigin: string): string {
  const safeOrigin = appOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
  <title>しあTube (GAS同期版)</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #0f0f0f;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
  <iframe
    id="siatube-app"
    src="${safeOrigin}/"
    allow="accelerometer *; autoplay *; clipboard-read *; clipboard-write *; encrypted-media *; fullscreen *; gyroscope *; picture-in-picture *; web-share *"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
  <script>
    // GASサンドボックスとのメッセージ通信同期
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'REFRESH_GAS') {
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          google.script.run
            .withSuccessHandler(function(res) {
              var frame = document.getElementById('siatube-app');
              if (frame && frame.contentWindow) {
                frame.contentWindow.postMessage({ type: 'GAS_SYNC_SUCCESS', data: res }, '*');
              }
            })
            .refreshHtmlToDocs();
        }
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Test connectivity with a GAS Web App URL
 */
export async function testGasProxyConnection(gasUrl: string): Promise<{
  success: boolean;
  latency: number;
  message: string;
}> {
  const cleanUrl = String(gasUrl || '').trim();
  if (!cleanUrl) {
    return { success: false, latency: 0, message: 'GAS URLが入力されていません' };
  }

  const startTime = performance.now();
  const testTarget = 'https://siatube.com/api/stream/status';

  // Test standard GET with ?url=
  try {
    const separator = cleanUrl.includes('?') ? '&' : '?';
    const pingUrl = `${cleanUrl}${separator}url=${encodeURIComponent(testTarget)}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(pingUrl, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(tid);

    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      return {
        success: true,
        latency,
        message: `GASプロキシ接続に成功しました (${latency}ms)`
      };
    } else {
      return {
        success: false,
        latency,
        message: `HTTPステータス ${res.status}: GASの権限設定が「全員(Anyone)」になっているか確認してください`
      };
    }
  } catch (err: any) {
    const latency = Math.round(performance.now() - startTime);
    if (err?.name === 'AbortError') {
      return { success: false, latency, message: '接続がタイムアウトしました (12秒)' };
    }
    return {
      success: false,
      latency,
      message: `接続エラー: ${err?.message || 'アクセスが拒否されました'}`
    };
  }
}
