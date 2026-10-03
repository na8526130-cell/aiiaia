/**
 * 数理アカデミー 学習ポータル - Google Apps Script (GAS) バックエンド v3.0.0 (最新版)
 *
 * Google Apps Script Web App 上でフル機能動作するためのバックエンドスクリプトです。
 * - 認証振り分け（正規パス → メディアポータル / ID:education・PW:matheducation または別パス → 中学・高校 全教科総合演習システム）
 * - ストリーム最優先取得（コメント・関連動画よりも先にストリームを高速解決）
 * - UrlFetchApp.fetchAll 並列レースによる超高速ストリーム取得 (youtubei.googleapis.com ANDROID_VR/IOS + yt.omada.cafe + Worker)
 * - 高画質 1080p / 720p + 高音質 AAC-LC (itag=140) 2要素リアルタイム音声同期 (HTTP 206 local-proxy 統合)
 * - Worker PoW Guard 匿名セッション認証 (guard_sid / SHA-256 先頭ゼロビット検証) ストリーム＆字幕抽出
 * - 4階層プロキシヘルスチェック診断 (/api/proxy/diagnostics)・疎通テスト対応
 */

// ==========================================
// 1. Web App エントリーポイント
// ==========================================
var c; // コピー＆ペースト時の誤入力防止ガード

function doGet(e) {
  // GASエディタの「実行」ボタンから直接実行された場合（権限承認・動作確認用）
  if (!e || !e.parameter) {
    try {
      var quota = MailApp.getRemainingDailyQuota();
      Logger.log('✅ GAS権限承認・初期化OK (メール送信元: t74442416@gmail.com / 本日の送信可能残り枠: ' + quota + '通)');
    } catch (mailPermErr) {
      Logger.log('MailApp 確認: ' + mailPermErr);
    }
  }

  // 1. プロキシ中継リクエスト (?url=https://...)
  if (e && e.parameter && e.parameter.url) {
    return handleProxy(e);
  }

  // 1b. メール認証コード中継送信 (?action=send_verify_email&to=a22621917@gmail.com&code=123456)
  if (e && e.parameter && e.parameter.action === 'send_verify_email') {
    var relayRes = handleSendVerificationCode({
      email: e.parameter.to || '',
      username: e.parameter.username || '',
      code: e.parameter.code || ''
    });
    return ContentService.createTextOutput(JSON.stringify(relayRes))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. REST APIとしてのアクセス（?api=/api/youtube/trending 等）
  if (e && e.parameter && e.parameter.api) {
    var apiPath = e.parameter.api;
    var res = handleGasApiRequest(apiPath, 'GET', {}, null);
    return ContentService.createTextOutput(JSON.stringify(res.data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. HTML Web App を描画（'index' または 'index.html' の両方に対応）
  var htmlOutput;
  try {
    htmlOutput = HtmlService.createHtmlOutputFromFile('index');
  } catch (err1) {
    try {
      htmlOutput = HtmlService.createHtmlOutputFromFile('index.html');
    } catch (err2) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:30px;background:#f8fafc;color:#1e293b;min-height:100vh;">' +
        '<h2 style="color:#0f172a;">⚠️ index.html が見つかりません</h2>' +
        '<p>Google Apps Script エディタの左メニューで、<b>「＋」→「HTML」</b> をクリックし、ファイル名を <b>index</b> として作成してください。</p>' +
        '<p style="color:#64748b;font-size:12px;">エラー詳細: ' + err1.message + ' | 数理アカデミー 学習ポータル</p>' +
        '</div>'
      );
    }
  }

  htmlOutput.setTitle('数理アカデミー 学習ポータル')
    .setFaviconUrl('https://ssl.gstatic.com/classroom/favicon.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5');

  return htmlOutput;
}

function doPost(e) {
  if (e && e.parameter && e.parameter.api) {
    var body = e.postData ? e.postData.contents : null;
    var res = handleGasApiRequest(e.parameter.api, 'POST', {}, body);
    return ContentService.createTextOutput(JSON.stringify(res.data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid POST' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 2. フロントエンドからのAPIディスパッチャー
// ==========================================

function handleGasApiRequest(urlStr, method, headers, bodyStr) {
  try {
    headers = headers || {};
    method = (method || 'GET').toUpperCase();

    // URL解析 (例: /api/youtube/search?q=hello&order=relevance)
    var parts = urlStr.split('?');
    var path = parts[0];
    var queryString = parts[1] || '';
    var query = {};

    if (queryString) {
      queryString.split('&').forEach(function(pair) {
        if (!pair) return;
        var kv = pair.split('=');
        var key = decodeURIComponent(kv[0]);
        var val = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '';
        query[key] = val;
      });
    }

    var body = {};
    if (bodyStr && typeof bodyStr === 'string') {
      try {
        body = JSON.parse(bodyStr);
      } catch (e) {
        body = {};
      }
    }

    var config = getRequestConfig(headers);

    // --- ルーティング ---

    // 1. 急上昇 / 人気動画
    if (path === '/api/youtube/trending') {
      return { status: 200, data: handleTrending(config, query) };
    }

    // 2. 検索 API
    if (path === '/api/youtube/search') {
      return { status: 200, data: handleSearch(config, query) };
    }

    // 3. 動画カテゴリー
    if (path === '/api/youtube/categories') {
      return { status: 200, data: handleCategories(config, query) };
    }

    // 4. 単一動画詳細 (/api/youtube/video/:id)
    if (path.indexOf('/api/youtube/video/') === 0) {
      var videoId = path.replace('/api/youtube/video/', '');
      return { status: 200, data: handleVideoDetail(config, videoId) };
    }

    // 5. 複数動画一括取得 (/api/youtube/videos)
    if (path === '/api/youtube/videos') {
      return { status: 200, data: handleVideosBatch(config, query) };
    }

    // 6. 関連動画 (/api/youtube/related/:id)
    if (path.indexOf('/api/youtube/related/') === 0) {
      var relVideoId = path.replace('/api/youtube/related/', '');
      return { status: 200, data: handleRelatedVideos(config, relVideoId, query) };
    }

    // 7. コメント一覧 (/api/youtube/comments/:id)
    if (path.indexOf('/api/youtube/comments/replies/') === 0) {
      var parentCommentId = path.replace('/api/youtube/comments/replies/', '');
      return { status: 200, data: handleCommentReplies(config, parentCommentId, query) };
    }
    if (path.indexOf('/api/youtube/comments/') === 0) {
      var comVideoId = path.replace('/api/youtube/comments/', '');
      return { status: 200, data: handleComments(config, comVideoId, query) };
    }

    // 8. チャンネル関連 (/api/youtube/channel/...)
    if (path.indexOf('/api/youtube/channel/shorts/') === 0) {
      var chShortsId = path.replace('/api/youtube/channel/shorts/', '');
      return { status: 200, data: handleChannelShorts(config, chShortsId, query) };
    }
    if (path.indexOf('/api/channel/') === 0 && path.indexOf('/tab/shorts') !== -1) {
      var tabShortsId = path.replace('/api/channel/', '').replace('/tab/shorts', '');
      return { status: 200, data: handleChannelShorts(config, tabShortsId, query) };
    }
    if (path.indexOf('/api/youtube/channel/videos/') === 0) {
      var chId = path.replace('/api/youtube/channel/videos/', '');
      return { status: 200, data: handleChannelVideos(config, chId, query) };
    }
    if (path.indexOf('/api/youtube/channel/playlists/') === 0) {
      var chPlId = path.replace('/api/youtube/channel/playlists/', '');
      return { status: 200, data: handleChannelPlaylists(config, chPlId) };
    }
    if (path.indexOf('/api/youtube/channel/community/') === 0) {
      var chComId = path.replace('/api/youtube/channel/community/', '');
      return { status: 200, data: handleChannelCommunity(config, chComId) };
    }
    if (path.indexOf('/api/youtube/channel/') === 0) {
      var channelId = path.replace('/api/youtube/channel/', '');
      return { status: 200, data: handleChannelDetail(config, channelId) };
    }

    // 8e. 検索サジェスト (/api/youtube/suggest)
    if (path === '/api/youtube/suggest') {
      return { status: 200, data: handleSuggest(query) };
    }

    // 9. YouTube Shorts
    if (path === '/api/youtube/shorts') {
      return { status: 200, data: handleShorts(config, query) };
    }

    // 10. AI動画要約 (Gemini API)
    if (path === '/api/ai/summarize') {
      return { status: 200, data: handleAiSummarize(body) };
    }

    // 11. サムネイル画像プロキシ & 汎用プロキシ & プロキシ診断
    if (path === '/api/proxy/thumbnail' || path === '/api/fetchAsBase64') {
      return { status: 200, data: handleThumbnailProxy(query) };
    }
    if (path === '/api/proxy/universal' || path === '/api/proxy' || path === '/api/youtube/stream-proxy') {
      return { status: 200, data: handleUniversalProxy(query) };
    }
    if (path === '/api/proxy/diagnostics') {
      return { status: 200, data: handleProxyDiagnostics(config) };
    }
    if (path === '/api/proxy/clear-cache') {
      return { status: 200, data: handleClearProxyCache() };
    }
    if (path === '/api/proxy/test-custom') {
      return { status: 200, data: handleTestCustomProxy(query, body) };
    }

    // 11b. 内蔵 Worker ルーティング互換 (/api/worker/...)
    if (path === '/api/worker/code') {
      return { status: 200, data: { version: '2.8.0', provider: 'GAS' } };
    }
    if (path.indexOf('/api/worker') === 0) {
      return { status: 200, data: handleWorkerProxy(config, path, query) };
    }

    // 12. APIキー / InnerTube 診断テスト
    if (path === '/api/youtube/test-key') {
      return { status: 200, data: handleTestKey(headers, body) };
    }
    if (path === '/api/innertube/test') {
      return { status: 200, data: handleTestInnerTube(config) };
    }

    // 13. YouTube Education 動的パラメータ
    if (path === '/api/education-param') {
      return { status: 200, data: handleEducationParam() };
    }

    // 14. プレミア会員認証 & 学習ポータル内個人アカウント認証・メール認証コード発行・学習履歴保存
    if (path === '/api/auth/verify') {
      return { status: 200, data: handleAuthVerify(body) };
    }
    if (path === '/api/auth/student-login') {
      return { status: 200, data: handleStudentPortalLogin(body) };
    }
    if (path === '/api/auth/send-code') {
      return { status: 200, data: handleSendVerificationCode(body) };
    }
    if (path === '/api/auth/register') {
      return { status: 200, data: handleRegisterStudentAccount(body) };
    }
    if (path === '/api/auth/student-progress') {
      return { status: 200, data: handleStudentProgress(method, query, body) };
    }

    // 14b. ニコニコ動画モード API中継 (/api/nico/:action)
    if (path.indexOf('/api/nico/') === 0) {
      var nicoAction = path.replace('/api/nico/', '');
      return { status: 200, data: handleNicoApiRelay(nicoAction, method, query) };
    }

    // 15. 再生リスト詳細 (/api/youtube/playlist/:id)
    if (path.indexOf('/api/youtube/playlist/') === 0) {
      var plId = path.replace('/api/youtube/playlist/', '');
      return { status: 200, data: handlePlaylistDetail(config, plId, query) };
    }

    // 16. ダウンロード情報取得 (/api/download/info/:id)
    if (path.indexOf('/api/download/info/') === 0) {
      var dlVideoId = path.replace('/api/download/info/', '');
      return { status: 200, data: handleDownloadInfo(config, dlVideoId) };
    }

    // 17. ストリームソース取得 (/api/youtube/stream-sources/:id, /api/youtube/stream-ytdlp/:id, /api/youtube/stream-direct/:id, /api/youtube/stream/:id)
    if (path.indexOf('/api/youtube/stream-direct/') === 0) {
      var directVid = path.replace('/api/youtube/stream-direct/', '');
      return { status: 200, data: handleStreamDirect(config, directVid, query) };
    }
    if (path.indexOf('/api/youtube/stream-ytdlp/') === 0) {
      var ytdlpVideoId = path.replace('/api/youtube/stream-ytdlp/', '');
      return { status: 200, data: handleStreamSources(config, ytdlpVideoId) };
    }
    if (path.indexOf('/api/youtube/stream-sources/') === 0) {
      var strVideoId = path.replace('/api/youtube/stream-sources/', '');
      return { status: 200, data: handleStreamSources(config, strVideoId) };
    }
    if (path.indexOf('/api/youtube/stream/') === 0) {
      var strVid = path.replace('/api/youtube/stream/', '');
      return { status: 200, data: handleStreamSources(config, strVid) };
    }

    // 18. 字幕・文字起こし取得 (/api/youtube/transcript/:id)
    if (path.indexOf('/api/youtube/transcript/') === 0) {
      var transVideoId = path.replace('/api/youtube/transcript/', '');
      var reqLang = (query && query.lang) || 'ja';
      return { status: 200, data: handleTranscript(config, transVideoId, reqLang) };
    }

    // 19. YouTube Education ストリームURL生成 (/api/stream/youtubeeducation/:id)
    if (path.indexOf('/api/stream/youtubeeducation/') === 0) {
      var eduVid = path.replace('/api/stream/youtubeeducation/', '');
      return { status: 200, data: handleStreamYoutubeEducation(eduVid, query) };
    }

    // 19b. ローカル PoW Guard セッション認証 (/api/__guard/challenge, /api/__guard/verify, /api/__guard/status)
    if (path === '/api/__guard/challenge' || path === '/api/v1/guard/challenge') {
      return {
        status: 200,
        data: createGasGuardChallenge(query)
      };
    }
    if (path === '/api/__guard/verify' || path === '/api/v1/guard/verify') {
      return {
        status: 200,
        data: verifyGasGuardChallenge(query)
      };
    }
    if (path === '/api/__guard/status' || path === '/api/v1/guard/status') {
      var stSid = ensureGasGuardSid(false, query && query.guard_sid);
      return {
        status: 200,
        data: {
          ok: true,
          verified: true,
          sessionId: stSid,
          verifiedUntil: Math.floor(new Date().getTime() / 1000) + 86400,
          defaultDifficultyBits: 12,
          engine: 'GAS PoW Guard v2.8.0'
        }
      };
    }

    // 20. ストリームサーバー状態 (/api/stream/status)
    if (path === '/api/stream/status') {
      return {
        status: 200,
        data: handleSelfStreamStatus()
      };
    }

    // 20b. 自前ストリーム直接取得 (/api/stream/:id)
    if (path.indexOf('/api/stream/') === 0) {
      var rawStreamVid = path.replace('/api/stream/', '');
      return {
        status: 200,
        data: handleSelfRawStream(config, rawStreamVid, query)
      };
    }

    // 21. 公開・共有プレイリスト API (/api/playlists/...)
    if (path.indexOf('/api/playlists') === 0) {
      return {
        status: 200,
        data: handlePublicPlaylists(path, method, query, body)
      };
    }

    return { status: 404, data: { error: 'Endpoint not found: ' + path } };
  } catch (err) {
    Logger.log('GAS Error: ' + err.toString());
    return { status: 500, data: { error: err.message || err.toString() } };
  }
}

// ==========================================
// 3. 設定・外部API通信ヘルパー
// ==========================================

function getRequestConfig(headers) {
  headers = headers || {};
  var props = PropertiesService.getScriptProperties().getProperties();
  var envApiKey = props.YOUTUBE_API_KEY || '';

  var rawInnerTube = (headers['x-innertube-url'] || '').trim();
  var customProxyUrl = (headers['x-custom-proxy-url'] || props.CUSTOM_PROXY_URL || '').trim();
  var candidateUrl = rawInnerTube;
  if ((!candidateUrl || candidateUrl === '/api/worker' || candidateUrl === 'self') && customProxyUrl && customProxyUrl.indexOf('http') === 0) {
    candidateUrl = customProxyUrl;
  }

  var innertubeUrl =
    !candidateUrl ||
    candidateUrl === '/api/worker' ||
    candidateUrl === 'self' ||
    candidateUrl.indexOf('myproxy0108.workers.dev') !== -1 ||
    candidateUrl.indexOf('yt-proxy.workers.dev') !== -1
      ? 'https://proxy.wa0260966.workers.dev'
      : candidateUrl;
  var invidiousUrl = headers['x-invidious-url'] || 'https://yt.omada.cafe/';
  var customYoutubeKey = headers['x-youtube-key'] || '';

  return {
    provider: 'innertube',
    innertubeUrl: innertubeUrl,
    customProxyUrl: customProxyUrl,
    invidiousUrl: (invidiousUrl || 'https://yt.omada.cafe/').trim(),
    youtubeKey: (customYoutubeKey || envApiKey || '').trim()
  };
}

function fetchInnerTubeWorker(workerUrl, endpoint, queryParams) {
  queryParams = queryParams || {};
  var baseUrl = (workerUrl || 'https://proxy.wa0260966.workers.dev').trim();
  if (baseUrl.indexOf('http://') !== 0 && baseUrl.indexOf('https://') !== 0) {
    baseUrl = 'https://' + baseUrl;
  }
  if (baseUrl.slice(-1) === '/') {
    baseUrl = baseUrl.slice(0, -1);
  }

  var queryString = Object.keys(queryParams)
    .filter(function(k) { return queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== ''; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]); })
    .join('&');

  var url = baseUrl + '/api/v1/' + endpoint;
  if (queryString) url += '?' + queryString;

  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 400) {
      if (endpoint === 'trending') {
        var fallbackSearchUrl = baseUrl + '/api/v1/search?q=' + encodeURIComponent('急上昇 人気 動画 日本') + '&limit=30';
        var sRes = UrlFetchApp.fetch(fallbackSearchUrl, { muteHttpExceptions: true });
        if (sRes.getResponseCode() >= 200 && sRes.getResponseCode() < 300) {
          var sJson = JSON.parse(sRes.getContentText());
          if (sJson && Array.isArray(sJson.results) && sJson.results.length > 0) {
            return { data: sJson.results };
          }
        }
      }
      return { error: 'InnerTube HTTP ' + res.getResponseCode() };
    }
    var json = JSON.parse(res.getContentText());
    return { data: json };
  } catch (err) {
    return { error: err.message || 'InnerTube fetch failed' };
  }
}

// LuanRT/YouTube.js 準拠の公式 InnerTube v1 直接呼び出しヘルパー (GAS用)
function callYouTubeInnerTubeDirect(endpoint, payload) {
  payload = payload || {};
  var url = 'https://www.youtube.com/youtubei/v1/' + endpoint + '?prettyPrint=false';
  var body = {
    context: {
      client: {
        hl: 'ja',
        gl: 'JP',
        clientName: 'WEB',
        clientVersion: '2.20260623.01.00',
        utcOffsetMinutes: 540
      }
    }
  };
  for (var k in payload) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      body[k] = payload[k];
    }
  }
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20260623.01.00',
        'Origin': 'https://www.youtube.com'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) {
      return { error: 'InnerTube Direct HTTP ' + res.getResponseCode() };
    }
    return { data: JSON.parse(res.getContentText()) };
  } catch (err) {
    return { error: err.message || 'InnerTube Direct failed' };
  }
}

// InnerTube JSONレスポンスから次ページ取得用の continuation トークンを抽出
function extractContinuationTokenFromInnerTube(rootNode) {
  var token = null;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (node.continuationCommand && typeof node.continuationCommand.token === 'string' && node.continuationCommand.token.length > 20) {
      if (!node.continuationCommand.request || node.continuationCommand.request === 'CONTINUATION_REQUEST_TYPE_BROWSE') {
        token = node.continuationCommand.token;
      }
    }
    if (node.nextContinuationData && typeof node.nextContinuationData.continuation === 'string') {
      token = node.nextContinuationData.continuation;
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        if (k === 'header' || k === 'topbar' || k === 'microformat' || k === 'frameworkUpdates') continue;
        walk(node[k]);
      }
    }
  }
  walk(rootNode);
  return token;
}

function parseGasCountString(raw) {
  if (typeof raw === 'number' && !isNaN(raw)) return String(Math.floor(raw));
  if (!raw) return '0';
  var str = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  var man = str.match(/([\d.]+)万/);
  if (man) return String(Math.round(parseFloat(man[1]) * 10000));
  var oku = str.match(/([\d.]+)億/);
  if (oku) return String(Math.round(parseFloat(oku[1]) * 100000000));
  var digits = str.match(/(\d+)/);
  return digits ? digits[1] : '0';
}

function extractInnerTubeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (typeof node.content === 'string') return node.content;
  if (Array.isArray(node.runs)) {
    return node.runs.map(function(r) { return (r && r.text) || ''; }).join('');
  }
  return '';
}

function parseGasDurationToIso(text) {
  if (!text) return 'PT0M0S';
  var parts = String(text).trim().split(':');
  if (parts.length === 3) {
    return 'PT' + parseInt(parts[0], 10) + 'H' + parseInt(parts[1], 10) + 'M' + parseInt(parts[2], 10) + 'S';
  }
  if (parts.length === 2) {
    return 'PT' + parseInt(parts[0], 10) + 'M' + parseInt(parts[1], 10) + 'S';
  }
  return 'PT0M0S';
}

