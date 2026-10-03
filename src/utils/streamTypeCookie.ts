/**
 * streamTypeCookie.ts
 * デフォルト再生方式の保存 ＋ 10年間有効Cookie（StreamType）への二重保存モジュール
 *
 * 起動時のデフォルト再生モード（通常＝Edu / タイプ2＝ストリーム 等）を固定し、
 * localStorage と有効期限3650日（10年間）の Cookie (StreamType) の両方に二重保存します。
 */

import { PlaybackMode } from '../types';

const COOKIE_NAME = 'StreamType';
const MODE_COOKIE_NAME = 'KaitoStreamMode';
const LS_STREAM_TYPE_KEY = 'StreamType';
const LS_DEFAULT_MODE_KEY = 'kaito_default_playback_mode';
const TEN_YEARS_DAYS = 3650;
const TEN_YEARS_SECONDS = TEN_YEARS_DAYS * 24 * 60 * 60; // 315,360,000 seconds

function setTenYearCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + TEN_YEARS_SECONDS * 1000).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; max-age=${TEN_YEARS_SECONDS}; path=/; SameSite=Lax`;
  } catch {}
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const target = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith(target)) {
        return decodeURIComponent(trimmed.slice(target.length));
      }
    }
  } catch {}
  return null;
}

/**
 * Convert PlaybackMode to na8526130-cell/youtube compatible StreamType ('normal' | 'type2')
 */
export function playbackModeToStreamType(mode: PlaybackMode): 'normal' | 'type2' {
  if (
    mode === 'stream-sync' ||
    mode === 'stream-high' ||
    mode === 'stream-ytdlp' ||
    mode === 'stream-360' ||
    mode === 'stream-audio' ||
    mode === 'stream-normal'
  ) {
    return 'type2';
  }
  return 'normal';
}

/**
 * Dual-save default playback mode to both localStorage and 10-year Cookie (StreamType)
 */
export function saveDefaultPlaybackMode(mode: PlaybackMode): void {
  const streamType = playbackModeToStreamType(mode);
  try {
    localStorage.setItem(LS_DEFAULT_MODE_KEY, mode);
    localStorage.setItem(LS_STREAM_TYPE_KEY, streamType);
  } catch {}
  setTenYearCookie(COOKIE_NAME, streamType);
  setTenYearCookie(MODE_COOKIE_NAME, mode);
}

/**
 * Load saved default playback mode from localStorage or 10-year Cookie (StreamType)
 */
export function loadDefaultPlaybackMode(): PlaybackMode {
  try {
    const lsMode = localStorage.getItem(LS_DEFAULT_MODE_KEY) as PlaybackMode | null;
    const cookieMode = getCookieValue(MODE_COOKIE_NAME) as PlaybackMode | null;
    const streamTypeCookie = getCookieValue(COOKIE_NAME);
    const streamTypeLs = localStorage.getItem(LS_STREAM_TYPE_KEY);

    const validModes: PlaybackMode[] = [
      'education',
      'stream-sync',
      'stream-high',
      'stream-ytdlp',
      'stream-360',
      'stream-audio',
      'nocookie'
    ];

    if (lsMode && validModes.includes(lsMode)) {
      // Ensure cookie stays in sync with localStorage
      setTenYearCookie(COOKIE_NAME, playbackModeToStreamType(lsMode));
      setTenYearCookie(MODE_COOKIE_NAME, lsMode);
      return lsMode;
    }

    if (cookieMode && validModes.includes(cookieMode)) {
      localStorage.setItem(LS_DEFAULT_MODE_KEY, cookieMode);
      localStorage.setItem(LS_STREAM_TYPE_KEY, playbackModeToStreamType(cookieMode));
      return cookieMode;
    }

    const st = streamTypeCookie || streamTypeLs;
    if (st === 'type2' || st === '2' || st === 'stream') {
      return 'stream-sync';
    }
  } catch {}

  return 'education';
}

export function getSavedStreamTypeCookie(): string {
  return getCookieValue(COOKIE_NAME) || localStorage.getItem(LS_STREAM_TYPE_KEY) || 'normal';
}
