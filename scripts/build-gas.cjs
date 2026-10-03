const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const gasDir = path.join(projectRoot, 'gas');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(gasDir)) {
  fs.mkdirSync(gasDir, { recursive: true });
}

const distIndexHtml = path.join(distDir, 'index.html');
if (!fs.existsSync(distIndexHtml)) {
  console.error('Error: dist/index.html not found. Please run "npm run build" first.');
  process.exit(1);
}

let html = fs.readFileSync(distIndexHtml, 'utf8');

// Find built CSS and JS files
const files = fs.readdirSync(assetsDir);
const cssFiles = files.filter(f => f.endsWith('.css'));
const jsFiles = files.filter(f => f.endsWith('.js'));

// Read and concatenate CSS
let rawCss = '';
for (const cssFile of cssFiles) {
  const cssPath = path.join(assetsDir, cssFile);
  rawCss += fs.readFileSync(cssPath, 'utf8') + '\n';
}

// Transpile and format CSS with esbuild (lineLimit 500 prevents GAS line truncation)
const transformedCss = esbuild.transformSync(rawCss, {
  loader: 'css',
  minify: true,
  lineLimit: 500,
  legalComments: 'none',
}).code;

// Read and concatenate JS
let rawJs = '';
for (const jsFile of jsFiles) {
  const jsPath = path.join(assetsDir, jsFile);
  rawJs += fs.readFileSync(jsPath, 'utf8') + '\n';
}

// Transpile JS targeting Safari 12 / ES2018, strip all license comments, and limit line length to 500
// This completely prevents:
// 1. Google Apps Script truncation of ultra-long lines (which caused "SyntaxError: Unexpected token ')'")
// 2. Multi-line comment parsing issues in GAS HTML service
// 3. Any modern ES syntax incompatibility on iPadOS / Safari
const transformedJsResult = esbuild.transformSync(rawJs, {
  target: ['es2018', 'safari12'],
  minify: true,
  lineLimit: 500,
  legalComments: 'none',
});

let safeJs = transformedJsResult.code;
// Escape </script to avoid premature script tag termination in HTML
safeJs = safeJs.replace(/<\/script/gi, '<\\/script');
// Escape <? and <% so Google Apps Script never mistakes them for GAS template scriptlets
safeJs = safeJs.replace(/<\?/g, '<\\?').replace(/<%/g, '<\\%');

