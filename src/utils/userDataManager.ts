import { YouTubeVideoItem, UserCustomPlaylist } from '../types';
import {
  SubscribedChannel,
  BlockedChannel,
  getSubscribedChannels,
  getBlockedChannels
} from './channelStorage';
import {
  savePlaylistsToIDB,
  saveVideoToHistoryIDB
} from './indexedDbStorage';

const UP_NEXT_QUEUE_KEY = 'kaito_up_next_queue_v1';
const SEARCH_HISTORY_KEY = 'kaito_search_history_v1';
const LEGACY_SEARCH_HISTORY_KEY = 'search_history';
const PINNED_TAGS_KEY = 'kaito_pinned_search_tags_v2';
const SAVED_VIDEOS_KEY = 'kaito_saved_videos';
const WATCH_HISTORY_KEY = 'kaito_watch_history';
const CUSTOM_PLAYLISTS_KEY = 'kaito_custom_playlists';
const SUBS_KEY = 'kaito_subscribed_channels_list';
const BLOCKED_KEY = 'kaito_blocked_channels';

const DEFAULT_PINNED_TAGS = [
  '髭男'
];

export function getVideoUniqueId(video?: YouTubeVideoItem | null): string {
  if (!video) return '';
  if (video.playlistId) return video.playlistId;
  if (typeof video.id === 'string') return video.id;
  return (video.id as any)?.videoId || (video.id as any)?.playlistId || (video.id as any)?.channelId || '';
}

export function showGlobalToast(message: string) {
  window.dispatchEvent(new CustomEvent('kaito_global_toast', { detail: { message } }));
}