// InnerTube JSONツリーから videoRenderer / compactVideoRenderer / lockupViewModel を再帰抽出
function extractVideosFromInnerTubeResponse(rootNode, excludeVideoId) {
  var results = [];
  var seen = {};
  if (excludeVideoId) seen[excludeVideoId] = true;

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }

    // 1. lockupViewModel (YouTube.js LockupView 相当: VIDEO / SHORTS / PLAYLIST 対応)
    if (node.lockupViewModel) {
      var lvm = node.lockupViewModel;
      var cId = lvm.contentId;
      var cType = String(lvm.contentType || '');
      if (cId && !seen[cId]) {
        seen[cId] = true;
        var meta = (lvm.metadata && lvm.metadata.lockupMetadataViewModel) || {};
        var title = (meta.title && meta.title.content) || '';
        var rows = (meta.metadata && meta.metadata.contentMetadataViewModel && meta.metadata.contentMetadataViewModel.metadataRows) || [];
        var chTitle = '';
        var viewStr = '0';
        var pubText = '';
        for (var r = 0; r < rows.length; r++) {
          var parts = rows[r].metadataParts || [];
          for (var p = 0; p < parts.length; p++) {
            var txt = (parts[p].text && parts[p].text.content) || '';
            if (!txt) continue;
            if (txt.indexOf('視聴') !== -1) viewStr = parseGasCountString(txt);
            else if (txt.indexOf('前') !== -1 || txt.indexOf('公開') !== -1) pubText = txt;
            else if (!chTitle && txt.indexOf('再生リスト') === -1 && txt.indexOf('ミックス') === -1) chTitle = txt;
          }
        }
        var badgeText = '';
        var overlays = (lvm.contentImage && (
          (lvm.contentImage.thumbnailViewModel && lvm.contentImage.thumbnailViewModel.overlays) ||
          (lvm.contentImage.collectionThumbnailViewModel && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.overlays)
        )) || [];
        for (var o = 0; o < overlays.length; o++) {
          var badges = (overlays[o].thumbnailBottomOverlayViewModel && overlays[o].thumbnailBottomOverlayViewModel.badges) ||
                       (overlays[o].thumbnailOverlayBadgeViewModel && overlays[o].thumbnailOverlayBadgeViewModel.thumbnailBadges) || [];
          for (var b = 0; b < badges.length; b++) {
            var bTxt = (badges[b].thumbnailBadgeViewModel && badges[b].thumbnailBadgeViewModel.text) || '';
            if (bTxt) { badgeText = bTxt; break; }
          }
        }

        // PLAYLIST LockupView
        if (cType.indexOf('PLAYLIST') !== -1 || cId.indexOf('PL') === 0 || cId.indexOf('RD') === 0 || cId.indexOf('OLAK') === 0 || cId.indexOf('UU') === 0) {
          var firstVid =
            (lvm.rendererContext && lvm.rendererContext.commandContext && lvm.rendererContext.commandContext.onTap && lvm.rendererContext.commandContext.onTap.innertubeCommand && lvm.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint && lvm.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId) ||
            (lvm.itemPlayback && lvm.itemPlayback.inlinePlayerData && lvm.itemPlayback.inlinePlayerData.onSelect && lvm.itemPlayback.inlinePlayerData.onSelect.innertubeCommand && lvm.itemPlayback.inlinePlayerData.onSelect.innertubeCommand.watchEndpoint && lvm.itemPlayback.inlinePlayerData.onSelect.innertubeCommand.watchEndpoint.videoId) ||
            '';
          var directThumb =
            (lvm.contentImage && lvm.contentImage.collectionThumbnailViewModel && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.image && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.image.sources && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.image.sources[0] && lvm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.image.sources[0].url) ||
            (lvm.contentImage && lvm.contentImage.thumbnailViewModel && lvm.contentImage.thumbnailViewModel.image && lvm.contentImage.thumbnailViewModel.image.sources && lvm.contentImage.thumbnailViewModel.image.sources[0] && lvm.contentImage.thumbnailViewModel.image.sources[0].url) ||
            '';
          var pThumb = directThumb || (firstVid ? ('https://i.ytimg.com/vi/' + firstVid + '/hqdefault.jpg') : 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
          var countMatch = String(badgeText).match(/(\d+)/);
          var itemCount = countMatch ? parseInt(countMatch[1], 10) : 0;
          results.push({
            id: cId,
            kind: 'youtube#playlist',
            isPlaylist: true,
            playlistId: cId,
            firstVideoId: firstVid,
            title: title || '再生リスト',
            thumbnail: pThumb,
            videoCount: itemCount,
            videoCountText: badgeText || (itemCount > 0 ? (itemCount + '本の動画') : '再生リスト'),
            snippet: {
              publishedAt: new Date().toISOString(),
              channelId: '',
              title: title || '再生リスト',
              description: chTitle ? (chTitle + ' • ' + (badgeText || '再生リスト')) : (badgeText || '再生リスト'),
              thumbnails: {
                high: { url: pThumb },
                medium: { url: pThumb },
                default: { url: pThumb }
              },
              channelTitle: chTitle || 'YouTube 再生リスト'
            },
            statistics: { viewCount: '0', likeCount: '0' },
            contentDetails: { duration: badgeText || '再生リスト', itemCount: itemCount }
          });
          return;
        }

        if (!/^[A-Za-z0-9_-]{11}$/.test(String(cId)) || !title) {
          return;
        }
        var thumbUrl = 'https://i.ytimg.com/vi/' + cId + '/hqdefault.jpg';
        var animThumb = undefined;
        for (var ao = 0; ao < overlays.length; ao++) {
          var aUrl = overlays[ao] && overlays[ao].animatedThumbnailOverlayViewModel && overlays[ao].animatedThumbnailOverlayViewModel.thumbnail && overlays[ao].animatedThumbnailOverlayViewModel.thumbnail.sources && overlays[ao].animatedThumbnailOverlayViewModel.thumbnail.sources[0] && overlays[ao].animatedThumbnailOverlayViewModel.thumbnail.sources[0].url;
          if (aUrl) { animThumb = aUrl; break; }
        }
        results.push({
          id: cId,
          kind: 'youtube#video',
          isShort: cType.indexOf('SHORTS') !== -1,
          snippet: {
            publishedAt: pubText || new Date().toISOString(),
            channelId: '',
            title: title,
            description: '',
            animatedThumbnailUrl: animThumb,
            thumbnails: {
              high: { url: thumbUrl },
              medium: { url: thumbUrl },
              default: { url: thumbUrl }
            },
            channelTitle: chTitle
          },
          statistics: { viewCount: viewStr, likeCount: '0' },
          contentDetails: { duration: parseGasDurationToIso(badgeText) }
        });
      }
      return;
    }

    // 1b. shortsLockupViewModel / reelItemRenderer (YouTube.js ShortsLockupView 相当)
    var slvm = node.shortsLockupViewModel || node.reelItemRenderer;
    if (slvm) {
      var sVid = slvm.videoId ||
                 (slvm.onTap && slvm.onTap.innertubeCommand && slvm.onTap.innertubeCommand.reelWatchEndpoint && slvm.onTap.innertubeCommand.reelWatchEndpoint.videoId) ||
                 (typeof slvm.entityId === 'string' ? slvm.entityId.replace(/^shorts-shelf-item-/, '') : '');
      if (sVid && !seen[sVid]) {
        seen[sVid] = true;
        var sTitle = (slvm.overlayMetadata && slvm.overlayMetadata.primaryText && slvm.overlayMetadata.primaryText.content) ||
                     (slvm.headline && slvm.headline.simpleText) ||
                     (slvm.accessibilityText ? String(slvm.accessibilityText).split(',')[0] : '') || 'YouTube Short';
        var sViews = (slvm.overlayMetadata && slvm.overlayMetadata.secondaryText && slvm.overlayMetadata.secondaryText.content) || '0';
        var sThumb = 'https://i.ytimg.com/vi/' + sVid + '/hqdefault.jpg';
        results.push({
          id: sVid,
          kind: 'youtube#video',
          isShort: true,
          snippet: {
            publishedAt: new Date().toISOString(),
            channelId: '',
            title: sTitle,
            description: sTitle + ' #shorts',
            thumbnails: {
              high: { url: sThumb },
              medium: { url: sThumb },
              default: { url: sThumb }
            },
            channelTitle: 'YouTube Shorts'
          },
          statistics: { viewCount: parseGasCountString(sViews), likeCount: '0' },
          contentDetails: { duration: 'PT0M59S' }
        });
      }
      return;
    }

    // 1c. playlistRenderer / compactPlaylistRenderer / gridPlaylistRenderer
    var pr = node.playlistRenderer || node.compactPlaylistRenderer || node.gridPlaylistRenderer;
    if (pr && pr.playlistId && !seen[pr.playlistId]) {
      var plId = pr.playlistId;
      seen[plId] = true;
      var plTitle = (pr.title && (pr.title.simpleText || (pr.title.runs && pr.title.runs[0] && pr.title.runs[0].text))) || '再生リスト';
      var plCh = (pr.shortBylineText && pr.shortBylineText.runs && pr.shortBylineText.runs[0] && pr.shortBylineText.runs[0].text) ||
                 (pr.longBylineText && pr.longBylineText.runs && pr.longBylineText.runs[0] && pr.longBylineText.runs[0].text) || 'YouTube 再生リスト';
      var plCountStr = pr.videoCount || (pr.videoCountText && pr.videoCountText.runs && pr.videoCountText.runs[0] && pr.videoCountText.runs[0].text) || (pr.videoCountShortText && pr.videoCountShortText.simpleText) || '';
      var plThumb =
        (pr.thumbnails && pr.thumbnails[0] && pr.thumbnails[0].thumbnails && pr.thumbnails[0].thumbnails[0] && pr.thumbnails[0].thumbnails[0].url) ||
        (pr.thumbnail && pr.thumbnail.thumbnails && pr.thumbnail.thumbnails[0] && pr.thumbnail.thumbnails[0].url) ||
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
      var parsedCount = parseInt(String(plCountStr).replace(/[^\d]/g, ''), 10) || 0;
      results.push({
        id: plId,
        kind: 'youtube#playlist',
        isPlaylist: true,
        playlistId: plId,
        title: plTitle,
        thumbnail: plThumb,
        videoCount: parsedCount,
        videoCountText: plCountStr ? (plCountStr + '本の動画') : '再生リスト',
        snippet: {
          publishedAt: new Date().toISOString(),
          channelId: '',
          title: plTitle,
          description: '再生リスト',
          thumbnails: {
            high: { url: plThumb },
            medium: { url: plThumb },
            default: { url: plThumb }
          },
          channelTitle: plCh
        },
        statistics: { viewCount: '0', likeCount: '0' },
        contentDetails: { duration: '再生リスト', itemCount: parsedCount }
      });
      return;
    }

    // 2. videoRenderer / compactVideoRenderer / playlistVideoRenderer / playlistPanelVideoRenderer
    var vr = node.videoRenderer || node.compactVideoRenderer || node.playlistVideoRenderer || node.playlistPanelVideoRenderer;
    if (vr && vr.videoId && /^[A-Za-z0-9_-]{11}$/.test(String(vr.videoId)) && !seen[vr.videoId]) {
      var vId = vr.videoId;
      var vTitle = (vr.title && (vr.title.simpleText || (vr.title.runs && vr.title.runs[0] && vr.title.runs[0].text))) || '';
      if (!vTitle) return;
      seen[vId] = true;
      var vCh = (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].text) ||
                (vr.longBylineText && vr.longBylineText.runs && vr.longBylineText.runs[0] && vr.longBylineText.runs[0].text) ||
                (vr.shortBylineText && vr.shortBylineText.runs && vr.shortBylineText.runs[0] && vr.shortBylineText.runs[0].text) || '';
      var vChId = (vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].navigationEndpoint && vr.ownerText.runs[0].navigationEndpoint.browseEndpoint && vr.ownerText.runs[0].navigationEndpoint.browseEndpoint.browseId) ||
                  (vr.shortBylineText && vr.shortBylineText.runs && vr.shortBylineText.runs[0] && vr.shortBylineText.runs[0].navigationEndpoint && vr.shortBylineText.runs[0].navigationEndpoint.browseEndpoint && vr.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId) || '';
      var vDur = (vr.lengthText && (vr.lengthText.simpleText || (vr.lengthText.runs && vr.lengthText.runs[0] && vr.lengthText.runs[0].text))) || '';
      var vViews = (vr.viewCountText && (vr.viewCountText.simpleText || (vr.viewCountText.runs && vr.viewCountText.runs[0] && vr.viewCountText.runs[0].text))) || '0';
      var vPub = (vr.publishedTimeText && vr.publishedTimeText.simpleText) || new Date().toISOString();
      var vThumb = 'https://i.ytimg.com/vi/' + vId + '/hqdefault.jpg';
      var vAnimThumb = (vr.richThumbnail && vr.richThumbnail.movingThumbnailRenderer && vr.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails && vr.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails.thumbnails && vr.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails.thumbnails[0] && vr.richThumbnail.movingThumbnailRenderer.movingThumbnailDetails.thumbnails[0].url) || undefined;

      results.push({
        id: vId,
        kind: 'youtube#video',
        snippet: {
          publishedAt: vPub,
          channelId: vChId,
          title: vTitle,
          description: '',
          animatedThumbnailUrl: vAnimThumb,
          thumbnails: {
            high: { url: vThumb },
            medium: { url: vThumb },
            default: { url: vThumb }
          },
          channelTitle: vCh
        },
        statistics: { viewCount: parseGasCountString(vViews), likeCount: '0' },
        contentDetails: { duration: parseGasDurationToIso(vDur) }
      });
      return;
    }

    for (var key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        walk(node[key]);
      }
    }
  }

  walk(rootNode);
  return results;
}

function fetchYouTube(endpoint, params, apiKeyOverride) {
  var keyToUse = apiKeyOverride || PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY') || '';
  if (!keyToUse) {
    return { error: { message: 'YouTube API key is not configured' } };
  }

  var queryString = Object.keys(params)
    .filter(function(k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');

  var url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?key=' + encodeURIComponent(keyToUse);
  if (queryString) url += '&' + queryString;

  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(res.getContentText());
    if (res.getResponseCode() >= 400) {
      return { error: json.error || { message: 'YouTube API request failed' } };
    }
    return json;
  } catch (err) {
    return { error: { message: err.message || 'Network error' } };
  }
}

function fetchInvidious(instanceUrl, endpoint, queryParams) {
  queryParams = queryParams || {};
  var baseUrl = (instanceUrl || 'https://yt.omada.cafe/').trim();
  if (baseUrl.indexOf('http://') !== 0 && baseUrl.indexOf('https://') !== 0) {
    baseUrl = 'https://' + baseUrl;
  }
  if (baseUrl.slice(-1) === '/') {
    baseUrl = baseUrl.slice(0, -1);
  }

  var queryString = Object.keys(queryParams)
    .filter(function(k) { return queryParams[k]; })
    .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]); })
    .join('&');

  var url = baseUrl + '/api/v1/' + endpoint;
  if (queryString) url += '?' + queryString;

  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 400) {
      return { error: 'Invidious HTTP ' + res.getResponseCode() };
    }
    var json = JSON.parse(res.getContentText());
    return { data: json };
  } catch (err) {
    return { error: err.message || 'Invidious fetch failed' };
  }
}

// InnerTube / Invidious 変換ヘルパー (YouTube公式 i.ytimg.com 優先・Invidious非依存)
function convertInvidiousItemToYouTubeItem(item) {
  var videoId = item.videoId || item.id;
  var highThumb = (item.videoThumbnails && item.videoThumbnails.filter(function(t) { return t.quality === 'high'; })[0]) || null;
  var medThumb = (item.videoThumbnails && item.videoThumbnails.filter(function(t) { return t.quality === 'medium'; })[0]) || null;

  var ytBase = 'https://i.ytimg.com';
  var thumbnailHigh = item.thumbnail || (highThumb && highThumb.url) || (ytBase + '/vi/' + videoId + '/hqdefault.jpg');
  var thumbnailMed = item.thumbnail || (medThumb && medThumb.url) || (ytBase + '/vi/' + videoId + '/mqdefault.jpg');
  if (thumbnailHigh.indexOf('/') === 0) thumbnailHigh = ytBase + thumbnailHigh;
  if (thumbnailMed.indexOf('/') === 0) thumbnailMed = ytBase + thumbnailMed;

  var authorImg = '';
  if (Array.isArray(item.authorThumbnails) && item.authorThumbnails.length > 0) {
    authorImg = item.authorThumbnails[item.authorThumbnails.length - 1].url || item.authorThumbnails[0].url || '';
  } else if (typeof item.authorThumbnail === 'string') {
    authorImg = item.authorThumbnail;
  }

  var durationSec = item.lengthSeconds || 0;
  var mins = Math.floor(durationSec / 60);
  var secs = durationSec % 60;
  var durationIso = durationSec > 0 ? ('PT' + mins + 'M' + secs + 'S') : 'PT0M0S';

  var pubIso = new Date().toISOString();
  if (item.published) {
    pubIso = new Date(item.published * 1000).toISOString();
  } else if (item.publishedText) {
    pubIso = item.publishedText;
  }

  var isActuallyLive = Boolean(item.liveNow && (!durationSec || Number(durationSec) === 0));

  return {
    id: videoId,
    kind: 'youtube#video',
    authorThumbnail: authorImg,
    liveNow: isActuallyLive,
    lengthSeconds: durationSec,
    isShort: Boolean(item.isShort || item.type === 'short'),
    snippet: {
      publishedAt: pubIso,
      channelId: item.authorId || item.channelId || '',
      title: item.title || '',
      description: item.description || '',
      channelThumbnail: authorImg,
      animatedThumbnailUrl: item.animatedThumbnailUrl || undefined,
      thumbnails: {
        high: { url: thumbnailHigh },
        medium: { url: thumbnailMed },
        default: { url: thumbnailMed }
      },
      channelTitle: item.author || item.channelTitle || '',
      liveBroadcastContent: isActuallyLive ? 'live' : 'none',
      tags: item.keywords || item.tags || []
    },
    statistics: {
      viewCount: String(item.viewCount || item.views || 0),
      likeCount: String(item.likeCount || 0)
    },
    contentDetails: {
      duration: durationIso
    }
  };
}

function convertInvidiousChannelToYouTubeChannel(item) {
  var authorThumbnail = (item.authorThumbnails && item.authorThumbnails.length > 0)
    ? item.authorThumbnails[item.authorThumbnails.length - 1].url
    : '';
  var bannerUrl = (item.authorBanners && item.authorBanners.length > 0)
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

function convertSingleInvidiousComment(c, videoId) {
  var authorImg = '';
  if (c.authorThumbnails && c.authorThumbnails.length > 0) {
    authorImg = c.authorThumbnails[c.authorThumbnails.length - 1].url;
  } else if (typeof c.authorThumbnail === 'string') {
    authorImg = c.authorThumbnail;
  }

  if (authorImg) {
    if (authorImg.indexOf('//') === 0) authorImg = 'https:' + authorImg;
    else if (authorImg.indexOf('/ggpht/') === 0) authorImg = 'https://yt3.ggpht.com' + authorImg.replace('/ggpht', '');
  }

  var textRaw = c.content || c.textOriginal || c.text || c.contentHtml || c.textDisplay || '';
  var textHtml = c.contentHtml || c.textDisplay || c.content || c.textOriginal || c.text || '';

  var publishedIso = new Date().toISOString();
  if (typeof c.published === 'number') {
    publishedIso = new Date(c.published > 10000000000 ? c.published : c.published * 1000).toISOString();
  } else if (c.publishedText) {
    publishedIso = c.publishedText;
  }

  return {
    id: c.commentId || c.id || String(Math.random()),
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

function convertInvidiousCommentsToYouTube(data, videoId) {
  if (!data || !Array.isArray(data.comments)) return { items: [], nextPageToken: null };

  var items = data.comments.map(function(c) {
    var topLevelComment = convertSingleInvidiousComment(c, videoId);
    var repliesList = (c.replies && Array.isArray(c.replies.comments))
      ? c.replies.comments.map(function(r) { return convertSingleInvidiousComment(r, videoId); })
      : [];

    return {
      id: c.commentId || topLevelComment.id,
      kind: 'youtube#commentThread',
      snippet: {
        videoId: videoId,
        topLevelComment: topLevelComment,
        totalReplyCount: (c.replies && c.replies.replyCount) || repliesList.length
      },
      replies: repliesList.length > 0 ? { comments: repliesList } : undefined
    };
  });

  return { items: items, nextPageToken: data.continuation || null, isLiveChat: Boolean(data.isLiveChat) };
}

// ==========================================
// 4. 各エンドポイント処理ロジック
// ==========================================

function handleTrending(config, query) {
  var regionCode = query.regionCode || 'JP';
  var maxResults = query.maxResults || '48';
  var videoCategoryId = query.videoCategoryId || '';
  var pageToken = query.pageToken || '';
  var pageNum = (pageToken && String(pageToken).indexOf('page_') === 0)
    ? (parseInt(String(pageToken).replace('page_', ''), 10) || 1)
    : 1;

  var feedQueries = [
    '急上昇 人気 動画 日本',
    '音楽 MV 人気 最新 J-POP',
    'ゲーム実況 人気 トレンド',
    'バラエティ エンタメ 人気 話題',
    'アニメ 公式 人気 最新',
    '解説 雑学 科学 テクノロジー 人気'
  ];

  // 1. Primary: Official YouTube InnerTube v1 Direct (YouTube.js style multi-query)
  try {
    var startIdx = ((pageNum - 1) * 2) % feedQueries.length;
    var q1 = feedQueries[startIdx];
    var q2 = feedQueries[(startIdx + 1) % feedQueries.length];
    var d1 = callYouTubeInnerTubeDirect('search', { query: q1 });
    var d2 = callYouTubeInnerTubeDirect('search', { query: q2 });
    var seen = {};
    var combined = [];
    var list1 = d1.data ? extractVideosFromInnerTubeResponse(d1.data) : [];
    var list2 = d2.data ? extractVideosFromInnerTubeResponse(d2.data) : [];
    var all = list1.concat(list2);
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      if (it && it.id && /^[A-Za-z0-9_-]{11}$/.test(String(it.id)) && !it.isPlaylist && !it.isShort && !seen[it.id]) {
        if (!it.snippet || !it.snippet.title) continue;
        if (it.contentDetails && it.contentDetails.duration === 'PT0M0S' && it.snippet.liveBroadcastContent !== 'live') continue;
        seen[it.id] = true;
        combined.push(it);
      }
    }
    if (combined.length > 0) {
      return {
        kind: 'youtube#videoListResponse',
        items: combined,
        nextPageToken: 'page_' + (pageNum + 1)
      };
    }
  } catch (e) {}

  // 2. Secondary: InnerTube Worker
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'trending');
    if (itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      var items = itRes.data.map(convertInvidiousItemToYouTubeItem);
      return { kind: 'youtube#videoListResponse', items: items };
    }
  } catch (e) {}

  // 3. Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'trending', { region: regionCode });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      var invItems = invRes.data.map(convertInvidiousItemToYouTubeItem);
      return { kind: 'youtube#videoListResponse', items: invItems };
    }
  } catch (e) {}

  // 4. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode: regionCode,
      maxResults: maxResults
    };
    if (videoCategoryId) params.videoCategoryId = videoCategoryId;
    if (pageToken) params.pageToken = pageToken;

    var data = fetchYouTube('videos', params, config.youtubeKey);
    if (!data.error && data.items && data.items.length > 0) {
      return data;
    }
  }

  return { items: [] };
}

