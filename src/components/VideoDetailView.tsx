import React, { useState, useEffect, useRef } from 'react';
import {
  ThumbsUp,
  Bookmark,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ListVideo,
  Clock,
  ArrowLeft,
  Zap,
  Play,
  ShieldBan,
  Plus,
  Check,
  Users,
  Film,
  GraduationCap,
  Music,
  Filter,
  Radio,
  Calendar,
  Eye,
  Sparkles,
  Loader2,
  FileText,
  Search,
  ExternalLink,
  Shuffle,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  ListPlus,
  Trash2,
  X,
  FolderPlus,
  RefreshCw,
  Copy,
  Globe,
  Lock
} from 'lucide-react';
import {
  YouTubeVideoItem,
  YouTubeCommentThreadItem,
  PlaybackMode,
  UserCustomPlaylist
} from '../types';
import { EducationPlayer } from './EducationPlayer';
import { VideoCard } from './VideoCard';
import { ThumbnailImage } from './ThumbnailImage';
import { AuthorAvatar } from './AuthorAvatar';
import { ChannelBadge } from './ChannelBadge';
import { CollaboratorsModal } from './CollaboratorsModal';
import { PlaylistModal } from './PlaylistModal';
import { customFetch } from '../utils/apiClient';
import { fetchStreamSourcesCoalesced, getCachedStreamSources } from '../utils/streamManager';
import {
  formatViewCount,
  formatSubscriberCount,
  formatPublishedAt,
  formatISO8601Duration,
  extractTimestamps,
  cleanCommentText,
  isShortVideo,
  smoothCosineScrollTo,
  parseAnyDurationToSeconds,
  formatSecondsToHHMMSS,
  formatPremiereDateJST,
  formatWaitingCount,
  isPremiereScheduled,
  getPremiereScheduledTime
} from '../utils/formatters';
import {
  isChannelBlocked,
  blockChannel,
  unblockChannel,
  isChannelSubscribed,
  subscribeChannel,
  unsubscribeChannel
} from '../utils/channelStorage';
import {
  getUpNextQueue,
  removeFromUpNextQueue,
  moveInUpNextQueue,
  shuffleUpNextQueue,
  clearUpNextQueue,
  popNextFromUpNextQueue,
  getCustomPlaylistsFromStorage,
  addVideoToCustomPlaylist,
  clonePlaylistToCustomPlaylists,
  getVideoUniqueId,
  showGlobalToast
} from '../utils/userDataManager';
import { getCachedChannelAvatar, setCachedChannelAvatar } from '../utils/channelAvatarCache';

interface VideoDetailViewProps {
  video: YouTubeVideoItem;
  relatedVideos: YouTubeVideoItem[];
  onSelectVideo: (video: YouTubeVideoItem) => void;
  onSelectChannel: (channelId: string) => void;
  playbackMode: PlaybackMode;
  onTogglePlaybackMode: (mode: PlaybackMode) => void;
  isSaved: boolean;
  onToggleSave: (video: YouTubeVideoItem) => void;
  onBackToHome: () => void;
  onOpenShortsPlayer?: (video: YouTubeVideoItem) => void;
}