// ==========================================
// 1. UP NEXT QUEUE (次に再生 / 一時キュー)
// ==========================================
export function getUpNextQueue(): YouTubeVideoItem[] {
  try {
    const raw = sessionStorage.getItem(UP_NEXT_QUEUE_KEY) || localStorage.getItem(UP_NEXT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUpNextQueue(queue: YouTubeVideoItem[]) {
  try {
    const serialized = JSON.stringify(queue);
    sessionStorage.setItem(UP_NEXT_QUEUE_KEY, serialized);
    localStorage.setItem(UP_NEXT_QUEUE_KEY, serialized);
    window.dispatchEvent(new CustomEvent('kaito_queue_changed', { detail: queue }));
  } catch (e) {
    console.error('Failed to save queue:', e);
  }
}

/**
 * Add video right at the top of the Up Next Queue ("次に再生に追加")
 */
export function addToUpNextQueueNext(video: YouTubeVideoItem): YouTubeVideoItem[] {
  const id = getVideoUniqueId(video);
  if (!id) return getUpNextQueue();
  const current = getUpNextQueue().filter((v) => getVideoUniqueId(v) !== id);
  const updated = [video, ...current];
  saveUpNextQueue(updated);
  showGlobalToast(`「${(video.snippet?.title || '動画').slice(0, 28)}」を次に再生へ予約しました`);
  return updated;
}

/**
 * Add video to the end of the Up Next Queue ("キューの最後尾に追加")
 */
export function addToUpNextQueueTail(video: YouTubeVideoItem): YouTubeVideoItem[] {
  const id = getVideoUniqueId(video);
  if (!id) return getUpNextQueue();
  const current = getUpNextQueue().filter((v) => getVideoUniqueId(v) !== id);
  const updated = [...current, video];
  saveUpNextQueue(updated);
  showGlobalToast(`「${(video.snippet?.title || '動画').slice(0, 28)}」をキューの最後尾に追加しました`);
  return updated;
}

export function removeFromUpNextQueue(videoOrId: YouTubeVideoItem | string): YouTubeVideoItem[] {
  const targetId = typeof videoOrId === 'string' ? videoOrId : getVideoUniqueId(videoOrId);
  const updated = getUpNextQueue().filter((v) => getVideoUniqueId(v) !== targetId);
  saveUpNextQueue(updated);
  return updated;
}

export function moveInUpNextQueue(index: number, direction: 'up' | 'down'): YouTubeVideoItem[] {
  const current = [...getUpNextQueue()];
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= current.length || targetIdx < 0 || targetIdx >= current.length) {
    return current;
  }
  const temp = current[index];
  current[index] = current[targetIdx];
  current[targetIdx] = temp;
  saveUpNextQueue(current);
  return current;
}

export function shuffleUpNextQueue(): YouTubeVideoItem[] {
  const current = [...getUpNextQueue()];
  for (let i = current.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [current[i], current[j]] = [current[j], current[i]];
  }
  saveUpNextQueue(current);
  showGlobalToast('再生キューをシャッフルしました');
  return current;
}

export function clearUpNextQueue(): YouTubeVideoItem[] {
  saveUpNextQueue([]);
  return [];
}

export function popNextFromUpNextQueue(): YouTubeVideoItem | null {
  const current = getUpNextQueue();
  if (current.length === 0) return null;
  const [nextItem, ...rest] = current;
  saveUpNextQueue(rest);
  return nextItem;
}

// ==========================================
// 2. SEARCH HISTORY & PINNED SEARCH TAGS
// ==========================================
export function getSearchHistory(): string[] {
  try {
    const rawPrimary = localStorage.getItem(SEARCH_HISTORY_KEY);
    const rawLegacy = localStorage.getItem(LEGACY_SEARCH_HISTORY_KEY);
    const listPrimary: string[] = rawPrimary ? JSON.parse(rawPrimary) : [];
    const listLegacy: string[] = rawLegacy ? JSON.parse(rawLegacy) : [];
    if (!Array.isArray(listPrimary) && !Array.isArray(listLegacy)) return [];
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const item of [...(Array.isArray(listPrimary) ? listPrimary : []), ...(Array.isArray(listLegacy) ? listLegacy : [])]) {
      const s = String(item || '').trim();
      if (s && !seen.has(s.toLowerCase())) {
        seen.add(s.toLowerCase());
        merged.push(s);
      }
    }
    return merged.slice(0, 24);
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return getSearchHistory();
  const current = getSearchHistory().filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...current].slice(0, 24);
  try {
    const serialized = JSON.stringify(updated);
    localStorage.setItem(SEARCH_HISTORY_KEY, serialized);
    localStorage.setItem(LEGACY_SEARCH_HISTORY_KEY, serialized);
    window.dispatchEvent(new CustomEvent('kaito_search_tags_changed'));
  } catch {}
  return updated;
}

export function removeSearchHistoryItem(query: string): string[] {
  const target = query.trim().toLowerCase();
  const updated = getSearchHistory().filter((q) => q.trim().toLowerCase() !== target);
  try {
    const serialized = JSON.stringify(updated);
    localStorage.setItem(SEARCH_HISTORY_KEY, serialized);
    localStorage.setItem(LEGACY_SEARCH_HISTORY_KEY, serialized);
    window.dispatchEvent(new CustomEvent('kaito_search_tags_changed'));
  } catch {}
  return updated;
}

export function clearSearchHistory(): string[] {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    localStorage.removeItem(LEGACY_SEARCH_HISTORY_KEY);
    window.dispatchEvent(new CustomEvent('kaito_search_tags_changed'));
  } catch {}
  return [];
}

export function getPinnedSearchTags(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_TAGS_KEY);
    if (raw === null) {
      localStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(DEFAULT_PINNED_TAGS));
      return DEFAULT_PINNED_TAGS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_PINNED_TAGS;
  }
}

export function isSearchTagPinned(tag: string): boolean {
  const trimmed = tag.trim().toLowerCase();
  return getPinnedSearchTags().some((t) => t.toLowerCase() === trimmed);
}

export function togglePinnedSearchTag(tag: string): string[] {
  const trimmed = tag.trim();
  if (!trimmed) return getPinnedSearchTags();
  const current = getPinnedSearchTags();
  const exists = current.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  let updated: string[];
  if (exists) {
    updated = current.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    showGlobalToast(`ピン留めタグ「${trimmed}」を解除しました`);
  } else {
    updated = [trimmed, ...current];
    showGlobalToast(`「${trimmed}」を検索バー下にピン留めしました`);
  }
  try {
    localStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('kaito_search_tags_changed'));
  } catch {}
  return updated;
}

