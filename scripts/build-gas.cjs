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

// Add dark background style and error logger to head
const errorTracker = `
<style>
  html, body { background-color: #0a0a0a !important; color: #ffffff; margin: 0; padding: 0; min-height: 100vh; }
</style>
<script>
  window.addEventListener('error', function(e) {
    console.error('GAS App Runtime Error:', e);
    var rootEl = document.getElementById('root');
    if (rootEl && !rootEl.querySelector('.app-loaded')) {
      var errBox = document.getElementById('gas-debug-error');
      if (!errBox) {
        errBox = document.createElement('div');
        errBox.id = 'gas-debug-error';
        errBox.style = 'position:fixed;bottom:20px;left:20px;right:20px;background:#22050b;border:1px solid #e11d48;color:#fecdd3;padding:16px;border-radius:10px;font-family:monospace;font-size:12px;z-index:999999;box-shadow:0 10px 25px rgba(0,0,0,0.5);';
        document.body.appendChild(errBox);
      }
      var lineCol = (e.lineno || '?') + (e.colno ? ':' + e.colno : '');
      errBox.innerHTML = '<div style="font-weight:bold;color:#ff4466;margin-bottom:6px;">⚠️ 画面の読み込み中にエラーが発生しました</div>' +
        '<div>' + (e.message || e.error || e) + '</div>' +
        '<div style="color:#fda4af;font-size:11px;margin-top:4px;">ファイル: ' + (e.filename || 'bundle') + ' (行: ' + lineCol + ')</div>';
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

// Add dark loading placeholder inside <div id="root">
const loadingPlaceholder = `
<div id="root">
  <div style="background-color:#0a0a0a;color:#ffffff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
    <div style="width:40px;height:40px;border:3.5px solid #e11d48;border-top-color:transparent;border-radius:50%;animation:gasspin 0.8s linear infinite;margin-bottom:16px;"></div>
    <div style="font-size:16px;font-weight:bold;letter-spacing:0.5px;">海斗<span style="color:#e11d48;">tube</span> を読み込み中...</div>
    <style>@keyframes gasspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
  </div>
</div>
`.trim();

html = html.replace(/<div id=["']root["']>\s*<\/div>/i, () => loadingPlaceholder);

// Inline JS into <body> as standard classic script
const scriptTag = `<script>\n${safeJs}\n</script>`;
if (html.includes('</body>')) {
  html = html.replace('</body>', () => `${scriptTag}\n</body>`);
} else {
  html = html + '\n' + scriptTag;
}

// Write to gas/index.html
const gasIndexHtml = path.join(gasDir, 'index.html');
fs.writeFileSync(gasIndexHtml, html, 'utf8');

const sizeKb = (fs.statSync(gasIndexHtml).size / 1024).toFixed(1);
console.log(`[GAS Build] Successfully generated standalone gas/index.html (${sizeKb} KB)`);

