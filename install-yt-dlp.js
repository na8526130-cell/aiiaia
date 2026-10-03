/**
 * install-yt-dlp.js
 * OS（Win/Mac/Linux）を自動判別して公式GitHubから ./bin/yt-dlp 実行ファイルを自動ダウンロードし、
 * サーバーから直接実行できるようにセットアップするスクリプト
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, 'bin');
const platform = os.platform();

let assetName = 'yt-dlp';
let targetFileName = 'yt-dlp';

if (platform === 'win32') {
  assetName = 'yt-dlp.exe';
  targetFileName = 'yt-dlp.exe';
} else if (platform === 'darwin') {
  assetName = 'yt-dlp_macos';
  targetFileName = 'yt-dlp';
} else if (platform === 'linux') {
  assetName = 'yt-dlp_linux';
  targetFileName = 'yt-dlp';
}

const TARGET_PATH = path.join(BIN_DIR, targetFileName);
const DOWNLOAD_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) {
      reject(new Error('Too many redirects while downloading yt-dlp'));
      return;
    }

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'kaito-tube-yt-dlp-installer/1.0'
        },
        timeout: 20000
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadFile(res.headers.location, dest, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} when downloading ${url}`));
          return;
        }

        const tempPath = `${dest}.tmp`;
        const fileStream = fs.createWriteStream(tempPath);

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              fs.renameSync(tempPath, dest);
              if (platform !== 'win32') {
                fs.chmodSync(dest, 0o755);
              }
              resolve(dest);
            } catch (err) {
              reject(err);
            }
          });
        });

        fileStream.on('error', (err) => {
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch {}
          reject(err);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Download request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

export async function ensureYtDlpInstalled(force = false) {
  try {
    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    if (!force && fs.existsSync(TARGET_PATH)) {
      const stat = fs.statSync(TARGET_PATH);
      if (stat.size > 1024 * 100) {
        if (platform !== 'win32') {
          try {
            fs.chmodSync(TARGET_PATH, 0o755);
          } catch {}
        }
        return TARGET_PATH;
      }
    }

    console.log(`[yt-dlp installer] Downloading ${assetName} for ${platform} from GitHub...`);
    await downloadFile(DOWNLOAD_URL, TARGET_PATH);
    console.log(`[yt-dlp installer] Successfully installed to ${TARGET_PATH}`);
    return TARGET_PATH;
  } catch (err) {
    console.warn(`[yt-dlp installer] Could not download yt-dlp binary (${err?.message || err}). Falling back to system yt-dlp if available.`);
    return null;
  }
}

// Run directly if invoked via `node install-yt-dlp.js`
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  ensureYtDlpInstalled().then(() => {
    process.exit(0);
  });
}
