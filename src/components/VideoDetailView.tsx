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
  ExternalLink
} from 'lucide-react';
import {
  YouTubeVideoItem,
  YouTubeCommentThreadItem,
  PlaybackMode,
  TranscriptItem
} from '../types';
import { EducationPlayer } from './EducationPlayer';
import { VideoCard } from './VideoCard';
import { AuthorAvatar } from './AuthorAvatar';
import { ChannelBadge } from './ChannelBadge';
import { CollaboratorsModal } from './CollaboratorsModal';
import { customFetch } from '../utils/apiClient';
import {
  formatViewCount,
  formatSubscriberCount,
  formatPublishedAt,
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

  // Related Videos internal state & pagination
  const [relatedList, setRelatedList] = useState<YouTubeVideoItem[]>(relatedVideos || []);
  const [relatedNextPageToken, setRelatedNextPageToken] = useState<string | null>(null);
  const [loadingMoreRelated, setLoadingMoreRelated] = useState(false);

  // Reply state per comment thread ID
  const [repliesData, setRepliesData] = useState<
    Record<
      string,
      {
        comments: any[];
        nextPageToken?: string | null;
        loading?: boolean;
        hasMore?: boolean;
      }
    >
  >({});

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

  // Jump to timestamp state
  const [playerStartTime, setPlayerStartTime] = useState<number>(0);

  // Channel subscriber count & avatar state
  const [channelAvatar, setChannelAvatar] = useState<string>('');
  const [subscriberCount, setSubscriberCount] = useState<string>('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const videoId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId;
  const [metaSnippet, setMetaSnippet] = useState<any>(video.snippet || {});

  // Transcript / Subtitles state
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptLang, setTranscriptLang] = useState<string>('');
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [bottomActiveTab, setBottomActiveTab] = useState<'comments' | 'transcript'>('comments');

  // Fetch transcripts for interactive timestamps
  useEffect(() => {
    if (!videoId) return;
    setLoadingTranscript(true);
    customFetch(`/api/youtube/transcript/${videoId}?lang=ja`)
      .then((res) => res.json())
      .then((data) => {
        if (data.items && Array.isArray(data.items)) {
          setTranscriptItems(data.items);
          setTranscriptLang(data.language || 'ja');
        } else {
          setTranscriptItems([]);
        }
      })
      .catch(() => setTranscriptItems([]))
      .finally(() => setLoadingTranscript(false));
  }, [videoId]);
  const [metaStats, setMetaStats] = useState<any>(video.statistics || {});

  const snippet = metaSnippet || {};
  const channelId = snippet.channelId;

  // Sync prop changes & auto-fetch full metadata if needed
  useEffect(() => {
    setMetaSnippet(video.snippet || {});
    setMetaStats(video.statistics || {});

    if (videoId && (!video.snippet?.description || !video.snippet?.channelTitle)) {
      customFetch(`/api/youtube/video/${videoId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.items && data.items[0]) {
            if (data.items[0].snippet) setMetaSnippet((prev: any) => ({ ...prev, ...data.items[0].snippet }));
            if (data.items[0].statistics) setMetaStats((prev: any) => ({ ...prev, ...data.items[0].statistics }));
          }
        })
        .catch((err) => console.warn('Video details fetch error:', err));
    }
  }, [videoId, video]);

  // Always fetch fresh related videos whenever videoId changes or snippet title resolves
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    const fetchRelated = async () => {
      try {
        const titleQuery = snippet.title || video.snippet?.title || '';
        const q = encodeURIComponent(titleQuery);
        const res = await customFetch(`/api/youtube/related/${videoId}?q=${q}&channelId=${channelId || ''}`);
        const data = await res.json();
        if (isMounted) {
          if (data.items && data.items.length > 0) {
            setRelatedList(data.items);
            setRelatedNextPageToken(data.nextPageToken || null);
          } else if (relatedVideos && relatedVideos.length > 0) {
            setRelatedList(relatedVideos);
            setRelatedNextPageToken('page_2');
          }
        }
      } catch (err) {
        console.warn('Related videos fetch error:', err);
        if (isMounted && relatedVideos && relatedVideos.length > 0) {
          setRelatedList(relatedVideos);
        }
      }
    };

    fetchRelated();
    return () => { isMounted = false; };
  }, [videoId, snippet.title]);

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

  // Load initial comments
  useEffect(() => {
    if (!videoId) return;
    setLoadingComments(true);
    setComments([]);
    setNextPageToken(null);
    setRepliesData({});

    customFetch(`/api/youtube/comments/${videoId}?order=${commentsOrder}`)
      .then((res) => res.json())
      .then((data) => {
        setComments(data.items || []);
        setNextPageToken(data.nextPageToken || null);
        setLoadingComments(false);
      })
      .catch((err) => {
        console.error('Comments fetch error:', err);
        setLoadingComments(false);
      });
  }, [videoId, commentsOrder]);

  // Load more comments (Pagination)
  const handleLoadMoreComments = () => {
    if (!nextPageToken || loadingMoreComments) return;
    setLoadingMoreComments(true);

    customFetch(`/api/youtube/comments/${videoId}?order=${commentsOrder}&pageToken=${nextPageToken}`)
      .then((res) => res.json())
      .then((data) => {
        setComments((prev) => [...prev, ...(data.items || [])]);
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

    // Read recent history (last 3 videos) to avoid loop
    let recentHistory: string[] = [];
    try {
      const stored = localStorage.getItem('yt_play_history_v1');
      if (stored) recentHistory = JSON.parse(stored).slice(-3);
    } catch {}

    const maxSeconds = autoplayMaxMinutes * 60;
    const candidates = relatedList.filter((v) => {
      const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
      if (!id || id === videoId || recentHistory.includes(id)) return false;

      if (autoplayFilterEnabled) {
        const durationSec = parseAnyDurationToSeconds(v.contentDetails?.duration || '');
        if (durationSec > 0 && durationSec > maxSeconds) {
          return false;
        }
      }
      return true;
    });

    if (candidates.length > 0) {
      const nextVid = candidates[0];
      try {
        const updated = [...recentHistory, videoId].slice(-10);
        localStorage.setItem('yt_play_history_v1', JSON.stringify(updated));
      } catch {}

      onSelectVideo(nextVid);
    } else {
      setAutoplayToast('指定条件に合う関連動画がないため、自動再生をストップしました。');
      setTimeout(() => setAutoplayToast(null), 4000);
    }
  };

  // Close Replies and smooth scroll back to parent comment with cosine easing
  const handleCloseReplies = (commentId: string) => {
    setRepliesData((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });

    const targetEl = commentRefs.current[commentId];
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const targetY = window.pageYOffset + rect.top - 120;
      smoothCosineScrollTo(Math.max(0, targetY), 450);
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

  // Load / Load More Replies for a specific top-level comment
  const handleFetchReplies = (commentId: string, pageToken?: string) => {
    setRepliesData((prev) => ({
      ...prev,
      [commentId]: {
        ...(prev[commentId] || { comments: [] }),
        loading: true
      }
    }));

    let url = `/api/youtube/comments/replies/${commentId}`;
    if (pageToken) url += `?pageToken=${pageToken}`;

    customFetch(url)
      .then((res) => res.json())
      .then((data) => {
        const existing = repliesData[commentId]?.comments || [];
        const newReplies = data.items || [];
        setRepliesData((prev) => ({
          ...prev,
          [commentId]: {
            comments: pageToken ? [...existing, ...newReplies] : newReplies,
            nextPageToken: data.nextPageToken || null,
            loading: false,
            hasMore: !!data.nextPageToken
          }
        }));
      })
      .catch((err) => {
        console.error('Fetch replies error:', err);
        setRepliesData((prev) => ({
          ...prev,
          [commentId]: {
            ...(prev[commentId] || { comments: [] }),
            loading: false
          }
        }));
      });
  };

  // Load channel subscriber count & avatar
  useEffect(() => {
    if (!channelId) return;

    // Check pre-cached avatar or video snippet
    const initial =
      snippet.channelThumbnail ||
      (video as any).authorThumbnail ||
      (video as any).authorThumbnails?.[0]?.url ||
      getCachedChannelAvatar(channelId);
    if (initial) {
      setChannelAvatar(initial);
    }

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
  }, [channelId, video, snippet]);

  const parsedTimestamps = extractTimestamps(snippet.description);

  // Helper to render comment text with clean formatting and clamping
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
          {cleanText}
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
  const isLive = Boolean(
    snippet.liveBroadcastContent === 'live' ||
    (video as any).liveNow
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
              <option value="education" className="bg-neutral-900 text-white">YouTube Edu（教育用埋込・推奨）</option>
              <option value="stream-high" className="bg-neutral-900 text-white">1080p 合体ストリーム（高画質映像＋音声）</option>
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
            onEnded={handleAutoplayNext}
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

            {/* Action Buttons: Likes, Collaborators, Save */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
              <div className="flex items-center bg-neutral-800 border border-neutral-700/80 rounded-full px-3 py-1.5 gap-2 text-neutral-200">
                <ThumbsUp className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                <span>{formatViewCount(video.statistics?.likeCount).replace(' 回視聴', '')} 高評価</span>
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

            <p className={`whitespace-pre-line ${isDescExpanded ? '' : 'line-clamp-3'}`}>
              {snippet.description || '概要欄のテキストはありません。'}
            </p>

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
                      onClick={() => setPlayerStartTime(ts.seconds)}
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

          {/* Comments & Interactive Transcript Tabs */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBottomActiveTab('comments')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    bottomActiveTab === 'comments'
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  id="tab-comments-btn"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                  <span>コメント ({comments.length})</span>
                </button>

                <button
                  onClick={() => setBottomActiveTab('transcript')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    bottomActiveTab === 'transcript'
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  id="tab-transcript-btn"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span>文字起こし / 字幕</span>
                  {transcriptItems.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] border border-rose-500/40">
                      {transcriptItems.length}
                    </span>
                  )}
                </button>
              </div>

              {bottomActiveTab === 'comments' ? (
                <select
                  value={commentsOrder}
                  onChange={(e) => setCommentsOrder(e.target.value as any)}
                  className="bg-neutral-800 border border-neutral-700 rounded-lg text-xs px-2.5 py-1 text-white focus:outline-none cursor-pointer"
                >
                  <option value="relevance">評価順</option>
                  <option value="time">新しい順</option>
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400">
                    言語: {transcriptLang.toUpperCase() || 'JA'}
                  </span>
                </div>
              )}
            </div>

            {/* TRANSCRIPT TAB CONTENT */}
            {bottomActiveTab === 'transcript' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                    placeholder="文字起こし内のセリフ・単語を検索..."
                    className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  {transcriptQuery && (
                    <button
                      onClick={() => setTranscriptQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {loadingTranscript ? (
                  <div className="py-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                    <span>文字起こしデータを読み込んでいます...</span>
                  </div>
                ) : transcriptItems.length === 0 ? (
                  <div className="py-12 text-center text-neutral-400 text-xs space-y-1">
                    <p className="font-semibold">この動画の字幕・文字起こしは利用できません。</p>
                    <p className="text-[11px] text-neutral-500">※ 動画投稿者またはYouTube側で字幕が無効化されている可能性があります。</p>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {transcriptItems
                      .filter((item) => !transcriptQuery || item.text.toLowerCase().includes(transcriptQuery.toLowerCase()))
                      .map((item, idx) => {
                        const m = Math.floor(item.start / 60);
                        const s = Math.floor(item.start % 60);
                        const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                        return (
                          <button
                            key={idx}
                            onClick={() => setPlayerStartTime(item.start)}
                            className="w-full text-left p-2 rounded-xl hover:bg-neutral-800/80 transition-colors flex items-start gap-3 group cursor-pointer"
                            title={`クリックして ${timeStr} へジャンプ再生`}
                          >
                            <span className="font-mono text-xs font-bold text-rose-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 group-hover:border-rose-500/50 group-hover:bg-rose-500/10 shrink-0">
                              {timeStr}
                            </span>
                            <span className="text-xs text-neutral-300 group-hover:text-white leading-relaxed">
                              {item.text}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* COMMENTS TAB CONTENT */}
            {bottomActiveTab === 'comments' && (
              <div className="space-y-4">
                {loadingComments ? (
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
                  const totalReplyCount = thread.snippet?.totalReplyCount || 0;
                  const replyState = repliesData[commentId];
                  const currentReplies = replyState?.comments || thread.replies?.comments || [];

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

                        {/* Replies Section with Hierarchy Loading and Cosine Smooth Back */}
                        {totalReplyCount > 0 && (
                          <div className="mt-3 space-y-3">
                            {!replyState ? (
                              <button
                                onClick={() => handleFetchReplies(commentId)}
                                className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 mt-1 cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>返信を表示 ({totalReplyCount}件)</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCloseReplies(commentId)}
                                className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 mt-1 cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>返信を閉じる</span>
                              </button>
                            )}

                            {replyState?.loading && (
                              <div className="text-[11px] text-neutral-400 flex items-center gap-2 py-1">
                                <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                <span>返信を読み込み中...</span>
                              </div>
                            )}

                            {currentReplies.length > 0 && (
                              <div className="pl-4 border-l-2 border-neutral-800 space-y-3 pt-1">
                                {currentReplies.map((rep: any) => {
                                  const repSnip = rep.snippet;
                                  return (
                                    <div key={rep.id} className="flex gap-2.5 text-[11px]">
                                      <AuthorAvatar
                                        src={repSnip?.authorProfileImageUrl}
                                        name={repSnip?.authorDisplayName}
                                        size="sm"
                                      />
                                      <div className="space-y-0.5 min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-semibold text-neutral-200">
                                            {repSnip?.authorDisplayName}
                                          </span>
                                          <span className="text-[10px] text-neutral-500">
                                            {formatPublishedAt(repSnip?.publishedAt)}
                                          </span>
                                        </div>
                                        <div className="text-neutral-300 break-words">
                                          {cleanCommentText(repSnip?.textOriginal, repSnip?.textDisplay)}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}

                                {replyState?.hasMore && (
                                  <button
                                    onClick={() => handleFetchReplies(commentId, replyState.nextPageToken || undefined)}
                                    disabled={replyState.loading}
                                    className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 pt-1 cursor-pointer"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                    <span>返信をさらに読み込む</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
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
        )}
          </div>
        </div>

        {/* Right Column (Live Chat + Related Videos Sidebar with Autoplay Filter & Infinite Scroll) */}
        <div className="space-y-4">
          {/* Live Chat Box (Side panel when isLive) */}
          {isLive && showLiveChat && (
            <div className="bg-neutral-900 border border-rose-500/40 rounded-2xl overflow-hidden shadow-xl">
              <div className="px-4 py-2.5 bg-neutral-800/90 border-b border-neutral-700/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-bold text-xs text-white">Liveコメント（リアルタイムチャット）</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.youtube.com/live_chat?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-neutral-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
                    title="別ウィンドウで開く"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>別タブ</span>
                  </a>
                  <button
                    onClick={() => setShowLiveChat(false)}
                    className="text-neutral-400 hover:text-white text-xs cursor-pointer px-1.5 py-0.5 rounded hover:bg-neutral-700"
                  >
                    非表示
                  </button>
                </div>
              </div>
              <div className="h-[460px] w-full bg-black relative">
                <iframe
                  src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}`}
                  className="w-full h-full border-0"
                  title="YouTube Live Chat"
                  allow="autoplay"
                />
              </div>
            </div>
          )}

          <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base text-white flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-rose-500" />
                <span>関連・おすすめ動画</span>
              </h2>
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
    </div>
  );
};