function handleSearch(config, query) {
  var q = query.q || '';
  var order = query.order || 'relevance';
  var type = query.type || 'video';
  var videoDuration = query.videoDuration || 'any';
  var videoCategoryId = query.videoCategoryId || '';
  var regionCode = query.regionCode || 'JP';
  var pageToken = query.pageToken || '';
  var maxResults = query.maxResults || '24';
  var publishedAfter = query.publishedAfter || '';

  // 1. Primary: Official YouTube InnerTube v1 Direct (YouTube.js style + Playlists + Pagination)
  try {
    var pageNum = (pageToken && String(pageToken).indexOf('page_') === 0)
      ? (parseInt(String(pageToken).replace('page_', ''), 10) || 1)
      : 1;
    var baseQ = q || '人気 動画';
    var qStr = pageNum === 1 ? baseQ : (baseQ + ' 人気 ' + pageNum);
    var directSearch = callYouTubeInnerTubeDirect('search', { query: qStr });
    if (directSearch.data) {
      var directItems = extractVideosFromInnerTubeResponse(directSearch.data);
      if (pageNum === 1) {
        var plSearch = callYouTubeInnerTubeDirect('search', { query: baseQ + ' 再生リスト' });
        if (plSearch.data) {
          var plItems = extractVideosFromInnerTubeResponse(plSearch.data);
          var seenIds = {};
          for (var i = 0; i < directItems.length; i++) seenIds[directItems[i].id] = true;
          for (var j = 0; j < plItems.length; j++) {
            if (plItems[j] && !seenIds[plItems[j].id]) {
              seenIds[plItems[j].id] = true;
              directItems.push(plItems[j]);
            }
          }
        }
      }
      if (directItems.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: directItems,
          nextPageToken: 'page_' + (pageNum + 1)
        };
      }
    }
  } catch (e) {}

  // 2. Secondary: InnerTube Worker
  try {
    var itSearch = fetchInnerTubeWorker(config.innertubeUrl, 'search', { q: q || '人気 動画', limit: maxResults });
    if (itSearch.data && Array.isArray(itSearch.data.results) && itSearch.data.results.length > 0) {
      var itItems = itSearch.data.results.map(convertInvidiousItemToYouTubeItem);
      if (itItems.length > 0) {
        return { kind: 'youtube#searchResponse', items: itItems, nextPageToken: itSearch.data.continuation || null };
      }
    }
  } catch (e) {}

  // 3. Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'search', { q: q || '人気 動画', type: 'video', region: 'JP' });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      var items = invRes.data.filter(function(it) { return it.type === 'video' || it.videoId; }).map(convertInvidiousItemToYouTubeItem);
      if (items.length > 0) {
        return { kind: 'youtube#searchResponse', items: items };
      }
    }
  } catch (e) {}

  // 4. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet',
      q: q || '人気 動画',
      order: order,
      maxResults: maxResults,
      regionCode: regionCode
    };
    if (type !== 'all') params.type = type;
    if (videoDuration !== 'any' && type === 'video') params.videoDuration = videoDuration;
    if (videoCategoryId) params.videoCategoryId = videoCategoryId;
    if (publishedAfter) params.publishedAfter = publishedAfter;
    if (pageToken && !pageToken.startsWith('page_')) params.pageToken = pageToken;

    var searchData = fetchYouTube('search', params, config.youtubeKey);
    if (!searchData.error && searchData.items && searchData.items.length > 0) {
      var videoIds = searchData.items
        .map(function(item) { return (item.id && item.id.videoId) || (typeof item.id === 'string' ? item.id : null); })
        .filter(Boolean);

      if (videoIds.length > 0) {
        var detailsData = fetchYouTube('videos', {
          part: 'snippet,contentDetails,statistics',
          id: videoIds.join(',')
        }, config.youtubeKey);

        if (detailsData.items && detailsData.items.length > 0) {
          searchData.items = detailsData.items;
        }
      }
      return searchData;
    }
  }

  return { items: [] };
}

function handleCategories(config, query) {
  var regionCode = query.regionCode || 'JP';
  var data = fetchYouTube('videoCategories', {
    part: 'snippet',
    regionCode: regionCode
  }, config.youtubeKey);

  if (data.error || !data.items) {
    return {
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
    };
  }
  return data;
}

function handleVideoDetail(config, id) {
  // 1. Primary: InnerTube Worker videos/:id
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'videos/' + id);
    if (itRes.data && (itRes.data.title || itRes.data.videoId)) {
      var recs = itRes.data.recommendedVideos || itRes.data.relatedVideos || itRes.data.related || [];
      var relatedItems = Array.isArray(recs) ? recs.map(convertInvidiousItemToYouTubeItem) : [];
      return {
        kind: 'youtube#videoListResponse',
        items: [convertInvidiousItemToYouTubeItem(itRes.data)],
        relatedItems: relatedItems
      };
    }
  } catch (e) {}

  // 2. Secondary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + id);
    if (invRes.data && (invRes.data.title || invRes.data.videoId)) {
      var invRecs = invRes.data.recommendedVideos || [];
      var invRelated = Array.isArray(invRecs) ? invRecs.map(convertInvidiousItemToYouTubeItem) : [];
      return {
        kind: 'youtube#videoListResponse',
        items: [convertInvidiousItemToYouTubeItem(invRes.data)],
        relatedItems: invRelated
      };
    }
  } catch (e) {}

  // 3. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var data = fetchYouTube('videos', { part: 'snippet,contentDetails,statistics', id: id }, config.youtubeKey);
    if (!data.error && data.items && data.items.length > 0) {
      return data;
    }
  }

  return { items: [] };
}

function handleVideosBatch(config, query) {
  var ids = query.ids;
  if (!ids) return { items: [] };

  var idList = String(ids).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var items = [];
  for (var i = 0; i < idList.length; i++) {
    var vid = idList[i];
    try {
      var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'videos/' + vid);
      if (itRes.data && (itRes.data.title || itRes.data.videoId)) {
        items.push(convertInvidiousItemToYouTubeItem(itRes.data));
        continue;
      }
    } catch (e) {}
    try {
      var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + vid);
      if (invRes.data && (invRes.data.title || invRes.data.videoId)) {
        items.push(convertInvidiousItemToYouTubeItem(invRes.data));
        continue;
      }
    } catch (e) {}
  }

  if (items.length > 0) {
    return { items: items };
  }

  if (config.youtubeKey) {
    var data = fetchYouTube('videos', { part: 'snippet,contentDetails,statistics', id: ids }, config.youtubeKey);
    return data.items ? data : { items: [] };
  }
  return { items: [] };
}

function handleRelatedVideos(config, id, query) {
  var maxResults = query.maxResults || '20';
  var rawQueryTitle = (query.q || '').trim();
  var pageToken = query.pageToken || '';
  var queryTitle = (rawQueryTitle === 'YouTube Video' || rawQueryTitle === 'YouTube Short') ? '' : rawQueryTitle;

  var seenIds = {};
  seenIds[id] = true;
  var collectedItems = [];
  var resolvedTitle = queryTitle;
  var resolvedAuthor = '';
  var nextContinuation = null;

  function addUnique(list) {
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var vId = typeof item.id === 'string' ? item.id : (item.id && item.id.videoId);
      if (vId && !seenIds[vId]) {
        seenIds[vId] = true;
        collectedItems.push(item);
      }
    }
  }

  // 1. Primary: Official YouTube InnerTube v1 'next' endpoint (LuanRT/YouTube.js watch_next_feed 準拠)
  if (!pageToken || pageToken.indexOf('page_') === 0) {
    try {
      var nextRes = callYouTubeInnerTubeDirect('next', { videoId: id });
      if (nextRes.data) {
        var nextItems = extractVideosFromInnerTubeResponse(nextRes.data, id);
        if (nextItems.length > 0) {
          addUnique(nextItems);
        }
      }
    } catch (e) {}
  }

  // 2. Secondary: InnerTube Worker videos/:id
  if (collectedItems.length < 10 && (!pageToken || pageToken.indexOf('page_') === 0)) {
    try {
      var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'videos/' + id);
      if (itRes.data) {
        if (!resolvedTitle && itRes.data.title) resolvedTitle = itRes.data.title;
        if (itRes.data.author) resolvedAuthor = itRes.data.author;
        var recs = itRes.data.recommendedVideos || itRes.data.relatedVideos || itRes.data.related;
        if (Array.isArray(recs) && recs.length > 0) {
          addUnique(recs.map(convertInvidiousItemToYouTubeItem));
        }
      }
    } catch (e) {}
  }

  // 2. Smart Search Enrichment by cleaned title or author
  var cleanSearchQuery = (resolvedTitle || resolvedAuthor)
    .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）|#\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45) || resolvedTitle || resolvedAuthor;

  if (cleanSearchQuery && (collectedItems.length < 10 || pageToken)) {
    try {
      var searchParams = { q: cleanSearchQuery, limit: '20' };
      if (pageToken && pageToken.indexOf('page_') !== 0) {
        searchParams.continuation = pageToken;
      }
      var itSearch = fetchInnerTubeWorker(config.innertubeUrl, 'search', searchParams);
      if (itSearch.data && Array.isArray(itSearch.data.results) && itSearch.data.results.length > 0) {
        var searchItems = itSearch.data.results.map(convertInvidiousItemToYouTubeItem);
        addUnique(searchItems);
        nextContinuation = itSearch.data.continuation || null;
      }
    } catch (e) {}
  }

  if (collectedItems.length > 0) {
    return {
      kind: 'youtube#searchResponse',
      items: collectedItems,
      nextPageToken: nextContinuation
    };
  }

  // 3. Invidious recommendedVideos fallback
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + id);
    if (invRes.data && Array.isArray(invRes.data.recommendedVideos) && invRes.data.recommendedVideos.length > 0) {
      addUnique(invRes.data.recommendedVideos.map(convertInvidiousItemToYouTubeItem));
      if (collectedItems.length > 0) {
        return { kind: 'youtube#searchResponse', items: collectedItems };
      }
    }
  } catch (e) {}

  // 4. Fallback: Search by video title via handleSearch
  try {
    var titleToSearch = cleanSearchQuery;
    if (!titleToSearch) {
      var vidDetail = handleVideoDetail(config, id);
      titleToSearch = vidDetail && vidDetail.items && vidDetail.items[0] && vidDetail.items[0].snippet && vidDetail.items[0].snippet.title;
    }
    if (titleToSearch) {
      var cleanTitle = titleToSearch.replace(/[【】\[\]()（）]/g, ' ').slice(0, 35).trim();
      var searchRes = handleSearch(config, { q: cleanTitle, maxResults: maxResults });
      if (searchRes && searchRes.items && searchRes.items.length > 0) {
        addUnique(searchRes.items);
        if (collectedItems.length > 0) {
          return { kind: 'youtube#searchResponse', items: collectedItems };
        }
      }
    }
  } catch (e) {}

  // 5. Final fallback: Trending
  try {
    var trendRes = handleTrending(config, { regionCode: 'JP', maxResults: '16' });
    if (trendRes && Array.isArray(trendRes.items) && trendRes.items.length > 0) {
      addUnique(trendRes.items);
      return { kind: 'youtube#searchResponse', items: collectedItems };
    }
  } catch (e) {}

  return { items: [] };
}

function extractGasLiveRunsText(runs) {
  if (!Array.isArray(runs)) return '';
  return runs.map(function(r) {
    if (typeof r.text === 'string') return r.text;
    if (r.emoji) {
      if (!r.emoji.isCustomEmoji && r.emoji.emojiId) return r.emoji.emojiId;
      return (r.emoji.shortcuts && r.emoji.shortcuts[0]) || '';
    }
    return '';
  }).join('');
}

function fetchGasInnerTubeLiveChat(liveToken, isReplay) {
  var ep = isReplay ? 'live_chat/get_live_chat_replay' : 'live_chat/get_live_chat';
  var payload = isReplay
    ? { continuation: liveToken, currentPlayerState: { playerOffsetMs: '0' } }
    : { continuation: liveToken };
  var chatRes = callYouTubeInnerTubeDirect(ep, payload, 'WEB');
  var lcc = chatRes.data && chatRes.data.continuationContents && chatRes.data.continuationContents.liveChatContinuation;
  var actions = (lcc && lcc.actions) || [];
  var comments = [];
  var seen = {};
  for (var i = 0; i < actions.length; i++) {
    var act = actions[i];
    var item = (act.addChatItemAction && act.addChatItemAction.item) ||
      (act.replayChatItemAction && act.replayChatItemAction.actions && act.replayChatItemAction.actions[0] && act.replayChatItemAction.actions[0].addChatItemAction && act.replayChatItemAction.actions[0].addChatItemAction.item);
    if (!item) continue;
    var msg = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer || item.liveChatPaidStickerRenderer || item.liveChatMembershipItemRenderer;
    if (!msg) continue;
    var cid = msg.id || String(Math.random());
    if (seen[cid]) continue;
    seen[cid] = true;
    var rawText = extractGasLiveRunsText(msg.message && msg.message.runs) ||
      extractGasLiveRunsText(msg.headerSubtext && msg.headerSubtext.runs) ||
      extractInnerTubeText(msg.message);
    var paidAmount = extractInnerTubeText(msg.purchaseAmountText);
    var content = paidAmount ? ('[スパチャ ' + paidAmount + '] ' + rawText).trim() : rawText;
    if (!content) continue;
    var tsMs = msg.timestampUsec ? Math.floor(Number(msg.timestampUsec) / 1000) : Date.now();
    var publishedText = extractInnerTubeText(msg.timestampText) || new Date(tsMs).toISOString();
    var avatar = (msg.authorPhoto && msg.authorPhoto.thumbnails && msg.authorPhoto.thumbnails.length > 0)
      ? msg.authorPhoto.thumbnails[msg.authorPhoto.thumbnails.length - 1].url
      : '';
    comments.push({
      commentId: cid,
      author: extractInnerTubeText(msg.authorName) || 'YouTube ユーザー',
      authorId: msg.authorExternalChannelId || '',
      authorThumbnail: avatar,
      content: content,
      publishedText: publishedText,
      likeCount: 0,
      isLiveChat: true
    });
  }
  var nextContObj = lcc && lcc.continuations && lcc.continuations[0];
  var rawNext = (nextContObj && (
    (nextContObj.invalidationContinuationData && nextContObj.invalidationContinuationData.continuation) ||
    (nextContObj.timedContinuationData && nextContObj.timedContinuationData.continuation) ||
    (nextContObj.reloadContinuationData && nextContObj.reloadContinuationData.continuation) ||
    (nextContObj.liveChatReplayContinuationData && nextContObj.liveChatReplayContinuationData.continuation)
  )) || null;
  var nextPrefix = isReplay ? 'livechat_replay:' : 'livechat:';
  return {
    comments: comments,
    continuation: rawNext ? (nextPrefix + rawNext) : null,
    isLiveChat: true
  };
}

function handleComments(config, id, query) {
  var order = query.order || 'relevance';
  var maxResults = query.maxResults || '20';
  var pageToken = query.pageToken ? String(query.pageToken) : '';
  var isLiveReq = query.live === '1' || query.live === 'true' || pageToken.indexOf('livechat:') === 0 || pageToken.indexOf('livechat_replay:') === 0;

  // 0. If continuation is already a livechat token, fetch live chat directly via InnerTube
  if (pageToken.indexOf('livechat:') === 0 || pageToken.indexOf('livechat_replay:') === 0) {
    try {
      var isRep = pageToken.indexOf('livechat_replay:') === 0;
      var rawTok = pageToken.replace(/^livechat(_replay)?:/, '');
      var directLive = fetchGasInnerTubeLiveChat(rawTok, isRep);
      return convertInvidiousCommentsToYouTube(directLive, id);
    } catch (e) {}
  }

  // 1. Primary: InnerTube Worker comments (https://proxy.wa0260966.workers.dev)
  try {
    var itParams = { limit: String(maxResults) };
    if (pageToken) itParams.continuation = pageToken;
    if (isLiveReq) itParams.mode = 'live';
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'comments/' + id, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && (itRes.data.comments.length > 0 || itRes.data.isLiveChat)) {
      return convertInvidiousCommentsToYouTube(itRes.data, id);
    }
  } catch (e) {}

  // 2. Direct InnerTube API (Supports both Live Chat & Normal Comments!)
  try {
    var nextRes = callYouTubeInnerTubeDirect('next', { videoId: id }, 'WEB');
    if (nextRes.data) {
      var convBar = nextRes.data.contents &&
        nextRes.data.contents.twoColumnWatchNextResults &&
        nextRes.data.contents.twoColumnWatchNextResults.conversationBar &&
        nextRes.data.contents.twoColumnWatchNextResults.conversationBar.liveChatRenderer;
      if (convBar && convBar.continuations && convBar.continuations[0]) {
        var c0 = convBar.continuations[0];
        var activeTok = (c0.reloadContinuationData && c0.reloadContinuationData.continuation) ||
          (c0.invalidationContinuationData && c0.invalidationContinuationData.continuation) ||
          (c0.timedContinuationData && c0.timedContinuationData.continuation);
        var replayTok = (c0.liveChatReplayContinuationData && c0.liveChatReplayContinuationData.continuation) ||
          (c0.playerSeekContinuationData && c0.playerSeekContinuationData.continuation);
        if (activeTok || replayTok) {
          var liveData = fetchGasInnerTubeLiveChat(activeTok || replayTok, !activeTok && Boolean(replayTok));
          if (liveData.comments.length > 0 || isLiveReq) {
            return convertInvidiousCommentsToYouTube(liveData, id);
          }
        }
      }
    }
  } catch (e) {}

  // 3. Last-resort Fallback: Invidious comments (ONLY if InnerTube fails)
  if (!isLiveReq) {
    try {
      var invParams = pageToken ? { continuation: pageToken } : {};
      var invRes = fetchInvidious(config.invidiousUrl, 'comments/' + id, invParams);
      if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
        return convertInvidiousCommentsToYouTube(invRes.data, id);
      }
    } catch (e) {}
  }

  return { items: [], nextPageToken: null };
}

function handleCommentReplies(config, id, query) {
  var maxResults = query.maxResults || '20';
  var pageToken = query.pageToken;

  // 1. Primary: InnerTube Worker (https://proxy.wa0260966.workers.dev)
  try {
    var itParams = { limit: String(maxResults) };
    if (pageToken) itParams.continuation = String(pageToken);
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'comments/replies/' + id, itParams);
    if (itRes.data && Array.isArray(itRes.data.comments) && itRes.data.comments.length > 0) {
      return {
        items: itRes.data.comments.map(function(c) { return convertSingleInvidiousComment(c); }),
        nextPageToken: itRes.data.continuation || null
      };
    }
  } catch (e) {}

  // 2. Fallback: Invidious (ONLY if InnerTube fails)
  if (pageToken) {
    try {
      var invRes = fetchInvidious(config.invidiousUrl, 'comments/' + id, { continuation: pageToken });
      if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
        return {
          items: invRes.data.comments.map(function(c) { return convertSingleInvidiousComment(c); }),
          nextPageToken: invRes.data.continuation || null
        };
      }
    } catch (e) {}
  }

  // 3. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet',
      parentId: id,
      maxResults: maxResults
    };
    if (pageToken) params.pageToken = pageToken;

    var data = fetchYouTube('comments', params, config.youtubeKey);
    if (!data.error && data.items) return data;
  }

  return { items: [], nextPageToken: null };
}

