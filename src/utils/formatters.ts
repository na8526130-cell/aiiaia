// Helper formatters for view count, duration, dates, and timestamp parsing

export function formatViewCount(countStr?: string | number): string {
  if (!countStr) return '0 回視聴';
  const num = typeof countStr === 'string' ? parseInt(countStr, 10) : countStr;
  if (isNaN(num)) return '0 回視聴';

  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(1)}億 回視聴`;
  }
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}万 回視聴`;
  }
  return `${num.toLocaleString()} 回視聴`;
}

export function formatSubscriberCount(countStr?: string | number): string {
  if (!countStr) return '0人';
  const num = typeof countStr === 'string' ? parseInt(countStr, 10) : countStr;
  if (isNaN(num)) return '0人';

  if (num >= 100000000) {
    return `チャンネル登録者数 ${(num / 100000000).toFixed(1)}億人`;
  }
  if (num >= 10000) {
    return `チャンネル登録者数 ${(num / 10000).toFixed(1)}万人`;
  }
  return `チャンネル登録者数 ${num.toLocaleString()}人`;
}

export function formatPublishedAt(isoDate?: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 30) return `${diffDay}日前`;
  if (diffMonth < 12) return `${diffMonth}ヶ月前`;
  return `${diffYear}年前`;
}

export function formatISO8601Duration(durationStr?: string): string {
  if (!durationStr) return '0:00';
  if (!durationStr.startsWith('P')) return durationStr;

  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  const formattedSec = seconds < 10 ? `0${seconds}` : `${seconds}`;

  if (hours > 0) {
    const formattedMin = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${formattedMin}:${formattedSec}`;
  }

  return `${minutes}:${formattedSec}`;
}

export function parseDurationToSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  if (!durationStr.startsWith('P')) {
    // If e.g. "12:45"
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }

  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

export interface DescriptionTimestamp {
  timeText: string;
  seconds: number;
  label: string;
}

export function extractTimestamps(description?: string): DescriptionTimestamp[] {
  if (!description) return [];

  const timestampRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/g;
  const lines = description.split('\n');
  const results: DescriptionTimestamp[] = [];

  for (const line of lines) {
    let match;
    while ((match = timestampRegex.exec(line)) !== null) {
      const fullTimeStr = match[0];
      const hrs = match[1] ? parseInt(match[1], 10) : 0;
      const mins = parseInt(match[2], 10);
      const secs = parseInt(match[3], 10);
      const totalSecs = hrs * 3600 + mins * 60 + secs;

      // Extract label around or after timestamp in line
      const cleanLabel = line.replace(fullTimeStr, '').trim() || 'チャプター';

      results.push({
        timeText: fullTimeStr,
        seconds: totalSecs,
        label: cleanLabel.slice(0, 40)
      });
    }
  }

  return results;
}

export function isShortVideo(video?: { snippet?: { title?: string; description?: string }; contentDetails?: { duration?: string } } | null): boolean {
  if (!video) return false;
  const title = (video.snippet?.title || '').toLowerCase();
  const description = (video.snippet?.description || '').toLowerCase();

  // Explicit short indicators in title or description
  if (
    title.includes('#shorts') ||
    title.includes('#short') ||
    title.includes('#ショート') ||
    title.includes('shorts') ||
    description.includes('#shorts') ||
    description.includes('#short') ||
    description.includes('#ショート')
  ) {
    return true;
  }

  // Check duration if available (under 61 seconds)
  if (video.contentDetails?.duration) {
    const secs = parseDurationToSeconds(video.contentDetails.duration);
    if (secs > 0 && secs <= 60) {
      return true;
    }
  }

  return false;
}

// 3-way Hybrid Duration Parser (ISO 8601, Colon mm:ss / hh:mm:ss, Japanese X分Y秒)
export function parseAnyDurationToSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();

  // 1. ISO 8601 (e.g. PT1H23M45S)
  if (str.startsWith('P')) {
    const match = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const h = parseInt(match[1] || '0', 10);
      const m = parseInt(match[2] || '0', 10);
      const s = parseInt(match[3] || '0', 10);
      return h * 3600 + m * 60 + s;
    }
  }

  // 2. Japanese text (e.g. 1時間23分45秒 or 4分30秒 or 50秒)
  if (str.includes('分') || str.includes('秒') || str.includes('時間')) {
    let total = 0;
    const hMatch = str.match(/(\d+)\s*時間/);
    const mMatch = str.match(/(\d+)\s*分/);
    const sMatch = str.match(/(\d+)\s*秒/);
    if (hMatch) total += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) total += parseInt(mMatch[1], 10) * 60;
    if (sMatch) total += parseInt(sMatch[1], 10);
    if (total > 0) return total;
  }

  // 3. Colon format (e.g. 01:23:45 or 03:20 or 45)
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseInt(p.trim(), 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
  }

  const rawNum = parseInt(str, 10);
  return isNaN(rawNum) ? 0 : rawNum;
}

export function formatSecondsToHHMMSS(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const formattedSec = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const formattedMin = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${formattedMin}:${formattedSec}`;
  }
  return `${m}:${formattedSec}`;
}