// ==========================================
// 3. CUSTOM PLAYLIST VIDEO MANAGEMENT & PUBLIC/PRIVATE SHARING & CLONE
// ==========================================
export function getCustomPlaylistsFromStorage(): UserCustomPlaylist[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PLAYLISTS_KEY);
    const parsed: UserCustomPlaylist[] = raw ? JSON.parse(raw) : [];
    return parsed.map((pl) => ({
      ...pl,
      visibility: pl.visibility || (pl.isPublic ? 'public' : 'private'),
      isPublic: Boolean(pl.isPublic || pl.visibility === 'public')
    }));
  } catch {
    return [];
  }
}

function saveCustomPlaylistsToStorage(playlists: UserCustomPlaylist[]) {
  try {
    localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(playlists));
    savePlaylistsToIDB(playlists).catch(() => {});
    window.dispatchEvent(new CustomEvent('kaito_custom_playlists_changed', { detail: playlists }));
  } catch (e) {
    console.error('Failed to save custom playlists:', e);
  }
}

/**
 * Sync a playlist with the server's public playlists registry when public, or remove when private
 */
export async function syncPlaylistWithServer(pl: UserCustomPlaylist): Promise<boolean> {
  const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
  try {
    if (isPub) {
      const res = await fetch('/api/playlists/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: { ...pl, visibility: 'public', isPublic: true } })
      });
      return res.ok;
    } else {
      const res = await fetch(`/api/playlists/${encodeURIComponent(pl.id)}/unpublish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}

/**
 * Encode a playlist into a compact share token so URL sharing works even across different server instances
 */
export function encodePlaylistShareToken(pl: UserCustomPlaylist): string {
  try {
    const compact = {
      i: pl.id,
      t: pl.title,
      d: (pl.description || '').slice(0, 200),
      a: pl.authorName || '海斗tube ユーザー',
      c: pl.createdAt || new Date().toLocaleDateString('ja-JP'),
      v: (pl.videos || []).slice(0, 60).map((v) => {
        const vid = getVideoUniqueId(v);
        return {
          i: vid,
          t: (v.snippet?.title || '').slice(0, 100),
          ch: (v.snippet?.channelTitle || '').slice(0, 50),
          ci: v.snippet?.channelId || '',
          du: v.contentDetails?.duration || ''
        };
      })
    };
    const json = JSON.stringify(compact);
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

/**
 * Decode a share token or share URL into a UserCustomPlaylist
 */
export function decodePlaylistShareToken(rawInput: string): UserCustomPlaylist | null {
  try {
    let token = rawInput.trim();
    if (!token) return null;

    // Extract pl_token or KAITO_PL: if full URL or prefixed code was passed
    if (token.includes('pl_token=')) {
      const u = new URL(token.startsWith('http') ? token : `https://dummy.local/${token}`);
      token = u.searchParams.get('pl_token') || '';
    } else if (token.startsWith('KAITO_PL:')) {
      token = token.replace(/^KAITO_PL:/, '').trim();
    }

    if (!token) return null;
    const jsonStr = decodeURIComponent(escape(atob(token)));
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !parsed.t || !Array.isArray(parsed.v)) return null;

    const videos: YouTubeVideoItem[] = parsed.v
      .filter((item: any) => item && item.i)
      .map((item: any) => ({
        id: String(item.i),
        kind: 'youtube#video',
        snippet: {
          publishedAt: new Date().toISOString(),
          channelId: item.ci || '',
          title: item.t || 'YouTube Video',
          description: '',
          channelTitle: item.ch || 'YouTube',
          thumbnails: {
            high: { url: `https://i.ytimg.com/vi/${item.i}/hqdefault.jpg` },
            medium: { url: `https://i.ytimg.com/vi/${item.i}/mqdefault.jpg` },
            default: { url: `https://i.ytimg.com/vi/${item.i}/default.jpg` }
          }
        },
        contentDetails: {
          duration: item.du || 'PT0M0S'
        }
      }));

    return {
      id: String(parsed.i || `shared_${Date.now()}`),
      title: String(parsed.t),
      description: String(parsed.d || ''),
      authorName: String(parsed.a || '共有ユーザー'),
      createdAt: String(parsed.c || new Date().toLocaleDateString('ja-JP')),
      visibility: 'public',
      isPublic: true,
      videos
    };
  } catch {
    return null;
  }
}