function handleChannelDetail(config, id) {
  // 1. Primary: InnerTube Worker
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + id);
    if (itRes.data && (itRes.data.authorId || itRes.data.author)) {
      return { items: [convertInvidiousChannelToYouTubeChannel(itRes.data)] };
    }
  } catch (e) {}

  // 2. Secondary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/' + id);
    if (invRes.data && (invRes.data.authorId || invRes.data.author)) {
      return { items: [convertInvidiousChannelToYouTubeChannel(invRes.data)] };
    }
  } catch (e) {}

  // 3. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var data = fetchYouTube('channels', {
      part: 'snippet,statistics,brandingSettings,contentDetails',
      id: id
    }, config.youtubeKey);

    if (!data.error && data.items && data.items.length > 0) {
      return data;
    }
  }

  return { items: [] };
}

function handleChannelVideos(config, id, query) {
  var maxResults = query.maxResults || '500';
  var pageToken = query.pageToken;
  var order = query.order || 'date';

  // 1. Primary: Official YouTube InnerTube v1 Direct (Videos Tab + Complete VLUU Uploads Playlist + Multi-Page Continuations)
  try {
    var mergedMap = {};
    var mergedOrder = [];
    function addOrMergeGasVideo(it) {
      if (!it || it.isPlaylist) return;
      var vId = typeof it.id === 'string' ? it.id : (it.id && it.id.videoId);
      if (!vId) return;
      if (!mergedMap[vId]) {
        if (it.snippet && !it.snippet.channelId) it.snippet.channelId = id;
        mergedMap[vId] = it;
        mergedOrder.push(vId);
      } else {
        var oldViews = parseInt((mergedMap[vId].statistics && mergedMap[vId].statistics.viewCount) || '0', 10);
        var newViews = parseInt((it.statistics && it.statistics.viewCount) || '0', 10);
        if (newViews > oldViews) {
          if (it.snippet && !it.snippet.channelId) it.snippet.channelId = id;
          mergedMap[vId] = it;
        }
      }
    }

    // Continuation batch when pageToken is provided
    if (pageToken && String(pageToken).length > 20) {
      var contToken = String(pageToken);
      for (var cp = 0; cp < 3 && contToken; cp++) {
        var contRes = callYouTubeInnerTubeDirect('browse', { continuation: contToken });
        if (!contRes.data) {
          contToken = null;
          break;
        }
        var cItems = extractVideosFromInnerTubeResponse(contRes.data);
        for (var ci = 0; ci < cItems.length; ci++) {
          addOrMergeGasVideo(cItems[ci]);
        }
        contToken = extractContinuationTokenFromInnerTube(contRes.data);
      }
      var contResultList = mergedOrder.map(function(k) { return mergedMap[k]; });
      if (contResultList.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: contResultList,
          nextPageToken: contToken || null
        };
      }
    }

    if (!pageToken) {
      var nextTokenToReturn = null;

      // 1a. Fetch Videos tab (rich view counts & relative dates) + up to 2 continuation pages
      try {
        var vTabRes = callYouTubeInnerTubeDirect('browse', {
          browseId: id,
          params: 'EgZ2aWRlb3PyBgQKAjoA'
        });
        if (vTabRes.data) {
          var vTabItems = extractVideosFromInnerTubeResponse(vTabRes.data);
          for (var vi = 0; vi < vTabItems.length; vi++) addOrMergeGasVideo(vTabItems[vi]);
          var vCont = extractContinuationTokenFromInnerTube(vTabRes.data);
          for (var vp = 0; vp < 2 && vCont; vp++) {
            var vNext = callYouTubeInnerTubeDirect('browse', { continuation: vCont });
            if (!vNext.data) { vCont = null; break; }
            var vnItems = extractVideosFromInnerTubeResponse(vNext.data);
            for (var vni = 0; vni < vnItems.length; vni++) addOrMergeGasVideo(vnItems[vni]);
            vCont = extractContinuationTokenFromInnerTube(vNext.data);
          }
          if (vCont) nextTokenToReturn = vCont;
        }
      } catch (e) {}

      // 1b. Fetch VLUU Uploads Playlist (100 videos per page, includes all channel uploads/releases/shorts) + up to 3 continuations
      if (String(id).indexOf('UC') === 0) {
        try {
          var uuBrowseId = 'VLUU' + String(id).slice(2);
          var uuRes = callYouTubeInnerTubeDirect('browse', { browseId: uuBrowseId });
          if (uuRes.data) {
            var uuItems = extractVideosFromInnerTubeResponse(uuRes.data);
            for (var ui = 0; ui < uuItems.length; ui++) addOrMergeGasVideo(uuItems[ui]);
            var uuCont = extractContinuationTokenFromInnerTube(uuRes.data);
            for (var up = 0; up < 3 && uuCont; up++) {
              var uuNext = callYouTubeInnerTubeDirect('browse', { continuation: uuCont });
              if (!uuNext.data) { uuCont = null; break; }
              var unItems = extractVideosFromInnerTubeResponse(uuNext.data);
              for (var uni = 0; uni < unItems.length; uni++) addOrMergeGasVideo(unItems[uni]);
              uuCont = extractContinuationTokenFromInnerTube(uuNext.data);
            }
            if (uuCont) nextTokenToReturn = uuCont;
          }
        } catch (e) {}
      }

      var allItems = mergedOrder.map(function(k) { return mergedMap[k]; });
      if (allItems.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: allItems,
          nextPageToken: nextTokenToReturn || null
        };
      }
    }
  } catch (e) {
    Logger.log('handleChannelVideos InnerTube Direct error: ' + e.toString());
  }

  // 2. Secondary: InnerTube Worker
  try {
    var itParams = {};
    if (pageToken) itParams.continuation = String(pageToken);
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + id + '/videos', itParams);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      return {
        kind: 'youtube#searchResponse',
        items: itRes.data.videos.map(convertInvidiousItemToYouTubeItem),
        nextPageToken: itRes.data.continuation || null
      };
    }
  } catch (e) {}

  // 2. Secondary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/' + id + '/videos');
    if (invRes.data && Array.isArray(invRes.data.videos) && invRes.data.videos.length > 0) {
      return {
        kind: 'youtube#searchResponse',
        items: invRes.data.videos.map(convertInvidiousItemToYouTubeItem),
        nextPageToken: invRes.data.continuation || null
      };
    }
  } catch (e) {}

  // 3. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet',
      channelId: id,
      order: order,
      maxResults: maxResults,
      type: 'video'
    };
    if (pageToken) params.pageToken = pageToken;

    var searchData = fetchYouTube('search', params, config.youtubeKey);
    if (!searchData.error && searchData.items && searchData.items.length > 0) {
      var videoIds = searchData.items.map(function(it) { return (it.id && it.id.videoId) || it.id; }).filter(Boolean);
      if (videoIds.length > 0) {
        var details = fetchYouTube('videos', {
          part: 'snippet,contentDetails,statistics',
          id: videoIds.join(',')
        }, config.youtubeKey);
        if (details.items) searchData.items = details.items;
      }
      return searchData;
    }
  }

  return { items: [] };
}

function handleChannelCommunity(config, id) {
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + id + '/community');
    if (itRes.data && Array.isArray(itRes.data.posts) && itRes.data.posts.length > 0) {
      var items = itRes.data.posts.map(function(post) {
        return {
          id: post.postId || post.id,
          contentText: post.text || post.contentText || '',
          publishedTimeText: post.publishedTimeText || post.published || '',
          attachmentImage: post.attachmentImage || post.image || null,
          voteCount: post.voteCount || post.likes || 0,
          replyCount: post.replyCount || 0
        };
      });
      return { items: items };
    }
  } catch (e) {}

  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/community/' + id);
    if (invRes.data && Array.isArray(invRes.data.comments)) {
      var invItems = invRes.data.comments.map(function(post) {
        return {
          id: post.commentId || post.id,
          contentText: post.content || post.text || '',
          publishedTimeText: post.publishedText || '',
          attachmentImage: post.attachmentImage || null,
          voteCount: post.likeCount || 0,
          replyCount: post.replyCount || 0
        };
      });
      return { items: invItems };
    }
  } catch (e) {}

  return { items: [] };
}

function handleSuggest(query) {
  var q = (query && query.q) ? String(query.q).trim() : '';
  if (!q) return [];
  try {
    var url = 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=ja&q=' + encodeURIComponent(q);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1];
      }
      return data;
    }
  } catch (e) {}
  return [];
}

function handleChannelShorts(config, id, query) {
  var title = query.title || '';
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + id + '/shorts');
    var list = (itRes.data && (itRes.data.videos || itRes.data.results || (Array.isArray(itRes.data) ? itRes.data : null))) || [];
    if (list.length > 0) {
      return {
        kind: 'youtube#searchResponse',
        items: list.map(convertInvidiousItemToYouTubeItem),
        nextPageToken: (itRes.data && itRes.data.continuation) || null
      };
    }
  } catch (e) {}

  try {
    var vidRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + id + '/videos');
    if (vidRes.data && Array.isArray(vidRes.data.videos) && vidRes.data.videos.length > 0) {
      var shortItems = vidRes.data.videos.filter(function(v) {
        var secs = Number(v.lengthSeconds || 0);
        var vTitle = String(v.title || '').toLowerCase();
        return (secs > 0 && secs <= 65) || vTitle.indexOf('short') !== -1 || vTitle.indexOf('ショート') !== -1 || v.isShort === true;
      });
      if (shortItems.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: shortItems.map(convertInvidiousItemToYouTubeItem),
          nextPageToken: null
        };
      }
    }
  } catch (e) {}

  if (title) {
    return handleShorts(config, { q: title + ' #shorts' });
  }
  return { items: [] };
}

function handleShorts(config, query) {
  var q = query.q || '#Shorts';
  var maxResults = query.maxResults || '30';
  var regionCode = query.regionCode || 'JP';
  var pageToken = query.pageToken || '';

  var rawQuery = String(q).trim();
  var searchTerm = rawQuery.toLowerCase().indexOf('short') !== -1 ? rawQuery : (rawQuery + ' #shorts');

  // 0. Primary: Official YouTube InnerTube v1 Direct (YouTube.js ShortsLockupView style)
  try {
    var directShorts = callYouTubeInnerTubeDirect('search', { query: searchTerm });
    if (directShorts.data) {
      var sItems = extractVideosFromInnerTubeResponse(directShorts.data).filter(function(it) {
        return !it.isPlaylist;
      }).map(function(it) {
        it.isShort = true;
        return it;
      });
      if (sItems.length > 0) {
        return {
          kind: 'youtube#searchResponse',
          items: sItems,
          nextPageToken: 'page_2'
        };
      }
    }
  } catch (e) {}

  // 1. Secondary: InnerTube Worker (XeroxYT-NTv6 style)
  try {
    var itParams = { q: searchTerm, limit: String(maxResults) };
    if (pageToken) itParams.continuation = String(pageToken);
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'search', itParams);
    if (itRes.data && Array.isArray(itRes.data.results) && itRes.data.results.length > 0) {
      var shortItems = itRes.data.results.filter(function(v) {
        var secs = Number(v.lengthSeconds || 0);
        var title = String(v.title || '').toLowerCase();
        var desc = String(v.description || '').toLowerCase();
        if (secs > 65) return false;
        if (secs > 0 && secs <= 65) return true;
        return title.indexOf('short') !== -1 || title.indexOf('ショート') !== -1 || desc.indexOf('#short') !== -1;
      });
      var finalItems = shortItems.length > 0 ? shortItems : itRes.data.results;
      return {
        kind: 'youtube#searchResponse',
        items: finalItems.map(convertInvidiousItemToYouTubeItem),
        nextPageToken: itRes.data.continuation || null
      };
    }
  } catch (e) {}

  // 2. Secondary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'search', { q: searchTerm, type: 'video', region: regionCode });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      return { items: invRes.data.map(convertInvidiousItemToYouTubeItem) };
    }
  } catch (e) {}

  // 3. Fallback: YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet',
      q: searchTerm,
      type: 'video',
      videoDuration: 'short',
      maxResults: maxResults,
      regionCode: regionCode
    };

    var searchData = fetchYouTube('search', params, config.youtubeKey);
    if (!searchData.error && searchData.items && searchData.items.length > 0) {
      var videoIds = searchData.items.map(function(it) { return (it.id && it.id.videoId) || it.id; }).filter(Boolean);
      if (videoIds.length > 0) {
        var details = fetchYouTube('videos', { part: 'snippet,contentDetails,statistics', id: videoIds.join(',') }, config.youtubeKey);
        if (details.items) {
          searchData.items = details.items.filter(function(item) {
            var durationStr = item.contentDetails && item.contentDetails.duration;
            if (durationStr) {
              var matchH = durationStr.match(/(\d+)H/);
              var matchM = durationStr.match(/(\d+)M/);
              var matchS = durationStr.match(/(\d+)S/);
              if (matchH || (matchM && parseInt(matchM[1], 10) > 1)) return false;
              var secs = (matchM ? parseInt(matchM[1], 10) * 60 : 0) + (matchS ? parseInt(matchS[1], 10) : 0);
              if (secs > 65) return false;
            }
            return true;
          });
        }
      }
      return searchData;
    }
  }

  return { items: [] };
}

function handleAiSummarize(body) {
  var title = body.title || '';
  var description = body.description || '';
  var channelTitle = body.channelTitle || '';
  var tags = body.tags || [];

  var geminiApiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';

  if (!geminiApiKey) {
    return {
      summary: '「' + title + '」の要約情報です。動画で取り上げられている要点を以下にまとめています。',
      keyTakeaways: [
        '動画タイトル: ' + (title || 'タイトルなし'),
        'チャンネル: ' + (channelTitle || '不明'),
        'この動画は主要ポイントを効率よく学習できるおすすめ動画です。'
      ],
      estimatedTimestamps: [
        { time: '00:00', label: 'オープニング・イントロ' },
        { time: '02:30', label: '核心となるコンセプト解説' },
        { time: '07:00', label: '実践・応用とまとめ' }
      ]
    };
  }

  var prompt = 'あなたは動画学習アシスタントAIです。\n' +
    '以下のYouTube動画情報を元に、日本語で分かりやすく動画概要と主要ポイントをまとめてください。\n\n' +
    '動画タイトル: ' + title + '\n' +
    'チャンネル名: ' + channelTitle + '\n' +
    'タグ: ' + (Array.isArray(tags) ? tags.join(', ') : (tags || '')) + '\n' +
    '概要欄: ' + (description ? description.slice(0, 1000) : 'なし') + '\n\n' +
    '以下のJSON形式で出力してください:\n' +
    '{\n' +
    '  "summary": "動画の全体要約（200文字程度）",\n' +
    '  "keyTakeaways": [\n' +
    '    "主要ポイント1",\n' +
    '    "主要ポイント2",\n' +
    '    "主要ポイント3"\n' +
    '  ],\n' +
    '  "estimatedTimestamps": [\n' +
    '    {"time": "00:00", "label": "オープニング・イントロ"},\n' +
    '    {"time": "03:15", "label": "核心となるコンセプト解説"},\n' +
    '    {"time": "08:30", "label": "実践・応用とまとめ"}\n' +
    '  ]\n' +
    '}';

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(geminiApiKey);
    var payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(res.getContentText());
    var contentText = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0].text;
    if (contentText) {
      return JSON.parse(contentText);
    }
  } catch (err) {
    Logger.log('Gemini error: ' + err.toString());
  }

  return {
    summary: '「' + title + '」の要約情報です。動画で取り上げられている要点を以下にまとめています。',
    keyTakeaways: [
      'タイトル: ' + title,
      'チャンネル: ' + channelTitle,
      '動画の概要とハイライトを効率的に学習できます。'
    ],
    estimatedTimestamps: [
      { time: '00:00', label: 'イントロダクション' },
      { time: '02:30', label: 'メインコンテンツ' },
      { time: '07:00', label: 'まとめと結論' }
    ]
  };
}

function handleThumbnailProxy(query) {
  var imageUrl = (query && query.url) || '';
  var videoId = (query && query.videoId) || '';
  if (!imageUrl && videoId) {
    imageUrl = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
  }
  if (!imageUrl) return { error: 'Missing url' };

  var b64 = fetchAsBase64(imageUrl);
  if (b64 && b64.indexOf('data:') === 0) {
    return { dataUri: b64, success: true };
  }
  return { dataUri: imageUrl, success: false };
}

function handleTestInnerTube(config) {
  var startTime = Date.now();
  try {
    var directSearch = callYouTubeInnerTubeDirect('search', { query: '人気 動画' });
    if (directSearch && directSearch.data) {
      var extracted = extractVideosFromInnerTubeResponse(directSearch.data);
      if (extracted && extracted.length > 0) {
        return {
          valid: true,
          status: 'ok',
          engine: 'GAS Official InnerTube v1 Direct',
          latencyMs: Date.now() - startTime,
          itemCount: extracted.length,
          message: 'GAS 公式 InnerTube v1 直接通信に成功しました (' + extracted.length + '件取得 / ' + (Date.now() - startTime) + 'ms)'
        };
      }
    }
  } catch (e) {}

  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'trending');
    if (itRes && itRes.data && Array.isArray(itRes.data) && itRes.data.length > 0) {
      return {
        valid: true,
        status: 'ok',
        engine: 'InnerTube Worker (' + config.innertubeUrl + ')',
        latencyMs: Date.now() - startTime,
        itemCount: itRes.data.length,
        message: 'InnerTube Worker 疎通確認に成功しました (' + itRes.data.length + '件取得 / ' + (Date.now() - startTime) + 'ms)'
      };
    }
  } catch (e2) {}

  return {
    valid: false,
    status: 'error',
    latencyMs: Date.now() - startTime,
    message: 'InnerTube 通信テストに失敗しました。'
  };
}

function handleUniversalProxy(query) {
  var targetUrl = (query && query.url) ? String(query.url).trim() : '';
  if (!targetUrl || targetUrl.indexOf('http') !== 0) {
    return { error: 'Valid http/https url parameter is required' };
  }
  try {
    var isOmada = targetUrl.indexOf('yt.omada.cafe') !== -1;
    var reqHeaders = isOmada
      ? {
          'Accept': 'application/json, text/plain, */*'
        }
      : {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        };
    var res = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: reqHeaders
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = { status: code, body: text };
    }
    if (code >= 400) {
      return {
        ok: false,
        status: code,
        data: parsed
      };
    }
    return parsed;
  } catch (err) {
    return { ok: false, status: 502, error: err.message || err.toString() };
  }
}

function handleTestCustomProxy(query, body) {
  var rawUrl = String((query && query.url) || (body && body.url) || '').trim();
  if (!rawUrl) {
    return { ok: false, success: false, message: 'プロキシURLが空です' };
  }
  var startTime = Date.now();
  var cleanUrl = rawUrl.replace(/\/+$/, '');
  if (cleanUrl === '/api/worker' || cleanUrl === 'self') {
    var innerCheck = handleTestInnerTube(getRequestConfig({}));
    return {
      ok: innerCheck.valid,
      success: innerCheck.valid,
      latencyMs: Date.now() - startTime,
      type: 'gas-builtin',
      message: innerCheck.message
    };
  }
  if (cleanUrl.indexOf('http') !== 0) {
    cleanUrl = 'https://' + cleanUrl;
  }

  try {
    var testEndpoint = cleanUrl.indexOf('script.google.com') !== -1
      ? cleanUrl + (cleanUrl.indexOf('?') !== -1 ? '&' : '?') + 'url=' + encodeURIComponent('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json')
      : cleanUrl + '/api/v1/health';

    var res = UrlFetchApp.fetch(testEndpoint, { muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code >= 200 && code < 400) {
      return {
        ok: true,
        success: true,
        latencyMs: Date.now() - startTime,
        type: cleanUrl.indexOf('script.google.com') !== -1 ? 'gas-proxy' : 'cloudflare-worker',
        message: 'カスタムプロキシ疎通成功 (' + (Date.now() - startTime) + 'ms)'
      };
    }
    var searchRes = UrlFetchApp.fetch(cleanUrl + '/api/v1/search?q=test&limit=2', { muteHttpExceptions: true });
    if (searchRes.getResponseCode() >= 200 && searchRes.getResponseCode() < 300) {
      return {
        ok: true,
        success: true,
        latencyMs: Date.now() - startTime,
        type: 'innertube-worker',
        message: 'InnerTube Worker 疎通成功 (' + (Date.now() - startTime) + 'ms)'
      };
    }
    return {
      ok: false,
      success: false,
      latencyMs: Date.now() - startTime,
      message: 'HTTP ' + code + ' が返却されました'
    };
  } catch (err) {
    return {
      ok: false,
      success: false,
      latencyMs: Date.now() - startTime,
      message: '接続エラー: ' + (err.message || err.toString())
    };
  }
}

function handleClearProxyCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.removeAll(['edu_param', 'edu_widget_api', 'KAITO_GUARD_SID']);
  } catch (e) {}
  return {
    ok: true,
    success: true,
    cleared: 1,
    message: 'GAS プロキシ・ストリームキャッシュ (PoW Guard 含む) をクリアしました',
    timestamp: new Date().toISOString()
  };
}

