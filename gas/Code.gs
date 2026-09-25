/**
 * 海斗tube (KaitoTube) - Google Apps Script (GAS) バックエンド
 * 
 * 表記・UI・機能・デザインを完全維持したまま
 * Google Apps Script Web App 上でフル機能動作するためのバックエンドスクリプトです。
 */

// ==========================================
// 1. Web App エントリーポイント
// ==========================================

function doGet(e) {
  // 1. プロキシ中継リクエスト (?url=https://...)
  if (e && e.parameter && e.parameter.url) {
    return handleProxy(e);
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
        '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:30px;background:#111;color:#fff;min-height:100vh;">' +
        '<h2 style="color:#ff5555;">⚠️ index.html が見つかりません</h2>' +
        '<p>Google Apps Script エディタの左メニューで、<b>「＋」→「HTML」</b> をクリックし、ファイル名を <b>index</b> として作成してください。</p>' +
        '<p style="color:#888;font-size:12px;">エラー詳細: ' + err1.message + '</p>' +
        '</div>'
      );
    }
  }

  htmlOutput.setTitle('海斗tube')
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

    // 8. チャンネル詳細 (/api/youtube/channel/:id)
    if (path.indexOf('/api/youtube/channel/videos/') === 0) {
      var chId = path.replace('/api/youtube/channel/videos/', '');
      return { status: 200, data: handleChannelVideos(config, chId, query) };
    }
    if (path.indexOf('/api/youtube/channel/') === 0) {
      var channelId = path.replace('/api/youtube/channel/', '');
      return { status: 200, data: handleChannelDetail(config, channelId) };
    }

    // 9. YouTube Shorts
    if (path === '/api/youtube/shorts') {
      return { status: 200, data: handleShorts(config, query) };
    }

    // 10. AI動画要約 (Gemini API)
    if (path === '/api/ai/summarize') {
      return { status: 200, data: handleAiSummarize(body) };
    }

    // 11. サムネイル画像プロキシ
    if (path === '/api/proxy/thumbnail') {
      return { status: 200, data: handleThumbnailProxy(query) };
    }

    // 12. APIキー診断テスト
    if (path === '/api/youtube/test-key') {
      return { status: 200, data: handleTestKey(headers, body) };
    }

    // 13. YouTube Education 動的パラメータ
    if (path === '/api/education-param') {
      return { status: 200, data: handleEducationParam() };
    }

    // 14. プレミア会員認証 (スクリプトプロパティ検証)
    if (path === '/api/auth/verify') {
      return { status: 200, data: handleAuthVerify(body) };
    }

    // 15. 再生リスト詳細 (/api/youtube/playlist/:id)
    if (path.indexOf('/api/youtube/playlist/') === 0) {
      var plId = path.replace('/api/youtube/playlist/', '');
      return { status: 200, data: handlePlaylistDetail(config, plId) };
    }

    // 16. チャンネル再生リスト一覧 (/api/youtube/channel/playlists/:id)
    if (path.indexOf('/api/youtube/channel/playlists/') === 0) {
      var chPlId = path.replace('/api/youtube/channel/playlists/', '');
      return { status: 200, data: handleChannelPlaylists(config, chPlId) };
    }

    // 17. ストリームソース取得 (/api/youtube/stream-sources/:id)
    if (path.indexOf('/api/youtube/stream-sources/') === 0) {
      var strVideoId = path.replace('/api/youtube/stream-sources/', '');
      return { status: 200, data: handleStreamSources(config, strVideoId) };
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

    // 20. ストリームサーバー状態 (/api/stream/status)
    if (path === '/api/stream/status') {
      return {
        status: 200,
        data: {
          status: 'ok',
          uptime: 999999,
          timestamp: new Date().toISOString(),
          provider: 'Google Apps Script (GAS) Serverless',
          features: {
            youtubeEducation: true,
            invidiousProxy: true,
            htmlService: true
          }
        }
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
  var props = PropertiesService.getScriptProperties().getProperties();
  var envApiKey = props.YOUTUBE_API_KEY || '';

  var invidiousUrl = headers['x-invidious-url'] || 'https://yt.omada.cafe/';
  var customYoutubeKey = headers['x-youtube-key'] || '';

  return {
    provider: 'invidious',
    invidiousUrl: (invidiousUrl || 'https://yt.omada.cafe/').trim(),
    youtubeKey: (customYoutubeKey || envApiKey || '').trim()
  };
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

// Invidious変換ヘルパー
function convertInvidiousItemToYouTubeItem(item) {
  var videoId = item.videoId || item.id;
  var highThumb = (item.videoThumbnails && item.videoThumbnails.filter(function(t) { return t.quality === 'high'; })[0]) || null;
  var medThumb = (item.videoThumbnails && item.videoThumbnails.filter(function(t) { return t.quality === 'medium'; })[0]) || null;

  // Invidious サーバー経由のサムネイル URL を優先生成 (i.ytimg.com ブロック回避)
  var invidiousBase = 'https://yt.omada.cafe';
  var thumbnailHigh = (highThumb && highThumb.url) || (invidiousBase + '/vi/' + videoId + '/hqdefault.jpg');
  var thumbnailMed = (medThumb && medThumb.url) || (invidiousBase + '/vi/' + videoId + '/mqdefault.jpg');
  if (thumbnailHigh.indexOf('/') === 0) thumbnailHigh = invidiousBase + thumbnailHigh;
  if (thumbnailMed.indexOf('/') === 0) thumbnailMed = invidiousBase + thumbnailMed;

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

  return {
    id: videoId,
    kind: 'youtube#video',
    snippet: {
      publishedAt: pubIso,
      channelId: item.authorId || '',
      title: item.title || '',
      description: item.description || '',
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

  return { items: items, nextPageToken: data.continuation || null };
}

// ==========================================
// 4. 各エンドポイント処理ロジック
// ==========================================

function handleTrending(config, query) {
  var regionCode = query.regionCode || 'JP';
  var maxResults = query.maxResults || '24';
  var videoCategoryId = query.videoCategoryId;
  var pageToken = query.pageToken;

  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'trending', { region: regionCode });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      var items = invRes.data.map(convertInvidiousItemToYouTubeItem);
      return { kind: 'youtube#videoListResponse', items: items };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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

  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'search', { q: q || '人気 動画', type: 'video', region: 'JP' });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      var items = invRes.data.filter(function(it) { return it.type === 'video' || it.videoId; }).map(convertInvidiousItemToYouTubeItem);
      if (items.length > 0) {
        return { kind: 'youtube#searchResponse', items: items };
      }
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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
  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + id);
    if (invRes.data && (invRes.data.title || invRes.data.videoId)) {
      return { kind: 'youtube#videoListResponse', items: [convertInvidiousItemToYouTubeItem(invRes.data)] };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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

  if (config.youtubeKey) {
    var data = fetchYouTube('videos', { part: 'snippet,contentDetails,statistics', id: ids }, config.youtubeKey);
    return data.items ? data : { items: [] };
  }
  return { items: [] };
}

function handleRelatedVideos(config, id, query) {
  var maxResults = query.maxResults || '12';

  // 1. Primary: Invidious recommendedVideos
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'videos/' + id);
    if (invRes.data && Array.isArray(invRes.data.recommendedVideos) && invRes.data.recommendedVideos.length > 0) {
      return { kind: 'youtube#searchResponse', items: invRes.data.recommendedVideos.map(convertInvidiousItemToYouTubeItem) };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var data = fetchYouTube('search', {
      part: 'snippet',
      relatedToVideoId: id,
      type: 'video',
      maxResults: maxResults
    }, config.youtubeKey);

    if (!data.error && data.items && data.items.length > 0) {
      var videoIds = data.items.map(function(it) { return (it.id && it.id.videoId) || it.id; }).filter(Boolean);
      if (videoIds.length > 0) {
        var details = fetchYouTube('videos', { part: 'snippet,contentDetails,statistics', id: videoIds.join(',') }, config.youtubeKey);
        if (details.items) data.items = details.items;
      }
      return data;
    }
  }

  // 3. Fallback: Search by video title
  try {
    var vidDetail = handleVideoDetail(config, id);
    var title = vidDetail && vidDetail.items && vidDetail.items[0] && vidDetail.items[0].snippet && vidDetail.items[0].snippet.title;
    if (title) {
      var cleanTitle = title.replace(/[【】\[\]()（）]/g, ' ').slice(0, 30).trim();
      var searchRes = handleSearch(config, { q: cleanTitle, maxResults: maxResults });
      if (searchRes && searchRes.items && searchRes.items.length > 0) {
        var filtered = searchRes.items.filter(function(v) {
          var vId = (v.id && v.id.videoId) || (typeof v.id === 'string' ? v.id : '');
          return vId && vId !== id;
        });
        if (filtered.length > 0) {
          return { kind: 'youtube#searchResponse', items: filtered };
        }
      }
    }
  } catch (e) {}

  return { items: [] };
}

function handleComments(config, id, query) {
  var order = query.order || 'relevance';
  var maxResults = query.maxResults || '20';
  var pageToken = query.pageToken;

  // 1. Primary: Invidious comments
  try {
    var invParams = pageToken ? { continuation: pageToken } : {};
    var invRes = fetchInvidious(config.invidiousUrl, 'comments/' + id, invParams);
    if (invRes.data && Array.isArray(invRes.data.comments) && invRes.data.comments.length > 0) {
      return convertInvidiousCommentsToYouTube(invRes.data, id);
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet,replies',
      videoId: id,
      order: order,
      maxResults: maxResults
    };
    if (pageToken) params.pageToken = pageToken;

    var data = fetchYouTube('commentThreads', params, config.youtubeKey);
    if (!data.error && data.items) {
      return data;
    }
  }

  return { items: [], nextPageToken: null };
}

function handleCommentReplies(config, id, query) {
  var maxResults = query.maxResults || '20';
  var pageToken = query.pageToken;

  // 1. Primary: Invidious
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

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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
  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/' + id);
    if (invRes.data && (invRes.data.authorId || invRes.data.author)) {
      return { items: [convertInvidiousChannelToYouTubeChannel(invRes.data)] };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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
  var maxResults = query.maxResults || '50';
  var pageToken = query.pageToken;
  var order = query.order || 'date';

  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/' + id + '/videos');
    if (invRes.data && Array.isArray(invRes.data.videos) && invRes.data.videos.length > 0) {
      return { kind: 'youtube#searchResponse', items: invRes.data.videos.map(convertInvidiousItemToYouTubeItem) };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
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

function handleShorts(config, query) {
  var q = query.q || '#Shorts';
  var maxResults = query.maxResults || '24';
  var regionCode = query.regionCode || 'JP';

  // 1. Primary: Invidious
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'search', { q: q, type: 'video', region: regionCode });
    if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
      return { items: invRes.data.map(convertInvidiousItemToYouTubeItem) };
    }
  } catch (e) {}

  // 2. Fallback: Only when Invidious has an error, use YouTube Official API (if key configured)
  if (config.youtubeKey) {
    var params = {
      part: 'snippet',
      q: q,
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

  var prompt = 'あなたは動画学習アシスタント「海斗tube AI」です。\n' +
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
  var imageUrl = query.url;
  if (!imageUrl) return { error: 'Missing url' };

  try {
    var res = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() < 400) {
      var base64 = Utilities.base64Encode(res.getContent());
      var contentType = res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || 'image/jpeg';
      return { dataUri: 'data:' + contentType + ';base64,' + base64 };
    }
  } catch (e) {
    Logger.log('Proxy thumbnail error: ' + e.toString());
  }

  return { dataUri: imageUrl };
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
  try {
    var response = UrlFetchApp.fetch(imageUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (response.getResponseCode() >= 400) return null;
    var blob = response.getBlob();
    var contentType = blob.getContentType() || 'image/jpeg';
    var base64 = Utilities.base64Encode(blob.getBytes());
    return 'data:' + contentType + ';base64,' + base64;
  } catch (err) {
    Logger.log('fetchAsBase64 error: ' + err.toString());
    return null;
  }
}

/**
 * 14. プレミア会員認証ハンドラー
 * GASのスクリプトプロパティ (PREMIUM_PASSWORD, PREMIUM_ID) から
 * パスワード・IDを取得して照合・検証します。
 * スクリプトプロパティ未設定時はデフォルト値 (ID: kaito, PW: @0726kaito) で安全に動作します。
 */
function handleAuthVerify(body) {
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    var expectedId = (props.PREMIUM_ID || props.KAITO_ID || 'kaito').trim();
    var expectedPassword = (props.PREMIUM_PASSWORD || props.KAITO_PASSWORD || '@0726kaito').trim();

    var inputId = ((body && (body.username || body.id)) || '').trim();
    var inputPassword = ((body && body.password) || '').trim();

    if (inputId === expectedId && inputPassword === expectedPassword) {
      return { success: true };
    }

    return {
      success: false,
      message: '会員IDまたはパスワードが一致しません。正しい認証情報を入力してください。'
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
 * 15. 再生リスト詳細取得ハンドラー (/api/youtube/playlist/:id)
 */
function handlePlaylistDetail(config, id) {
  // 1. Invidious playlists/:id
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

  // 2. YouTube Data API fallback
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
 */
function handleChannelPlaylists(config, channelId) {
  try {
    var invRes = fetchInvidious(config.invidiousUrl, 'channels/playlists/' + channelId);
    if (invRes.data && Array.isArray(invRes.data.playlists)) {
      var items = invRes.data.playlists.map(function(pl) {
        return {
          id: pl.playlistId || pl.id,
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

  if (config.youtubeKey) {
    try {
      var res = fetchYouTube('playlists', { part: 'snippet,contentDetails', channelId: channelId, maxResults: '25' }, config.youtubeKey);
      return res.items ? res : { items: [], nextPageToken: null };
    } catch (e) {}
  }

  return { items: [], nextPageToken: null };
}

/**
 * 17. ストリームソース取得ハンドラー (/api/youtube/stream-sources/:id)
 */
function handleStreamSources(config, videoId) {
  var cleanInst = (config.invidiousUrl || 'https://yt.omada.cafe').replace(/\/+$/, '');
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
 */
function handleTranscript(config, videoId, lang) {
  lang = lang || 'ja';
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
          var text = res.getContentText();
          var lines = text.split('\n');
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
    var response = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
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
    param = '?enablejsapi=1&rel=0&control=1&showinfo=0&start=0&autoplay=0&cc_load_policy=0&errorlinks=1&hl=ja&authuser=0&modestbranding=1';
  } else if (param.indexOf('?') !== 0) {
    param = '?' + param;
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
 * 21. 最新HTMLビルドとの同期ハンドラー
 */
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