/**
 * Build a shareable URL for a public playlist
 */
export function buildPlaylistShareUrl(pl: UserCustomPlaylist): string {
  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const token = encodePlaylistShareToken(pl);
  const params = new URLSearchParams();
  params.set('shared_playlist', pl.id);
  if (token) {
    params.set('pl_token', token);
  }
  return `${base}?${params.toString()}`;
}

/**
 * Fetch public playlists from server
 */
export async function fetchPublicPlaylistsFromServer(query = ''): Promise<UserCustomPlaylist[]> {
  try {
    const qParam = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    const res = await fetch(`/api/playlists/public${qParam}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

/**
 * Resolve a shared playlist by ID, share URL, or share code
 */
export async function fetchSharedPlaylistByIdOrInput(rawInput: string): Promise<UserCustomPlaylist | null> {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Check if input has a share token embedded
  const fromToken = decodePlaylistShareToken(trimmed);

  // 2. Extract shared_playlist ID if URL
  let targetId = trimmed;
  if (trimmed.includes('shared_playlist=')) {
    try {
      const u = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.local/${trimmed}`);
      targetId = u.searchParams.get('shared_playlist') || '';
    } catch {}
  }

  // 3. Try server lookup first for full metadata
  if (targetId && !targetId.startsWith('KAITO_PL:') && !targetId.includes(' ')) {
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.playlist) {
          return data.playlist as UserCustomPlaylist;
        }
      }
    } catch {}
  }

  return fromToken;
}

/**
 * Toggle or set a custom playlist's visibility (Public / Private)
 */
export async function updateCustomPlaylistVisibility(
  playlistId: string,
  visibility: 'public' | 'private',
  authorName?: string
): Promise<UserCustomPlaylist[]> {
  const current = getCustomPlaylistsFromStorage();
  let updatedTarget: UserCustomPlaylist | null = null;
  const updated = current.map((pl) => {
    if (pl.id !== playlistId) return pl;
    updatedTarget = {
      ...pl,
      visibility,
      isPublic: visibility === 'public',
      authorName: authorName !== undefined ? authorName : pl.authorName || '海斗tube ユーザー',
      updatedAt: new Date().toLocaleDateString('ja-JP')
    };
    return updatedTarget;
  });

  saveCustomPlaylistsToStorage(updated);
  if (updatedTarget) {
    await syncPlaylistWithServer(updatedTarget);
    showGlobalToast(
      visibility === 'public'
        ? `「${(updatedTarget as UserCustomPlaylist).title}」を公開（Public）に設定しました`
        : `「${(updatedTarget as UserCustomPlaylist).title}」を非公開（Private）に設定しました`
    );
  }
  return updated;
}

/**
 * Update custom playlist title, description, visibility, or authorName
 */
export async function updateCustomPlaylistMeta(
  playlistId: string,
  updates: {
    title?: string;
    description?: string;
    visibility?: 'public' | 'private';
    authorName?: string;
  }
): Promise<UserCustomPlaylist[]> {
  const current = getCustomPlaylistsFromStorage();
  let updatedTarget: UserCustomPlaylist | null = null;
  const updated = current.map((pl) => {
    if (pl.id !== playlistId) return pl;
    const nextVis = updates.visibility || pl.visibility || (pl.isPublic ? 'public' : 'private');
    updatedTarget = {
      ...pl,
      title: updates.title !== undefined ? updates.title : pl.title,
      description: updates.description !== undefined ? updates.description : pl.description,
      visibility: nextVis,
      isPublic: nextVis === 'public',
      authorName: updates.authorName !== undefined ? updates.authorName : pl.authorName,
      updatedAt: new Date().toLocaleDateString('ja-JP')
    };
    return updatedTarget;
  });

  saveCustomPlaylistsToStorage(updated);
  if (updatedTarget) {
    await syncPlaylistWithServer(updatedTarget);
    showGlobalToast(`プレイリスト「${(updatedTarget as UserCustomPlaylist).title}」の設定を更新しました`);
  }
  return updated;
}