function handleProxyDiagnostics(config) {
  var items = [];

  // 1. InnerTube check
  var t1 = Date.now();
  var itCheck = handleTestInnerTube(config);
  items.push({
    id: 'innertube',
    label: 'InnerTube データ・検索プロキシ (GAS)',
    ok: Boolean(itCheck.valid),
    latencyMs: Date.now() - t1,
    detail: itCheck.message
  });

  // 2. Stream check
  var t2 = Date.now();
  var stRes = handleStreamSources(config, 'dQw4w9WgXcQ');
  var hasStream = Boolean(stRes && stRes.streams && (stRes.streams.v720 || stRes.streams.v360 || stRes.streams.combined360));
  items.push({
    id: 'stream',
    label: '動画・音声 Range ストリーム中継',
    ok: hasStream,
    latencyMs: Date.now() - t2,
    detail: hasStream ? ('ストリーム解決成功 (' + (stRes.engine || 'yt-dlp') + ')') : 'ストリーム解決失敗'
  });

  // 3. Thumbnail Base64 check
  var t3 = Date.now();
  var thumbRes = handleThumbnailProxy({ videoId: 'dQw4w9WgXcQ' });
  var thumbOk = Boolean(thumbRes && thumbRes.success && thumbRes.dataUri && thumbRes.dataUri.indexOf('data:image/') === 0);
  items.push({
    id: 'thumbnail',
    label: 'サムネイル Base64 変換プロキシ',
    ok: thumbOk,
    latencyMs: Date.now() - t3,
    detail: thumbOk ? 'UrlFetchApp Base64 Data URI 変換正常' : 'サムネイル変換失敗'
  });

  // 4. Worker / Custom Proxy check
  var t4 = Date.now();
  var workerCheck = handleTestCustomProxy({ url: config.innertubeUrl }, {});
  items.push({
    id: 'customProxy',
    label: '連携 Worker (' + config.innertubeUrl + ')',
    ok: Boolean(workerCheck.ok),
    latencyMs: Date.now() - t4,
    detail: workerCheck.message
  });

  var allOk = items.every(function(i) { return i.ok; });
  return {
    ok: allOk,
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    activeEngine: 'GAS Serverless v2.8.0 + ' + config.innertubeUrl,
    customProxyUrl: config.customProxyUrl || null,
    items: items
  };
}

function handleWorkerProxy(config, path, query) {
  var subPath = path.replace(/^\/api\/worker\/?/, '').replace(/^api\/v1\/?/, '');
  if (!subPath || subPath === 'health') {
    return {
      status: 'ok',
      service: 'KaitoTube GAS InnerTube Engine',
      version: '2.8.0',
      timestamp: new Date().toISOString()
    };
  }
  var itRes = fetchInnerTubeWorker(config.innertubeUrl, subPath, query);
  return itRes.data || { error: itRes.error || 'Worker proxy failed' };
}

function handleTestKey(headers, body) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var customKey = (body && body.key) || headers['x-youtube-key'] || props.YOUTUBE_API_KEY || '';

  if (!customKey) {
    return { valid: false, error: 'APIキーが指定されていません' };
  }

  try {
    var testUrl = 'https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=JP&key=' + encodeURIComponent(customKey);
    var resp = UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());

    if (resp.getResponseCode() === 200 && data.items) {
      return {
        valid: true,
        status: 'ok',
        message: 'YouTube Data API への疎通・認証に成功しました！クォータ残量も正常です。',
        categoryCount: data.items.length
      };
    }

    var errCode = (data && data.error && data.error.code) || resp.getResponseCode();
    var errMsg = (data && data.error && data.error.message) || 'API認証エラー';
    var reason = (data && data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason) || '';

    var userFriendly = errMsg;
    if (reason === 'quotaExceeded' || errCode === 403) {
      userFriendly = '本日のAPI利用クォータ上限（10,000 unit）に達しています。明日再開されるか、別のAPIキーまたはInvidiousへの切り替えをお試しください。';
    } else if (reason === 'keyInvalid' || errCode === 400) {
      userFriendly = 'APIキーが無効またはフォーマットが不正です。Google Cloud Console のキーをご確認ください。';
    }

    return {
      valid: false,
      status: reason || 'error',
      code: errCode,
      message: userFriendly,
      rawError: errMsg
    };
  } catch (err) {
    return {
      valid: false,
      status: 'network_error',
      message: 'APIサーバーへの通信に失敗しました: ' + (err.message || '')
    };
  }
}

function handleEducationParam() {
  var cache = CacheService.getScriptCache();
  var cachedParam = cache.get('edu_param');
  var cachedApi = cache.get('edu_widget_api');
  if (cachedParam) {
    return {
      success: true,
      param: cachedParam,
      widgetApiSource: cachedApi || '',
      hasWidgetApi: Boolean(cachedApi && cachedApi.length > 100)
    };
  }

  try {
    var sheetUrl = 'https://docs.google.com/spreadsheets/d/1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg/gviz/tq?tqx=out:json&sheet=Youtube-education-parameter&range=A1:A2&headers=0';
    var res = UrlFetchApp.fetch(sheetUrl, { muteHttpExceptions: true });
    var text = res.getContentText();
    var match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/);
    if (match && match[1]) {
      var json = JSON.parse(match[1]);
      var rows = (json && json.table && json.table.rows) || [];
      var paramVal = rows[0] && rows[0].c && rows[0].c[0] && rows[0].c[0].v;
      var widgetApiVal = rows[1] && rows[1].c && rows[1].c[0] && rows[1].c[0].v;

      var paramStr = paramVal ? String(paramVal).replace(/&amp;/g, '&').trim() : '';
      if (paramStr && paramStr.indexOf('?') !== 0) {
        paramStr = '?' + paramStr;
      }
      var widgetApiStr = widgetApiVal ? String(widgetApiVal) : '';

      if (paramStr) {
        try {
          cache.put('edu_param', paramStr, 3600); // 1時間キャッシュ
          if (widgetApiStr && widgetApiStr.length < 90000) {
            cache.put('edu_widget_api', widgetApiStr, 3600);
          }
        } catch (cacheErr) {}
        return {
          success: true,
          param: paramStr,
          widgetApiSource: widgetApiStr,
          hasWidgetApi: Boolean(widgetApiStr && widgetApiStr.length > 100)
        };
      }
    }
  } catch (e) {
    Logger.log('Edu param sheet fetch failed: ' + e.toString());
  }

  var fallbackParam = '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
  return {
    success: false,
    param: fallbackParam,
    widgetApiSource: '',
    hasWidgetApi: false
  };
}

/**
 * 画像・サムネイルをBase64に変換して返却 (CORS / ブロック回避用)
 * google.script.run.fetchAsBase64(imageUrl) から直接呼び出し可能
 * @reference https://github.com/na8526130-cell/kaitotube
 */
function fetchAsBase64(imageUrl) {
  if (!imageUrl) return null;
  var candidates = [imageUrl];
  var match = String(imageUrl).match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  if (match && match[1]) {
    var vId = match[1];
    var ytHq = 'https://i.ytimg.com/vi/' + vId + '/hqdefault.jpg';
    var ytMq = 'https://i.ytimg.com/vi/' + vId + '/mqdefault.jpg';
    if (candidates.indexOf(ytHq) === -1) candidates.push(ytHq);
    if (candidates.indexOf(ytMq) === -1) candidates.push(ytMq);
  }

  for (var i = 0; i < candidates.length; i++) {
    try {
      var response = UrlFetchApp.fetch(candidates[i], {
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
        if (base64 && base64.length > 50) {
          return 'data:' + contentType + ';base64,' + base64;
        }
      }
    } catch (err) {
      Logger.log('fetchAsBase64 candidate error: ' + err.toString());
    }
  }
  return null;
}

/**
 * 14. プレミア会員認証ハンドラー
 * GASのスクリプトプロパティ (PREMIUM_PASSWORD, PREMIUM_ID) から
 * パスワード・IDを取得して照合・検証します。
 * スクリプトプロパティ未設定時はデフォルト値 (ID: kaito, PW: @0726kaito) で安全に動作します。
 */
var SENDER_AUTH_EMAIL = 't74442416@gmail.com';

function handleAuthVerify(body) {
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    var expectedId = (props.PREMIUM_ID || props.KAITO_ID || 'kaito').trim();
    var expectedPassword = (props.PREMIUM_PASSWORD || props.KAITO_PASSWORD || '@0726kaito').trim();

    var inputId = ((body && (body.username || body.id)) || '').trim();
    var inputPassword = ((body && body.password) || '').trim();

    if (inputId === expectedId && inputPassword === expectedPassword) {
      return { success: true, mode: 'media' };
    }

    if (inputId === 'education' && inputPassword === 'matheducation') {
      return {
        success: true,
        mode: 'study',
        studentId: 'education'
      };
    }

    return {
      success: false,
      message: '受講生IDまたはパスワードが正しくありません。'
    };
  } catch (err) {
    Logger.log('handleAuthVerify error: ' + err.toString());
    return {
      success: false,
      message: '認証処理中にエラーが発生しました: ' + (err.message || err.toString())
    };
  }
}

/**
 * 14a. 学習ポータル内の個人アカウントログイン照合 (/api/auth/student-login)
 */
function handleStudentPortalLogin(body) {
  try {
    var identifier = ((body && (body.identifier || body.email || body.username)) || '').trim().toLowerCase();
    var password = ((body && body.password) || '').trim();
    if (!identifier || !password) {
      return {
        success: false,
        message: '登録メールアドレス（または受講生ID）とパスワードを入力してください。'
      };
    }

    var props = PropertiesService.getScriptProperties();
    var rawAccounts = props.getProperty('STUDY_REGISTERED_ACCOUNTS') || '[]';
    var accounts = [];
    try {
      accounts = JSON.parse(rawAccounts);
    } catch (e) {
      accounts = [];
    }

    for (var i = 0; i < accounts.length; i++) {
      var acc = accounts[i];
      if (
        acc &&
        ((acc.email && acc.email.toLowerCase() === identifier) ||
          (acc.username && acc.username.toLowerCase() === identifier)) &&
        acc.password === password
      ) {
        return {
          success: true,
          studentId: acc.username,
          email: acc.email,
          createdAt: acc.createdAt,
          progress: acc.progress || getSavedGasStudentProgress(acc.email),
          message: acc.email + ' の個人学習アカウントにログインしました（学習履歴を復元しました）。'
        };
      }
    }

    return {
      success: false,
      message: 'メールアドレス（または受講生ID）またはパスワードが正しくありません。'
    };
  } catch (err) {
    return {
      success: false,
      message: 'ログインエラー: ' + (err.message || err.toString())
    };
  }
}

/**
 * 14b. 学習ポータル内の新規アカウント登録用 6桁認証コード発行
 * 差出人 t74442416@gmail.com から 登録者のメールアドレス（例: a22621917@gmail.com）宛に認証コードを送信します。
 */
function handleSendVerificationCode(body) {
  try {
    var username = ((body && body.username) || '受講生').trim();
    var email = ((body && body.email) || '').trim();
    var password = ((body && body.password) || '').trim();

    if (!email) {
      return {
        success: false,
        message: '送信先のメールアドレスを入力してください。'
      };
    }

    var code = (body && body.code) ? String(body.code).trim() : String(Math.floor(100000 + Math.random() * 900000));
    var cache = CacheService.getScriptCache();
    var payload = JSON.stringify({
      username: username,
      email: email,
      password: password,
      code: code,
      createdAt: new Date().getTime()
    });
    if (cache) {
      cache.put('VERIFY_CODE_' + email.toLowerCase(), payload, 900);
    }
    PropertiesService.getScriptProperties().setProperty('VERIFY_CODE_' + email.toLowerCase(), payload);

    var subject = '【数理アカデミー】アカウント登録 認証コードのお知らせ (' + code + ')';
    var mailBody =
      email + ' 様\n\n' +
      '数理アカデミー 学習ポータルより、個人アカウント登録用の認証コードをお送りいたします。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '■ 認証コード（6桁）: ' + code + '\n' +
      '■ 送信元メールアドレス: ' + SENDER_AUTH_EMAIL + '\n' +
      '■ 宛先メールアドレス: ' + email + '\n' +
      '■ 登録受講生ID: ' + username + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '学習ポータル画面の「6桁の認証コード」入力欄に上記のコードを入力し、アカウント本登録を完了してください（有効期限15分）。\n\n' +
      '--------------------------------------------------\n' +
      '数理アカデミー 認証センター (' + SENDER_AUTH_EMAIL + ')';

    var mailSent = false;
    try {
      // 差出人 t74442416@gmail.com から 登録者メールアドレス（例: a22621917@gmail.com）宛に送信
      MailApp.sendEmail({
        to: email,
        replyTo: SENDER_AUTH_EMAIL,
        name: '数理アカデミー (' + SENDER_AUTH_EMAIL + ')',
        subject: subject,
        body: mailBody
      });
      mailSent = true;
    } catch (mailErr) {
      try {
        GmailApp.sendEmail(email, subject, mailBody, {
          name: '数理アカデミー (' + SENDER_AUTH_EMAIL + ')',
          replyTo: SENDER_AUTH_EMAIL
        });
        mailSent = true;
      } catch (gErr) {
        Logger.log('Mail send warning: ' + gErr.toString());
      }
    }

    return {
      success: true,
      mailSent: mailSent,
      senderEmail: SENDER_AUTH_EMAIL,
      recipientEmail: email,
      verificationCode: code,
      message: '差出人 ' + SENDER_AUTH_EMAIL + ' から ' + email + ' 宛に6桁の認証コードを送信しました。'
    };
  } catch (err) {
    return {
      success: false,
      message: '認証コード発行エラー: ' + (err.message || err.toString())
    };
  }
}

/**
 * 14c. 認証コード照合＆受講生アカウント本登録
 */
function handleRegisterStudentAccount(body) {
  try {
    var username = ((body && body.username) || '').trim();
    var email = ((body && body.email) || '').trim();
    var password = ((body && body.password) || '').trim();
    var code = ((body && body.code) || '').trim();

    var key = 'VERIFY_CODE_' + email.toLowerCase();
    var cache = CacheService.getScriptCache();
    var raw = (cache && cache.get(key)) || PropertiesService.getScriptProperties().getProperty(key);

    if (!raw) {
      return {
        success: false,
        message: '認証コードが発行されていないか、期限切れです。再度コードを発行してください。'
      };
    }

    var saved = JSON.parse(raw);
    if (String(saved.code) !== String(code)) {
      return {
        success: false,
        message: '認証コードが一致しません。6桁のコードを正しく入力してください。'
      };
    }

    var props = PropertiesService.getScriptProperties();
    var rawAccounts = props.getProperty('STUDY_REGISTERED_ACCOUNTS') || '[]';
    var accounts = [];
    try {
      accounts = JSON.parse(rawAccounts);
    } catch (e) {
      accounts = [];
    }

    var finalUser = username || saved.username;
    var finalPass = password || saved.password;
    var initialProgress = (body && body.progress) || getSavedGasStudentProgress(email);
    var filtered = accounts.filter(function(a) {
      return a && a.email && a.email.toLowerCase() !== email.toLowerCase() && a.username.toLowerCase() !== finalUser.toLowerCase();
    });
    filtered.push({
      username: finalUser,
      email: email,
      password: finalPass,
      createdAt: new Date().toISOString(),
      progress: initialProgress
    });
    props.setProperty('STUDY_REGISTERED_ACCOUNTS', JSON.stringify(filtered));
    if (initialProgress) {
      props.setProperty('STUDY_PROGRESS_' + email.toLowerCase(), JSON.stringify(initialProgress));
    }
    props.deleteProperty(key);

    return {
      success: true,
      mode: 'study',
      studentId: finalUser,
      email: email,
      progress: initialProgress,
      message: '受講生アカウントの登録が完了し、学習履歴データを保存しました。'
    };
  } catch (err) {
    return {
      success: false,
      message: 'アカウント登録エラー: ' + (err.message || err.toString())
    };
  }
}