// Remove original link rel="stylesheet" tags for dist assets
html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'][^"']*assets\/[^"']*["'][^>]*>/gi, '');

// Remove original script tags pointing to assets
html = html.replace(/<script[^>]+src=["'][^"']*assets\/[^"']*["'][^>]*><\/script>/gi, '');

// Add light study-portal background style and error logger to head
const errorTracker = `
<style>
  html, body { background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; min-height: 100vh; }
</style>
<script>
  window.addEventListener('error', function(e) {
    console.error('Portal Runtime Error:', e);
    var rootEl = document.getElementById('root');
    if (rootEl && !rootEl.querySelector('.app-loaded')) {
      var errBox = document.getElementById('gas-debug-error');
      if (!errBox) {
        errBox = document.createElement('div');
        errBox.id = 'gas-debug-error';
        errBox.style = 'position:fixed;bottom:20px;left:20px;right:20px;background:#fff1f2;border:1px solid #fecdd3;color:#be123c;padding:16px;border-radius:10px;font-family:monospace;font-size:12px;z-index:999999;box-shadow:0 10px 25px rgba(0,0,0,0.1);';
        document.body.appendChild(errBox);
      }
      var lineCol = (e.lineno || '?') + (e.colno ? ':' + e.colno : '');
      errBox.innerHTML = '<div style="font-weight:bold;color:#e11d48;margin-bottom:6px;">⚠️ 教材データの読み込み中にエラーが発生しました</div>' +
        '<div>' + (e.message || e.error || e) + '</div>' +
        '<div style="color:#9f1239;font-size:11px;margin-top:4px;">モジュール: ' + (e.filename || 'bundle') + ' (行: ' + lineCol + ')</div>';
    }
  });
</script>
`;

// Inline CSS into <head>
const styleTag = `${errorTracker}\n<style>\n${transformedCss}\n</style>`;
if (html.includes('</head>')) {
  html = html.replace('</head>', () => `${styleTag}\n</head>`);
} else {
  html = styleTag + '\n' + html;
}

// Add educational math loading placeholder inside <div id="root">
const loadingPlaceholder = `
<div id="root">
  <div style="min-height:100vh;background:#f8fafc;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 16px;">
    <div style="max-width:768px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:12px;font-weight:700;color:#2563eb;margin-bottom:8px;">文部科学省指導要領準拠 • 中学3年・高校数学I 単元特講</div>
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px 0;">数理アカデミー 学習ポータル：二次方程式の基本解法と「解の公式」</h1>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px 0;">二次方程式 ax² + bx + c = 0 (a ≠ 0) の定義、平方根・因数分解・平方完成による解法、および解の公式 x = (-b ± √(b² - 4ac)) / (2a) と判別式 D = b² - 4ac の性質について学習します。</p>
      <div style="padding:12px 16px;background:#f1f5f9;border-radius:10px;font-family:monospace;font-weight:700;color:#0f172a;text-align:center;margin-bottom:16px;">x = (-b ± √(b² - 4ac)) / (2a)</div>
      <div id="gas-loader-status" style="font-size:13px;color:#2563eb;text-align:center;font-weight:600;">学習ポータル教材モジュールを読み込み中...</div>
    </div>
  </div>
</div>
`.trim();

html = html.replace(/<div id=["']root["']>[\s\S]*?<\/div>\s*(?=<script|<\/body>)/i, () => loadingPlaceholder);

// Write standalone bundle.js (minified and safe for CDN and direct dynamic execution)
const gasBundleJs = path.join(gasDir, 'bundle.js');
fs.writeFileSync(gasBundleJs, safeJs, 'utf8');
const bundleJsSizeKb = (fs.statSync(gasBundleJs).size / 1024).toFixed(1);
console.log(`[GAS Build] Generated gas/bundle.js (${bundleJsSizeKb} KB)`);

// Write standalone bundle.css
const gasBundleCss = path.join(gasDir, 'bundle.css');
fs.writeFileSync(gasBundleCss, transformedCss, 'utf8');

// Multi-Tier Bulletproof JS Loader:
// Tier 1: jsDelivr CDN (fastest, standard text/javascript MIME)
// Tier 2: GitHub Raw fetch (browser fetch fallback)
// Tier 3: GAS server-side UrlFetchApp bridge (100% bypasses school Wi-Fi domain blocks)
const scriptTag = `<script>
(function() {
  var isLoaded = false;
  var statusEl = document.getElementById('gas-loader-status');

  function updateStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function executeBundleCode(code) {
    if (isLoaded) return;
    isLoaded = true;
    updateStatus('学習ポータルを起動しています...');
    try {
      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.text = code;
      document.body.appendChild(s);
    } catch (e) {
      console.error('Bundle exec error:', e);
      var errEl = document.getElementById('gas-debug-error');
      if (errEl) errEl.textContent = '実行エラー: ' + (e.message || e);
    }
  }

  // Tier 1: jsDelivr CDN
  var cdnScript = document.createElement('script');
  cdnScript.type = 'text/javascript';
  cdnScript.src = 'https://cdn.jsdelivr.net/gh/na8526130-cell/aiiaia@main/gas/bundle.js?_t=' + Date.now();
  cdnScript.onload = function() {
    isLoaded = true;
  };
  cdnScript.onerror = function() {
    if (!isLoaded) tryTier2();
  };
  document.head.appendChild(cdnScript);

  // Fallback timer if Tier 1 hangs or is blocked
  setTimeout(function() {
    if (!isLoaded) {
      tryTier2();
    }
  }, 2500);

  // Tier 2: Direct raw fetch from GitHub
  function tryTier2() {
    if (isLoaded) return;
    updateStatus('GitHubから教材スクリプトを取得中...');
    fetch('https://raw.githubusercontent.com/na8526130-cell/aiiaia/main/gas/bundle.js?_t=' + Date.now())
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(code) {
        if (code && code.length > 5000) {
          executeBundleCode(code);
        } else {
          tryTier3();
        }
      })
      .catch(function(err) {
        console.warn('Tier 2 fetch failed:', err);
        tryTier3();
      });
  }

  // Tier 3: GAS server-side UrlFetchApp bridge (Google cloud backend bypasses network filters)
  function tryTier3() {
    if (isLoaded) return;
    updateStatus('GASクラウド経由で教材データを取得中...');
    if (window.google && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function(res) {
          if (res && res.code && res.code.length > 5000) {
            executeBundleCode(res.code);
          } else if (typeof res === 'string' && res.length > 5000) {
            executeBundleCode(res);
          } else {
            updateStatus('⚠️ 教材スクリプトの取得に失敗しました。再読み込みしてください。');
          }
        })
        .withFailureHandler(function(err) {
          updateStatus('⚠️ 取得エラー: ' + (err && err.message ? err.message : String(err)));
        })
        .getRemoteBundleJs();
    } else {
      updateStatus('⚠️ スクリプトの読み込みがタイムアウトしました。');
    }
  }
})();
</script>`;

if (html.includes('</body>')) {
  html = html.replace('</body>', () => `${scriptTag}\n</body>`);
} else {
  html = html + '\n' + scriptTag;
}

// Write to gas/index.html
const gasIndexHtml = path.join(gasDir, 'index.html');
fs.writeFileSync(gasIndexHtml, html, 'utf8');

const sizeKb = (fs.statSync(gasIndexHtml).size / 1024).toFixed(1);
console.log(`[GAS Build] Successfully generated lightweight gas/index.html (${sizeKb} KB)`);