/**
 * Clone (duplicate) any playlist (another user's public playlist, YouTube playlist, or own playlist) into user's local custom playlists
 */
export async function clonePlaylistToCustomPlaylists(
  sourcePl: UserCustomPlaylist,
  options?: { customTitle?: string; visibility?: 'public' | 'private'; authorName?: string }
): Promise<UserCustomPlaylist> {
  const current = getCustomPlaylistsFromStorage();
  const isOwnSameTitle = current.some((p) => p.title === sourcePl.title);
  const finalTitle =
    options?.customTitle?.trim() ||
    (isOwnSameTitle ? `${sourcePl.title} (複製)` : sourcePl.title);
  const vis = options?.visibility || 'private';

  const cloned: UserCustomPlaylist = {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: finalTitle,
    description: sourcePl.description || `${sourcePl.authorName ? `${sourcePl.authorName} の公開プレイリストから複製` : ''}`,
    createdAt: new Date().toLocaleDateString('ja-JP'),
    updatedAt: new Date().toLocaleDateString('ja-JP'),
    visibility: vis,
    isPublic: vis === 'public',
    authorName: options?.authorName || '自分',
    sourcePlaylistId: sourcePl.id,
    cloneCount: 0,
    videos: Array.isArray(sourcePl.videos) ? [...sourcePl.videos] : []
  };

  const updated = [cloned, ...current];
  saveCustomPlaylistsToStorage(updated);

  if (sourcePl.id) {
    fetch(`/api/playlists/${encodeURIComponent(sourcePl.id)}/clone`, { method: 'POST' }).catch(() => {});
  }
  if (vis === 'public') {
    syncPlaylistWithServer(cloned).catch(() => {});
  }

  showGlobalToast(`プレイリスト「${cloned.title}」(${cloned.videos.length}本) をマイ再生リストへ複製しました！`);
  return cloned;
}

export function addVideoToCustomPlaylist(playlistId: string, video: YouTubeVideoItem): UserCustomPlaylist[] {
  const vidId = getVideoUniqueId(video);
  const current = getCustomPlaylistsFromStorage();
  let targetTitle = '再生リスト';
  let modifiedPl: UserCustomPlaylist | null = null;
  const updated = current.map((pl) => {
    if (pl.id !== playlistId) return pl;
    targetTitle = pl.title;
    const filtered = (pl.videos || []).filter((v) => getVideoUniqueId(v) !== vidId);
    modifiedPl = {
      ...pl,
      updatedAt: new Date().toLocaleDateString('ja-JP'),
      videos: [...filtered, video]
    };
    return modifiedPl;
  });
  saveCustomPlaylistsToStorage(updated);
  if (modifiedPl && ((modifiedPl as UserCustomPlaylist).visibility === 'public' || (modifiedPl as UserCustomPlaylist).isPublic)) {
    syncPlaylistWithServer(modifiedPl).catch(() => {});
  }
  showGlobalToast(`「${targetTitle}」に動画を追加しました`);
  return updated;
}

export function removeVideoFromCustomPlaylist(playlistId: string, videoId: string): UserCustomPlaylist[] {
  const current = getCustomPlaylistsFromStorage();
  let modifiedPl: UserCustomPlaylist | null = null;
  const updated = current.map((pl) => {
    if (pl.id !== playlistId) return pl;
    modifiedPl = {
      ...pl,
      updatedAt: new Date().toLocaleDateString('ja-JP'),
      videos: (pl.videos || []).filter((v) => getVideoUniqueId(v) !== videoId)
    };
    return modifiedPl;
  });
  saveCustomPlaylistsToStorage(updated);
  if (modifiedPl && ((modifiedPl as UserCustomPlaylist).visibility === 'public' || (modifiedPl as UserCustomPlaylist).isPublic)) {
    syncPlaylistWithServer(modifiedPl).catch(() => {});
  }
  return updated;
}

// ==========================================
// 4. JSON / CODE BACKUP & RESTORE
// ==========================================
export interface KaitoBackupPayload {
  version: number;
  app: string;
  exportedAt: string;
  subscribedChannels: SubscribedChannel[];
  savedVideos: YouTubeVideoItem[];
  customPlaylists: UserCustomPlaylist[];
  blockedChannels: BlockedChannel[];
  watchHistory?: YouTubeVideoItem[];
  pinnedSearchTags?: string[];
  searchHistory?: string[];
}