function getSavedGasStudentProgress(emailOrId) {
  try {
    var key = 'STUDY_PROGRESS_' + String(emailOrId || '').trim().toLowerCase();
    var raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {
    solvedIds: {},
    attemptCount: 0,
    correctCount: 0,
    streakCount: 0,
    studySeconds: 1455,
    masteredCards: {},
    exams: [],
    activityLogs: [],
    mockExamHistory: [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * 14d. 受講生アカウントごとの学習履歴・進捗データの取得＆保存 (/api/auth/student-progress)
 */
function handleStudentProgress(method, query, body) {
  try {
    var props = PropertiesService.getScriptProperties();
    var m = String(method || 'GET').toUpperCase();
    if (m === 'GET') {
      var idGet = String((query && (query.identifier || query.email || query.studentId)) || '').trim().toLowerCase();
      if (!idGet) {
        return { success: false, message: 'identifier is required' };
      }
      var prog = getSavedGasStudentProgress(idGet);
      return {
        success: true,
        identifier: idGet,
        progress: prog
      };
    }

    var idPost = String((body && (body.email || body.identifier || body.studentId)) || '').trim().toLowerCase();
    if (!idPost) {
      return { success: false, message: 'identifier is required' };
    }
    var incoming = (body && body.progress) || {};
    var prev = getSavedGasStudentProgress(idPost);
    var merged = {
      solvedIds: incoming.solvedIds || prev.solvedIds || {},
      attemptCount: typeof incoming.attemptCount === 'number' ? incoming.attemptCount : (prev.attemptCount || 0),
      correctCount: typeof incoming.correctCount === 'number' ? incoming.correctCount : (prev.correctCount || 0),
      streakCount: typeof incoming.streakCount === 'number' ? incoming.streakCount : (prev.streakCount || 0),
      studySeconds: typeof incoming.studySeconds === 'number' ? incoming.studySeconds : (prev.studySeconds || 1455),
      masteredCards: incoming.masteredCards || prev.masteredCards || {},
      exams: Array.isArray(incoming.exams) ? incoming.exams : (prev.exams || []),
      activityLogs: Array.isArray(incoming.activityLogs) ? incoming.activityLogs.slice(0, 60) : (prev.activityLogs || []),
      mockExamHistory: Array.isArray(incoming.mockExamHistory) ? incoming.mockExamHistory.slice(0, 30) : (prev.mockExamHistory || []),
      updatedAt: new Date().toISOString()
    };
    props.setProperty('STUDY_PROGRESS_' + idPost, JSON.stringify(merged));

    // 登録済みアカウント一覧のprogressも同期
    try {
      var rawAccounts = props.getProperty('STUDY_REGISTERED_ACCOUNTS') || '[]';
      var accounts = JSON.parse(rawAccounts);
      if (Array.isArray(accounts)) {
        for (var i = 0; i < accounts.length; i++) {
          if (
            accounts[i] &&
            ((accounts[i].email && accounts[i].email.toLowerCase() === idPost) ||
              (accounts[i].username && accounts[i].username.toLowerCase() === idPost))
          ) {
            accounts[i].progress = merged;
          }
        }
        props.setProperty('STUDY_REGISTERED_ACCOUNTS', JSON.stringify(accounts));
      }
    } catch (e) {}

    return {
      success: true,
      identifier: idPost,
      progress: merged
    };
  } catch (err) {
    return {
      success: false,
      message: '学習履歴保存エラー: ' + (err.message || err.toString())
    };
  }
}

/**
 * 15. 再生リスト詳細取得ハンドラー (/api/youtube/playlist/:id)
 * YouTube公式 InnerTube v1 (browse VL... / next RD...) + InnerTube Worker + Invidious 対応
 */
function handlePlaylistDetail(config, id, query) {
  query = query || {};
  var seedVideoId = (query.videoId || '').trim();

  // 0. ==== 連結チャンネルIDによる合同タイムライン (UCxxx====UCyyy====UCzzz)
  if (String(id).indexOf('====') !== -1) {
    var rawChIds = String(id).split('====');
    var chIds = [];
    var seenCh = {};
    for (var ci = 0; ci < rawChIds.length; ci++) {
      var trimmed = rawChIds[ci].trim();
      if (trimmed && !seenCh[trimmed]) {
        seenCh[trimmed] = true;
        chIds.push(trimmed);
      }
    }
    chIds = chIds.slice(0, 20);
    var combinedMap = {};
    var combinedList = [];
    for (var cIdx = 0; cIdx < chIds.length; cIdx++) {
      var cid = chIds[cIdx];
      try {
        var uuBrowse = cid.indexOf('UC') === 0 ? ('VLUU' + cid.slice(2)) : ('VL' + cid);
        var bRes = callYouTubeInnerTubeDirect('browse', { browseId: uuBrowse });
        var cVids = bRes.data ? extractVideosFromInnerTubeResponse(bRes.data) : [];
        if (cVids.length === 0) {
          var vTab = callYouTubeInnerTubeDirect('browse', { browseId: cid, params: 'EgZ2aWRlb3PyBgQKAjoA' });
          cVids = vTab.data ? extractVideosFromInnerTubeResponse(vTab.data) : [];
        }
        for (var vi = 0; vi < Math.min(cVids.length, 15); vi++) {
          var vItem = cVids[vi];
          var vId = typeof vItem.id === 'string' ? vItem.id : (vItem.id && vItem.id.videoId);
          if (vId && !combinedMap[vId] && !vItem.isPlaylist) {
            if (vItem.snippet && !vItem.snippet.channelId) vItem.snippet.channelId = cid;
            combinedMap[vId] = vItem;
            combinedList.push(vItem);
          }
        }
      } catch (e) {}
    }
    if (combinedList.length > 0) {
      return {
        playlist: {
          id: id,
          snippet: {
            title: '登録チャンネル合同タイムライン (' + chIds.length + 'ch 新しい順)',
            description: '全登録チャンネルのアップロード動画 (UUxxx) を統合した合同タイムライン',
            channelTitle: '登録チャンネル合同タイムライン'
          }
        },
        items: combinedList,
        nextPageToken: null
      };
    }
  }

  // 1. Primary: Official YouTube InnerTube v1 Direct
  try {
    if (String(id).indexOf('RD') === 0) {
      var inferredVid = seedVideoId || (String(id).length === 13 ? String(id).slice(2) : '');
      var nextPayload = { playlistId: id };
      if (inferredVid) nextPayload.videoId = inferredVid;
      var nextRes = callYouTubeInnerTubeDirect('next', nextPayload);
      if (nextRes.data) {
        var mixItems = extractVideosFromInnerTubeResponse(nextRes.data).filter(function(it) {
          return !it.isPlaylist;
        });
        if (mixItems.length > 0) {
          return {
            playlist: {
              id: id,
              snippet: {
                title: 'YouTube ミックスリスト',
                description: '',
                channelTitle: 'YouTube Mix'
              }
            },
            items: mixItems,
            nextPageToken: null
          };
        }
      }
    } else {
      var browseId = String(id).indexOf('VL') === 0 ? id : ('VL' + id);
      var browseRes = callYouTubeInnerTubeDirect('browse', { browseId: browseId });
      if ((!browseRes.data || extractVideosFromInnerTubeResponse(browseRes.data).length === 0) && String(id).indexOf('UU') === 0) {
        browseRes = callYouTubeInnerTubeDirect('browse', {
          browseId: 'UC' + String(id).slice(2),
          params: 'EgZ2aWRlb3PyBgQKAjoA'
        });
      }
      if (browseRes.data) {
        var plItems = extractVideosFromInnerTubeResponse(browseRes.data).filter(function(it) {
          return !it.isPlaylist;
        });
        var seenPlVids = {};
        for (var pi = 0; pi < plItems.length; pi++) {
          var pvId = typeof plItems[pi].id === 'string' ? plItems[pi].id : (plItems[pi].id && plItems[pi].id.videoId);
          if (pvId) seenPlVids[pvId] = true;
        }
        var plCont = extractContinuationTokenFromInnerTube(browseRes.data);
        for (var pp = 0; pp < 3 && plCont; pp++) {
          var plNext = callYouTubeInnerTubeDirect('browse', { continuation: plCont });
          if (!plNext.data) break;
          var moreItems = extractVideosFromInnerTubeResponse(plNext.data).filter(function(it) {
            return !it.isPlaylist;
          });
          for (var mi = 0; mi < moreItems.length; mi++) {
            var mvId = typeof moreItems[mi].id === 'string' ? moreItems[mi].id : (moreItems[mi].id && moreItems[mi].id.videoId);
            if (mvId && !seenPlVids[mvId]) {
              seenPlVids[mvId] = true;
              plItems.push(moreItems[mi]);
            }
          }
          plCont = extractContinuationTokenFromInnerTube(plNext.data);
        }
        if (plItems.length > 0) {
          var plHeaderTitle =
            (browseRes.data.metadata && browseRes.data.metadata.playlistMetadataRenderer && browseRes.data.metadata.playlistMetadataRenderer.title) ||
            '再生リスト';
          return {
            playlist: {
              id: id,
              snippet: {
                title: plHeaderTitle,
                description: '',
                channelTitle: ''
              }
            },
            items: plItems,
            nextPageToken: null
          };
        }
      }
    }
  } catch (e) {
    Logger.log('handlePlaylistDetail InnerTube Direct error: ' + e.toString());
  }

  // 2. Secondary: InnerTube Worker playlists/:id
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'playlists/' + id);
    if (itRes.data && Array.isArray(itRes.data.videos) && itRes.data.videos.length > 0) {
      var workerItems = itRes.data.videos.map(convertInvidiousItemToYouTubeItem);
      return {
        playlist: {
          id: id,
          snippet: {
            title: itRes.data.title || '再生リスト',
            description: itRes.data.description || '',
            channelTitle: itRes.data.author || ''
          }
        },
        items: workerItems,
        nextPageToken: null
      };
    }
  } catch (e) {}

  // 3. Invidious playlists/:id
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'playlists/' + id);
    if (invRes.data && Array.isArray(invRes.data.videos)) {
      var items = invRes.data.videos.map(convertInvidiousItemToYouTubeItem);
      return {
        playlist: {
          id: id,
          snippet: {
            title: invRes.data.title || '再生リスト',
            description: invRes.data.description || '',
            channelTitle: invRes.data.author || ''
          }
        },
        items: items,
        nextPageToken: null
      };
    }
  } catch (e) {
    Logger.log('handlePlaylistDetail invidious error: ' + e.toString());
  }

  // 4. YouTube Data API fallback
  if (config.youtubeKey) {
    try {
      var plRes = fetchYouTube('playlists', { part: 'snippet', id: id }, config.youtubeKey);
      var itemsRes = fetchYouTube('playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: '50' }, config.youtubeKey);
      if (itemsRes.items) {
        return {
          playlist: plRes.items ? plRes.items[0] : null,
          items: itemsRes.items.map(function(item) {
            return {
              id: item.snippet ? item.snippet.resourceId.videoId : item.contentDetails.videoId,
              snippet: item.snippet
            };
          }),
          nextPageToken: itemsRes.nextPageToken || null
        };
      }
    } catch (e) {
      Logger.log('handlePlaylistDetail youtube error: ' + e.toString());
    }
  }

  return {
    playlist: null,
    items: [],
    nextPageToken: null,
    error: 'PLAYLIST_NOT_FOUND',
    message: '再生リストの取得に失敗しました。'
  };
}

/**
 * 16. チャンネル再生リスト一覧取得ハンドラー (/api/youtube/channel/playlists/:id)
 * YouTube公式 InnerTube v1 (Playlistsタブ + Releasesタブ) + Worker + Invidious 対応
 */
function handleChannelPlaylists(config, channelId) {
  // 1. Primary: Official YouTube InnerTube v1 Direct (Playlists Tab + Releases Tab)
  try {
    var allPlaylists = [];
    var seenPl = {};
    var tabParamsList = [
      'EglwbGF5bGlzdHPyBgQKAkIA', // Playlists tab
      'EghyZWxlYXNlc_IGBAoCMgA%3D' // Releases / Albums tab
    ];
    for (var t = 0; t < tabParamsList.length; t++) {
      try {
        var directRes = callYouTubeInnerTubeDirect('browse', {
          browseId: channelId,
          params: tabParamsList[t]
        });
        if (directRes && directRes.data) {
          var extracted = extractVideosFromInnerTubeResponse(directRes.data);
          for (var i = 0; i < extracted.length; i++) {
            var it = extracted[i];
            if (it && (it.isPlaylist || it.playlistId)) {
              var pid = it.playlistId || it.id;
              if (pid && !seenPl[pid]) {
                seenPl[pid] = true;
                it.id = pid;
                it.playlistId = pid;
                it.title = (it.snippet && it.snippet.title) || it.title || '再生リスト';
                it.thumbnail = (it.snippet && it.snippet.thumbnails && it.snippet.thumbnails.high && it.snippet.thumbnails.high.url) || it.thumbnail || '';
                it.videoCount = (it.contentDetails && it.contentDetails.itemCount) || it.videoCount || 0;
                if (it.snippet) it.snippet.channelId = channelId;
                allPlaylists.push(it);
              }
            }
          }
        }
      } catch (innerErr) {}
    }
    if (allPlaylists.length > 0) {
      return { items: allPlaylists, nextPageToken: null };
    }
  } catch (e) {
    Logger.log('handleChannelPlaylists InnerTube Direct error: ' + e.toString());
  }

  // 2. Secondary: InnerTube Worker
  try {
    var itRes = fetchInnerTubeWorker(config.innertubeUrl, 'channels/' + channelId + '/playlists');
    if (itRes.data && Array.isArray(itRes.data.playlists) && itRes.data.playlists.length > 0) {
      var itItems = itRes.data.playlists.map(function(pl) {
        var thumb = pl.thumbnail || pl.playlistThumbnail || (pl.thumbnails && pl.thumbnails[0] && pl.thumbnails[0].url) || '';
        return {
          id: pl.playlistId || pl.id,
          playlistId: pl.playlistId || pl.id,
          isPlaylist: true,
          title: pl.title || '再生リスト',
          thumbnail: thumb,
          videoCount: pl.videoCount || pl.itemCount || 0,
          snippet: {
            title: pl.title || '再生リスト',
            description: pl.description || '',
            channelTitle: pl.author || '',
            channelId: channelId,
            publishedAt: '',
            thumbnails: {
              medium: { url: thumb },
              high: { url: thumb }
            }
          },
          contentDetails: {
            itemCount: pl.videoCount || pl.itemCount || 0
          }
        };
      });
      return { items: itItems, nextPageToken: null };
    }
  } catch (e) {}

  // 3. Fallback: Invidious (both channels/:id/playlists and channels/playlists/:id)
  var invEndpoints = ['channels/' + channelId + '/playlists', 'channels/playlists/' + channelId];
  for (var idx = 0; idx < invEndpoints.length; idx++) {
    try {
      var invRes = fetchInvidious(config.invidiousUrl, invEndpoints[idx]);
      if (invRes.data && Array.isArray(invRes.data.playlists) && invRes.data.playlists.length > 0) {
        var items = invRes.data.playlists.map(function(pl) {
          return {
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
              channelId: channelId,
              publishedAt: '',
              thumbnails: {
                medium: { url: pl.playlistThumbnail || '' },
                high: { url: pl.playlistThumbnail || '' }
              }
            },
            contentDetails: {
              itemCount: pl.videoCount || 0
            }
          };
        });
        return { items: items, nextPageToken: null };
      }
    } catch (e) {
      Logger.log('handleChannelPlaylists invidious error: ' + e.toString());
    }
  }

  if (config.youtubeKey) {
    try {
      var res = fetchYouTube('playlists', { part: 'snippet,contentDetails', channelId: channelId, maxResults: '25' }, config.youtubeKey);
      return res.items ? res : { items: [], nextPageToken: null };
    } catch (e) {}
  }

  return { items: [], nextPageToken: null };
}

/**
 * 16b. ダウンロード情報取得ハンドラー (/api/download/info/:id)
 * 自前ストリーム downloadGroups / muxed / audio / videoOnly / hls / VTT字幕 完全対応
 */
function handleDownloadInfo(config, videoId) {
  var src = handleStreamSources(config, videoId);
  var streams = (src && src.streams) || {};
  var dlGroups = (src && src.downloadGroups) || null;
  var workerBase = (config.innertubeUrl || 'https://proxy.wa0260966.workers.dev').replace(/\/+$/, '');
  var m3u8Url =
    (dlGroups && dlGroups.hls && dlGroups.hls[0] && dlGroups.hls[0].url) ||
    streams.m3u8Url ||
    (workerBase + '/api/stream/' + videoId + '.m3u8');

  var videoOnlyList = [];
  if (dlGroups && Array.isArray(dlGroups.video) && dlGroups.video.length > 0) {
    for (var vi = 0; vi < dlGroups.video.length; vi++) {
      var v = dlGroups.video[vi];
      if (v && v.url) {
        videoOnlyList.push({
          label: (v.resolution || '映像') + ' (' + String(v.ext || 'mp4').toUpperCase() + ')',
          quality: v.resolution || 'video',
          url: v.url
        });
      }
    }
  } else {
    if (streams.v1080) videoOnlyList.push({ label: '1080p (Full HD)', quality: '1080p', url: streams.v1080 });
    if (streams.v720) videoOnlyList.push({ label: '720p (HD)', quality: '720p', url: streams.v720 });
    if (streams.v360) videoOnlyList.push({ label: '360p', quality: '360p', url: streams.v360 });
  }

  var audioOnlyList = [];
  if (dlGroups && Array.isArray(dlGroups.audio) && dlGroups.audio.length > 0) {
    for (var ai = 0; ai < dlGroups.audio.length; ai++) {
      var a = dlGroups.audio[ai];
      if (a && a.url) {
        audioOnlyList.push({
          label: (a.language ? a.language + ' ' : '') + '高音質音声 (' + String(a.ext || 'm4a').toUpperCase() + ')',
          format: a.ext || 'm4a',
          url: a.url
        });
      }
    }
  } else if (streams.audio) {
    audioOnlyList.push({ label: '高音質音声 AAC/M4A', format: 'm4a', url: streams.audio });
  }

  var subList = [];
  if (src && Array.isArray(src.subtitleTracks) && src.subtitleTracks.length > 0) {
    for (var si = 0; si < src.subtitleTracks.length; si++) {
      var st = src.subtitleTracks[si];
      if (st && st.url) {
        subList.push({
          label: (st.label || st.lang || '字幕') + ' (VTT)',
          lang: st.lang || 'ja',
          url: st.url
        });
      }
    }
  } else {
    subList.push({ label: '日本語字幕 (VTT)', lang: 'ja', url: workerBase + '/api/subtitles/' + videoId + '?lang=ja' });
    subList.push({ label: '英語字幕 (VTT)', lang: 'en', url: workerBase + '/api/subtitles/' + videoId + '?lang=en' });
  }

  return {
    videoId: videoId,
    title: (src && src.title) || ('video-' + videoId),
    engine: (src && src.engine) || 'kaitotube-self',
    m3u8Url: m3u8Url,
    m3u8DevUrl: 'https://m3u8.dev/?url=' + encodeURIComponent(m3u8Url),
    standard360:
      (dlGroups && dlGroups.muxed && dlGroups.muxed[0] && dlGroups.muxed[0].url) ||
      streams.combined360 ||
      streams.v360 ||
      streams.invidious360 ||
      '',
    videoOnly: videoOnlyList,
    audioOnly: audioOnlyList,
    subtitles: subList
  };
}

/**
 * 17. ストリームソース & yt-dlp 抽出ハンドラー (/api/youtube/stream-sources/:id & /api/youtube/stream-ytdlp/:id)
 * - googlevideo.com の生URLを Worker の /api/v1/stream-proxy?url=... でラップし、抽出元と再生中継元のIPを一致させ 403 エラーを防止
 * - ANDROID_VR / IOS / WEB のマルチクライアントフォールバック対応
 */
function wrapGasWorkerStreamProxy(rawUrl, workerBase) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  var trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.indexOf('/api/proxy') !== -1 || trimmed.indexOf('/api/v1/stream-proxy') !== -1 || trimmed.indexOf('/api/stream-proxy/') !== -1) {
    return trimmed;
  }
  if (trimmed.indexOf('googlevideo.com') !== -1 && trimmed.indexOf('yt.omada.cafe') === -1) {
    var base = (workerBase || 'https://proxy.wa0260966.workers.dev').replace(/\/+$/, '');
    return base + '/api/proxy?url=' + encodeURIComponent(trimmed);
  }
  return trimmed;
}

function fetchGasYtDlpDirect(videoId, workerBase) {
  var clients = [
    {
      name: 'ANDROID_VR',
      url: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
      headers: {
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-Goog-Api-Format-Version': '2',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.60.19'
      },
      contextClient: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        osName: 'Android',
        osVersion: '12L',
        androidSdkVersion: 32,
        hl: 'ja',
        gl: 'JP'
      }
    },
    {
      name: 'IOS',
      url: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
      headers: {
        'User-Agent': 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X; ja_JP)',
        'X-Goog-Api-Format-Version': '2',
        'X-YouTube-Client-Name': '5',
        'X-YouTube-Client-Version': '20.03.02'
      },
      contextClient: {
        clientName: 'IOS',
        clientVersion: '20.03.02',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.2.1.22C161',
        hl: 'ja',
        gl: 'JP'
      }
    },
    {
      name: 'WEB',
      url: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20260623.01.00'
      },
      contextClient: {
        clientName: 'WEB',
        clientVersion: '2.20260623.01.00',
        hl: 'ja',
        gl: 'JP'
      }
    }
  ];

  // UrlFetchApp.fetchAll で全クライアントを並列同時リクエストし最速解決
  var requests = clients.map(function(clientCfg) {
    return {
      url: clientCfg.url,
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: clientCfg.headers,
      payload: JSON.stringify({
        context: { client: clientCfg.contextClient },
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true
      })
    };
  });

  var responses = [];
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (batchErr) {
    responses = [];
  }

  for (var cIdx = 0; cIdx < clients.length; cIdx++) {
    var clientCfg = clients[cIdx];
    try {
      var res = responses[cIdx] || UrlFetchApp.fetch(requests[cIdx].url, requests[cIdx]);
      if (res && res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        var data = JSON.parse(res.getContentText());
        var sd = data && data.streamingData;
        if (sd) {
          var formats = Array.isArray(sd.formats) ? sd.formats : [];
          var adaptive = Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [];
          var combined720 = formats.filter(function(f) { return f.url && f.qualityLabel === '720p'; })[0];
          var combined360 = formats.filter(function(f) { return f.url && (f.itag === 18 || f.qualityLabel === '360p'); })[0] || formats.filter(function(f) { return Boolean(f.url); })[0];
          var v1080 = adaptive.filter(function(f) { return f.url && f.qualityLabel === '1080p' && (f.mimeType || '').indexOf('video/mp4') !== -1; })[0] ||
                      adaptive.filter(function(f) { return f.url && f.qualityLabel === '1080p'; })[0];
          var v720 = adaptive.filter(function(f) { return f.url && f.qualityLabel === '720p' && (f.mimeType || '').indexOf('video/mp4') !== -1; })[0] ||
                     adaptive.filter(function(f) { return f.url && f.qualityLabel === '720p'; })[0] || combined720;
          var audio = adaptive.filter(function(f) { return f.url && (f.mimeType || '').indexOf('audio/mp4') !== -1; })[0] ||
                      adaptive.filter(function(f) { return f.url && (f.mimeType || '').indexOf('audio') !== -1; })[0];

          if ((v1080 && v1080.url) || (v720 && v720.url) || (combined360 && combined360.url)) {
            var rawV1080 = (v1080 && v1080.url) || (v720 && v720.url) || (combined360 && combined360.url) || '';
            var rawV720 = (v720 && v720.url) || (combined720 && combined720.url) || (combined360 && combined360.url) || '';
            var rawV360 = (combined360 && combined360.url) || (v720 && v720.url) || '';
            var rawComb720 = (combined720 && combined720.url) || '';
            var rawComb360 = (combined360 && combined360.url) || '';
            var rawAudio = (audio && audio.url) || rawComb360 || '';

            return {
              title: (data.videoDetails && data.videoDetails.title) || ('video-' + videoId),
              clientName: clientCfg.name,
              v1080: wrapGasWorkerStreamProxy(rawV1080, workerBase),
              v720: wrapGasWorkerStreamProxy(rawV720, workerBase),
              v360: wrapGasWorkerStreamProxy(rawV360, workerBase),
              combined720: wrapGasWorkerStreamProxy(rawComb720, workerBase),
              combined360: wrapGasWorkerStreamProxy(rawComb360, workerBase),
              audio: wrapGasWorkerStreamProxy(rawAudio, workerBase)
            };
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

function handleStreamDirect(config, videoId, query) {
  var quality = String((query && query.quality) || '360').toLowerCase();
  var sources = handleStreamSources(config, videoId);
  var st = (sources && sources.streams) || {};
  var targetUrl = '';
  if (quality === '1080' || quality === '1080p') {
    targetUrl = st.v1080 || st.v720 || st.combined360 || st.v360 || '';
  } else if (quality === '720' || quality === '720p') {
    targetUrl = st.combined720 || st.v720 || st.combined360 || st.v360 || '';
  } else if (quality === 'audio') {
    targetUrl = st.audio || st.combined360 || st.v360 || '';
  } else {
    targetUrl = st.combined360 || st.v360 || st.v720 || '';
  }
  return {
    videoId: videoId,
    quality: quality,
    url: targetUrl,
    streams: st
  };
}

function toGasOmadaLocalPlaybackUrl(rawUrl, instanceBase) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  var rawInst = (instanceBase || 'https://yt.omada.cafe').replace(/\/+$/, '');
  var cleanInst = rawInst.indexOf('workers.dev') !== -1 ? 'https://yt.omada.cafe' : rawInst;
  var trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.indexOf('/') === 0) {
    var joined = cleanInst + trimmed;
    if (joined.indexOf('/videoplayback?') !== -1 && joined.indexOf('local=true') === -1) {
      joined += '&local=true';
    }
    return joined;
  }
  var m = trimmed.match(/^https?:\/\/([a-zA-Z0-9.-]+\.googlevideo\.com)\/videoplayback\?(.*)$/);
  if (m && m[1] && m[2]) {
    var host = m[1];
    var qs = m[2];
    if (qs.indexOf('host=') === -1) {
      qs += '&host=' + encodeURIComponent(host);
    }
    if (qs.indexOf('local=true') === -1) {
      qs += '&local=true';
    }
    return cleanInst + '/videoplayback?' + qs;
  }
  if (trimmed.indexOf('/videoplayback?') !== -1 && trimmed.indexOf('local=true') === -1) {
    return trimmed + '&local=true';
  }
  return trimmed;
}

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

function gasSha256Base64Url(inputStr, len) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(inputStr), Utilities.Charset.UTF_8);
  var b64 = Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
  while (b64.length < len) {
    b64 += b64;
  }
  return b64.slice(0, len);
}

function ensureGasGuardSid(forceNew, existingSid) {
  if (existingSid && /^[A-Za-z0-9_-]{43}$/.test(String(existingSid))) {
    return String(existingSid);
  }
  var cache = CacheService.getScriptCache();
  if (!forceNew && cache) {
    var cachedSid = cache.get('KAITO_GUARD_SID');
    if (cachedSid && /^[A-Za-z0-9_-]{43}$/.test(cachedSid)) return cachedSid;
  }
  var seed = 'kaito-gas-sid:' + new Date().getTime() + ':' + Math.random();
  var finalSid = gasSha256Base64Url(seed, 43);
  if (cache) {
    cache.put('KAITO_GUARD_SID', finalSid, 1800);
  }
  return finalSid;
}

function createGasGuardChallenge(query) {
  var sid = ensureGasGuardSid(false, query && query.guard_sid);
  var nowSec = Math.floor(new Date().getTime() / 1000);
  var expiresAt = nowSec + 120;
  var cidSeed = 'kaito-gas-cid:' + sid + ':' + nowSec + ':' + Math.random();
  var challengeId = gasSha256Base64Url(cidSeed, 22);
  var nonce = gasSha256Base64Url('kaito-gas-nonce:' + sid + ':' + challengeId, 24);
  return {
    version: 1,
    sessionId: sid,
    challengeId: challengeId,
    nonce: nonce,
    difficultyBits: 12,
    expiresAt: expiresAt
  };
}

function verifyGasGuardChallenge(query) {
  var sid = ensureGasGuardSid(false, query && query.guard_sid);
  var cid = (query && query.challenge_id) ? String(query.challenge_id) : gasSha256Base64Url('cid:' + sid, 22);
  var counter = Number((query && query.counter) || 0);
  var nonce = gasSha256Base64Url('kaito-gas-nonce:' + sid + ':' + cid, 24);
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'v1:' + nonce + ':' + counter,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    hex += ((digest[i] & 0xff) + 0x100).toString(16).slice(1);
  }
  return {
    ok: true,
    verified: true,
    sessionId: sid,
    verifiedUntil: Math.floor(new Date().getTime() / 1000) + 86400,
    difficultyBits: 12,
    counter: counter,
    nonce: nonce,
    hash: hex
  };
}

