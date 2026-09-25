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
import { getApiSettings, saveApiSettings, customFetch, setEmergencyYoutubeV3 } from './utils/apiClient';
import { initThemeListener } from './utils/themeManager';
import { Flame, Play, ShieldCheck, AlertCircle, Zap, Settings, Users, ChevronDown, RefreshCw } from 'lucide-react';

export default function App() {
  // Disguise & Gate State - Always lock on refresh as requested ("更新したら数学の画面なる")
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
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
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideoItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [initialShortVideo, setInitialShortVideo] = useState<YouTubeVideoItem | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // Default to YouTube Education embedded player
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('education');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // API Settings State & Emergency v3 availability
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => getApiSettings());
  const [emergencyV3Available, setEmergencyV3Available] = useState<boolean>(false);

  // History Guard (ヒストリーガード): 戻るボタンが押された際にYouTube履歴ではなく即座に偽装数学画面に直行させる
  useEffect(() => {
    if (isUnlocked) {
      try {
        // クリーンなURL状態を維持
        window.history.pushState({ kaitoDisguiseGuard: true }, '', window.location.pathname);
      } catch {}

      const handlePopState = () => {
        // ブラウザの戻るボタンが押されたら即座に偽装画面（ロック）へ直行！
        setIsUnlocked(false);
        setIsDetailOpen(false);
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
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
      // 偽装プリセットの反映
      try {
        const storedPreset = localStorage.getItem('kaito_disguise_preset');
        if (storedPreset === 'classroom') {
          document.title = 'ホーム - Google Classroom';
          updateFavicon('https://ssl.gstatic.com/classroom/favicon.png');
          return;
        } else if (storedPreset === 'docs') {
          document.title = '無題のドキュメント - Google ドキュメント';
          updateFavicon('https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico');
          return;
        } else if (storedPreset === 'nhk') {
          document.title = 'NHK for School - 学校放送学習ポータル';
          updateFavicon('https://www.nhk.or.jp/favicon.ico');
          return;
        } else if (storedPreset === 'wikipedia') {
          document.title = '二次方程式 - Wikipedia';
          updateFavicon('https://en.wikipedia.org/static/favicon/wikipedia.ico');
          return;
        }
      } catch {}
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
      document.title = '海斗tube';
      updateFavicon('/favicon.svg');
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

  // Listen to emergency v3 and settings change events
  useEffect(() => {
    const handleEmergency = (e: any) => {
      if (e.detail?.available !== undefined) {
        setEmergencyV3Available(Boolean(e.detail.available));
      }
    };
    const handleSettingsChanged = (e: any) => {
      if (e.detail) {
        setApiSettings(e.detail);
        if (e.detail.forceYoutubeV3) {
          setEmergencyV3Available(false);
        }
      }
    };
    window.addEventListener('kaito_emergency_v3_available', handleEmergency);
    window.addEventListener('kaito_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('kaito_emergency_v3_available', handleEmergency);
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

  const handleActivateEmergencyV3 = () => {
    setEmergencyYoutubeV3(true);
    setEmergencyV3Available(false);
  };

  const handleDeactivateEmergencyV3 = () => {
    setEmergencyYoutubeV3(false);
  };

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
    if (activeTab === 'categories' || activeTab === 'library' || activeTab === 'shorts' || activeTab === 'channels') {
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
        maxResults: '28'
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      if (filters.publishedAfter) queryParams.set('publishedAfter', filters.publishedAfter);
      apiUrl = `/api/youtube/search?${queryParams.toString()}`;
    } else {
      // Trending or Home
      const queryParams = new URLSearchParams({
        regionCode: filters.regionCode,
        maxResults: '28'
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
        maxResults: '28',
        pageToken: feedNextPageToken
      });
      if (filters.categoryId) queryParams.set('videoCategoryId', filters.categoryId);
      if (filters.publishedAfter) queryParams.set('publishedAfter', filters.publishedAfter);
      apiUrl = `/api/youtube/search?${queryParams.toString()}`;
    } else {
      const queryParams = new URLSearchParams({
        regionCode: filters.regionCode,
        maxResults: '28',
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
            const existingIds = new Set(prev.map((v) => typeof v.id === 'string' ? v.id : (v.id as any)?.videoId));
            const newItems = data.items.filter((v: any) => {
              const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
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
  const handleSelectVideo = (video: YouTubeVideoItem) => {
    if (isShortVideo(video)) {
      setInitialShortVideo(video);
      setActiveTab('shorts');
      setSelectedVideo(null);
      setIsDetailOpen(false);
    } else {
      setSelectedVideo(video);
      setIsDetailOpen(true);
    }

    const targetId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId;
    if (!targetId) return;

    const updatedHistory = [
      video,
      ...watchHistory.filter((v) => {
        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
        return id !== targetId;
      })
    ].slice(0, 50);

    setWatchHistory(updatedHistory);
    try {
      localStorage.setItem('kaito_watch_history', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error(e);
    }

    if (!isShortVideo(video)) {
      // Fetch related videos for normal long-form videos with query fallback
      const q = encodeURIComponent(video.snippet?.title || '');
      const chId = encodeURIComponent(video.snippet?.channelId || '');
      customFetch(`/api/youtube/related/${targetId}?q=${q}&channelId=${chId}`)
        .then((res) => res.json())
        .then((data) => {
          setRelatedVideos((data.items || []).filter((r: YouTubeVideoItem) => !isChannelBlocked(r.snippet?.channelId || '')));
        })
        .catch((err) => console.error(err));
    }
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
    try {
      localStorage.removeItem('kaito_watch_history');
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePlaylist = (title: string, description: string) => {
    const newPl: UserCustomPlaylist = {
      id: Date.now().toString(),
      title,
      description,
      createdAt: new Date().toLocaleDateString('ja-JP'),
      videos: []
    };
    const updated = [newPl, ...customPlaylists];
    setCustomPlaylists(updated);
    try {
      localStorage.setItem('kaito_custom_playlists', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePlaylist = (id: string) => {
    const updated = customPlaylists.filter((p) => p.id !== id);
    setCustomPlaylists(updated);
    try {
      localStorage.setItem('kaito_custom_playlists', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearchSubmit = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

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

      // Async fetch complete video metadata
      customFetch(`/api/youtube/video/${parsed.videoId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.items && data.items[0]) {
            handleSelectVideo(data.items[0]);
          }
        })
        .catch(() => {});
      return;
    }

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
    } catch {}
  };

  const handleLockDisguise = () => {
    setIsUnlocked(false);
    try {
      sessionStorage.removeItem('kaito_math_unlocked');
    } catch {}
    setSelectedVideo(null);
  };

  // If not unlocked, render the Quadratic Equation Educational Disguise Page
  if (!isUnlocked) {
    return <MathDisguiseView onUnlock={handleUnlockMath} />;
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
        emergencyV3Available={emergencyV3Available}
        onActivateEmergencyV3={handleActivateEmergencyV3}
        onDeactivateEmergencyV3={handleDeactivateEmergencyV3}
        onLockDisguise={handleLockDisguise}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Render Selected Video Detail View if open */}
        {selectedVideo && isDetailOpen ? (
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
        ) : activeTab === 'channels' ? (
          <ChannelsView
            onSelectChannel={setSelectedChannelId}
            onSelectVideo={handleSelectVideo}
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
                    高画質ストリーム & NoCookie 再生対応
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
        />
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900 py-6 text-center text-xs text-neutral-400 space-y-3">
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

        {/* Minecraft-Themed Visitor Counter */}
        <div className="flex items-center justify-center pt-1">
          <MinecraftVisitorCounter />
        </div>

        <p className="font-semibold text-neutral-300">
          海斗<span className="text-rose-500">tube</span> — YouTube Client & Education Embed
        </p>
        <p className="text-[11px] text-neutral-500">
          Powered by YouTube Data API v3, Education Embed Player & Gemini AI
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