export function createBackupPayload(includeHistory = true): KaitoBackupPayload {
  let savedVideos: YouTubeVideoItem[] = [];
  let watchHistory: YouTubeVideoItem[] = [];
  try {
    savedVideos = JSON.parse(localStorage.getItem(SAVED_VIDEOS_KEY) || '[]');
  } catch {}
  try {
    watchHistory = JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || '[]');
  } catch {}

  // Strip huge base64 data URIs from channel avatars when generating compact backup if needed, or keep standard URLs
  const subs = getSubscribedChannels().map((ch) => ({
    ...ch,
    avatarUrl: ch.avatarUrl && ch.avatarUrl.startsWith('data:image/') && ch.avatarUrl.length > 4000
      ? undefined
      : ch.avatarUrl
  }));

  return {
    version: 2,
    app: 'kaito-tube',
    exportedAt: new Date().toISOString(),
    subscribedChannels: subs,
    savedVideos,
    customPlaylists: getCustomPlaylistsFromStorage(),
    blockedChannels: getBlockedChannels(),
    watchHistory: includeHistory ? watchHistory : [],
    pinnedSearchTags: getPinnedSearchTags(),
    searchHistory: getSearchHistory()
  };
}

export function encodeBackupToTextCode(payload: KaitoBackupPayload): string {
  const json = JSON.stringify(payload);
  try {
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return `KAITO_BACKUP_V2:${encoded}`;
  } catch {
    return json;
  }
}

