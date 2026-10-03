import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VideoCard } from './components/VideoCard';
import { VideoDetailView } from './components/VideoDetailView';
import { FilterModal } from './components/FilterModal';
import { ChannelModal } from './components/ChannelModal';
import { CategoryView } from './components/CategoryView';
import { LibraryView } from './components/LibraryView';
import { ShortsView } from './components/ShortsView';
import { ChannelsView } from './components/ChannelsView';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsHelpModal } from './components/ShortcutsHelpModal';
import { MinecraftVisitorCounter } from './components/MinecraftVisitorCounter';
import { MathDisguiseView } from './components/MathDisguiseView';
import { MiniFloatingPlayer } from './components/MiniFloatingPlayer';
import { NiconicoView, extractNicoVideoId } from './components/NiconicoView';
import {
  YouTubeVideoItem,
  YouTubeCategoryItem,
  SearchFilters,
  PlaybackMode,
  UserCustomPlaylist,
  ApiSettings
} from './types';
import { isShortVideo, parseYouTubeUrl } from './utils/formatters';
import { isChannelBlocked } from './utils/channelStorage';
import { getApiSettings, saveApiSettings, customFetch } from './utils/apiClient';
import { prefetchStreamSources, fetchStreamSourcesCoalesced } from './utils/streamManager';
import { initThemeListener } from './utils/themeManager';
import {
  addSearchHistory,
  getVideoUniqueId,
  syncPlaylistWithServer,
  fetchSharedPlaylistByIdOrInput,
  clonePlaylistToCustomPlaylists,
  showGlobalToast
} from './utils/userDataManager';
import { loadDefaultPlaybackMode, saveDefaultPlaybackMode } from './utils/streamTypeCookie';
import {
  saveVideoToHistoryIDB,
  loadAllHistoryFromIDB,
  removeHistoryItemFromIDB,
  clearAllHistoryFromIDB,
  savePlaylistsToIDB,
  loadPlaylistsFromIDB
} from './utils/indexedDbStorage';
import { Flame, Play, ShieldCheck, AlertCircle, Zap, Settings, Users, ChevronDown, RefreshCw, Check } from 'lucide-react';