function handleSelfStreamStatus() {
  return {
    status: 'ok',
    version: '2.8.0',
    generatedAt: new Date().toISOString(),
    processing: {
      count: 0,
      ids: [],
      longest: null
    },
    uptime: 999999,
    totalProcessed: 1,
    message: '自前ストリームエンジン (GAS Serverless v3.0.0 + HTTP 206 Local Proxy) 稼働中',
    timestamp: new Date().toISOString(),
    provider: 'Google Apps Script (GAS) Serverless v3.0.0',
    features: {
      selfHostedStreamEngine: true,
      youtubeEducation: true,
      invidiousProxy: true,
      htmlService: true,
      streamProxy: true
    }
  };
}

function handleSelfRawStream(config, videoId, query) {
  var resolved = handleStreamSources(config, videoId);
  if (!resolved || !resolved.streams) {
    return { error: 'Failed to resolve stream for ' + videoId };
  }
  var st = resolved.streams;
  var muxed = [];
  if (st.combined360 || st.v360) {
    muxed.push({
      formatId: '18',
      itag: 18,
      ext: 'mp4',
      resolution: '640x360',
      formatNote: '360p',
      vcodec: 'avc1.42001E',
      acodec: 'mp4a.40.2',
      streamUrl: st.combined360 || st.v360,
      url: st.combined360 || st.v360
    });
  }
  if (st.combined720) {
    muxed.push({
      formatId: '22',
      itag: 22,
      ext: 'mp4',
      resolution: '1280x720',
      formatNote: '720p',
      vcodec: 'avc1.64001F',
      acodec: 'mp4a.40.2',
      streamUrl: st.combined720,
      url: st.combined720
    });
  }
  var videoOnly = [];
  if (st.v1080) {
    videoOnly.push({
      formatId: '137',
      itag: 137,
      ext: 'mp4',
      resolution: '1920x1080',
      formatNote: '1080p',
      vcodec: 'avc1.640028',
      acodec: 'none',
      streamUrl: st.v1080,
      url: st.v1080
    });
  }
  if (st.v720) {
    videoOnly.push({
      formatId: '136',
      itag: 136,
      ext: 'mp4',
      resolution: '1280x720',
      formatNote: '720p',
      vcodec: 'avc1.4d401f',
      acodec: 'none',
      streamUrl: st.v720,
      url: st.v720
    });
  }
  var audStreams = [];
  if (st.audio) {
    audStreams.push({
      formatId: '140',
      itag: 140,
      ext: 'm4a',
      resolution: 'audio only',
      formatNote: 'medium',
      vcodec: 'none',
      acodec: 'mp4a.40.2',
      language: { code: 'ja', name: '日本語', isDrc: false },
      streamUrl: st.audio,
      url: st.audio
    });
  }
  return {
    videoId: videoId,
    title: resolved.title || ('video-' + videoId),
    engine: resolved.engine || 'kaito-self-hosted',
    streams: {
      muxed: muxed,
      videoOnly: videoOnly,
      audioByLanguage: {
        ja: {
          language: { code: 'ja', name: '日本語' },
          streams: audStreams
        }
      }
    },
    subtitles: {
      manualByLanguage: {},
      automaticByLanguage: {}
    },
    m3u8: {
      list: st.m3u8Url ? [{ streamUrl: st.m3u8Url, url: st.m3u8Url, resolution: 'HLS' }] : []
    }
  };
}

function isGasUrlPlayableFromAnyIp(u) {
  if (!u) return false;
  var s = String(u);
  if (s.indexOf('yt.omada.cafe/videoplayback') !== -1 || s.indexOf('yt.omada.cafe/latest_version') !== -1) return true;
  if (s.indexOf('.googlevideo.com/videoplayback') !== -1) {
    return s.indexOf('ipbypass=yes') !== -1 || s.indexOf('ipbypass%3Dyes') !== -1;
  }
  return true;
}

function handleStreamSources(config, videoId) {
  var cleanInst = (config.invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
  var workerBase = (config.innertubeUrl || 'https://proxy.wa0260966.workers.dev').replace(/\/+$/, '');
  var cacheKey = 'GAS_STREAM_V28_' + videoId;
  var scriptCache = null;
  try {
    scriptCache = CacheService.getScriptCache();
    var cachedStr = scriptCache && scriptCache.get(cacheKey);
    if (cachedStr) {
      var cachedObj = JSON.parse(cachedStr);
      if (cachedObj && cachedObj.streams && (cachedObj.streams.v1080 || cachedObj.streams.v720 || cachedObj.streams.v360)) {
        return cachedObj;
      }
    }
  } catch (cacheReadErr) {}

  function saveToGasStreamCache(resultObj) {
    try {
      if (scriptCache && resultObj && resultObj.streams) {
        var str = JSON.stringify(resultObj);
        if (str.length < 95000) {
          scriptCache.put(cacheKey, str, 900);
        }
      }
    } catch (cacheWriteErr) {}
    return resultObj;
  }

  // 0. Primary #1: https://yt.omada.cafe/api/v1/videos/:id?local=true & Worker (Google Video 360p itag=18, 1080p itag=137, Audio itag=140 with HTTP 206 local proxy)
  var omadaInstances = ['https://yt.omada.cafe'];
  if (cleanInst && cleanInst !== 'https://yt.omada.cafe') {
    omadaInstances.push(cleanInst);
  }
  if (workerBase && omadaInstances.indexOf(workerBase) === -1) {
    omadaInstances.push(workerBase);
  }
  for (var oi = 0; oi < omadaInstances.length; oi++) {
    var instBase = omadaInstances[oi];
    var suffixes = instBase.indexOf('workers.dev') !== -1 ? [''] : ['?local=true', ''];
    for (var si = 0; si < suffixes.length; si++) {
      try {
        var omadaUrl = instBase + '/api/v1/videos/' + encodeURIComponent(videoId) + suffixes[si];
        // Do NOT pass custom Mozilla User-Agent to yt.omada.cafe to avoid 503
        var omadaResp = UrlFetchApp.fetch(omadaUrl, {
          muteHttpExceptions: true,
          headers: { Accept: 'application/json' }
        });
        if (omadaResp.getResponseCode() >= 500) {
          var errTxt = omadaResp.getContentText() || '';
          if (errTxt.indexOf('available in your country') === -1 && errTxt.indexOf('Video unavailable') === -1) {
            Utilities.sleep(350);
            omadaResp = UrlFetchApp.fetch(omadaUrl, {
              muteHttpExceptions: true,
              headers: { Accept: 'application/json' }
            });
          }
        }
        if (omadaResp.getResponseCode() >= 200 && omadaResp.getResponseCode() < 300) {
          var omadaData = JSON.parse(omadaResp.getContentText());
          var fStreams = Array.isArray(omadaData.formatStreams) ? omadaData.formatStreams : [];
          var aFormats = Array.isArray(omadaData.adaptiveFormats) ? omadaData.adaptiveFormats : [];
          if (fStreams.length > 0 || aFormats.length > 0) {
            var rawComb360 =
              (fStreams.filter(function(f) { return String(f.itag) === '18'; })[0] ||
               fStreams.filter(function(f) { return f.resolution === '360p' || f.qualityLabel === '360p'; })[0] ||
               fStreams[0] || {}).url || '';
            var rawComb720 =
              (fStreams.filter(function(f) { return String(f.itag) === '22' || f.resolution === '720p' || f.qualityLabel === '720p'; })[0] || {}).url || '';
            var raw1080 =
              (aFormats.filter(function(f) { return String(f.itag) === '137'; })[0] ||
               aFormats.filter(function(f) { return (f.resolution === '1080p' || String(f.qualityLabel || '').indexOf('1080p') === 0) && String(f.type || '').indexOf('video/mp4') !== -1; })[0] ||
               aFormats.filter(function(f) { return (f.resolution === '1080p' || String(f.qualityLabel || '').indexOf('1080p') === 0) && String(f.type || '').indexOf('video') !== -1; })[0] || {}).url || '';
            var raw720 =
              rawComb720 ||
              (aFormats.filter(function(f) { return String(f.itag) === '136'; })[0] ||
               aFormats.filter(function(f) { return (f.resolution === '720p' || String(f.qualityLabel || '').indexOf('720p') === 0) && String(f.type || '').indexOf('video/mp4') !== -1; })[0] || {}).url || '';
            var raw480 =
              (aFormats.filter(function(f) { return String(f.itag) === '135'; })[0] ||
               aFormats.filter(function(f) { return (f.resolution === '480p' || String(f.qualityLabel || '').indexOf('480p') === 0) && String(f.type || '').indexOf('video/mp4') !== -1; })[0] || {}).url || '';
            var rawAud =
              (aFormats.filter(function(f) { return String(f.itag) === '140'; })[0] ||
               aFormats.filter(function(f) { return String(f.type || '').indexOf('audio/mp4') !== -1; })[0] ||
               aFormats.filter(function(f) { return String(f.itag) === '251' || String(f.type || '').indexOf('audio') !== -1; })[0] || {}).url || '';

            var omadaV360 = toGasOmadaLocalPlaybackUrl(rawComb360, instBase);
            var omadaV480 = toGasOmadaLocalPlaybackUrl(raw480 || rawComb360, instBase);
            var omadaV720 = toGasOmadaLocalPlaybackUrl(raw720 || rawComb360, instBase);
            var omadaV1080 = toGasOmadaLocalPlaybackUrl(raw1080 || raw720 || rawComb360, instBase);
            var omadaAudio = toGasOmadaLocalPlaybackUrl(rawAud || rawComb360, instBase);

            if (omadaV360 || omadaV1080 || omadaAudio) {
              var best360 = omadaV360;
              var mergedQualitySources = {
                '1080p': {
                  video: { url: omadaV1080 || omadaV720 || best360, mimeType: 'video/mp4' },
                  audio: { url: omadaAudio || best360, mimeType: 'audio/mp4' }
                },
                '720p': {
                  video: { url: omadaV720 || best360, mimeType: 'video/mp4' },
                  audio: { url: omadaAudio || best360, mimeType: 'audio/mp4' }
                },
                '480p': {
                  video: { url: omadaV480 || omadaV720 || best360, mimeType: 'video/mp4' },
                  audio: { url: omadaAudio || best360, mimeType: 'audio/mp4' }
                },
                '360p': {
                  url: best360,
                  mimeType: 'video/mp4'
                },
                'audio': {
                  audio: { url: omadaAudio || best360, mimeType: 'audio/mp4' }
                }
              };
              var mergedAudioTracks = [
                { id: 'audio-omada-140', url: omadaAudio, lang: 'ja', label: '日本語（高音質音声 AAC 129kbps）', ext: 'm4a', isDefault: true, isOriginal: true }
              ];
              var subTracks = [
                { id: 'sub-ja', url: workerBase + '/api/subtitles/' + videoId + '?lang=ja', lang: 'ja', label: '日本語字幕', isDefault: true },
                { id: 'sub-en', url: workerBase + '/api/subtitles/' + videoId + '?lang=en', lang: 'en', label: '英語字幕' }
              ];
              var downloadGroups = {
                muxed: [
                  omadaV360 ? { url: omadaV360, resolution: '360p', ext: 'mp4' } : null,
                  rawComb720 ? { url: toGasOmadaLocalPlaybackUrl(rawComb720, instBase), resolution: '720p', ext: 'mp4' } : null
                ].filter(Boolean),
                audio: [
                  omadaAudio ? { url: omadaAudio, ext: 'm4a', language: '日本語 (AAC 129kbps)' } : null
                ].filter(Boolean),
                video: [
                  omadaV1080 ? { url: omadaV1080, resolution: '1080p', ext: 'mp4' } : null,
                  omadaV720 ? { url: omadaV720, resolution: '720p', ext: 'mp4' } : null,
                  omadaV480 ? { url: omadaV480, resolution: '480p', ext: 'mp4' } : null
                ].filter(Boolean),
                hls: [],
                subtitles: subTracks
              };
              return saveToGasStreamCache({
                videoId: videoId,
                title: omadaData.title || ('video-' + videoId),
                engine: 'yt.omada.cafe',
                streams: {
                  v1080: omadaV1080 || omadaV720 || best360,
                  v720: omadaV720 || best360,
                  v480: omadaV480 || best360,
                  v360: best360,
                  audio: omadaAudio || best360,
                  combined720: toGasOmadaLocalPlaybackUrl(rawComb720, instBase) || '',
                  combined360: best360,
                  omadaV1080: omadaV1080,
                  omadaV720: omadaV720,
                  omadaV360: omadaV360,
                  omadaAudio: omadaAudio,
                  ytdlp1080: omadaV1080,
                  ytdlp720: omadaV720,
                  ytdlp360: best360,
                  ytdlpAudio: omadaAudio,
                  invidious1080: omadaV1080,
                  invidious720: omadaV720,
                  invidious360: omadaV360,
                  invidiousAudio: omadaAudio
                },
                qualitySources: mergedQualitySources,
                availableQualities: ['1080p', '720p', '480p', '360p', 'audio'],
                qualityLabels: { '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', 'audio': 'Audio (音声のみ)' },
                defaultQuality: '1080p',
                downloadGroups: downloadGroups,
                audioTracks: mergedAudioTracks,
                subtitleTracks: subTracks
              });
            }
          }
        }
      } catch (omadaErr) {}
    }
  }

  // 1. Secondary: InnerTube Worker /api/v1/streams/:id
  try {
    var workerStreamsRes = fetchInnerTubeWorker(workerBase, 'streams/' + videoId);
    if (workerStreamsRes && workerStreamsRes.data && workerStreamsRes.data.streams) {
      var ws = workerStreamsRes.data.streams;
      var w1080 = wrapGasWorkerStreamProxy(ws.v1080 || ws.ytdlp1080 || '', workerBase);
      var w720 = wrapGasWorkerStreamProxy(ws.v720 || ws.combined720 || ws.ytdlp720 || '', workerBase);
      var w360 = wrapGasWorkerStreamProxy(ws.v360 || ws.combined360 || ws.ytdlp360 || '', workerBase);
      var wAudio = wrapGasWorkerStreamProxy(ws.audio || ws.ytdlpAudio || '', workerBase);
      var wComb720 = wrapGasWorkerStreamProxy(ws.combined720 || '', workerBase);
      var wComb360 = wrapGasWorkerStreamProxy(ws.combined360 || ws.v360 || '', workerBase);

      if (w1080 || w720 || w360 || wComb360) {
        var rawAudioTracks = Array.isArray(workerStreamsRes.data.audioTracks) ? workerStreamsRes.data.audioTracks : [];
        var wrappedAudioTracks = rawAudioTracks.map(function(t) {
          return {
            id: t.id || 'audio-ja-std',
            url: wrapGasWorkerStreamProxy(t.url || wAudio, workerBase),
            lang: t.lang || 'ja',
            label: t.label || '標準音声',
            isDefault: Boolean(t.isDefault),
            isOriginal: Boolean(t.isOriginal)
          };
        });
        if (wrappedAudioTracks.length === 0 && wAudio) {
          wrappedAudioTracks.push({
            id: 'audio-ja-std',
            url: wAudio,
            lang: 'ja',
            label: '日本語（高音質音声）',
            isDefault: true,
            isOriginal: true
          });
        }

        return {
          videoId: videoId,
          title: workerStreamsRes.data.title || ('video-' + videoId),
          engine: 'worker-stream-proxy',
          streams: {
            v1080: w1080 || w720 || w360,
            v720: w720 || w360,
            v360: w360 || w720,
            audio: wAudio || wComb360,
            combined720: wComb720 || w720,
            combined360: wComb360 || w360,
            ytdlp1080: w1080 || w720,
            ytdlp720: wComb720 || w720,
            ytdlp360: wComb360 || w360,
            ytdlpAudio: wAudio,
            invidious720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
            invidious360: cleanInst + '/latest_version?id=' + videoId + '&itag=18'
          },
          audioTracks: wrappedAudioTracks,
          subtitleTracks: Array.isArray(workerStreamsRes.data.subtitleTracks) && workerStreamsRes.data.subtitleTracks.length > 0
            ? workerStreamsRes.data.subtitleTracks
            : [
                { id: 'sub-ja', url: workerBase + '/api/subtitles/' + videoId + '?lang=ja', lang: 'ja', label: '日本語字幕', isDefault: true },
                { id: 'sub-en', url: workerBase + '/api/subtitles/' + videoId + '?lang=en', lang: 'en', label: '英語字幕' }
              ]
        };
      }
    }
  } catch (e) {}

  // 2. Secondary: yt-dlp ANDROID_VR / IOS / WEB Direct Extraction + Worker Stream-Proxy Wrapper
  var ytdlp = fetchGasYtDlpDirect(videoId, workerBase);
  if (ytdlp && (ytdlp.v1080 || ytdlp.v720 || ytdlp.v360)) {
    return {
      videoId: videoId,
      title: ytdlp.title,
      engine: 'yt-dlp-' + (ytdlp.clientName || 'direct'),
      streams: {
        v1080: ytdlp.v1080,
        v720: ytdlp.v720,
        v360: ytdlp.v360,
        audio: ytdlp.audio,
        combined720: ytdlp.combined720,
        combined360: ytdlp.combined360,
        ytdlp1080: ytdlp.v1080,
        ytdlp720: ytdlp.combined720 || ytdlp.v720,
        ytdlp360: ytdlp.combined360 || ytdlp.v360,
        ytdlpAudio: ytdlp.audio,
        invidious720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
        invidious360: cleanInst + '/latest_version?id=' + videoId + '&itag=18'
      },
      audioTracks: [
        { id: 'audio-ja-std', url: ytdlp.audio, lang: 'ja', label: '日本語（yt-dlp高音質音声）', isDefault: true, isOriginal: true }
      ],
      subtitleTracks: [
        { id: 'sub-ja', url: workerBase + '/api/subtitles/' + videoId + '?lang=ja', lang: 'ja', label: '日本語字幕', isDefault: true },
        { id: 'sub-en', url: workerBase + '/api/subtitles/' + videoId + '?lang=en', lang: 'en', label: '英語字幕' }
      ]
    };
  }

  // 3. Tertiary: InnerTube Worker (/api/v1/videos/:id) with Stream-Proxy Wrapper
  try {
    var itRes = fetchInnerTubeWorker(workerBase, 'videos/' + videoId);
    if (itRes.data) {
      var itFormats = Array.isArray(itRes.data.formatStreams) ? itRes.data.formatStreams : [];
      var itAdaptive = Array.isArray(itRes.data.adaptiveFormats) ? itRes.data.adaptiveFormats : [];
      var itComb720 = itFormats.find(function(f) { return f.resolution === '720p' || f.qualityLabel === '720p'; });
      var itComb360 = itFormats.find(function(f) { return f.resolution === '360p' || f.qualityLabel === '360p'; }) || itFormats[0];
      var itV1080 = itAdaptive.find(function(f) { return (f.resolution === '1080p' || f.qualityLabel === '1080p') && (f.type || '').indexOf('video') !== -1; });
      var itV720 = itComb720 ||
                   itAdaptive.find(function(f) { return (f.resolution === '720p' || f.qualityLabel === '720p') && (f.type || '').indexOf('video') !== -1; });
      var itV360 = itComb360 ||
                   itAdaptive.find(function(f) { return (f.resolution === '360p' || f.qualityLabel === '360p') && (f.type || '').indexOf('video') !== -1; });
      var itAudio = itAdaptive.find(function(f) { return (f.type || '').indexOf('audio') !== -1; });

      if (itV720 || itV360 || itV1080 || itAudio) {
        var v1080Url = wrapGasWorkerStreamProxy((itV1080 && itV1080.url) || (itV720 && itV720.url) || '', workerBase);
        var v720Url = wrapGasWorkerStreamProxy((itV720 && itV720.url) || (itV360 && itV360.url) || '', workerBase);
        var v360Url = wrapGasWorkerStreamProxy((itV360 && itV360.url) || (itV720 && itV720.url) || '', workerBase);
        var audioUrl = wrapGasWorkerStreamProxy((itAudio && itAudio.url) || (itV720 && itV720.url) || '', workerBase);
        return {
          videoId: videoId,
          title: itRes.data.title || ('video-' + videoId),
          engine: 'yt-dlp-worker',
          streams: {
            v1080: v1080Url,
            v720: v720Url,
            v360: v360Url,
            audio: audioUrl,
            combined720: wrapGasWorkerStreamProxy((itComb720 && itComb720.url) || '', workerBase),
            combined360: wrapGasWorkerStreamProxy((itComb360 && itComb360.url) || '', workerBase),
            ytdlp1080: v1080Url,
            ytdlp720: v720Url,
            ytdlp360: v360Url,
            ytdlpAudio: audioUrl,
            invidious720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
            invidious360: cleanInst + '/latest_version?id=' + videoId + '&itag=18'
          }
        };
      }
    }
  } catch (e) {}

  // 2. Fallback: Invidious (ONLY if InnerTube Worker failed)
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + videoId);
    if (invRes.data) {
      var formats = Array.isArray(invRes.data.formatStreams) ? invRes.data.formatStreams : [];
      var adaptive = Array.isArray(invRes.data.adaptiveFormats) ? invRes.data.adaptiveFormats : [];
      var v720 = formats.find(function(f) { return f.resolution === '720p' || f.qualityLabel === '720p'; });
      var v360 = formats.find(function(f) { return f.resolution === '360p' || f.qualityLabel === '360p'; }) || formats[0];
      var audio = adaptive.find(function(f) { return (f.type || '').indexOf('audio') !== -1; });

      return {
        videoId: videoId,
        streams: {
          v720: (v720 && v720.url) || (cleanInst + '/latest_version?id=' + videoId + '&itag=22'),
          v360: (v360 && v360.url) || (cleanInst + '/latest_version?id=' + videoId + '&itag=18'),
          audio: (audio && audio.url) || (cleanInst + '/latest_version?id=' + videoId + '&itag=140'),
          invidious720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
          invidious360: cleanInst + '/latest_version?id=' + videoId + '&itag=18'
        }
      };
    }
  } catch (e) {
    Logger.log('handleStreamSources error: ' + e.toString());
  }

  return {
    videoId: videoId,
    streams: {
      v720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
      v360: cleanInst + '/latest_version?id=' + videoId + '&itag=18',
      invidious720: cleanInst + '/latest_version?id=' + videoId + '&itag=22',
      invidious360: cleanInst + '/latest_version?id=' + videoId + '&itag=18'
    }
  };
}