export const VideoDetailView: React.FC<VideoDetailViewProps> = ({
  video,
  relatedVideos,
  onSelectVideo,
  onSelectChannel,
  playbackMode,
  onTogglePlaybackMode,
  isSaved,
  onToggleSave,
  onBackToHome,
  onOpenShortsPlayer
}) => {
  const [comments, setComments] = useState<YouTubeCommentThreadItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [commentsOrder, setCommentsOrder] = useState<'relevance' | 'time'>('relevance');
  const [showLiveChat, setShowLiveChat] = useState(true);
  const [isLiveChatMode, setIsLiveChatMode] = useState(false);
  const [liveChatAutoRefresh, setLiveChatAutoRefresh] = useState(true);
  const [liveChatViewType, setLiveChatViewType] = useState<'innertube' | 'iframe'>('innertube');
  const liveChatScrollRef = useRef<HTMLDivElement>(null);

  // Related Videos internal state & pagination
  const [relatedList, setRelatedList] = useState<YouTubeVideoItem[]>(relatedVideos || []);
  const [loadingRelated, setLoadingRelated] = useState<boolean>(false);
  const [relatedNextPageToken, setRelatedNextPageToken] = useState<string | null>(null);
  const [loadingMoreRelated, setLoadingMoreRelated] = useState(false);

  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // Modals state
  const [isCollaboratorsModalOpen, setIsCollaboratorsModalOpen] = useState(false);

  // Comment clamp state (Set of comment IDs expanded)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Autoplay Filter & Duplicate prevention
  const [autoplayFilterEnabled, setAutoplayFilterEnabled] = useState<boolean>(() => {
    return localStorage.getItem('kaito_autoplay_filter_enabled') === 'true';
  });
  const [autoplayMaxMinutes, setAutoplayMaxMinutes] = useState<number>(() => {
    const v = localStorage.getItem('kaito_autoplay_max_minutes');
    return v ? parseInt(v, 10) : 4;
  });
  const [autoplayToast, setAutoplayToast] = useState<string | null>(null);

  // IntersectionObserver sentinel for related videos infinite scroll
  const relatedSentinelRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Record<string, HTMLElement | null>>({});

  // Jump to timestamp state & trigger counter (forces Edu embed URL reload on every click)
  const [playerStartTime, setPlayerStartTime] = useState<number>(0);
  const [seekTrigger, setSeekTrigger] = useState<number>(0);

  // Channel subscriber count & avatar state
  const [channelAvatar, setChannelAvatar] = useState<string>('');
  const [subscriberCount, setSubscriberCount] = useState<string>('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const rawId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || (video.id as any)?.playlistId || '';
  const detectedPlaylistId =
    video.playlistId ||
    (typeof video.id === 'object' ? (video.id as any)?.playlistId : undefined) ||
    ((video.isPlaylist || video.kind === 'youtube#playlist' || /^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(rawId)) ? rawId : undefined);
  const videoId =
    video.firstVideoId ||
    (typeof video.id === 'object' ? (video.id as any)?.videoId : undefined) ||
    (video as any).snippet?.resourceId?.videoId ||
    (video as any).contentDetails?.videoId ||
    (!/^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(rawId) ? rawId : '');
  const [metaSnippet, setMetaSnippet] = useState<any>(video.snippet || {});
  const [streamAcquiredForId, setStreamAcquiredForId] = useState<string>(() =>
    videoId && getCachedStreamSources(videoId) ? videoId : ''
  );
  const isStreamReady = Boolean(videoId && streamAcquiredForId === videoId);

  // 1. Prioritize stream acquisition BEFORE fetching comments, related videos, or secondary metadata
  useEffect(() => {
    if (!videoId) return;
    setComments([]);
    setNextPageToken(null);
    setRelatedList([]);
    setRelatedNextPageToken(null);

    if (getCachedStreamSources(videoId)) {
      setStreamAcquiredForId(videoId);
      return;
    }

    setStreamAcquiredForId('');
    let cancelled = false;
    fetchStreamSourcesCoalesced(videoId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setStreamAcquiredForId(videoId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const extractPlaylistItemVideoId = (it: any): string => {
    if (!it) return '';
    if (typeof it.id === 'string' && !/^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(it.id)) return it.id;
    if (it.id?.videoId) return String(it.id.videoId);
    if (it.snippet?.resourceId?.videoId) return String(it.snippet.resourceId.videoId);
    if (it.contentDetails?.videoId) return String(it.contentDetails.videoId);
    if (it.firstVideoId) return String(it.firstVideoId);
    return getVideoUniqueId(it);
  };

  // Playlist Queue state when playing a playlist from search, related videos, or custom playlists
  const [activePlaylist, setActivePlaylist] = useState<{
    id: string;
    title: string;
    channelTitle: string;
    items: YouTubeVideoItem[];
    originalItems: YouTubeVideoItem[];
  } | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const activePlaylistTrackRef = useRef<HTMLButtonElement | null>(null);

  // Playlist Shuffle & Repeat/Loop state
  const [isPlaylistShuffle, setIsPlaylistShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>(() => {
    const saved = localStorage.getItem('kaito_repeat_mode');
    if (saved === 'all' || saved === 'one') return saved;
    return 'off';
  });

  // Up Next Queue (一時キュー) state
  const [upNextQueue, setUpNextQueue] = useState<YouTubeVideoItem[]>(() => getUpNextQueue());

  // Add to Custom Playlist dropdown & modal state in detail view
  const [showAddPlaylistMenu, setShowAddPlaylistMenu] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [customPlaylistsList, setCustomPlaylistsList] = useState<UserCustomPlaylist[]>([]);

  useEffect(() => {
    const syncQueue = () => setUpNextQueue(getUpNextQueue());
    window.addEventListener('kaito_queue_changed', syncQueue);
    return () => window.removeEventListener('kaito_queue_changed', syncQueue);
  }, []);

  const handleCycleRepeatMode = () => {
    const next: 'off' | 'all' | 'one' =
      repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    setRepeatMode(next);
    try {
      localStorage.setItem('kaito_repeat_mode', next);
    } catch {}
    const label =
      next === 'all'
        ? '全曲ループ再生をONにしました'
        : next === 'one'
        ? '1曲リピート再生をONにしました'
        : 'ループ再生をOFFにしました';
    showGlobalToast(label);
  };

  const handleTogglePlaylistShuffle = () => {
    if (!activePlaylist) return;
    const nextShuffle = !isPlaylistShuffle;
    setIsPlaylistShuffle(nextShuffle);

    if (nextShuffle) {
      const currentItem = activePlaylist.items.find((it) => extractPlaylistItemVideoId(it) === videoId);
      const others = activePlaylist.items.filter((it) => extractPlaylistItemVideoId(it) !== videoId);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      const newOrder = currentItem ? [currentItem, ...others] : others;
      setActivePlaylist({
        ...activePlaylist,
        items: newOrder
      });
      showGlobalToast('再生リストをシャッフル順に切り替えました');
    } else {
      setActivePlaylist({
        ...activePlaylist,
        items: activePlaylist.originalItems
      });
      showGlobalToast('再生リストを元の曲順に戻しました');
    }
  };

  const handleStepPlaylistTrack = (delta: number) => {
    if (!activePlaylist || activePlaylist.items.length === 0) return;
    const currentIdx = activePlaylist.items.findIndex((it) => extractPlaylistItemVideoId(it) === videoId);
    let nextIdx = (currentIdx >= 0 ? currentIdx : 0) + delta;
    if (nextIdx >= activePlaylist.items.length) {
      nextIdx = repeatMode === 'all' ? 0 : activePlaylist.items.length - 1;
    }
    if (nextIdx < 0) {
      nextIdx = repeatMode === 'all' ? activePlaylist.items.length - 1 : 0;
    }
    const target = activePlaylist.items[nextIdx];
    if (target) {
      const targetVid = extractPlaylistItemVideoId(target);
      onSelectVideo({
        ...target,
        id: targetVid || target.id,
        firstVideoId: targetVid,
        isPlaylist: false,
        kind: 'youtube#video',
        playlistId: activePlaylist.id,
        customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
        customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
      });
    }
  };

  useEffect(() => {
    const customId = detectedPlaylistId || (video.customPlaylistItems?.length ? `custom_${video.customPlaylistTitle || 'playlist'}` : undefined);

    // If already playing this exact playlist, keep its current items & shuffle state intact
    if (activePlaylist && customId && activePlaylist.id === customId && activePlaylist.items.length > 0) {
      if ((video.isPlaylist || video.kind === 'youtube#playlist') && activePlaylist.items[0]) {
        const first = activePlaylist.items[0];
        const firstVid = extractPlaylistItemVideoId(first);
        onSelectVideo({
          ...first,
          id: firstVid || first.id,
          firstVideoId: firstVid,
          isPlaylist: false,
          kind: 'youtube#video',
          playlistId: activePlaylist.id,
          customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
          customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
        });
      }
      return;
    }

    // Support Custom Playlists or Channel Play All lists passed directly
    if (video.customPlaylistItems && video.customPlaylistItems.length > 0) {
      const cid = customId || `custom_${video.customPlaylistTitle || 'playlist'}`;
      setIsPlaylistShuffle(false);
      setActivePlaylist({
        id: cid,
        title: video.customPlaylistTitle || '再生リスト',
        channelTitle: video.snippet?.channelTitle || 'プレイリスト',
        items: video.customPlaylistItems,
        originalItems: video.customPlaylistItems
      });
      if (!videoId || video.isPlaylist || video.kind === 'youtube#playlist') {
        const first = video.customPlaylistItems[0];
        if (first) {
          const firstVid = extractPlaylistItemVideoId(first);
          onSelectVideo({
            ...first,
            id: firstVid || first.id,
            firstVideoId: firstVid,
            isPlaylist: false,
            kind: 'youtube#video',
            playlistId: cid,
            customPlaylistItems: video.customPlaylistItems,
            customPlaylistTitle: video.customPlaylistTitle
          });
        }
      }
      return;
    }

    if (!detectedPlaylistId) {
      // If user clicked a standalone video not in the active playlist, clear activePlaylist
      if (activePlaylist && !activePlaylist.items.some((it) => extractPlaylistItemVideoId(it) === videoId)) {
        setActivePlaylist(null);
      }
      return;
    }

    // If we already have a target videoId to play, wait until its stream is acquired before fetching the playlist tracks
    if (videoId && !isStreamReady) {
      return;
    }

    let cancelled = false;
    setLoadingPlaylist(true);
    const seedParam = videoId ? `?videoId=${encodeURIComponent(videoId)}` : '';
    customFetch(`/api/youtube/playlist/${encodeURIComponent(detectedPlaylistId)}${seedParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          setIsPlaylistShuffle(false);
          const plTitle = data.playlist?.snippet?.title || video.customPlaylistTitle || video.snippet?.title || '再生リスト';
          const plObj = {
            id: detectedPlaylistId,
            title: plTitle,
            channelTitle: data.playlist?.snippet?.channelTitle || video.snippet?.channelTitle || '',
            items: data.items,
            originalItems: data.items
          };
          setActivePlaylist(plObj);
          const hasMatchingVideoInList =
            Boolean(videoId) && data.items.some((it: any) => extractPlaylistItemVideoId(it) === videoId);
          if (!videoId || video.isPlaylist || video.kind === 'youtube#playlist' || !hasMatchingVideoInList) {
            const first = data.items[0];
            if (first) {
              const firstVid = extractPlaylistItemVideoId(first);
              onSelectVideo({
                ...first,
                id: firstVid || first.id,
                firstVideoId: firstVid,
                isPlaylist: false,
                kind: 'youtube#video',
                playlistId: detectedPlaylistId,
                customPlaylistItems: data.items,
                customPlaylistTitle: plTitle
              });
            }
          }
        }
      })
      .catch((err) => console.warn('Playlist load error:', err))
      .finally(() => {
        if (!cancelled) setLoadingPlaylist(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detectedPlaylistId, videoId, isStreamReady, video.customPlaylistItems]);

  // Auto-scroll active playlist item into view when track changes
  useEffect(() => {
    if (activePlaylistTrackRef.current) {
      try {
        activePlaylistTrackRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch {}
    }
  }, [videoId, activePlaylist?.id]);

  // Reset timestamp state when switching videos
  useEffect(() => {
    setPlayerStartTime(0);
    setSeekTrigger(0);
  }, [videoId]);

  // Jump to timestamp handler (used by description, chapters, and comments)
  const handleJumpToTime = (seconds: number) => {
    const targetSec = Math.max(0, Math.floor(seconds));
    try {
      localStorage.setItem('yt_user_gesture_v1', '1');
    } catch {}
    setPlayerStartTime(targetSec);
    setSeekTrigger((prev) => prev + 1);

    // Smooth scroll up to player if scrolled down
    const playerEl = document.getElementById(`player-container-${videoId}`);
    if (playerEl) {
      const rect = playerEl.getBoundingClientRect();
      if (rect.top < -80 || rect.top > window.innerHeight * 0.5) {
        const targetY = Math.max(0, (window.pageYOffset || document.documentElement.scrollTop) + rect.top - 76);
        smoothCosineScrollTo(targetY, 350);
      }
    }
  };
  const [metaStats, setMetaStats] = useState<any>(video.statistics || {});

  const snippet = metaSnippet || {};
  const channelId = snippet.channelId;

  // Sync prop changes & auto-fetch full metadata ONLY after stream is acquired
  useEffect(() => {
    setMetaSnippet(video.snippet || {});
    setMetaStats(video.statistics || {});
    setAutoplayToast(null);
    setPlayerStartTime(0);
  }, [videoId, video]);

  useEffect(() => {
    if (!videoId || !isStreamReady) return;
    if (!video.snippet?.description || !video.snippet?.channelTitle) {
      customFetch(`/api/youtube/video/${videoId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.items && data.items[0]) {
            if (data.items[0].snippet) setMetaSnippet((prev: any) => ({ ...prev, ...data.items[0].snippet }));
            if (data.items[0].statistics) setMetaStats((prev: any) => ({ ...prev, ...data.items[0].statistics }));
          }
          if (data.relatedItems && Array.isArray(data.relatedItems) && data.relatedItems.length > 0) {
            setRelatedList((prev) => (prev.length > 0 ? prev : data.relatedItems));
          }
        })
        .catch((err) => console.warn('Video details fetch error:', err));
    }
  }, [videoId, video, isStreamReady]);

  // Sync window.__autoplayDurationFilter and window.__autoplayCandidates (Reference code compatibility)
  useEffect(() => {
    try {
      (window as any).__autoplayDurationFilter = {
        enabled: Boolean(autoplayFilterEnabled),
        maxMinutes: autoplayMaxMinutes
      };
    } catch {}
  }, [autoplayFilterEnabled, autoplayMaxMinutes]);

  useEffect(() => {
    try {
      (window as any).__autoplayCandidates = relatedList
        .map((v) => {
          const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
          return {
            id,
            duration: v.contentDetails?.duration || '',
            item: v
          };
        })
        .filter((c) => Boolean(c.id));
    } catch {}
  }, [relatedList]);

  // Sync relatedVideos prop if parent populates it
  useEffect(() => {
    if (relatedVideos && relatedVideos.length > 0 && relatedList.length === 0) {
      const filtered = relatedVideos.filter((v) => {
        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
        return id && id !== videoId && !isChannelBlocked(v.snippet?.channelId || '');
      });
      if (filtered.length > 0) {
        setRelatedList(filtered);
      }
    }
  }, [relatedVideos, videoId]);

  // Reset relatedList immediately when switching to a new videoId so stale candidates are never used
  useEffect(() => {
    setRelatedList((prev) =>
      prev.filter((v) => {
        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
        return id && id !== videoId;
      })
    );
  }, [videoId]);

  // Fetch related videos ONLY after stream has been acquired (isStreamReady)
  useEffect(() => {
    if (!videoId || !isStreamReady) return;

    let isMounted = true;
    const filterValidItems = (items: any[]) => {
      const seen = new Set<string>([videoId]);
      const out: YouTubeVideoItem[] = [];
      for (const item of items || []) {
        const id = typeof item.id === 'string' ? item.id : item.id?.videoId;
        if (id && !seen.has(id) && !isChannelBlocked(item.snippet?.channelId || '')) {
          seen.add(id);
          out.push(item);
        }
      }
      return out;
    };

    const fetchRelated = async () => {
      setLoadingRelated(true);
      try {
        const titleQuery = snippet.title || video.snippet?.title || '';
        const authorQuery = snippet.channelTitle || video.snippet?.channelTitle || '';
        const q = encodeURIComponent(titleQuery);

        // Stage 1: Related endpoint
        try {
          const res = await customFetch(`/api/youtube/related/${videoId}?q=${q}&channelId=${channelId || ''}`);
          const data = await res.json();
          const valid = filterValidItems(data.items || []);
          if (isMounted && valid.length > 0) {
            setRelatedList(valid);
            setRelatedNextPageToken(data.nextPageToken || 'page_2');
            setLoadingRelated(false);
            return;
          }
        } catch (e) {
          console.warn('Stage 1 related fetch failed:', e);
        }

        // Stage 2: Client-side fallback search by cleaned video title or channel name
        const cleanQuery = (titleQuery || authorQuery)
          .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）|#\S+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40) || titleQuery || authorQuery || '人気 動画';

        try {
          const searchRes = await customFetch(`/api/youtube/search?q=${encodeURIComponent(cleanQuery)}&maxResults=20&regionCode=JP`);
          const searchData = await searchRes.json();
          const validSearch = filterValidItems(searchData.items || []);
          if (isMounted && validSearch.length > 0) {
            setRelatedList(validSearch);
            setRelatedNextPageToken(searchData.nextPageToken || null);
            setLoadingRelated(false);
            return;
          }
        } catch (e) {
          console.warn('Stage 2 search fallback failed:', e);
        }

        // Stage 3: Client-side fallback to trending videos so sidebar is never blank
        try {
          const trendRes = await customFetch(`/api/youtube/trending?regionCode=JP&maxResults=20`);
          const trendData = await trendRes.json();
          const validTrend = filterValidItems(trendData.items || []);
          if (isMounted && validTrend.length > 0) {
            setRelatedList(validTrend);
            setRelatedNextPageToken(trendData.nextPageToken || null);
            setLoadingRelated(false);
            return;
          }
        } catch (e) {
          console.warn('Stage 3 trending fallback failed:', e);
        }

        if (isMounted && relatedVideos && relatedVideos.length > 0) {
          setRelatedList(filterValidItems(relatedVideos));
        }
      } finally {
        if (isMounted) {
          setLoadingRelated(false);
        }
      }
    };

    fetchRelated();
    return () => {
      isMounted = false;
    };
  }, [videoId, isStreamReady, snippet.title, snippet.channelTitle]);

  // Load More Related Videos
  const handleLoadMoreRelated = () => {
    if (!videoId || loadingMoreRelated) return;
    setLoadingMoreRelated(true);
    const q = encodeURIComponent(snippet.title || '');
    const tokenParam = relatedNextPageToken ? `&pageToken=${encodeURIComponent(relatedNextPageToken)}` : '';
    customFetch(`/api/youtube/related/${videoId}?q=${q}&channelId=${channelId || ''}${tokenParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setRelatedList((prev) => {
            const existingIds = new Set(prev.map((v) => typeof v.id === 'string' ? v.id : (v.id as any)?.videoId));
            const newItems = data.items.filter((v: any) => {
              const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
              return id && !existingIds.has(id);
            });
            return [...prev, ...newItems];
          });
        }
        setRelatedNextPageToken(data.nextPageToken || null);
        setLoadingMoreRelated(false);
      })
      .catch((err) => {
        console.error('Load more related error:', err);
        setLoadingMoreRelated(false);
      });
  };

  useEffect(() => {
    if (!channelId) return;
    setIsSubscribed(isChannelSubscribed(channelId));
    setIsBlocked(isChannelBlocked(channelId));
  }, [channelId]);

  const handleToggleSubscribe = () => {
    if (!channelId) return;
    if (isSubscribed) {
      unsubscribeChannel(channelId);
      setIsSubscribed(false);
    } else {
      subscribeChannel({
        channelId,
        channelTitle: snippet.channelTitle || 'チャンネル',
        subscriberCount,
        subscribedAt: new Date().toISOString()
      });
      setIsSubscribed(true);
    }
  };

  const handleToggleBlock = () => {
    if (!channelId) return;
    if (isBlocked) {
      unblockChannel(channelId);
      setIsBlocked(false);
    } else {
      if (window.confirm(`「${snippet.channelTitle || 'このチャンネル'}」を非表示・ブロックしますか？`)) {
        blockChannel(channelId, snippet.channelTitle || 'チャンネル');
        setIsBlocked(true);
      }
    }
  };

  // Load initial comments (supports both normal comments and InnerTube Live Chat)
  const fetchInitialOrLatestComments = (silent = false) => {
    if (!videoId) return;
    if (!silent) {
      setLoadingComments(true);
      setComments([]);
      setNextPageToken(null);
    }

    const liveQuery = silent && isLiveChatMode ? '&live=1' : '';

    customFetch(`/api/youtube/comments/${videoId}?order=${commentsOrder}${liveQuery}`)
      .then((res) => res.json())
      .then((data) => {
        const incoming: YouTubeCommentThreadItem[] = Array.isArray(data.items) ? data.items : [];
        if (data.isLiveChat === true) {
          setIsLiveChatMode(true);
        } else {
          setIsLiveChatMode(false);
          setMetaSnippet((prev: any) =>
            prev?.liveBroadcastContent === 'live' ? { ...prev, liveBroadcastContent: 'none' } : prev
          );
        }
        setComments((prev) => {
          if (!silent || prev.length === 0) return incoming;
          const seen = new Set(prev.map((c) => c.id));
          const added = incoming.filter((c) => c?.id && !seen.has(c.id));
          return added.length > 0 ? [...prev, ...added].slice(-150) : prev;
        });
        if (data.nextPageToken) {
          setNextPageToken(data.nextPageToken);
        }
        setLoadingComments(false);
      })
      .catch((err) => {
        console.error('Comments fetch error:', err);
        setLoadingComments(false);
      });
  };

  useEffect(() => {
    setIsLiveChatMode(false);
    if (!isStreamReady) return;
    fetchInitialOrLatestComments(false);
  }, [videoId, commentsOrder, isStreamReady]);

  // Real-time InnerTube Live Chat polling when watching a Live stream
  useEffect(() => {
    if (!videoId || !isLiveChatMode || !liveChatAutoRefresh) return;

    const timer = setInterval(() => {
      const tokenParam =
        nextPageToken && nextPageToken.startsWith('livechat')
          ? `&pageToken=${encodeURIComponent(nextPageToken)}`
          : '';
      customFetch(`/api/youtube/comments/${videoId}?live=1${tokenParam}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.isLiveChat) setIsLiveChatMode(true);
          if (Array.isArray(data.items) && data.items.length > 0) {
            setComments((prev) => {
              const seen = new Set(prev.map((c) => c.id));
              const fresh = data.items.filter((c: any) => c?.id && !seen.has(c.id));
              if (fresh.length === 0) return prev;
              return [...prev, ...fresh].slice(-150);
            });
            if (liveChatScrollRef.current) {
              try {
                liveChatScrollRef.current.scrollTop = liveChatScrollRef.current.scrollHeight;
              } catch {}
            }
          }
          if (data.nextPageToken) {
            setNextPageToken(data.nextPageToken);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => clearInterval(timer);
  }, [videoId, isLiveChatMode, snippet.liveBroadcastContent, liveChatAutoRefresh, nextPageToken]);

  // Load more comments (Pagination or Live Chat continuation)
  const handleLoadMoreComments = () => {
    if (!nextPageToken || loadingMoreComments) return;
    setLoadingMoreComments(true);

    const liveParam = isLiveChatMode || nextPageToken.startsWith('livechat') ? '&live=1' : '';
    customFetch(`/api/youtube/comments/${videoId}?order=${commentsOrder}&pageToken=${encodeURIComponent(nextPageToken)}${liveParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.isLiveChat) setIsLiveChatMode(true);
        setComments((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const added = (data.items || []).filter((c: any) => c?.id && !seen.has(c.id));
          return [...prev, ...added];
        });
        setNextPageToken(data.nextPageToken || null);
        setLoadingMoreComments(false);
      })
      .catch((err) => {
        console.error('Load more comments error:', err);
        setLoadingMoreComments(false);
      });
  };

  // Auto-scroll infinite loading for related videos
  useEffect(() => {
    if (!relatedSentinelRef.current || !relatedNextPageToken || loadingMoreRelated) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMoreRelated();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(relatedSentinelRef.current);
    return () => observer.disconnect();
  }, [relatedNextPageToken, loadingMoreRelated, videoId]);

  // Handle Autoplay Next Video with Filter, 3-recent history exclude, and 5s lock
  const handleAutoplayNext = () => {
    const lock = sessionStorage.getItem('yt_autoplay_lock');
    if (lock) {
      const lockTime = parseInt(lock, 10);
      if (!isNaN(lockTime) && Date.now() - lockTime < 5000) {
        console.log('[Autoplay Guard] yt_autoplay_lock active (5s limit), blocking duplicate transition');
        return; // Locked against rapid duplicate trigger
      }
    }

    // Set 5-second lock IMMEDIATELY in sessionStorage to prevent multiple event fires
    sessionStorage.setItem('yt_autoplay_lock', String(Date.now()));

    // 1. 1曲リピート (Single Track Repeat)
    if (repeatMode === 'one') {
      handleJumpToTime(0);
      return;
    }

    // 2. 次に再生（一時キュー）が予約されていれば最優先で消化！
    const nextQueued = popNextFromUpNextQueue();
    if (nextQueued) {
      const qVid = extractPlaylistItemVideoId(nextQueued);
      onSelectVideo({
        ...nextQueued,
        id: qVid || nextQueued.id,
        firstVideoId: qVid,
        isPlaylist: false,
        kind: 'youtube#video',
        playlistId: activePlaylist?.id,
        customPlaylistItems: video.customPlaylistItems || activePlaylist?.originalItems,
        customPlaylistTitle: video.customPlaylistTitle || activePlaylist?.title
      });
      return;
    }

    // 3. 再生リスト再生中の場合、必ずその再生リストの順番で次の動画へ進む
    if (activePlaylist && activePlaylist.items.length > 0) {
      const currentIdx = activePlaylist.items.findIndex((it) => {
        return extractPlaylistItemVideoId(it) === videoId;
      });
      if (currentIdx >= 0 && currentIdx < activePlaylist.items.length - 1) {
        const nextItem = activePlaylist.items[currentIdx + 1];
        const nextVid = extractPlaylistItemVideoId(nextItem);
        onSelectVideo({
          ...nextItem,
          id: nextVid || nextItem.id,
          firstVideoId: nextVid,
          isPlaylist: false,
          kind: 'youtube#video',
          playlistId: activePlaylist.id,
          customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
          customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
        });
        return;
      } else if (currentIdx === -1 && activePlaylist.items.length > 0) {
        const firstItem = activePlaylist.items[0];
        const firstVid = extractPlaylistItemVideoId(firstItem);
        onSelectVideo({
          ...firstItem,
          id: firstVid || firstItem.id,
          firstVideoId: firstVid,
          isPlaylist: false,
          kind: 'youtube#video',
          playlistId: activePlaylist.id,
          customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
          customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
        });
        return;
      } else if (currentIdx === activePlaylist.items.length - 1) {
        if (repeatMode === 'all') {
          const firstItem = activePlaylist.items[0];
          const firstVid = extractPlaylistItemVideoId(firstItem);
          onSelectVideo({
            ...firstItem,
            id: firstVid || firstItem.id,
            firstVideoId: firstVid,
            isPlaylist: false,
            kind: 'youtube#video',
            playlistId: activePlaylist.id,
            customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
            customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
          });
        } else {
          showGlobalToast('再生リストの最後まで再生しました');
        }
        return;
      }
    }

    // Read recent history (last 3 videos) to avoid loop
    let fullHistory: string[] = [];
    let recentHistory: string[] = [];
    try {
      const stored = localStorage.getItem('yt_play_history_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          fullHistory = parsed;
          recentHistory = parsed.slice(-3);
        }
      }
    } catch {}

    const maxSeconds = autoplayMaxMinutes * 60;
    const sourcePool: YouTubeVideoItem[] =
      relatedList.length > 0
        ? relatedList
        : relatedVideos && relatedVideos.length > 0
        ? relatedVideos
        : [];

    // Also collect DOM [data-video-id] candidates as fallback (matching reference StreamType1/2)
    if (sourcePool.length === 0 && typeof document !== 'undefined') {
      const domNodes = Array.from(document.querySelectorAll('[data-video-id]'));
      for (const el of domNodes) {
        const domId = el.getAttribute('data-video-id');
        const domDur = el.getAttribute('data-duration') || '';
        if (domId && domId !== videoId && !/^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(domId)) {
          sourcePool.push({
            id: domId,
            kind: 'youtube#video',
            snippet: {
              title: el.getAttribute('title') || '関連動画',
              channelTitle: '',
              thumbnails: {
                high: { url: `https://i.ytimg.com/vi/${domId}/hqdefault.jpg` }
              }
            },
            contentDetails: {
              duration: domDur
            }
          } as YouTubeVideoItem);
        }
      }
    }

    const filterCandidates = (excludeRecent: boolean) =>
      sourcePool.filter((v) => {
        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
        if (!id || id === videoId) return false;
        if (v.isPlaylist || v.kind === 'youtube#playlist' || /^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(id)) {
          return false;
        }
        if (excludeRecent && recentHistory.includes(id)) return false;

        if (autoplayFilterEnabled) {
          const durationSec = parseAnyDurationToSeconds(v.contentDetails?.duration || '');
          if (durationSec > 0 && durationSec > maxSeconds) {
            return false;
          }
        }
        return true;
      });

    let candidates = filterCandidates(true);
    if (candidates.length === 0 && !autoplayFilterEnabled) {
      candidates = filterCandidates(false);
    }

    if (candidates.length > 0) {
      const nextVid = candidates[0];
      const nextId = typeof nextVid.id === 'string' ? nextVid.id : (nextVid.id as any)?.videoId;
      try {
        const updated = [...fullHistory.filter((id) => id !== videoId), videoId].slice(-10);
        localStorage.setItem('yt_play_history_v1', JSON.stringify(updated));
      } catch {}

      if (nextVid.snippet?.title) {
        showGlobalToast(`次の動画を自動再生: ${nextVid.snippet.title}`);
      }
      onSelectVideo({
        ...nextVid,
        id: nextId || nextVid.id,
        isPlaylist: false,
        fromWatchAutoplay: true
      } as any);
    } else {
      // Clear lock if no candidates could be played
      sessionStorage.removeItem('yt_autoplay_lock');
      setAutoplayToast('指定条件に合う関連動画がないため、自動再生をストップしました。');
      setTimeout(() => setAutoplayToast(null), 4000);
    }
  };

  const toggleCommentExpand = (commentId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  // Load channel subscriber count & avatar
  useEffect(() => {
    if (!channelId) return;

    // Check pre-cached avatar or video snippet immediately
    const initial =
      snippet.channelThumbnail ||
      (video as any).authorThumbnail ||
      (video as any).authorThumbnails?.[0]?.url ||
      getCachedChannelAvatar(channelId);
    if (initial) {
      setChannelAvatar(initial);
    }

    if (!isStreamReady) return;

    customFetch(`/api/youtube/channel/${channelId}`)
      .then((res) => res.json())
      .then((data) => {
        const item = data.items?.[0];
        if (item?.snippet?.thumbnails) {
          const avatar =
            item.snippet.thumbnails.high?.url ||
            item.snippet.thumbnails.medium?.url ||
            item.snippet.thumbnails.default?.url ||
            '';
          if (avatar) {
            setChannelAvatar(avatar);
            setCachedChannelAvatar(channelId, avatar);
          }
        }
        if (item?.statistics?.subscriberCount) {
          setSubscriberCount(item.statistics.subscriberCount);
        }
      })
      .catch(() => {});
  }, [channelId, video, snippet, isStreamReady]);

  const parsedTimestamps = extractTimestamps(snippet.description);

  // Helper to convert inline timestamps (e.g. 0:45, 12:34, 1:02:15) into clickable buttons
  const renderTextWithTimestamps = (text: string) => {
    if (!text) return null;
    const parts = text.split(/((?:(?:\d{1,2}):)?\d{1,2}:\d{2})/g);
    return parts.map((part, index) => {
      const match = part.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
      if (match) {
        const hrs = match[1] ? parseInt(match[1], 10) : 0;
        const mins = parseInt(match[2], 10);
        const secs = parseInt(match[3], 10);
        if (secs < 60 && mins < 60) {
          const totalSeconds = hrs * 3600 + mins * 60 + secs;
          return (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleJumpToTime(totalSeconds);
              }}
              className="text-rose-400 hover:text-rose-300 font-mono font-bold bg-rose-500/10 hover:bg-rose-500/25 px-1.5 py-0.2 rounded border border-rose-500/30 transition-colors cursor-pointer inline-flex items-center gap-0.5 mx-0.5"
              title={`${part} にジャンプ再生`}
            >
              {part}
            </button>
          );
        }
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  // Helper to render comment text with clean formatting, inline clickable timestamps, and clamping
  const renderCommentBody = (commentId: string, textOriginal?: string, textDisplay?: string) => {
    const cleanText = cleanCommentText(textOriginal, textDisplay);
    if (!cleanText) {
      return <span className="text-neutral-500 italic">コメント内容がありません</span>;
    }
    const isExpanded = expandedComments.has(commentId);
    const isLong = cleanText.length > 220 || cleanText.split('\n').length > 5;

    return (
      <div className="space-y-1">
        <div className={`whitespace-pre-line ${!isExpanded && isLong ? 'max-h-[140px] overflow-hidden relative' : ''}`}>
          {renderTextWithTimestamps(cleanText)}
          {!isExpanded && isLong && (
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent pointer-events-none" />
          )}
        </div>
        {isLong && (
          <button
            onClick={() => toggleCommentExpand(commentId)}
            className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            {isExpanded ? '一部を表示' : 'もっと見る'}
          </button>
        )}
      </div>
    );
  };

  const isUpcomingPremiere = isPremiereScheduled(video);
  const hasFixedDuration = Boolean(
    ((video as any).lengthSeconds && (video as any).lengthSeconds > 0) ||
    (video.contentDetails?.duration && video.contentDetails.duration !== 'PT0M0S' && video.contentDetails.duration !== 'PT0S')
  );
  const isLive = Boolean(
    isLiveChatMode ||
    (!hasFixedDuration && loadingComments && (snippet.liveBroadcastContent === 'live' || (video as any).liveNow))
  );
  const waitingCount =
    (video as any).waiting ||
    (video as any).concurrentViewers ||
    (video as any).liveStreamingDetails?.concurrentViewers ||
    (video as any).liveViewers;
  const premiereScheduledTime = getPremiereScheduledTime(video) || snippet.publishedAt;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-white yt-watch-page">
      {/* Autoplay Filter Notification Toast */}
      {autoplayToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 border border-amber-500/80 text-amber-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-medium max-w-sm">
          <Filter className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{autoplayToast}</span>
          <button
            onClick={() => setAutoplayToast(null)}
            className="ml-auto text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Back Button & Stream Mode Quick Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>一覧へ戻る</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Chat Toggle Button if Live */}
          {isLive && (
            <button
              onClick={() => setShowLiveChat(!showLiveChat)}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                showLiveChat
                  ? 'bg-rose-600/20 text-rose-300 border-rose-500/40 hover:bg-rose-600/30'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{showLiveChat ? 'Liveチャットを閉じる' : 'Liveチャットを表示'}</span>
            </button>
          )}

          {/* Quick Stream Type Dropdown */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-neutral-300">
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] text-neutral-400">再生モード:</span>
            <select
              value={playbackMode}
              onChange={(e) => onTogglePlaybackMode(e.target.value as PlaybackMode)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="education" className="bg-neutral-900 text-white">YouTube Edu（通常・教育用埋込）</option>
              <option value="stream-ytdlp" className="bg-neutral-900 text-white">yt-dlp ストリーム（高速抽出・1080p/720p/360p）</option>
              <option value="stream-sync" className="bg-neutral-900 text-white">タイプ2（映像+音声 2要素リアルタイム同期）</option>
              <option value="stream-high" className="bg-neutral-900 text-white">1080p 合体ストリーム（サーバー結合）</option>
              <option value="stream-audio" className="bg-neutral-900 text-white">音声ストリーム（オーディオのみ）</option>
              <option value="stream-360" className="bg-neutral-900 text-white">360p ストリーム（軽量）</option>
              <option value="nocookie" className="bg-neutral-900 text-white">NoCookie プレイヤー</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Player + Details (Left), Related Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (Player + Video Info + Comments) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Premiere Banner */}
          {isUpcomingPremiere && (
            <div className="bg-gradient-to-r from-amber-950/80 via-neutral-900 to-amber-950/80 border border-amber-500/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-amber-500 text-black font-black text-[11px] rounded uppercase tracking-wider">
                      プレミア公開
                    </span>
                    <span className="text-sm font-bold text-amber-300">
                      プレミア公開を待っています
                    </span>
                  </div>
                  <p className="text-xs text-neutral-200 mt-1">
                    公開予定: {formatPremiereDateJST(premiereScheduledTime)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs font-bold text-amber-400">
                  {formatWaitingCount(waitingCount)}
                </span>
              </div>
            </div>
          )}

          {/* Live Streaming Badge Banner */}
          {isLive && (
            <div className="bg-gradient-to-r from-rose-950/80 via-neutral-900 to-rose-950/80 border border-rose-500/60 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-600 text-white font-black text-[10px] rounded uppercase tracking-wider">
                      LIVE
                    </span>
                    <span className="text-xs font-bold text-rose-300">ライブ配信中</span>
                  </div>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    {waitingCount ? `${waitingCount} 人が視聴中` : 'リアルタイム配信中'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLiveChat(!showLiveChat)}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{showLiveChat ? 'チャット非表示' : 'チャット表示'}</span>
              </button>
            </div>
          )}

          {/* Education Video Player */}
          <EducationPlayer
            videoId={videoId}
            title={snippet.title}
            playbackMode={playbackMode}
            onTogglePlaybackMode={onTogglePlaybackMode}
            startTime={playerStartTime}
            seekTrigger={seekTrigger}
            onEnded={handleAutoplayNext}
            onStreamReady={(readyId) => {
              if (readyId === videoId) {
                setStreamAcquiredForId(readyId);
              }
            }}
            isUpcomingPremiere={isUpcomingPremiere}
            premiereDateStr={premiereScheduledTime ? String(premiereScheduledTime) : undefined}
            waitingCount={waitingCount}
          />

          {/* Shorts Dedicated Banner if it's a Short video */}
          {isShortVideo(video) && (
            <div className="bg-gradient-to-r from-rose-950 via-neutral-900 to-rose-950 border border-rose-500/50 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                  <Zap className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>YouTube Shorts 動画</span>
                    <span className="px-1.5 py-0.2 bg-rose-500/30 text-rose-300 rounded text-[10px] font-semibold border border-rose-500/40">縦型</span>
                  </h4>
                  <p className="text-[11px] text-neutral-300">縦型スワイプ画面でサクサク連続再生できます</p>
                </div>
              </div>
              <button
                onClick={() => onOpenShortsPlayer?.(video)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-105 shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>スワイプ画面で観る</span>
              </button>
            </div>
          )}

          {/* Video Title */}
          <h1 className="text-xl md:text-2xl font-bold text-white leading-snug">
            {snippet.title}
          </h1>

          {/* Channel Info & Video Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            {/* Channel Avatar & Name */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectChannel(channelId)}
                className="w-11 h-11 rounded-full overflow-hidden hover:opacity-90 transition-opacity cursor-pointer shrink-0 border border-neutral-700/80"
                title={snippet.channelTitle}
              >
                <AuthorAvatar
                  src={channelAvatar}
                  name={snippet.channelTitle}
                  size="lg"
                  className="w-11 h-11"
                />
              </button>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => onSelectChannel(channelId)}
                    className="font-bold text-white hover:text-rose-400 transition-colors text-left block text-base cursor-pointer"
                  >
                    {snippet.channelTitle}
                  </button>
                  <ChannelBadge
                    channelTitle={snippet.channelTitle}
                    isArtist={(video as any).isArtist || (video as any).authorMusic}
                    isVerified={(video as any).verified || (video as any).isVerified || (video as any).authorVerified}
                  />
                  {isBlocked && (
                    <span className="px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 text-[10px] border border-neutral-700">
                      非表示中
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  {formatSubscriberCount(subscriberCount)}
                </p>
              </div>

              {/* Quick Subscribe & Block Actions */}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={handleToggleSubscribe}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                    isSubscribed
                      ? 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {isSubscribed ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>登録済</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>登録</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleToggleBlock}
                  className={`p-1.5 rounded-full border transition-colors cursor-pointer ${
                    isBlocked
                      ? 'bg-rose-950/70 text-rose-300 border-rose-600/50'
                      : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:bg-neutral-700'
                  }`}
                  title={isBlocked ? '非表示を解除' : 'このチャンネルを非表示'}
                >
                  <ShieldBan className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Action Buttons: Likes, Repeat/Loop, Add to Playlist, Collaborators, Save */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
              <div className="flex items-center bg-neutral-800 border border-neutral-700/80 rounded-full px-3 py-1.5 gap-2 text-neutral-200">
                <ThumbsUp className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                <span>{formatViewCount(video.statistics?.likeCount).replace(' 回視聴', '')} 高評価</span>
              </div>

              {/* Repeat / Loop Toggle Button */}
              <button
                onClick={handleCycleRepeatMode}
                className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all cursor-pointer ${
                  repeatMode === 'one'
                    ? 'bg-amber-600/20 border-amber-500/60 text-amber-300 font-bold'
                    : repeatMode === 'all'
                    ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300 font-bold'
                    : 'bg-neutral-800 border-neutral-700/80 text-neutral-300 hover:text-white'
                }`}
                title="クリックで切替: ループなし → 全曲ループ → 1曲リピート"
                id="repeat-mode-toggle-btn"
              >
                {repeatMode === 'one' ? (
                  <>
                    <Repeat1 className="w-4 h-4 text-amber-400" />
                    <span>1曲リピート</span>
                  </>
                ) : repeatMode === 'all' ? (
                  <>
                    <Repeat className="w-4 h-4 text-indigo-400" />
                    <span>全曲ループ</span>
                  </>
                ) : (
                  <>
                    <Repeat className="w-4 h-4 text-neutral-400" />
                    <span>ループ切替</span>
                  </>
                )}
              </button>

              {/* Add to Custom Playlist Dropdown & PlaylistModal Trigger */}
              <div className="relative">
                <button
                  onClick={() => {
                    const next = !showAddPlaylistMenu;
                    setShowAddPlaylistMenu(next);
                    if (next) setCustomPlaylistsList(getCustomPlaylistsFromStorage());
                  }}
                  className="px-3 py-1.5 rounded-full border border-neutral-700/80 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="自作プレイリストに追加・公開共有設定"
                >
                  <FolderPlus className="w-4 h-4 text-amber-400" />
                  <span>リストへ追加</span>
                </button>
                {showAddPlaylistMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-2 z-40 text-xs">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-neutral-300 border-b border-neutral-800 flex items-center justify-between">
                      <span>マイ再生リストに追加</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddPlaylistMenu(false);
                          setIsPlaylistModalOpen(true);
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>新規/公開管理</span>
                      </button>
                    </div>
                    {customPlaylistsList.length === 0 ? (
                      <div className="px-3 py-3 text-neutral-400 text-[11px] space-y-2">
                        <p>まだマイ再生リストがありません。</p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPlaylistMenu(false);
                            setIsPlaylistModalOpen(true);
                          }}
                          className="w-full py-1.5 px-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>作成・公開リスト複製を開く</span>
                        </button>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-neutral-800/60">
                        {customPlaylistsList.map((pl) => {
                          const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
                          return (
                            <button
                              key={pl.id}
                              onClick={() => {
                                addVideoToCustomPlaylist(pl.id, video);
                                setShowAddPlaylistMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-neutral-800 text-neutral-200 hover:text-white flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isPub ? (
                                  <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                  <Lock className="w-3 h-3 text-neutral-500 shrink-0" />
                                )}
                                <span className="truncate font-medium">{pl.title}</span>
                              </div>
                              <span className="text-[10px] text-neutral-400 shrink-0">{pl.videos?.length || 0}本</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="border-t border-neutral-800 mt-1 pt-1.5 px-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddPlaylistMenu(false);
                          setIsPlaylistModalOpen(true);
                        }}
                        className="w-full py-1.5 px-2.5 bg-neutral-800 hover:bg-neutral-700 text-indigo-300 font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-[11px]"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>公開/非公開設定・リスト複製モーダル</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collaborators Modal Trigger Button */}
              <button
                onClick={() => setIsCollaboratorsModalOpen(true)}
                className="px-3 py-1.5 rounded-full border border-neutral-700/80 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                title="共同投稿者・クレジット一覧"
                id="collaborators-modal-trigger-btn"
              >
                <Users className="w-4 h-4 text-sky-400" />
                <span>共同投稿者</span>
              </button>

              {/* Save to Library Button */}
              <button
                onClick={() => onToggleSave(video)}
                className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSaved
                    ? 'bg-rose-600 border-rose-500 text-white font-semibold'
                    : 'bg-neutral-800 border-neutral-700/80 text-neutral-300 hover:text-white'
                }`}
                id="save-video-btn"
              >
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-white' : ''}`} />
                <span>{isSaved ? '保存済み' : 'ライブラリ保存'}</span>
              </button>
            </div>
          </div>

          {/* Expandable Video Description Box */}
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 text-sm leading-relaxed text-neutral-300 relative">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-400 mb-2">
              <span>{formatViewCount(metaStats.viewCount || video.statistics?.viewCount)} • {formatPublishedAt(snippet.publishedAt)}</span>
              {snippet.categoryId && (
                <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  カテゴリ ID: {snippet.categoryId}
                </span>
              )}
            </div>

            <div className={`whitespace-pre-line ${isDescExpanded ? '' : 'line-clamp-3'}`}>
              {snippet.description
                ? renderTextWithTimestamps(snippet.description)
                : '概要欄のテキストはありません。'}
            </div>

            {/* Clickable Timestamps extracted from description if any */}
            {parsedTimestamps.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-800">
                <p className="text-xs font-bold text-rose-400 mb-2 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>チャプター・タイムスタンプ (クリックでジャンプ):</span>
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {parsedTimestamps.map((ts, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleJumpToTime(ts.seconds)}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-rose-500/20 text-rose-300 border border-neutral-700 hover:border-rose-500/50 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="font-mono font-bold text-rose-400">{ts.timeText}</span>
                      <span className="text-neutral-300">{ts.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setIsDescExpanded(!isDescExpanded)}
              className="mt-3 text-xs font-bold text-rose-400 hover:underline flex items-center gap-1 focus:outline-none cursor-pointer"
            >
              <span>{isDescExpanded ? '一部を表示' : 'もっと見る'}</span>
              {isDescExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Comments & Live Chat Section */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-neutral-800 text-white shadow-sm"
                  id="tab-comments-btn"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                  <span>{isLiveChatMode ? `Live配信チャット (${comments.length})` : `コメント (${comments.length})`}</span>
                </div>
                {isLiveChatMode && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    InnerTube LiveChat
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isLiveChatMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => setLiveChatAutoRefresh((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                        liveChatAutoRefresh
                          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                      title="5秒ごとに最新Liveコメントを自動取得"
                    >
                      <Radio className="w-3 h-3" />
                      <span>{liveChatAutoRefresh ? '自動更新ON' : '自動更新OFF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchInitialOrLatestComments(true)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors cursor-pointer flex items-center gap-1"
                      title="最新のLiveコメントを今すぐ取得"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>更新</span>
                    </button>
                  </>
                )}

                {!isLiveChatMode && (
                  <select
                    value={commentsOrder}
                    onChange={(e) => setCommentsOrder(e.target.value as any)}
                    className="bg-neutral-800 border border-neutral-700 rounded-lg text-xs px-2.5 py-1 text-white focus:outline-none cursor-pointer"
                  >
                    <option value="relevance">評価順</option>
                    <option value="time">新しい順</option>
                  </select>
                )}
              </div>
            </div>

            {/* COMMENTS CONTENT */}
            <div className="space-y-4">
              {!isStreamReady ? (
                <div className="py-8 text-center text-neutral-400 text-sm animate-pulse flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  <span>ストリームを優先取得中...（完了後にコメントを表示します）</span>
                </div>
              ) : loadingComments ? (
                <div className="py-8 text-center text-neutral-400 text-sm animate-pulse flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  <span>コメントを読み込んでいます...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 text-sm">
                  コメントはありません。
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-neutral-800/80">
                  {comments.map((thread) => {
                    const topComment = thread.snippet?.topLevelComment;
                    const topSnippet = topComment?.snippet;
                    if (!topSnippet) return null;

                    const commentId = thread.id;

                    return (
                      <div
                        key={thread.id}
                        ref={(el) => (commentRefs.current[commentId] = el)}
                        className="pt-4 first:pt-0 flex gap-3 text-xs"
                      >
                        <AuthorAvatar
                          src={topSnippet.authorProfileImageUrl}
                          name={topSnippet.authorDisplayName}
                          size="md"
                        />
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-200">{topSnippet.authorDisplayName}</span>
                            <span className="text-neutral-500 text-[11px]">
                              {formatPublishedAt(topSnippet.publishedAt)}
                            </span>
                          </div>
                          <div className="text-neutral-200 leading-relaxed break-words">
                            {renderCommentBody(commentId, topSnippet.textOriginal, topSnippet.textDisplay)}
                          </div>
                          <div className="flex items-center gap-3 pt-1 text-neutral-400 text-[11px]">
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="w-3.5 h-3.5 text-neutral-500" />
                              {topSnippet.likeCount || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Comments Button */}
                  {nextPageToken && (
                    <div className="pt-4 text-center">
                      <button
                        onClick={handleLoadMoreComments}
                        disabled={loadingMoreComments}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 hover:text-white rounded-xl border border-neutral-700 transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
                      >
                        {loadingMoreComments ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                            <span>コメントを読み込み中...</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 text-rose-500" />
                            <span>コメントをさらに読み込む</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Up Next Queue + Playlist Queue + Live Chat + Related Videos Sidebar) */}
        <div className="space-y-4">
          {/* Up Next Temporary Queue Panel (次に再生 / 一時キュー) */}
          {upNextQueue.length > 0 && (
            <div className="bg-neutral-900 border border-rose-500/40 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-rose-950/40 border-b border-rose-500/30 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ListPlus className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-bold text-xs text-white truncate">
                      次に再生（一時キュー）
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                      {upNextQueue.length}本予約中
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-200/80 truncate mt-0.5">
                    現在の動画が終わり次第、上から順番に再生されます
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {upNextQueue.length > 1 && (
                    <button
                      onClick={() => shuffleUpNextQueue()}
                      className="p-1.5 rounded-lg bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                      title="予約キューをシャッフル"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => clearUpNextQueue()}
                    className="px-2 py-1 rounded-lg bg-neutral-800/90 hover:bg-rose-600 text-[11px] text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    title="キューをすべてクリア"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>クリア</span>
                  </button>
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto divide-y divide-neutral-800/60 custom-scrollbar">
                {upNextQueue.map((qItem, qIdx) => {
                  const qVid = getVideoUniqueId(qItem);
                  const qThumb =
                    qItem.snippet?.thumbnails?.medium?.url ||
                    qItem.snippet?.thumbnails?.high?.url ||
                    (qVid ? `https://i.ytimg.com/vi/${qVid}/mqdefault.jpg` : '');
                  return (
                    <div
                      key={`${qVid}-${qIdx}`}
                      className="p-2.5 flex items-center gap-2.5 hover:bg-neutral-800/60 transition-colors group"
                    >
                      <span className="w-5 text-center text-[11px] font-mono text-rose-400 font-bold shrink-0">
                        {qIdx === 0 ? '次' : qIdx + 1}
                      </span>
                      <div
                        onClick={() => {
                          removeFromUpNextQueue(qItem);
                          onSelectVideo({
                            ...qItem,
                            playlistId: activePlaylist?.id,
                            customPlaylistItems: video.customPlaylistItems,
                            customPlaylistTitle: video.customPlaylistTitle
                          });
                        }}
                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-neutral-950 shrink-0">
                          <ThumbnailImage
                            video={qItem}
                            videoId={qVid}
                            fallbackUrl={qThumb}
                            alt=""
                            quality="medium"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-neutral-100 group-hover:text-rose-300 line-clamp-2 leading-snug">
                            {qItem.snippet?.title}
                          </p>
                          <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                            {qItem.snippet?.channelTitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        {qIdx > 0 && (
                          <button
                            onClick={() => moveInUpNextQueue(qIdx, 'up')}
                            className="p-0.5 text-neutral-500 hover:text-white cursor-pointer"
                            title="順番を上げる"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFromUpNextQueue(qItem)}
                          className="p-1 text-neutral-500 hover:text-rose-400 cursor-pointer"
                          title="キューから削除"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {qIdx < upNextQueue.length - 1 && (
                          <button
                            onClick={() => moveInUpNextQueue(qIdx, 'down')}
                            className="p-0.5 text-neutral-500 hover:text-white cursor-pointer"
                            title="順番を下げる"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Playlist Queue Box with One-Tap Shuffle & Repeat/Loop Controls */}
          {(loadingPlaylist || activePlaylist) && (
            <div className="bg-neutral-900 border border-indigo-500/40 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-indigo-950/50 border-b border-indigo-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ListVideo className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="font-bold text-xs text-white truncate">
                        {activePlaylist?.title || '再生リストを読み込み中...'}
                      </span>
                    </div>
                    {activePlaylist && (
                      <p className="text-[11px] text-indigo-300/80 truncate mt-0.5">
                        {activePlaylist.channelTitle ? `${activePlaylist.channelTitle} • ` : ''}
                        {(() => {
                          const cIdx = activePlaylist.items.findIndex((it) => extractPlaylistItemVideoId(it) === videoId);
                          return cIdx >= 0
                            ? `${cIdx + 1} / ${activePlaylist.items.length} 本目（順番再生中）`
                            : `全${activePlaylist.items.length}本の動画`;
                        })()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activePlaylist && activePlaylist.items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          clonePlaylistToCustomPlaylists({
                            id: activePlaylist.id,
                            title: activePlaylist.title || '再生リスト',
                            description: `${activePlaylist.channelTitle || 'YouTube'} のプレイリストから複製`,
                            createdAt: new Date().toLocaleDateString('ja-JP'),
                            visibility: 'private',
                            isPublic: false,
                            authorName: activePlaylist.channelTitle || 'YouTube',
                            videos: activePlaylist.originalItems || activePlaylist.items
                          });
                        }}
                        className="text-[11px] font-bold text-indigo-200 hover:text-white px-2.5 py-1 rounded-lg bg-indigo-600/40 hover:bg-indigo-600 border border-indigo-400/40 flex items-center gap-1 cursor-pointer transition-colors"
                        title="この再生リストを自分のマイ再生リストへ丸ごと複製 (Clone)"
                      >
                        <Copy className="w-3 h-3" />
                        <span>自分のリストへ複製</span>
                      </button>
                    )}
                    <button
                      onClick={() => setActivePlaylist(null)}
                      className="text-[11px] text-neutral-400 hover:text-white px-2 py-1 rounded bg-neutral-800/80 hover:bg-neutral-700 shrink-0 cursor-pointer"
                      title="再生リストを閉じる"
                    >
                      閉じる
                    </button>
                  </div>
                </div>

                {/* One-Tap Shuffle, Loop / Repeat 1, and Prev/Next Controls Bar */}
                {activePlaylist && activePlaylist.items.length > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-indigo-500/20">
                    <div className="flex items-center gap-1.5">
                      {/* Shuffle Toggle Button */}
                      <button
                        type="button"
                        onClick={handleTogglePlaylistShuffle}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                          isPlaylistShuffle
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                            : 'bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-700'
                        }`}
                        title="曲順のシャッフル再生をワンタップ切替"
                        id="playlist-shuffle-btn"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>{isPlaylistShuffle ? 'シャッフルON' : 'シャッフル'}</span>
                      </button>

                      {/* Repeat / Loop Mode Toggle Button */}
                      <button
                        type="button"
                        onClick={handleCycleRepeatMode}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                          repeatMode === 'one'
                            ? 'bg-amber-600 text-white border-amber-400 shadow'
                            : repeatMode === 'all'
                            ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                            : 'bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-700'
                        }`}
                        title="ループ再生切替 (OFF → 全曲ループ → 1曲リピート)"
                        id="playlist-repeat-btn"
                      >
                        {repeatMode === 'one' ? (
                          <>
                            <Repeat1 className="w-3.5 h-3.5" />
                            <span>1曲リピート</span>
                          </>
                        ) : repeatMode === 'all' ? (
                          <>
                            <Repeat className="w-3.5 h-3.5" />
                            <span>全曲ループ</span>
                          </>
                        ) : (
                          <>
                            <Repeat className="w-3.5 h-3.5" />
                            <span>ループOFF</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Prev / Next Track Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepPlaylistTrack(-1)}
                        className="p-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
                        title="前の曲へ"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepPlaylistTrack(1)}
                        className="p-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
                        title="次の曲へ"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {loadingPlaylist && !activePlaylist ? (
                <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>再生リストを取得中...</span>
                </div>
              ) : activePlaylist ? (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-neutral-800/60 custom-scrollbar">
                  {activePlaylist.items.map((item, idx) => {
                    const itemVid = extractPlaylistItemVideoId(item);
                    const isCurrent = Boolean(itemVid && itemVid === videoId);
                    const thumb =
                      item.snippet?.thumbnails?.medium?.url ||
                      item.snippet?.thumbnails?.high?.url ||
                      (itemVid ? `https://i.ytimg.com/vi/${itemVid}/mqdefault.jpg` : '');
                    const dur = formatISO8601Duration(item.contentDetails?.duration);
                    return (
                      <button
                        key={`${itemVid}-${idx}`}
                        ref={isCurrent ? activePlaylistTrackRef : undefined}
                        onClick={() =>
                          onSelectVideo({
                            ...item,
                            id: itemVid || item.id,
                            firstVideoId: itemVid,
                            isPlaylist: false,
                            kind: 'youtube#video',
                            playlistId: activePlaylist.id,
                            customPlaylistItems: video.customPlaylistItems || activePlaylist.originalItems,
                            customPlaylistTitle: video.customPlaylistTitle || activePlaylist.title
                          })
                        }
                        className={`w-full text-left p-2.5 flex items-center gap-2.5 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-indigo-600/20 border-l-2 border-indigo-400'
                            : 'hover:bg-neutral-800/70'
                        }`}
                      >
                        <span className="w-5 text-center text-[11px] font-mono text-neutral-400 shrink-0">
                          {isCurrent ? '▶' : idx + 1}
                        </span>
                        <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-neutral-950 shrink-0">
                          <ThumbnailImage
                            video={item}
                            videoId={itemVid}
                            fallbackUrl={thumb}
                            alt={item.snippet?.title || ''}
                            quality="medium"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {dur && dur !== '0:00' && (
                            <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[10px] font-mono text-white">
                              {dur}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold line-clamp-2 leading-snug ${isCurrent ? 'text-indigo-300' : 'text-neutral-200'}`}>
                            {item.snippet?.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                            {item.snippet?.channelTitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
          {/* Live Chat Box (Side panel when isLive - InnerTube API Primary + Optional YouTube Embed) */}
          {isLive && showLiveChat && (
            <div className="bg-neutral-900 border border-rose-500/40 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-3.5 py-2.5 bg-neutral-800/90 border-b border-neutral-700/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-bold text-xs text-white">Liveコメント ({comments.length})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLiveChatViewType((v) => (v === 'innertube' ? 'iframe' : 'innertube'))}
                    className="text-[11px] px-2 py-0.5 rounded bg-neutral-700/80 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                    title="InnerTube API取得と公式埋込を切替"
                  >
                    {liveChatViewType === 'innertube' ? '公式埋込へ切替' : 'InnerTube表示へ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchInitialOrLatestComments(true)}
                    className="p-1 rounded bg-neutral-700/80 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                    title="最新チャットを取得"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <a
                    href={`https://www.youtube.com/live_chat?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-neutral-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer px-1"
                    title="別ウィンドウで開く"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => setShowLiveChat(false)}
                    className="text-neutral-400 hover:text-white text-xs cursor-pointer px-1.5 py-0.5 rounded hover:bg-neutral-700"
                  >
                    非表示
                  </button>
                </div>
              </div>
              {liveChatViewType === 'innertube' ? (
                <div
                  ref={liveChatScrollRef}
                  className="h-[420px] w-full bg-neutral-950/90 overflow-y-auto p-3 space-y-2.5 custom-scrollbar"
                >
                  {loadingComments && comments.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-neutral-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                      <span>InnerTube APIからLiveコメントを取得中...</span>
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-neutral-400 gap-2">
                      <span>現在取得できるLiveコメントはありません</span>
                      <button
                        type="button"
                        onClick={() => fetchInitialOrLatestComments(false)}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold cursor-pointer"
                      >
                        再取得する
                      </button>
                    </div>
                  ) : (
                    comments.map((thread) => {
                      const topSnippet = thread.snippet?.topLevelComment?.snippet;
                      if (!topSnippet) return null;
                      const isSuperChat = (topSnippet.textOriginal || '').startsWith('[スパチャ');
                      return (
                        <div
                          key={`live-${thread.id}`}
                          className={`flex items-start gap-2.5 text-xs p-2 rounded-xl ${
                            isSuperChat
                              ? 'bg-amber-500/15 border border-amber-500/40'
                              : 'bg-neutral-900/70 border border-neutral-800/60'
                          }`}
                        >
                          <AuthorAvatar
                            src={topSnippet.authorProfileImageUrl}
                            name={topSnippet.authorDisplayName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-neutral-300 text-[11px] truncate">
                                {topSnippet.authorDisplayName}
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                {formatPublishedAt(topSnippet.publishedAt)}
                              </span>
                            </div>
                            <p className="text-neutral-100 leading-snug break-words mt-0.5">
                              {topSnippet.textOriginal || topSnippet.textDisplay}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="h-[460px] w-full bg-black relative">
                  <iframe
                    src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}`}
                    className="w-full h-full border-0"
                    title="YouTube Live Chat"
                    allow="autoplay"
                  />
                </div>
              )}
            </div>
          )}

          <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base text-white flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-rose-500" />
                <span>関連・おすすめ動画</span>
              </h2>
              {relatedList.length > 0 && (
                <span className="text-[11px] text-neutral-400 font-medium">
                  {relatedList.length}本
                </span>
              )}
            </div>

            {/* Autoplay Filter Config (Minutes limit & Loop Prevention) */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoplayFilterEnabled}
                    onChange={(e) => {
                      setAutoplayFilterEnabled(e.target.checked);
                      localStorage.setItem('kaito_autoplay_filter_enabled', String(e.target.checked));
                    }}
                    className="accent-rose-600 rounded"
                  />
                  <span>指定時間以下の動画のみ自動再生</span>
                </label>
              </div>

              {autoplayFilterEnabled && (
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 pl-5">
                  <span>制限時間:</span>
                  <select
                    value={autoplayMaxMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setAutoplayMaxMinutes(val);
                      localStorage.setItem('kaito_autoplay_max_minutes', String(val));
                    }}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-white focus:outline-none"
                  >
                    <option value={2}>2分以内</option>
                    <option value={4}>4分以内 (推奨)</option>
                    <option value={10}>10分以内</option>
                    <option value={20}>20分以内</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {!isStreamReady ? (
            <div className="py-10 text-center text-neutral-400 text-xs flex flex-col items-center justify-center gap-2 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl">
              <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
              <span>ストリームを優先取得中...（完了後に関連動画を表示します）</span>
            </div>
          ) : loadingRelated && relatedList.length === 0 ? (
            <div className="py-10 text-center text-neutral-400 text-xs flex flex-col items-center justify-center gap-2 bg-neutral-900/40 border border-neutral-800/60 rounded-2xl">
              <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
              <span>関連動画を読み込んでいます...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              {relatedList.map((v) => (
                <VideoCard
                  key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                  video={v}
                  onSelectVideo={onSelectVideo}
                  onSelectChannel={onSelectChannel}
                  isSaved={isSaved}
                  onToggleSave={onToggleSave}
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={relatedSentinelRef} className="h-4 w-full" />

          {/* Load More Button for Related Videos */}
          {relatedNextPageToken && (
            <div className="pt-2">
              <button
                onClick={handleLoadMoreRelated}
                disabled={loadingMoreRelated}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs font-bold text-neutral-300 hover:text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow"
                id="load-more-related-btn"
              >
                {loadingMoreRelated ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    <span>関連動画を読み込み中...</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-rose-500" />
                    <span>関連動画をさらに読み込む</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collaborators Modal */}
      <CollaboratorsModal
        isOpen={isCollaboratorsModalOpen}
        onClose={() => setIsCollaboratorsModalOpen(false)}
        videoId={videoId}
        channelId={channelId}
        channelTitle={snippet.channelTitle}
        description={snippet.description}
        onSelectChannel={onSelectChannel}
      />

      {/* Playlist Public/Private & Clone Management Modal */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => setIsPlaylistModalOpen(false)}
        targetVideo={video}
        onSelectPlaylistToPlay={(pl) => {
          if (pl.videos && pl.videos.length > 0) {
            onSelectVideo({
              ...pl.videos[0],
              playlistId: `custom_${pl.id}`,
              customPlaylistTitle: pl.title,
              customPlaylistItems: pl.videos
            });
          }
        }}
      />
    </div>
  );
};