export default function App() {
  // Disguise & Gate State - Always lock on refresh as requested ("更新したら数学の画面なる")
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [openStudyPortalOnLock, setOpenStudyPortalOnLock] = useState<boolean>(false);
  const [disguiseTick, setDisguiseTick] = useState(0);

  useEffect(() => {
    const handleDisguiseChange = () => setDisguiseTick((t) => t + 1);
    window.addEventListener('kaito_disguise_changed', handleDisguiseChange);
    return () => window.removeEventListener('kaito_disguise_changed', handleDisguiseChange);
  }, []);

  // Theme auto-listener (OS prefers-color-scheme & cross-tab sync)
  useEffect(() => {
    const cleanup = initThemeListener();
    return cleanup;
  }, []);

  // Navigation & View States
  const [platformMode, setPlatformModeState] = useState<'youtube' | 'niconico'>(() => {
    try {
      return localStorage.getItem('platform') === 'niconico' ? 'niconico' : 'youtube';
    } catch {
      return 'youtube';
    }
  });
  const handleChangePlatformMode = (mode: 'youtube' | 'niconico') => {
    setPlatformModeState(mode);
    try {
      localStorage.setItem('platform', mode);
    } catch {}
    if (mode === 'niconico') {
      setIsDetailOpen(false);
    }
  };
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideoItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [initialShortVideo, setInitialShortVideo] = useState<YouTubeVideoItem | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // Default playback mode loaded from localStorage + 10-year Cookie (StreamType)
  const [playbackMode, setPlaybackModeState] = useState<PlaybackMode>(() => loadDefaultPlaybackMode());
  const setPlaybackMode = (mode: PlaybackMode) => {
    setPlaybackModeState(mode);
    saveDefaultPlaybackMode(mode);
  };
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // API Settings State
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => getApiSettings());

  // History Guard (ヒストリーガード): 戻るボタンが押された際にYouTube履歴ではなく即座に偽装数学画面に直行させる
  useEffect(() => {
    if (isUnlocked) {
      try {
        // クリーンなURL状態を維持
        window.history.pushState({ kaitoDisguiseGuard: true }, '', window.location.pathname);
      } catch {}

      const handlePopState = () => {
        // ブラウザの戻るボタンが押されたら即座に偽装画面（ロック）へ直行！
        document.querySelectorAll('video, audio').forEach((el: any) => {
          try {
            el.muted = true;
            el.pause();
          } catch {}
        });
        const target = localStorage.getItem('kaito_panic_target') || 'study_portal';
        setOpenStudyPortalOnLock(target === 'study_portal');
        setIsUnlocked(false);
        setSelectedVideo(null);
        setIsDetailOpen(false);
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [isUnlocked]);

  // Boss Key (Esc x2 or Alt+S) & Auto-Lock on Tab Leave (visibilitychange / blur)
  useEffect(() => {
    if (!isUnlocked) return;

    const triggerInstantStealthLock = () => {
      document.querySelectorAll('video, audio').forEach((el: any) => {
        try {
          el.muted = true;
          el.pause();
        } catch {}
      });
      const target = localStorage.getItem('kaito_panic_target') || 'study_portal';
      setOpenStudyPortalOnLock(target === 'study_portal');
      setIsUnlocked(false);
      setSelectedVideo(null);
      setIsDetailOpen(false);
    };

    let lastEscTime = 0;
    const handlePanicKeyDown = (e: KeyboardEvent) => {
      // Alt + S -> Instant Boss Key
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        triggerInstantStealthLock();
        return;
      }
      // Esc pressed twice within 600ms -> Instant Boss Key
      if (e.key === 'Escape') {
        const now = Date.now();
        if (now - lastEscTime < 600) {
          e.preventDefault();
          triggerInstantStealthLock();
          lastEscTime = 0;
          return;
        }
        lastEscTime = now;
      }
    };

    const handleVisibilityOrBlur = () => {
      try {
        if (localStorage.getItem('kaito_auto_lock_on_blur') === 'true') {
          if (document.hidden) {
            triggerInstantStealthLock();
          }
        }
      } catch {}
    };

    const handleWindowBlur = () => {
      try {
        if (localStorage.getItem('kaito_auto_lock_on_blur') === 'true') {
          // Do not lock if focus moved to an iframe inside our own document
          setTimeout(() => {
            if (document.hidden || !document.hasFocus()) {
              const activeTag = document.activeElement?.tagName?.toLowerCase();
              if (activeTag !== 'iframe') {
                triggerInstantStealthLock();
              }
            }
          }, 150);
        }
      } catch {}
    };

    window.addEventListener('keydown', handlePanicKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibilityOrBlur);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handlePanicKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isUnlocked]);

  // Synchronize Tab Title and Favicon based on Disguise / Unlock State
  useEffect(() => {
    const updateFavicon = (iconUrl: string) => {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = iconUrl;
    };

    if (!isUnlocked) {
      document.title = '数理アカデミー 学習ポータル';
      updateFavicon('https://ssl.gstatic.com/classroom/favicon.png');
    } else {
      // Check if user has an active Stealth Cloak configured
      try {
        const cloakRaw = localStorage.getItem('kaito_stealth_cloak');
        if (cloakRaw) {
          const cloak = JSON.parse(cloakRaw);
          if (cloak.title) document.title = cloak.title;
          if (cloak.favicon) updateFavicon(cloak.favicon);
          return;
        }
      } catch {}
      document.title = '数理アカデミー 学習ポータル';
      updateFavicon('https://ssl.gstatic.com/classroom/favicon.png');
    }
  }, [isUnlocked, disguiseTick]);

  // Search Filters
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    order: 'relevance',
    type: 'all',
    videoDuration: 'any',
    categoryId: '',
    regionCode: 'JP'
  });

  // Data States
  const [rawVideos, setRawVideos] = useState<YouTubeVideoItem[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideoItem[]>([]);
  const [categories, setCategories] = useState<YouTubeCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedNextPageToken, setFeedNextPageToken] = useState<string | null>(null);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);

  // Blocked channels tracker
  const [blockedTick, setBlockedTick] = useState(0);
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  useEffect(() => {
    let timer: any;
    const handleToast = (e: any) => {
      const msg = e.detail?.message;
      if (msg) {
        setGlobalToast(msg);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setGlobalToast(null), 3000);
      }
    };
    const handlePlaylistsSync = (e: any) => {
      if (e.detail) {
        setCustomPlaylists(e.detail);
      } else {
        try {
          const raw = localStorage.getItem('kaito_custom_playlists');
          if (raw) setCustomPlaylists(JSON.parse(raw));
        } catch {}
      }
    };
    const handleBackupRestored = (e: any) => {
      if (e.detail) {
        if (e.detail.savedVideos) setSavedVideos(e.detail.savedVideos);
        if (e.detail.watchHistory) setWatchHistory(e.detail.watchHistory);
        if (e.detail.customPlaylists) setCustomPlaylists(e.detail.customPlaylists);
      }
    };

    window.addEventListener('kaito_global_toast', handleToast);
    window.addEventListener('kaito_custom_playlists_changed', handlePlaylistsSync);
    window.addEventListener('kaito_backup_restored', handleBackupRestored);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('kaito_global_toast', handleToast);
      window.removeEventListener('kaito_custom_playlists_changed', handlePlaylistsSync);
      window.removeEventListener('kaito_backup_restored', handleBackupRestored);
    };
  }, []);

  // Saved / History / Playlists (LocalStorage)
  const [savedVideos, setSavedVideos] = useState<YouTubeVideoItem[]>(() => {
    try {
      const stored = localStorage.getItem('kaito_saved_videos');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [watchHistory, setWatchHistory] = useState<YouTubeVideoItem[]>(() => {
    try {
      const stored = localStorage.getItem('kaito_watch_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [customPlaylists, setCustomPlaylists] = useState<UserCustomPlaylist[]>(() => {
    try {
      const stored = localStorage.getItem('kaito_custom_playlists');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Hydrate unlimited Watch History (VideoHistory DB) & Custom Playlists (PlaylistsDB) with ArrayBuffer thumbnails from IndexedDB
  useEffect(() => {
    loadAllHistoryFromIDB()
      .then((idbHistory) => {
        if (idbHistory && idbHistory.length > 0) {
          setWatchHistory((prev) => {
            const mergedMap = new Map<string, YouTubeVideoItem>();
            for (const item of [...idbHistory, ...prev]) {
              const id = getVideoUniqueId(item);
              if (id && !mergedMap.has(id)) {
                mergedMap.set(id, item);
              }
            }
            return Array.from(mergedMap.values());
          });
        } else {
          // Migrate existing localStorage history items into VideoHistory IndexedDB
          try {
            const raw = localStorage.getItem('kaito_watch_history');
            const parsed: YouTubeVideoItem[] = raw ? JSON.parse(raw) : [];
            for (const item of parsed.slice(0, 50)) {
              saveVideoToHistoryIDB(item).catch(() => {});
            }
          } catch {}
        }
      })
      .catch(() => {});

    loadPlaylistsFromIDB()
      .then((idbPlaylists) => {
        if (idbPlaylists && idbPlaylists.length > 0) {
          setCustomPlaylists((prev) => {
            const plMap = new Map<string, UserCustomPlaylist>();
            for (const pl of [...idbPlaylists, ...prev]) {
              if (pl && pl.id && !plMap.has(pl.id)) {
                plMap.set(pl.id, pl);
              }
            }
            return Array.from(plMap.values());
          });
        } else {
          try {
            const raw = localStorage.getItem('kaito_custom_playlists');
            const parsed: UserCustomPlaylist[] = raw ? JSON.parse(raw) : [];
            if (parsed.length > 0) {
              savePlaylistsToIDB(parsed).catch(() => {});
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Global keydown listener for shortcut help modal
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Listen to block state changes
  useEffect(() => {
    const handleBlockedChange = () => setBlockedTick((t) => t + 1);
    window.addEventListener('kaito_channel_blocked_changed', handleBlockedChange);
    return () => {
      window.removeEventListener('kaito_channel_blocked_changed', handleBlockedChange);
    };
  }, []);

  // Listen to settings change events
  useEffect(() => {
    const handleSettingsChanged = (e: any) => {
      if (e.detail) {
        setApiSettings(e.detail);
      }
    };
    window.addEventListener('kaito_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('kaito_settings_changed', handleSettingsChanged);
    };
  }, []);

  // Cross-Tab Synchronization via window.addEventListener("storage", ...)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;

      // 1. Channel Subscriptions
      if (e.key === 'kaito_subscribed_channels') {
        window.dispatchEvent(new CustomEvent('kaito_channel_subs_changed'));
      }

      // 2. Channel Blocks
      if (e.key === 'kaito_blocked_channels') {
        setBlockedTick((t) => t + 1);
        window.dispatchEvent(new CustomEvent('kaito_channel_blocked_changed'));
      }

      // 3. Saved Videos (Library)
      if (e.key === 'kaito_saved_videos') {
        try {
          setSavedVideos(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {}
      }

      // 4. Watch History
      if (e.key === 'kaito_watch_history') {
        try {
          setWatchHistory(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {}
      }

      // 5. Custom Playlists
      if (e.key === 'kaito_custom_playlists') {
        try {
          setCustomPlaylists(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {}
      }

      // 6. Settings / API Config
      if (e.key === 'kaito_api_settings_v1') {
        try {
          if (e.newValue) {
            const parsed = JSON.parse(e.newValue);
            setApiSettings(parsed);
          }
        } catch {}
      }

      // 7. Disguise & Stealth Settings
      if (e.key === 'kaito_disguise_preset' || e.key === 'kaito_stealth_cloak') {
        // Trigger re-evaluation of title/favicon
        window.dispatchEvent(new CustomEvent('kaito_disguise_changed'));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Save Settings handler
  const handleSaveSettings = (newSettings: ApiSettings) => {
    setApiSettings(newSettings);
    saveApiSettings(newSettings);
  };

  // Load Categories on mount or when API settings change
  useEffect(() => {
    customFetch(`/api/youtube/categories?regionCode=${filters.regionCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setCategories(data.items);
      })
      .catch((err) => console.error(err));
  }, [filters.regionCode, apiSettings]);

  // Fetch Main Videos depending on search query, active tab, or apiSettings
  useEffect(() => {
    if (
      activeTab === 'categories' ||
      activeTab === 'library' ||
      activeTab === 'shorts' ||
      activeTab === 'channels' ||
      activeTab === 'subscriptions-feed'
    ) {
      return;
    }

    setLoading(true);

    let apiUrl = '';
    if (filters.query.trim()) {
      const queryParams = new URLSearchParams({
        q: filters.query.trim(),
        order: filters.order,
        type: filters.type,
        videoDuration: filters.videoDuration,
        regionCode: filters.regionCode,
        maxResults: '48'
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      if (filters.publishedAfter) queryParams.set('publishedAfter', filters.publishedAfter);
      apiUrl = `/api/youtube/search?${queryParams.toString()}`;
    } else {
      // Trending or Home
      const queryParams = new URLSearchParams({
        regionCode: filters.regionCode,
        maxResults: '48'
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      apiUrl = `/api/youtube/trending?${queryParams.toString()}`;
    }

    customFetch(apiUrl)
      .then((res) => res.json())
      .then((data) => {
        setRawVideos(data.items || []);
        setFeedNextPageToken(data.nextPageToken || null);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [
    filters.query,
    filters.order,
    filters.type,
    filters.videoDuration,
    filters.categoryId,
    filters.regionCode,
    filters.publishedAfter,
    activeTab,
    apiSettings
  ]);

  // Load more videos for search results or trending feed
  const handleLoadMoreFeed = () => {
    if (!feedNextPageToken || loadingMoreFeed) return;
    setLoadingMoreFeed(true);

    let apiUrl = '';
    if (filters.query.trim()) {
      const queryParams = new URLSearchParams({
        q: filters.query.trim(),
        order: filters.order,
        type: filters.type,
        videoDuration: filters.videoDuration,
        regionCode: filters.regionCode,
        maxResults: '48',
        pageToken: feedNextPageToken
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      if (filters.publishedAfter) queryParams.set('publishedAfter', filters.publishedAfter);
      apiUrl = `/api/youtube/search?${queryParams.toString()}`;
    } else {
      const queryParams = new URLSearchParams({
        regionCode: filters.regionCode,
        maxResults: '48',
        pageToken: feedNextPageToken
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      apiUrl = `/api/youtube/trending?${queryParams.toString()}`;
    }

    customFetch(apiUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setRawVideos((prev) => {
            const existingIds = new Set(prev.map((v) => v.playlistId || (typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || (v.id as any)?.playlistId)));
            const newItems = data.items.filter((v: any) => {
              const id = v.playlistId || (typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || (v.id as any)?.playlistId);
              return id && !existingIds.has(id);
            });
            return [...prev, ...newItems];
          });
        }
        setFeedNextPageToken(data.nextPageToken || null);
        setLoadingMoreFeed(false);
      })
      .catch((err) => {
        console.error('Load more feed error:', err);
        setLoadingMoreFeed(false);
      });
  };

  // Filter out blocked channel videos from feed
  const videos = rawVideos.filter((v) => {
    const chId = v.snippet?.channelId;
    return !chId || !isChannelBlocked(chId);
  });

  // Handle Video Selection & Add to History
  const handleSelectVideo = (video: YouTubeVideoItem, keepMinimized = false) => {
    try {
      localStorage.setItem('yt_user_gesture_v1', '1');
    } catch {}

    const rawCandidateId =
      typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || '';
    if (extractNicoVideoId(rawCandidateId)) {
      handleChangePlatformMode('niconico');
      setFilters((prev) => ({ ...prev, query: rawCandidateId }));
      return;
    }

    const isPl = Boolean(
      video.isPlaylist ||
      video.kind === 'youtube#playlist' ||
      video.playlistId ||
      (video.customPlaylistItems && video.customPlaylistItems.length > 0)
    );

    const stayInDetailView = Boolean((video as any).fromWatchAutoplay || isDetailOpen || keepMinimized);

    if (!isPl && !stayInDetailView && isShortVideo(video)) {
      setInitialShortVideo(video);
      setActiveTab('shorts');
      setSelectedVideo(null);
      setIsDetailOpen(false);
    } else {
      setSelectedVideo(video);
      if (!keepMinimized) {
        setIsDetailOpen(true);
      }
    }

    const targetId =
      video.firstVideoId ||
      (typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || (video.id as any)?.playlistId);
    if (!targetId) return;

    // 1. Prioritize stream acquisition BEFORE any related videos or comments are fetched
    const streamTargetId = video.firstVideoId || (!/^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(targetId) ? targetId : '');
    if (streamTargetId) {
      prefetchStreamSources(streamTargetId);
    }

    const historyItem: YouTubeVideoItem = {
      ...video,
      watchedAt: new Date().toISOString()
    };

    const updatedHistory = [
      historyItem,
      ...watchHistory.filter((v) => {
        const id = getVideoUniqueId(v);
        return id !== targetId;
      })
    ];

    setWatchHistory(updatedHistory);
    // Save unlimited history with ArrayBuffer binary thumbnail to IndexedDB (VideoHistory)
    saveVideoToHistoryIDB(historyItem).catch(() => {});
    try {
      // Keep compact 100-item mirror in localStorage so synchronous reads never exceed 5MB
      localStorage.setItem('kaito_watch_history', JSON.stringify(updatedHistory.slice(0, 100)));
    } catch (e) {
      console.error(e);
    }

    // Clear previous related videos; VideoDetailView fetches related videos & comments AFTER stream is acquired
    setRelatedVideos([]);
  };

  // Toggle Save Video
  const handleToggleSave = (video: YouTubeVideoItem) => {
    const targetId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId;
    if (!targetId) return;

    const exists = savedVideos.some((v) => {
      const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
      return id === targetId;
    });

    let updated: YouTubeVideoItem[];
    if (exists) {
      updated = savedVideos.filter((v) => {
        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
        return id !== targetId;
      });
    } else {
      updated = [video, ...savedVideos];
    }

    setSavedVideos(updated);
    try {
      localStorage.setItem('kaito_saved_videos', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const isVideoSaved = (video: YouTubeVideoItem) => {
    const targetId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId;
    return savedVideos.some((v) => {
      const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
      return id === targetId;
    });
  };

  const handleClearHistory = () => {
    setWatchHistory([]);
    clearAllHistoryFromIDB().catch(() => {});
    try {
      localStorage.removeItem('kaito_watch_history');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveHistoryItem = (videoId: string) => {
    const updated = watchHistory.filter((v) => getVideoUniqueId(v) !== videoId);
    setWatchHistory(updated);
    removeHistoryItemFromIDB(videoId).catch(() => {});
    try {
      localStorage.setItem('kaito_watch_history', JSON.stringify(updated.slice(0, 100)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePlaylist = (
    title: string,
    description: string,
    visibility: 'public' | 'private' = 'private',
    authorName?: string
  ) => {
    const newPl: UserCustomPlaylist = {
      id: Date.now().toString(),
      title,
      description,
      createdAt: new Date().toLocaleDateString('ja-JP'),
      updatedAt: new Date().toLocaleDateString('ja-JP'),
      visibility,
      isPublic: visibility === 'public',
      authorName: authorName || '海斗tube ユーザー',
      videos: []
    };
    const updated = [newPl, ...customPlaylists];
    setCustomPlaylists(updated);
    savePlaylistsToIDB(updated).catch(() => {});
    try {
      localStorage.setItem('kaito_custom_playlists', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (visibility === 'public') {
      syncPlaylistWithServer(newPl).catch(() => {});
      showGlobalToast(`公開プレイリスト「${title}」を作成しました`);
    } else {
      showGlobalToast(`非公開プレイリスト「${title}」を作成しました`);
    }
  };

  const handleDeletePlaylist = (id: string) => {
    const target = customPlaylists.find((p) => p.id === id);
    const updated = customPlaylists.filter((p) => p.id !== id);
    setCustomPlaylists(updated);
    savePlaylistsToIDB(updated).catch(() => {});
    try {
      localStorage.setItem('kaito_custom_playlists', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (target && (target.visibility === 'public' || target.isPublic)) {
      syncPlaylistWithServer({ ...target, visibility: 'private', isPublic: false }).catch(() => {});
    }
  };

  // Handle shared_playlist URL query parameter on unlock
  useEffect(() => {
    if (!isUnlocked) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get('shared_playlist');
      const plToken = params.get('pl_token');
      if (sharedId || plToken) {
        fetchSharedPlaylistByIdOrInput(window.location.href).then((resolved) => {
          if (resolved && resolved.videos && resolved.videos.length > 0) {
            showGlobalToast(`共有プレイリスト「${resolved.title}」を読み込みました（再生画面から複製できます）`);
            handleSelectVideo({
              ...resolved.videos[0],
              playlistId: `custom_${resolved.id}`,
              customPlaylistTitle: resolved.title,
              customPlaylistItems: resolved.videos
            });
          }
        });
      }
    } catch {}
  }, [isUnlocked]);

  const handleSearchSubmit = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Check if the input is a Niconico video ID (sm..., nm..., so...) or nicovideo.jp URL
    const nicoId = extractNicoVideoId(trimmed);
    if (nicoId || platformMode === 'niconico') {
      if (nicoId && platformMode !== 'niconico') {
        handleChangePlatformMode('niconico');
      }
      addSearchHistory(trimmed);
      setFilters((prev) => ({ ...prev, query: trimmed }));
      setIsDetailOpen(false);
      return;
    }

    // Check if the input is a shared playlist URL (?shared_playlist=... or KAITO_PL:...)
    if (trimmed.includes('shared_playlist=') || trimmed.includes('pl_token=') || trimmed.startsWith('KAITO_PL:')) {
      const resolved = await fetchSharedPlaylistByIdOrInput(trimmed);
      if (resolved) {
        await clonePlaylistToCustomPlaylists(resolved);
        if (resolved.videos && resolved.videos.length > 0) {
          handleSelectVideo({
            ...resolved.videos[0],
            playlistId: `custom_${resolved.id}`,
            customPlaylistTitle: resolved.title,
            customPlaylistItems: resolved.videos
          });
        } else {
          setActiveTab('library');
          setIsDetailOpen(false);
        }
        return;
      }
    }

    // Check if the input is a YouTube URL (shorts, watch, youtu.be, embed, etc.)
    const parsed = parseYouTubeUrl(trimmed);
    if (parsed.videoId) {
      // If it contains "shorts" or /shorts/<id>, automatically route to Shorts view
      if (parsed.isShort || trimmed.toLowerCase().includes('short')) {
        const tempShortVideo: YouTubeVideoItem = {
          id: parsed.videoId,
          snippet: {
            title: 'YouTube Short',
            description: '#shorts',
            publishedAt: new Date().toISOString(),
            channelId: '',
            channelTitle: 'YouTube',
            thumbnails: {
              high: { url: `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg` },
              medium: { url: `https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg` },
              default: { url: `https://i.ytimg.com/vi/${parsed.videoId}/default.jpg` }
            }
          }
        };

        // Try to fetch real video metadata asynchronously in background
        customFetch(`/api/youtube/video/${parsed.videoId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.items && data.items[0]) {
              setInitialShortVideo(data.items[0]);
            }
          })
          .catch(() => {});

        setInitialShortVideo(tempShortVideo);
        setActiveTab('shorts');
        setSelectedVideo(null);
        setIsDetailOpen(false);
        return;
      }

      // If it is a normal YouTube video URL, open the video directly in detail / player view
      const tempVideo: YouTubeVideoItem = {
        id: parsed.videoId,
        snippet: {
          title: 'YouTube Video',
          description: '',
          publishedAt: new Date().toISOString(),
          channelId: '',
          channelTitle: 'YouTube',
          thumbnails: {
            high: { url: `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg` },
            medium: { url: `https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg` },
            default: { url: `https://i.ytimg.com/vi/${parsed.videoId}/default.jpg` }
          }
        }
      };

      handleSelectVideo(tempVideo);

      // Fetch complete video metadata only AFTER stream sources are resolved
      fetchStreamSourcesCoalesced(parsed.videoId)
        .catch(() => {})
        .finally(() => {
          customFetch(`/api/youtube/video/${parsed.videoId}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.items && data.items[0]) {
                handleSelectVideo(data.items[0]);
              }
            })
            .catch(() => {});
        });
      return;
    }

    addSearchHistory(trimmed);
    setFilters((prev) => ({ ...prev, query: trimmed }));
    setActiveTab('home');
    setIsDetailOpen(false); // 検索中も動画は小窓・バックグラウンドで自動再生を維持
  };

  const handleUpdateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      query: '',
      order: 'relevance',
      type: 'all',
      videoDuration: 'any',
      categoryId: '',
      regionCode: 'JP'
    });
  };

  const handleUnlockMath = () => {
    setIsUnlocked(true);
    try {
      sessionStorage.setItem('kaito_math_unlocked', 'true');
      localStorage.setItem('yt_user_gesture_v1', '1');
    } catch {}
  };

  const handleLockDisguise = () => {
    document.querySelectorAll('video, audio').forEach((el: any) => {
      try {
        el.muted = true;
        el.pause();
      } catch {}
    });
    const target = localStorage.getItem('kaito_panic_target') || 'study_portal';
    setOpenStudyPortalOnLock(target === 'study_portal');
    setIsUnlocked(false);
    try {
      sessionStorage.removeItem('kaito_math_unlocked');
    } catch {}
    setSelectedVideo(null);
  };

  // If not unlocked, render the Quadratic Equation Educational Disguise Page
  if (!isUnlocked) {
    return (
      <MathDisguiseView
        onUnlock={handleUnlockMath}
        initialStudyPortalOpen={openStudyPortalOnLock}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white app-loaded">
      {/* Top Main Navigation Header */}
      <Header
        filters={filters}
        onUpdateFilters={handleUpdateFilters}
        onSearchSubmit={handleSearchSubmit}
        onOpenFilterModal={() => setIsFilterModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          setIsDetailOpen(false); // タブ移動時も動画はバックグラウンド再生を維持
        }}
        playbackMode={playbackMode}
        onTogglePlaybackMode={setPlaybackMode}
        savedCount={savedVideos.length}
        apiSettings={apiSettings}
        onLockDisguise={handleLockDisguise}
        platformMode={platformMode}
        onChangePlatformMode={handleChangePlatformMode}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {platformMode === 'niconico' ? (
          <NiconicoView
            externalQuery={filters.query}
            onSelectSaveToMainHistory={(historyItem) => {
              const targetId = getVideoUniqueId(historyItem);
              const updatedHistory = [
                { ...historyItem, watchedAt: new Date().toISOString() },
                ...watchHistory.filter((v) => getVideoUniqueId(v) !== targetId)
              ];
              setWatchHistory(updatedHistory);
              saveVideoToHistoryIDB({ ...historyItem, watchedAt: new Date().toISOString() }).catch(() => {});
              try {
                localStorage.setItem('kaito_watch_history', JSON.stringify(updatedHistory.slice(0, 100)));
              } catch {}
            }}
            onSwitchToYouTubeMode={() => handleChangePlatformMode('youtube')}
          />
        ) : selectedVideo && isDetailOpen ? (
          <VideoDetailView
            video={selectedVideo}
            relatedVideos={relatedVideos}
            onSelectVideo={handleSelectVideo}
            onSelectChannel={setSelectedChannelId}
            playbackMode={playbackMode}
            onTogglePlaybackMode={setPlaybackMode}
            isSaved={isVideoSaved(selectedVideo)}
            onToggleSave={handleToggleSave}
            onBackToHome={() => setIsDetailOpen(false)}
            onOpenShortsPlayer={(v) => handleSelectVideo(v)}
          />
        ) : activeTab === 'shorts' ? (
          <ShortsView
            onSelectChannel={setSelectedChannelId}
            playbackMode={playbackMode}
            onTogglePlaybackMode={setPlaybackMode}
            regionCode={filters.regionCode}
            initialShortVideo={initialShortVideo}
            onClearInitialShort={() => setInitialShortVideo(null)}
            onBackToHome={() => setActiveTab('home')}
          />
        ) : activeTab === 'subscriptions-feed' ? (
          <ChannelsView
            onSelectChannel={setSelectedChannelId}
            onSelectVideo={handleSelectVideo}
            initialSubTab="feed"
            isVideoSaved={isVideoSaved}
            onToggleSave={handleToggleSave}
          />
        ) : activeTab === 'channels' ? (
          <ChannelsView
            onSelectChannel={setSelectedChannelId}
            onSelectVideo={handleSelectVideo}
            initialSubTab="subscribed"
            isVideoSaved={isVideoSaved}
            onToggleSave={handleToggleSave}
          />
        ) : activeTab === 'categories' ? (
          <CategoryView
            categories={categories}
            onSelectVideo={handleSelectVideo}
            onSelectChannel={setSelectedChannelId}
            regionCode={filters.regionCode}
          />
        ) : activeTab === 'library' ? (
          <LibraryView
            savedVideos={savedVideos}
            watchHistory={watchHistory}
            customPlaylists={customPlaylists}
            onSelectVideo={handleSelectVideo}
            onSelectChannel={setSelectedChannelId}
            onToggleSave={handleToggleSave}
            onClearHistory={handleClearHistory}
            onRemoveHistoryItem={handleRemoveHistoryItem}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
          />
        ) : (
          /* Home & Trending Video Grid */
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            {/* Title / Filter Status Header */}
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-neutral-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center">
                  {activeTab === 'trending' ? (
                    <Flame className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Play className="w-4 h-4 text-rose-500 fill-rose-500" />
                  )}
                </div>

                <div>
                  <h1 className="text-xl font-bold text-white">
                    {filters.query
                      ? `「${filters.query}」の検索結果`
                      : activeTab === 'trending'
                      ? '急上昇トレンド'
                      : 'おすすめ動画'}
                  </h1>
                  <p className="text-xs text-neutral-400">
                    高画質ストリーム &amp; NoCookie 再生対応
                  </p>
                </div>
              </div>
            </div>

            {/* Video Cards Grid */}
            {loading ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-neutral-400 text-xs font-medium">
                  動画データを取得中...
                </p>
              </div>
            ) : videos.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 space-y-3 bg-neutral-900 border border-neutral-800 rounded-xl p-8 max-w-xl mx-auto">
                <AlertCircle className="w-10 h-10 text-rose-500/80 mx-auto" />
                <p className="text-base font-bold text-white">動画が見つかりませんでした</p>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  サーバーの応答がないか、検索条件に一致する動画がありません。検索キーワードや条件を変更して再度お試しください。
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleResetFilters}
                    className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    検索条件リセット
                  </button>
                  <button
                    onClick={() => {
                      setLoading(true);
                      handleResetFilters();
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                    <span>再読み込み</span>
                  </button>
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>設定</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {videos.map((v) => (
                    <VideoCard
                      key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                      video={v}
                      onSelectVideo={handleSelectVideo}
                      onSelectChannel={setSelectedChannelId}
                      isSaved={isVideoSaved(v)}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>

                {/* Load More Button for Search Results / Feed */}
                {feedNextPageToken && (
                  <div className="pt-4 pb-8 text-center">
                    <button
                      onClick={handleLoadMoreFeed}
                      disabled={loadingMoreFeed}
                      className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-sm font-bold text-neutral-200 hover:text-white rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mx-auto cursor-pointer"
                      id="feed-load-more-btn"
                    >
                      {loadingMoreFeed ? (
                        <>
                          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                          <span>動画をさらに読み込み中...</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 text-rose-500" />
                          <span>さらに読み込む</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Feedback Toast */}
      {globalToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-neutral-900/95 border border-rose-500/60 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in max-w-sm">
          <div className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{globalToast}</span>
        </div>
      )}

      {/* Mini Floating Player for Background Continuous Playback (他の検索や操作中も次の動画が流れるまで自動バックグラウンド再生) */}
      {selectedVideo && !isDetailOpen && activeTab !== 'shorts' && (
        <MiniFloatingPlayer
          video={selectedVideo}
          playbackMode={playbackMode}
          onOpenDetail={() => setIsDetailOpen(true)}
          onClose={() => {
            setSelectedVideo(null);
            setIsDetailOpen(false);
          }}
          onEnded={() => {
            const currentVid =
              selectedVideo.firstVideoId ||
              (typeof selectedVideo.id === 'string'
                ? selectedVideo.id
                : (selectedVideo.id as any)?.videoId || '');
            const list = selectedVideo.customPlaylistItems;
            if (list && list.length > 0) {
              const idx = list.findIndex((it) => {
                const id =
                  typeof it.id === 'string'
                    ? it.id
                    : (it.id as any)?.videoId ||
                      (it as any).snippet?.resourceId?.videoId ||
                      (it as any).contentDetails?.videoId ||
                      it.firstVideoId ||
                      '';
                return id === currentVid;
              });
              if (idx >= 0 && idx < list.length - 1) {
                const nextItem = list[idx + 1];
                const nextVid =
                  typeof nextItem.id === 'string'
                    ? nextItem.id
                    : (nextItem.id as any)?.videoId ||
                      (nextItem as any).snippet?.resourceId?.videoId ||
                      (nextItem as any).contentDetails?.videoId ||
                      nextItem.firstVideoId ||
                      '';
                handleSelectVideo(
                  {
                    ...nextItem,
                    id: nextVid || nextItem.id,
                    firstVideoId: nextVid,
                    isPlaylist: false,
                    kind: 'youtube#video',
                    playlistId: selectedVideo.playlistId,
                    customPlaylistItems: list,
                    customPlaylistTitle: selectedVideo.customPlaylistTitle
                  },
                  true
                );
                return;
              }
            }
            if (relatedVideos.length > 0) {
              const nextRel = relatedVideos.find((r) => {
                const rId = typeof r.id === 'string' ? r.id : (r.id as any)?.videoId;
                return rId && rId !== currentVid;
              });
              if (nextRel) {
                handleSelectVideo(nextRel, true);
              }
            }
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-900/40 py-6 text-center text-xs text-neutral-400 space-y-3">
        <div className="flex items-center justify-center gap-4 flex-wrap text-neutral-400 text-xs">
          <button
            onClick={() => setIsShortcutsModalOpen(true)}
            className="hover:text-white transition-colors cursor-pointer"
          >
            ショートカット一覧
          </button>
          <span>•</span>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="hover:text-white transition-colors cursor-pointer"
          >
            API設定
          </button>
        </div>

        {/* Visitor Counter */}
        <div className="flex items-center justify-center pt-1">
          <MinecraftVisitorCounter />
        </div>

        <p className="font-bold text-white text-sm">
          海斗<span className="text-rose-500">tube</span> — 制作: 海斗
        </p>
        <p className="text-[11px] text-neutral-400 font-medium">
          Created &amp; Developed by 海斗
        </p>
      </footer>

      {/* Search Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        categories={categories}
        onUpdateFilters={handleUpdateFilters}
        onResetFilters={handleResetFilters}
      />

      {/* Channel View Modal */}
      <ChannelModal
        channelId={selectedChannelId}
        onClose={() => setSelectedChannelId(null)}
        onSelectVideo={handleSelectVideo}
        isSaved={false}
        onToggleSave={handleToggleSave}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={apiSettings}
        onSaveSettings={handleSaveSettings}
        onOpenProxyGuide={() => window.dispatchEvent(new CustomEvent('kaito_open_proxy_guide'))}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutsHelpModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}