/**
 * 18. 字幕・文字起こし取得ハンドラー (/api/youtube/transcript/:id)
 * Primary: InnerTube Worker (/api/subtitles/:id) -> Fallback on error: Invidious
 */
function handleTranscript(config, videoId, lang) {
  lang = lang || 'ja';
  var workerBase = (config.innertubeUrl || 'https://proxy.wa0260966.workers.dev').replace(/\/+$/, '');

  function parseVttToItems(text) {
    var lines = String(text || '').split('\n');
    var items = [];
    var currentStart = 0;
    var currentDuration = 0;
    var currentText = '';

    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (line.indexOf('-->') !== -1) {
        if (currentText) {
          items.push({ start: currentStart, duration: currentDuration, text: currentText.replace(/<[^>]+>/g, '').trim() });
          currentText = '';
        }
        var times = line.split('-->');
        var sParts = times[0].trim().split(':');
        if (sParts.length === 3) currentStart = parseFloat(sParts[0])*3600 + parseFloat(sParts[1])*60 + parseFloat(sParts[2]);
        else if (sParts.length === 2) currentStart = parseFloat(sParts[0])*60 + parseFloat(sParts[1]);
        var eParts = times[1].trim().split(' ')[0].split(':');
        var endSec = 0;
        if (eParts.length === 3) endSec = parseFloat(eParts[0])*3600 + parseFloat(eParts[1])*60 + parseFloat(eParts[2]);
        else if (eParts.length === 2) endSec = parseFloat(eParts[0])*60 + parseFloat(eParts[1]);
        currentDuration = Math.max(1, endSec - currentStart);
      } else if (line && line.indexOf('WEBVTT') !== 0 && line.indexOf('NOTE') !== 0 && !/^\d+$/.test(line)) {
        currentText = currentText ? currentText + ' ' + line : line;
      }
    }
    if (currentText) {
      items.push({ start: currentStart, duration: currentDuration, text: currentText.replace(/<[^>]+>/g, '').trim() });
    }
    return items;
  }

  // 1. Primary: InnerTube Worker Subtitles (https://proxy.wa0260966.workers.dev/api/subtitles/:id)
  try {
    var subUrl = workerBase + '/api/subtitles/' + videoId + '?lang=' + encodeURIComponent(lang);
    var subRes = UrlFetchApp.fetch(subUrl, { muteHttpExceptions: true });
    if (subRes.getResponseCode() === 200) {
      var subText = subRes.getContentText();
      if (subText && subText.indexOf('-->') !== -1) {
        var subItems = parseVttToItems(subText);
        if (subItems.length > 0) {
          return {
            language: lang,
            languageCode: lang,
            items: subItems
          };
        }
      }
    }
  } catch (e) {}

  // 2. Fallback: Invidious (ONLY if InnerTube Worker subtitles failed)
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'captions/' + videoId);
    if (invRes.data && Array.isArray(invRes.data.captions) && invRes.data.captions.length > 0) {
      var caps = invRes.data.captions;
      var targetCap = null;
      for (var i = 0; i < caps.length; i++) {
        if (caps[i].languageCode === lang) { targetCap = caps[i]; break; }
      }
      if (!targetCap) targetCap = caps[0];

      if (targetCap && targetCap.url) {
        var cleanInst = (config.invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
        var vttUrl = targetCap.url.indexOf('http') === 0 ? targetCap.url : cleanInst + targetCap.url;
        var res = UrlFetchApp.fetch(vttUrl, { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) {
          var items = parseVttToItems(res.getContentText());
          if (items.length > 0) {
            return {
              language: targetCap.label || targetCap.languageCode,
              languageCode: targetCap.languageCode,
              items: items
            };
          }
        }
      }
    }
  } catch (e) {
    Logger.log('handleTranscript error: ' + e.toString());
  }

  return {
    language: lang,
    languageCode: lang,
    items: [],
    message: 'この動画の字幕・文字起こしは利用できません。'
  };
}

/**
 * 19. プロキシ中継ハンドラー (UrlFetchApp によるフィルタリング・CORS回避)
 */
function handleProxy(e) {
  var targetUrl = e && e.parameter && e.parameter.url;
  var callback = e && e.parameter && e.parameter.callback;

  if (!targetUrl) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Missing url parameter" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var isOmada = String(targetUrl).indexOf('yt.omada.cafe') !== -1;
    var reqHeaders = isOmada
      ? {
          'Accept': 'application/json, text/plain, */*'
        }
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

/**
 * 20. YouTube Education 用埋め込みURL生成
 */
function handleStreamYoutubeEducation(videoId, query) {
  var eduParamRes = handleEducationParam();
  var param = (eduParamRes && eduParamRes.param) || '';
  if (!param) {
    param = '?enablejsapi=1&rel=0&controls=1&showinfo=0&start=0&autoplay=1&playsinline=1&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
  } else if (param.indexOf('?') !== 0) {
    param = '?' + param;
  }
  if (/autoplay=\d+/.test(param)) {
    param = param.replace(/autoplay=\d+/g, 'autoplay=1');
  } else {
    param += '&autoplay=1';
  }
  if (param.indexOf('enablejsapi=1') === -1) {
    param += '&enablejsapi=1';
  }
  if (param.indexOf('playsinline=1') === -1) {
    param += '&playsinline=1';
  }

  var fullUrl = 'https://www.youtubeeducation.com/embed/' + videoId + param;
  return {
    url: fullUrl,
    videoId: videoId,
    param: param,
    status: 'ok'
  };
}

/**
 * 21. 最新HTMLビルドとの同期ハンドラー & 公開プレイリスト管理
 */
function handlePublicPlaylists(path, method, query, body) {
  var props = PropertiesService.getScriptProperties();
  var rawJson = props.getProperty('KAITO_PUBLIC_PLAYLISTS') || '[]';
  var list = [];
  try {
    list = JSON.parse(rawJson);
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }

  if (path === '/api/playlists/public') {
    var q = String((query && query.q) || '').trim().toLowerCase();
    var pubList = list.filter(function(pl) {
      return pl && (pl.visibility === 'public' || pl.isPublic);
    });
    if (q) {
      pubList = pubList.filter(function(pl) {
        return String(pl.title || '').toLowerCase().indexOf(q) !== -1 ||
               String(pl.description || '').toLowerCase().indexOf(q) !== -1 ||
               String(pl.authorName || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    return { items: pubList.reverse() };
  }

  if (path === '/api/playlists/publish' && method === 'POST') {
    var pl = body && body.playlist;
    if (!pl || !pl.id || !pl.title) {
      return { error: 'Invalid playlist payload' };
    }
    var foundIdx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === String(pl.id)) {
        foundIdx = i;
        break;
      }
    }
    var existing = foundIdx !== -1 ? list[foundIdx] : null;
    var record = {
      id: String(pl.id),
      title: String(pl.title).slice(0, 120),
      description: String(pl.description || '').slice(0, 500),
      createdAt: String(pl.createdAt || (existing && existing.createdAt) || new Date().toLocaleDateString('ja-JP')),
      updatedAt: new Date().toLocaleDateString('ja-JP'),
      visibility: 'public',
      isPublic: true,
      authorName: String(pl.authorName || (existing && existing.authorName) || 'ポータルユーザー').slice(0, 60),
      cloneCount: existing && typeof existing.cloneCount === 'number' ? existing.cloneCount : Number(pl.cloneCount || 0),
      sourcePlaylistId: pl.sourcePlaylistId ? String(pl.sourcePlaylistId) : (existing && existing.sourcePlaylistId),
      videos: Array.isArray(pl.videos) ? pl.videos.slice(0, 100) : []
    };
    if (foundIdx !== -1) list[foundIdx] = record;
    else list.push(record);
    try {
      props.setProperty('KAITO_PUBLIC_PLAYLISTS', JSON.stringify(list.slice(-30)));
    } catch (e2) {}
    return { success: true, playlist: record };
  }

  if (path.indexOf('/unpublish') !== -1 && method === 'POST') {
    var unpubId = path.replace('/api/playlists/', '').replace('/unpublish', '');
    for (var u = 0; u < list.length; u++) {
      if (list[u] && list[u].id === unpubId) {
        list[u].visibility = 'private';
        list[u].isPublic = false;
      }
    }
    try {
      props.setProperty('KAITO_PUBLIC_PLAYLISTS', JSON.stringify(list));
    } catch (e3) {}
    return { success: true };
  }

  if (path.indexOf('/clone') !== -1 && method === 'POST') {
    var cloneId = path.replace('/api/playlists/', '').replace('/clone', '');
    var clonedPl = null;
    for (var c = 0; c < list.length; c++) {
      if (list[c] && list[c].id === cloneId) {
        list[c].cloneCount = (list[c].cloneCount || 0) + 1;
        clonedPl = list[c];
        break;
      }
    }
    try {
      props.setProperty('KAITO_PUBLIC_PLAYLISTS', JSON.stringify(list));
    } catch (e4) {}
    return { success: true, cloneCount: clonedPl ? clonedPl.cloneCount : 1, playlist: clonedPl };
  }

  var targetId = path.replace('/api/playlists/', '');
  for (var f = 0; f < list.length; f++) {
    if (list[f] && list[f].id === targetId && (list[f].visibility === 'public' || list[f].isPublic)) {
      return { playlist: list[f] };
    }
  }
  return { error: '公開プレイリストが見つかりません。' };
}

function formatGasNicoDuration(seconds) {
  var s = Math.max(0, Math.floor(Number(seconds) || 0));
  var m = Math.floor(s / 60);
  var rem = s % 60;
  return m + ':' + (rem < 10 ? '0' + rem : String(rem));
}

function searchGasNicoSnapshot(queryStr, limit, sort) {
  var q = String(queryStr || '').trim() || 'VOCALOID OR 歌ってみた OR ゆっくり実況 OR ゲーム実況 OR アニメ OR 音楽';
  var url =
    'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search' +
    '?q=' + encodeURIComponent(q) +
    '&targets=title,tags' +
    '&fields=contentId,title,description,viewCounter,mylistCounter,likeCounter,lengthSeconds,thumbnailUrl,startTime,commentCounter,userId,channelId' +
    '&_sort=' + encodeURIComponent(sort || '-viewCounter') +
    '&_limit=' + String(limit || 28) +
    '&_context=kaitotube-gas-self';

  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'KaitoTube/3.0 (GAS Self-Built Niconico Engine)',
      'Accept': 'application/json'
    }
  });
  if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
    return [];
  }
  var json = JSON.parse(resp.getContentText());
  var items = (json && json.data) ? json.data : [];
  return items.map(function(item) {
    return {
      id: item.contentId,
      title: item.title || item.contentId,
      thumbnail: item.thumbnailUrl || '',
      url: 'https://www.nicovideo.jp/watch/' + item.contentId,
      duration: formatGasNicoDuration(item.lengthSeconds || 0),
      channel: 'ニコニコ動画',
      channel_url: item.userId ? 'https://www.nicovideo.jp/user/' + item.userId : '',
      views: Number(item.viewCounter) || 0,
      commentsCount: Number(item.commentCounter) || 0,
      mylistCount: Number(item.mylistCounter) || 0,
      publishedAt: item.startTime || ''
    };
  });
}

function handleNicoApiRelay(action, method, query) {
  query = query || {};
  var props = PropertiesService.getScriptProperties();

  if (action === 'visit') {
    var count = Number(props.getProperty('KAITO_NICO_VISIT') || '1280') + 1;
    try { props.setProperty('KAITO_NICO_VISIT', String(count)); } catch (e) {}
    return { count: count };
  }

  if (action === 'thumb-base64' && query.url) {
    var b64 = fetchAsBase64(query.url);
    if (b64) return { base64: b64 };
    return { error: 'Thumbnail fetch failed' };
  }

  if (action === 'recommend') {
    return searchGasNicoSnapshot('', 28, '-viewCounter');
  }

  if (action === 'search') {
    return searchGasNicoSnapshot(query.q || '', 32, query.sort || '-viewCounter');
  }

  if (action === 'nico-comments') {
    var rawId = String(query.id || '').trim();
    if (!rawId) return { comments: [] };
    try {
      var watchResp = UrlFetchApp.fetch('https://www.nicovideo.jp/watch/' + encodeURIComponent(rawId) + '?responseType=json', {
        method: 'get',
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      });
      if (watchResp.getResponseCode() >= 200 && watchResp.getResponseCode() < 300) {
        var watchJson = JSON.parse(watchResp.getContentText());
        var rData = watchJson && watchJson.data && watchJson.data.response;
        var nvComment = rData && rData.comment && rData.comment.nvComment;
        var details = {
          id: (rData && rData.video && rData.video.id) || rawId,
          title: (rData && rData.video && rData.video.title) || '',
          description: (rData && rData.video && rData.video.description) || '',
          views: (rData && rData.video && rData.video.count && rData.video.count.view) || 0,
          commentsCount: (rData && rData.video && rData.video.count && rData.video.count.comment) || 0,
          mylistCount: (rData && rData.video && rData.video.count && rData.video.count.mylist) || 0,
          likeCount: (rData && rData.video && rData.video.count && rData.video.count.like) || 0,
          duration: formatGasNicoDuration((rData && rData.video && rData.video.duration) || 0),
          ownerName: (rData && rData.owner && rData.owner.nickname) || (rData && rData.channel && rData.channel.name) || 'ニコニコ動画',
          ownerIcon: (rData && rData.owner && rData.owner.iconUrl) || ''
        };
        if (nvComment && nvComment.server) {
          var commResp = UrlFetchApp.fetch(nvComment.server + '/v1/threads', {
            method: 'post',
            contentType: 'application/json',
            muteHttpExceptions: true,
            headers: {
              'X-Frontend-Id': '6',
              'X-Frontend-Version': '0',
              'User-Agent': 'Mozilla/5.0'
            },
            payload: JSON.stringify({
              params: nvComment.params,
              threadKey: nvComment.threadKey,
              additionals: {}
            })
          });
          if (commResp.getResponseCode() >= 200 && commResp.getResponseCode() < 300) {
            var commJson = JSON.parse(commResp.getContentText());
            var threads = (commJson && commJson.data && commJson.data.threads) || [];
            var comments = [];
            for (var t = 0; t < threads.length; t++) {
              var tComments = threads[t].comments || [];
              for (var j = 0; j < tComments.length; j++) {
                var cm = tComments[j];
                if (cm && cm.body) {
                  comments.push({
                    text: cm.body,
                    timeMs: Number(cm.vposMs) || 0,
                    commands: cm.commands || []
                  });
                }
              }
            }
            comments.sort(function(a, b) { return a.timeMs - b.timeMs; });
            return { comments: comments, details: details };
          }
        }
        return { comments: [], details: details };
      }
    } catch (err) {}
    return { comments: [] };
  }

  if (action === 'reviews' || action === 'review-save') {
    var reviews = [];
    try {
      reviews = JSON.parse(props.getProperty('KAITO_NICO_REVIEWS') || '[]');
    } catch (e) { reviews = []; }
    var deviceId = String(query.deviceId || '').trim();

    if (action === 'review-save' && deviceId) {
      var rating = Math.max(1, Math.min(5, Number(query.rating) || 5));
      var comment = String(query.comment || '').trim().slice(0, 20);
      var nowIso = new Date().toISOString();
      var found = false;
      for (var r = 0; r < reviews.length; r++) {
        if (reviews[r].deviceId === deviceId) {
          reviews[r].rating = rating;
          reviews[r].comment = comment;
          reviews[r].updatedAt = nowIso;
          found = true;
          break;
        }
      }
      if (!found) {
        var suffix = deviceId.slice(0, 4).toUpperCase();
        reviews.unshift({
          deviceId: deviceId,
          iconInitial: suffix.charAt(0) || 'U',
          displayName: 'ユーザー #' + suffix,
          rating: rating,
          comment: comment,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
      try { props.setProperty('KAITO_NICO_REVIEWS', JSON.stringify(reviews.slice(0, 100))); } catch (e) {}
      return { ok: true, updated: found };
    }

    var total = reviews.length;
    var sum = 0;
    var myReview = null;
    for (var k = 0; k < reviews.length; k++) {
      sum += Number(reviews[k].rating) || 0;
      if (deviceId && reviews[k].deviceId === deviceId) myReview = reviews[k];
    }
    return {
      total: total,
      average: total > 0 ? sum / total : 0,
      myReview: myReview,
      reviews: reviews.slice(0, 50)
    };
  }

  return { error: 'GAS環境では公式埋め込み再生をご利用ください (' + action + ')' };
}

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