// Precision Cosine Easing Smooth Scroll (1 - cos(π * t)) / 2
export function smoothCosineScrollTo(targetY: number, duration = 400): Promise<void> {
  return new Promise((resolve) => {
    // Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: targetY });
      resolve();
      return;
    }

    const startY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) {
      resolve();
      return;
    }

    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Cosine ease in-out
      const ease = (1 - Math.cos(Math.PI * progress)) / 2;
      window.scrollTo(0, startY + diff * ease);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        window.scrollTo(0, targetY);
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

// Scroll element smoothly into center with fallback
export function scrollElementToCenter(elem: HTMLElement | null, duration = 400): void {
  if (!elem) return;
  const rect = elem.getBoundingClientRect();
  const elemCenter = rect.top + window.pageYOffset - (window.innerHeight / 2) + (rect.height / 2);
  smoothCosineScrollTo(Math.max(0, elemCenter), duration);
}

// ASCII Symbol Fallback Identifier for Missing Thumbnails
export function getThumbnailPlaceholderSymbol(type: 'video' | 'short' | 'playlist' | 'channel', title?: string): string {
  if (type === 'short') return '▶';
  if (type === 'playlist') return '▤';
  if (type === 'channel') {
    const char = (title || 'C').trim().charAt(0).toUpperCase();
    return char || '●';
  }
  return '▷';
}

export function cleanCommentText(textOriginal?: string, textDisplay?: string): string {
  const text = textOriginal || textDisplay || '';
  if (!text) return '';
  return text
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Format premiere scheduled date in Japan Standard Time (JST)
 * Outputs e.g. "2026年9月20日 21時00分"
 */
export function formatPremiereDateJST(dateInput?: string | number | null): string {
  if (!dateInput) return 'まもなく公開予定';
  try {
    let ms: number;
    if (typeof dateInput === 'number') {
      ms = dateInput < 1e11 ? dateInput * 1000 : dateInput;
    } else if (typeof dateInput === 'string' && /^\d+$/.test(dateInput.trim())) {
      const num = Number(dateInput.trim());
      ms = num < 1e11 ? num * 1000 : num;
    } else {
      ms = new Date(dateInput).getTime();
    }
    if (isNaN(ms)) return String(dateInput);

    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(ms));
    const find = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return `${find('year')}年${find('month')}月${find('day')}日 ${find('hour')}時${find('minute')}分`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format waiting count (e.g. "1,250人が待機中")
 */
export function formatWaitingCount(count?: string | number | null): string {
  if (!count) return '待機中';
  const num = typeof count === 'string' ? parseInt(count.replace(/[^0-9]/g, ''), 10) : count;
  if (isNaN(num) || num <= 0) return '待機中';
  return `${num.toLocaleString('ja-JP')}人が待機中`;
}

/**
 * Detect if a video is a scheduled premiere
 */
export function isPremiereScheduled(video: any): boolean {
  if (!video) return false;
  const status = video.status || '';
  const broadcast = video.snippet?.liveBroadcastContent || '';
  return Boolean(
    status === 'premiere_scheduled' ||
    broadcast === 'upcoming' ||
    video.premiereTimestamp ||
    video.scheduledStartTime ||
    video.liveStreamingDetails?.scheduledStartTime ||
    video.premiere === true ||
    video.isUpcoming === true
  );
}

/**
 * Extract scheduled premiere timestamp / ISO string
 */
export function getPremiereScheduledTime(video: any): string | number | null {
  if (!video) return null;
  return (
    video.scheduledStartTime ||
    video.liveStreamingDetails?.scheduledStartTime ||
    video.premiereTimestamp ||
    video.premiereDate ||
    (video.status === 'premiere_scheduled' ? video.snippet?.publishedAt : null)
  );
}

export interface ParsedYouTubeUrl {
  videoId: string | null;
  isShort: boolean;
  timestamp?: number;
}

/**
 * Parse any YouTube URL (including shorts, watch?v=, youtu.be, embed)
 * Returns the videoId and whether it is a Shorts URL (e.g. /shorts/<id> or containing #shorts / short)
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl {
  if (!input) return { videoId: null, isShort: false };
  const raw = String(input).trim();

  // 1. YouTube Shorts format: youtube.com/shorts/<VIDEO_ID>
  const shortsRegex = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i;
  const shortsMatch = raw.match(shortsRegex);
  if (shortsMatch && shortsMatch[1]) {
    return {
      videoId: shortsMatch[1],
      isShort: true
    };
  }

  // 2. Standard watch URL: youtube.com/watch?v=<VIDEO_ID>
  const watchRegex = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i;
  const watchMatch = raw.match(watchRegex);
  if (watchMatch && watchMatch[1]) {
    const isExplicitShort = raw.toLowerCase().includes('shorts') || raw.toLowerCase().includes('#shorts');
    return {
      videoId: watchMatch[1],
      isShort: isExplicitShort
    };
  }

  // 3. Shortened URL: youtu.be/<VIDEO_ID>
  const shortDomainRegex = /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i;
  const shortDomainMatch = raw.match(shortDomainRegex);
  if (shortDomainMatch && shortDomainMatch[1]) {
    const isExplicitShort = raw.toLowerCase().includes('shorts') || raw.toLowerCase().includes('#shorts');
    return {
      videoId: shortDomainMatch[1],
      isShort: isExplicitShort
    };
  }

  // 4. Embed / Education URL: (youtube.com|youtubeeducation.com|youtube-nocookie.com)/embed/<VIDEO_ID>
  const embedRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube|youtubeeducation|youtube-nocookie)\.com\/embed\/([a-zA-Z0-9_-]{11})/i;
  const embedMatch = raw.match(embedRegex);
  if (embedMatch && embedMatch[1]) {
    const isExplicitShort = raw.toLowerCase().includes('shorts') || raw.toLowerCase().includes('#shorts');
    return {
      videoId: embedMatch[1],
      isShort: isExplicitShort
    };
  }

  // 5. Bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return {
      videoId: raw,
      isShort: false
    };
  }

  return { videoId: null, isShort: false };
}

