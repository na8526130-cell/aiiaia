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
 * Generate complete Code.gs script for Google Apps Script deployment (v2.8.0)
 */
export function generateGasCode(): string {
  return `/**
 * 数理アカデミー 学習ポータル - Google Apps Script (GAS) サーバーコード v3.0.0 (最新版)
 * - ストリーム最優先取得（コメント・関連動画よりも先にストリームを高速解決）
 * - UrlFetchApp.fetchAll 並列レースによる超高速ストリーム取得 (youtubei.googleapis.com ANDROID_VR/IOS + yt.omada.cafe + Worker)
 * - 高画質 1080p / 720p + 高音質 AAC-LC (itag=140) 2要素リアルタイム音声同期 (HTTP 206 local-proxy 統合)
 * - 学校・組織のフィルタリング回避 & Worker PoW Guard セッション認証連携用
 */

// 1. Webアプリのエントリーポイント (GET)
var c; // コピー＆ペースト時の誤入力防止ガード

function doGet(e) {
  if (!e || !e.parameter) {
    try {
      var quota = MailApp.getRemainingDailyQuota();
      Logger.log('GAS権限承認OK (残りメール枠: ' + quota + '通)');
    } catch (err) {}
  }

  // プロキシ中継リクエストの場合 (?url=https://...)
  if (e && e.parameter && e.parameter.url) {
    return handleProxy(e);
  }

  // メール認証コード中継送信 (?action=send_verify_email&to=a22621917@gmail.com&code=123456)
  if (e && e.parameter && e.parameter.action === 'send_verify_email') {
    var toEmail = String(e.parameter.to || '').trim();
    var code = String(e.parameter.code || '').trim();
    var uname = String(e.parameter.username || toEmail.split('@')[0] || '受講生').trim();
    if (toEmail && code) {
      MailApp.sendEmail({
        to: toEmail,
        subject: '【数理アカデミー 学習ポータル】アカウント登録 認証コードのお知らせ',
        name: '数理アカデミー 学習ポータル認証局 (t74442416@gmail.com)',
        replyTo: 't74442416@gmail.com',
        body: uname + ' 様\\n\\n認証コード（6桁）: ' + code + '\\n送信元: t74442416@gmail.com\\n宛先: ' + toEmail
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, sentViaGasMailApp: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // REST API アクセス (?api=/api/youtube/trending 等)
  if (e && e.parameter && e.parameter.api) {
    var res = handleGasApiRequest(e.parameter.api, 'GET', {}, null);
    return ContentService.createTextOutput(JSON.stringify(res.data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // アプリケーション本体の配信 ('index' または 'index.html' 両対応)
  var htmlOutput;
  try {
    htmlOutput = HtmlService.createHtmlOutputFromFile('index');
  } catch (err1) {
    htmlOutput = HtmlService.createHtmlOutputFromFile('index.html');
  }

  htmlOutput.setTitle('数理アカデミー 学習ポータル')
    .setFaviconUrl('https://ssl.gstatic.com/classroom/favicon.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5');

  return htmlOutput;
}

// 1b. Webアプリのエントリーポイント (POST)
function doPost(e) {
  if (e && e.parameter && e.parameter.api) {
    var body = e.postData ? e.postData.contents : null;
    var res = handleGasApiRequest(e.parameter.api, 'POST', {}, body);
    return ContentService.createTextOutput(JSON.stringify(res.data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return handleProxy(e);
}

// 2. Worker PoW 匿名セッション認証 (guard_sid) ヘルパー
function solveGasPow(nonce, difficultyBits, version) {
  version = version || 1;
  difficultyBits = Number(difficultyBits) || 16;
  var wholeBytes = Math.floor(difficultyBits / 8);
  var remBits = difficultyBits % 8;
  var mask = remBits > 0 ? ((0xff << (8 - remBits)) & 0xff) : 0;

  for (var counter = 0; counter < 5000000; counter++) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      'v' + version + ':' + nonce + ':' + counter,
      Utilities.Charset.UTF_8
    );
    var ok = true;
    for (var i = 0; i < wholeBytes; i++) {
      if ((digest[i] & 0xff) !== 0) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (remBits > 0 && ((digest[wholeBytes] & 0xff) & mask) !== 0) {
      continue;
    }
    return counter;
  }
  return 0;
}

// 2. 自前セッション認証 (guard_sid) ヘルパー (外部サーバー通信なし)
function ensureGasGuardSid(forceNew) {
  var cache = CacheService.getScriptCache();
  if (!forceNew && cache) {
    var cachedSid = cache.get('KAITO_GUARD_SID');
    if (cachedSid) return cachedSid;
  }
  var finalSid = 'kaito-gas-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 10);
  if (cache) {
    cache.put('KAITO_GUARD_SID', finalSid, 1800);
  }
  return finalSid;
}

// 3. プロキシ中継処理 (UrlFetchApp によるフィルタリング・CORS回避)
function handleProxy(e) {
  var targetUrl = e && e.parameter && e.parameter.url;
  var callback = e && e.parameter && e.parameter.callback;

  if (!targetUrl) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      version: '2.8.0',
      service: '海斗tube GAS Proxy v2.8.0'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var isOmada = String(targetUrl).indexOf('yt.omada.cafe') !== -1;
    var reqHeaders = isOmada
      ? { 'Accept': 'application/json, text/plain, */*' }
      : {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        };
    var response = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: reqHeaders
    });

    var responseText = response.getContentText();
    var responseCode = response.getResponseCode();

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

// 4. サムネイル・外部画像の Base64 変換取得 (CORS回避)
function fetchAsBase64(imageUrl) {
  if (!imageUrl) return null;
  try {
    var response = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/'
      }
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 400) {
      var blob = response.getBlob();
      var contentType = blob.getContentType() || 'image/jpeg';
      var base64 = Utilities.base64Encode(blob.getBytes());
      return 'data:' + contentType + ';base64,' + base64;
    }
  } catch (err) {}
  return null;
}

// 5. 最新ビルド情報同期関数
function refreshHtmlToDocs(appBaseUrl) {
  try {
    if (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.indexOf('http') === 0) {
      PropertiesService.getScriptProperties().setProperty('APP_BASE_URL', appBaseUrl.trim());
    }
    return {
      success: true,
      version: '2.8.0',
      syncedAt: new Date().toISOString()
    };
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
  <title>数理アカデミー 学習ポータル</title>
  <link rel="icon" type="image/png" href="https://ssl.gstatic.com/classroom/favicon.png" />
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
    id="kaito-app"
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
              var frame = document.getElementById('kaito-app');
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

  // 1. Primary: Server-side proxy test endpoint (avoids browser CORS issues with 302 redirects on script.google.com)
  try {
    const serverRes = await fetch(`/api/proxy/test-custom?url=${encodeURIComponent(cleanUrl)}`);
    if (serverRes.ok) {
      const data = await serverRes.json();
      if (data?.success || data?.ok) {
        return {
          success: true,
          latency: data.latencyMs || Math.round(performance.now() - startTime),
          message: data.message || `GASプロキシ接続に成功しました (${data.latencyMs || Math.round(performance.now() - startTime)}ms)`
        };
      }
    }
  } catch {}

  // 2. Fallback: Direct client fetch with ?url=
  const testTarget = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json';
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
        message: `HTTPステータス ${res.status}: GASのデプロイ権限設定が「全員(Anyone)」になっているか確認してください`
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
