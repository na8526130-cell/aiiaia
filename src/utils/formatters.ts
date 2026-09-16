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