export function parseBackupInput(rawInput: string): KaitoBackupPayload {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('バックアップデータが空です');
  }

  let jsonStr = trimmed;
  if (trimmed.startsWith('KAITO_BACKUP_V2:') || trimmed.startsWith('KAITO_BACKUP:')) {
    const b64 = trimmed.replace(/^KAITO_BACKUP(_V2)?:/, '').trim();
    try {
      jsonStr = decodeURIComponent(escape(atob(b64)));
    } catch {
      throw new Error('バックアップコードの復号に失敗しました。コードが途中で切れていないか確認してください。');
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('JSON形式またはバックアップコードとして認識できませんでした。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('無効なバックアップデータです。');
  }

  return {
    version: parsed.version || 1,
    app: parsed.app || 'kaito-tube',
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    subscribedChannels: Array.isArray(parsed.subscribedChannels) ? parsed.subscribedChannels : [],
    savedVideos: Array.isArray(parsed.savedVideos) ? parsed.savedVideos : [],
    customPlaylists: Array.isArray(parsed.customPlaylists) ? parsed.customPlaylists : [],
    blockedChannels: Array.isArray(parsed.blockedChannels) ? parsed.blockedChannels : [],
    watchHistory: Array.isArray(parsed.watchHistory) ? parsed.watchHistory : [],
    pinnedSearchTags: Array.isArray(parsed.pinnedSearchTags) ? parsed.pinnedSearchTags : [],
    searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory : []
  };
}

export function restoreFromBackupPayload(
  payload: KaitoBackupPayload,
  mode: 'merge' | 'overwrite' = 'merge'
): {
  subsCount: number;
  savedCount: number;
  playlistsCount: number;
  blockedCount: number;
  historyCount: number;
} {
  // 1. Subscribed Channels
  const currentSubs = mode === 'merge' ? getSubscribedChannels() : [];
  const subMap = new Map<string, SubscribedChannel>();
  for (const s of [...payload.subscribedChannels, ...currentSubs]) {
    if (s && s.channelId && !subMap.has(s.channelId)) {
      subMap.set(s.channelId, s);
    }
  }
  const finalSubs = Array.from(subMap.values());
  localStorage.setItem(SUBS_KEY, JSON.stringify(finalSubs));

  // 2. Saved Videos
  let currentSaved: YouTubeVideoItem[] = [];
  if (mode === 'merge') {
    try {
      currentSaved = JSON.parse(localStorage.getItem(SAVED_VIDEOS_KEY) || '[]');
    } catch {}
  }
  const savedMap = new Map<string, YouTubeVideoItem>();
  for (const v of [...payload.savedVideos, ...currentSaved]) {
    const id = getVideoUniqueId(v);
    if (id && !savedMap.has(id)) {
      savedMap.set(id, v);
    }
  }
  const finalSaved = Array.from(savedMap.values());
  localStorage.setItem(SAVED_VIDEOS_KEY, JSON.stringify(finalSaved));

  // 3. Custom Playlists
  const currentPlaylists = mode === 'merge' ? getCustomPlaylistsFromStorage() : [];
  const plMap = new Map<string, UserCustomPlaylist>();
  for (const pl of [...payload.customPlaylists, ...currentPlaylists]) {
    if (pl && pl.id) {
      if (!plMap.has(pl.id)) {
        plMap.set(pl.id, pl);
      } else if (mode === 'merge') {
        // Merge videos inside same playlist id
        const existing = plMap.get(pl.id)!;
        const vidMap = new Map<string, YouTubeVideoItem>();
        for (const v of [...(existing.videos || []), ...(pl.videos || [])]) {
          const vidId = getVideoUniqueId(v);
          if (vidId && !vidMap.has(vidId)) vidMap.set(vidId, v);
        }
        plMap.set(pl.id, { ...existing, videos: Array.from(vidMap.values()) });
      }
    }
  }
  const finalPlaylists = Array.from(plMap.values());
  localStorage.setItem(CUSTOM_PLAYLISTS_KEY, JSON.stringify(finalPlaylists));

  // 4. Blocked Channels
  const currentBlocked = mode === 'merge' ? getBlockedChannels() : [];
  const blockedMap = new Map<string, BlockedChannel>();
  for (const b of [...payload.blockedChannels, ...currentBlocked]) {
    if (b && b.channelId && !blockedMap.has(b.channelId)) {
      blockedMap.set(b.channelId, b);
    }
  }
  const finalBlocked = Array.from(blockedMap.values());
  localStorage.setItem(BLOCKED_KEY, JSON.stringify(finalBlocked));

  // 5. Watch History (if present)
  let currentHistory: YouTubeVideoItem[] = [];
  if (mode === 'merge') {
    try {
      currentHistory = JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || '[]');
    } catch {}
  }
  const historyMap = new Map<string, YouTubeVideoItem>();
  for (const v of [...(payload.watchHistory || []), ...currentHistory]) {
    const id = getVideoUniqueId(v);
    if (id && !historyMap.has(id)) {
      historyMap.set(id, v);
    }
  }
  const finalHistory = Array.from(historyMap.values()).slice(0, 100);
  if ((payload.watchHistory && payload.watchHistory.length > 0) || mode === 'overwrite') {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(finalHistory));
  }

  // 6. Pinned Search Tags & Search History
  if (payload.pinnedSearchTags && payload.pinnedSearchTags.length > 0) {
    const currentPins = mode === 'merge' ? getPinnedSearchTags() : [];
    const mergedPins = Array.from(new Set([...payload.pinnedSearchTags, ...currentPins]));
    localStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(mergedPins));
  }
  if (payload.searchHistory && payload.searchHistory.length > 0) {
    const currentSearch = mode === 'merge' ? getSearchHistory() : [];
    const mergedSearch = Array.from(new Set([...payload.searchHistory, ...currentSearch])).slice(0, 24);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(mergedSearch));
  }

  // Dispatch sync events so all components update immediately
  window.dispatchEvent(new Event('kaito_channel_subs_changed'));
  window.dispatchEvent(new Event('kaito_channel_blocked_changed'));
  window.dispatchEvent(new CustomEvent('kaito_search_tags_changed'));
  window.dispatchEvent(
    new CustomEvent('kaito_backup_restored', {
      detail: {
        savedVideos: finalSaved,
        watchHistory: finalHistory,
        customPlaylists: finalPlaylists
      }
    })
  );

  return {
    subsCount: finalSubs.length,
    savedCount: finalSaved.length,
    playlistsCount: finalPlaylists.length,
    blockedCount: finalBlocked.length,
    historyCount: finalHistory.length
  };
}
