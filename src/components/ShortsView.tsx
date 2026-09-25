import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Heart,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  User,
  X,
  Check,
  Search,
  Zap,
  ArrowLeft,
  MoreVertical,
  Disc,
  Send,
  CornerUpRight,
  Sparkles
} from 'lucide-react';
import { YouTubeVideoItem, PlaybackMode } from '../types';
import { formatViewCount, formatPublishedAt, cleanCommentText, parseYouTubeUrl } from '../utils/formatters';
import { EducationPlayer } from './EducationPlayer';
import { AuthorAvatar } from './AuthorAvatar';
import { ThumbnailImage } from './ThumbnailImage';
import { customFetch } from '../utils/apiClient';

interface ShortsViewProps {
  onSelectChannel: (channelId: string) => void;
  playbackMode: PlaybackMode;
  onTogglePlaybackMode: (mode: PlaybackMode) => void;
  regionCode: string;
  initialShortVideo?: YouTubeVideoItem | null;
  onClearInitialShort?: () => void;
  onBackToHome?: () => void;
}

export const ShortsView: React.FC<ShortsViewProps> = ({
  onSelectChannel,
  playbackMode,
  onTogglePlaybackMode,
  regionCode,
  initialShortVideo,
  onClearInitialShort,
  onBackToHome
}) => {
  const [shorts, setShorts] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // selectedIndex null means Grid List View; number means Fullscreen Vertical Player!
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    initialShortVideo ? 0 : null
  );

  // Shorts-only search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  // Player Interaction States
  const [isLiked, setIsLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Player Search Overlay State inside vertical player
  const [isPlayerSearchOpen, setIsPlayerSearchOpen] = useState(false);
  const [playerSearchInput, setPlayerSearchInput] = useState<string>('');

  // Comments Sheet State
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentInput, setNewCommentInput] = useState('');

  const [subscribedChannels, setSubscribedChannels] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('kaito_subscriptions');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const popularShortTags = ['トレンド', 'プログラミング', 'AI・IT', '学習・勉強', '英語', '雑学'];

  const handleNextShort = () => {
    if (selectedIndex === null) return;
    if (selectedIndex < shorts.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setIsLiked(false);
      setIsCommentsOpen(false);
      setShowMoreMenu(false);
    }
  };

  const handlePrevShort = () => {
    if (selectedIndex === null) return;
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setIsLiked(false);
      setIsCommentsOpen(false);
      setShowMoreMenu(false);
    }
  };

  const handleClosePlayer = () => {
    setSelectedIndex(null);
    onClearInitialShort?.();
    setIsCommentsOpen(false);
    setShowMoreMenu(false);
    setIsPlayerSearchOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        handleNextShort();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevShort();
      } else if (e.key === 'Escape') {
        if (isCommentsOpen) {
          setIsCommentsOpen(false);
        } else if (isPlayerSearchOpen) {
          setIsPlayerSearchOpen(false);
        } else {
          handleClosePlayer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex, shorts.length, isCommentsOpen, isPlayerSearchOpen]);

  // Fetch shorts list
  useEffect(() => {
    setLoading(true);
    let url = `/api/youtube/shorts?regionCode=${regionCode}`;
    if (searchQuery.trim()) {
      url += `&q=${encodeURIComponent(searchQuery.trim() + ' #Shorts')}`;
    }
    customFetch(url)
      .then((res) => res.json())
      .then((data) => {
        let items: YouTubeVideoItem[] = data.items || [];

        // Strictly filter out any horizontal or long-form videos
        items = items.filter((item) => {
          const durationStr = item.contentDetails?.duration;
          if (durationStr) {
            const matchH = durationStr.match(/(\d+)H/);
            const matchM = durationStr.match(/(\d+)M/);
            const matchS = durationStr.match(/(\d+)S/);
            if (matchH || (matchM && parseInt(matchM[1], 10) > 1)) {
              return false; // Definitely not a Short (longer than 1 minute)
            }
            const secs = (matchM ? parseInt(matchM[1], 10) * 60 : 0) + (matchS ? parseInt(matchS[1], 10) : 0);
            if (secs > 65) return false;
          }
          return true;
        });

        if (initialShortVideo) {
          const initId =
            typeof initialShortVideo.id === 'string'
              ? initialShortVideo.id
              : (initialShortVideo.id as any)?.videoId;

          const exists = items.some((item) => {
            const id = typeof item.id === 'string' ? item.id : (item.id as any)?.videoId;
            return id === initId;
          });

          if (!exists) {
            items = [initialShortVideo, ...items];
          } else {
            items = [
              initialShortVideo,
              ...items.filter((item) => {
                const id = typeof item.id === 'string' ? item.id : (item.id as any)?.videoId;
                return id !== initId;
              })
            ];
          }
          setSelectedIndex(0);
        }
        setShorts(items);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [regionCode, searchQuery, initialShortVideo]);

  const activeShort = selectedIndex !== null ? shorts[selectedIndex] || null : null;
  const activeVideoId = activeShort
    ? typeof activeShort.id === 'string'
      ? activeShort.id
      : (activeShort.id as any)?.videoId
    : null;

  const activeSnippet = activeShort?.snippet;
  const activeChannelId = activeSnippet?.channelId;

  // Fetch comments when comments sheet is toggled
  useEffect(() => {
    if (isCommentsOpen && activeVideoId) {
      setCommentsLoading(true);
      customFetch(`/api/youtube/comments/${activeVideoId}`)
        .then((res) => res.json())
        .then((data) => {
          setCommentsList(data.items || []);
          setCommentsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setCommentsLoading(false);
        });
    }
  }, [isCommentsOpen, activeVideoId]);

  const handleGridSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = searchInput.trim();
    if (!val) return;

    // Direct YouTube / Shorts URL check
    const parsed = parseYouTubeUrl(val);
    if (parsed.videoId) {
      const directShort: YouTubeVideoItem = {
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

      setShorts((prev) => {
        const filtered = prev.filter((p) => {
          const id = typeof p.id === 'string' ? p.id : (p.id as any)?.videoId;
          return id !== parsed.videoId;
        });
        return [directShort, ...filtered];
      });
      setSelectedIndex(0);
      setSearchInput('');

      // Fetch metadata asynchronously
      customFetch(`/api/youtube/video/${parsed.videoId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.items && data.items[0]) {
            setShorts((prev) => {
              const updated = [...prev];
              if (updated.length > 0) {
                updated[0] = data.items[0];
              }
              return updated;
            });
          }
        })
        .catch(() => {});
      return;
    }

    setSearchQuery(val);
  };

  const handleTagClick = (tag: string) => {
    if (tag === 'トレンド') {
      setSearchInput('');
      setSearchQuery('');
    } else {
      setSearchInput(tag);
      setSearchQuery(tag);
    }
  };

  const handlePlayerSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerSearchInput.trim()) return;
    setSearchQuery(playerSearchInput.trim());
    setIsPlayerSearchOpen(false);
  };

  const toggleSubscribe = (chId?: string) => {
    if (!chId) return;
    const newSubs = { ...subscribedChannels, [chId]: !subscribedChannels[chId] };
    setSubscribedChannels(newSubs);
    try {
      localStorage.setItem('kaito_subscriptions', JSON.stringify(newSubs));
    } catch (e) {
      console.error(e);
    }
  };

  const handleShare = () => {
    if (!activeVideoId) return;
    const url = `https://www.youtube.com/shorts/${activeVideoId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentInput.trim()) return;
    const newComment = {
      id: `local-${Date.now()}`,
      snippet: {
        topLevelComment: {
          snippet: {
            authorDisplayName: 'あなた (受講生)',
            authorProfileImageUrl:
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            textDisplay: newCommentInput,
            likeCount: 0,
            publishedAt: new Date().toISOString()
          }
        }
      }
    };
    setCommentsList([newComment, ...commentsList]);
    setNewCommentInput('');
  };

  return (
    <div className="w-full min-h-[calc(100vh-64px)] bg-neutral-950 text-white">
      {/* 
        ====================================================
        MODE A: SHORTS GRID LIST VIEW (Default Screen)
        ====================================================
      */}
      {selectedIndex === null ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 p-0.5 shadow-lg shrink-0">
                <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center">
                  <Zap className="w-6 h-6 text-rose-500 fill-rose-500" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    ショート動画ライブラリ
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-600/20 border border-rose-500/30 text-rose-400 text-[11px] font-bold">
                    YouTube Shorts
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  サクサク縦スクロール視聴できる短尺コンテンツ
                </p>
              </div>
            </div>
          </div>

          {/* Dedicated Shorts Search Bar */}
          <div className="space-y-3">
            <form onSubmit={handleGridSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="ショート専用検索 (例: 英語, 雑学, AI)..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-full pl-10 pr-10 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition-colors shadow-inner"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-full shadow-lg shadow-rose-900/30 transition-all shrink-0 flex items-center gap-1.5"
              >
                <Search className="w-4 h-4" />
                <span>検索</span>
              </button>
            </form>

            {/* Popular Topics Tags */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-neutral-400 font-semibold shrink-0">人気のテーマ:</span>
              {popularShortTags.map((tag) => {
                const isActive = searchQuery === tag || (tag === 'トレンド' && !searchQuery);
                return (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    className={`px-3.5 py-1.5 rounded-full font-bold transition-all shrink-0 border ${
                      isActive
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid Content Area */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-rose-400">ショート動画を取得中...</p>
            </div>
          ) : shorts.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-neutral-900/40 rounded-2xl border border-neutral-800 p-8">
              <Zap className="w-12 h-12 text-neutral-600 mx-auto" />
              <p className="text-sm text-neutral-300">該当するショート動画が見つかりませんでした。</p>
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="px-5 py-2 bg-rose-600 text-white font-bold text-xs rounded-full shadow"
              >
                検索をリセット
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
              {shorts.map((item, idx) => {
                const videoId =
                  typeof item.id === 'string' ? item.id : (item.id as any)?.videoId;
                const snippet = item.snippet;
                const thumbnail =
                  snippet?.thumbnails?.high?.url ||
                  snippet?.thumbnails?.medium?.url ||
                  snippet?.thumbnails?.default?.url;

                return (
                  <div
                    key={`${videoId}-${idx}`}
                    onClick={() => setSelectedIndex(idx)}
                    className="group relative bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800/80 hover:border-rose-500/60 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-2xl hover:scale-[1.02] flex flex-col"
                  >
                    {/* Vertical 9:16 Thumbnail Aspect Container */}
                    <div className="relative w-full aspect-[9/16] bg-neutral-950 overflow-hidden">
                      <ThumbnailImage
                        video={item}
                        videoId={videoId}
                        fallbackUrl={thumbnail}
                        alt={snippet?.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />

                      {/* Top Gradient & Badge */}
                      <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/80 via-black/20 to-transparent flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black tracking-wide flex items-center gap-1 shadow">
                          <Zap className="w-3 h-3 fill-white" />
                          Shorts
                        </span>
                      </div>

                      {/* Play Button Overlay on Hover */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform">
                          <Play className="w-6 h-6 fill-white ml-0.5" />
                        </div>
                      </div>

                      {/* Bottom Title Gradient Overlay */}
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-8 space-y-1">
                        <p className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-rose-300 transition-colors">
                          {snippet?.title}
                        </p>
                        <p className="text-[11px] text-neutral-300 truncate">
                          @{snippet?.channelTitle}
                        </p>
                        {item.statistics?.viewCount && (
                          <p className="text-[10px] text-neutral-400 font-medium">
                            {formatViewCount(item.statistics.viewCount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* 
          ====================================================
          MODE B: FULLSCREEN VERTICAL PLAYER
          ====================================================
        */
        <div
          className="w-full h-[calc(100vh-64px)] bg-neutral-950 flex flex-col items-center justify-center p-0 sm:p-4 select-none relative overflow-hidden"
        >
          {/* Main Stage & PC Navigation Wrapper */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 w-full max-w-5xl h-full">
            {/* Main Smartphone Stage Container */}
            <div className="relative w-full max-w-md h-[calc(100vh-64px)] sm:h-[88vh] max-h-[840px] sm:rounded-2xl overflow-hidden bg-black shadow-2xl flex flex-col justify-between border border-neutral-800/80 shrink-0">

            {/* TOP OVERLAY BAR */}
            <div className="absolute top-0 left-0 right-0 z-40 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
              {/* Back button returns to Shorts Grid List View */}
              <button
                onClick={handleClosePlayer}
                className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors drop-shadow"
                title="一覧に戻る"
                id="shorts-player-back-grid-btn"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>

              {/* Search Toggle inside Player */}
              {isPlayerSearchOpen ? (
                <div className="flex-1 mx-2 flex flex-col gap-2">
                  <form
                    onSubmit={handlePlayerSearchSubmit}
                    className="flex items-center gap-1.5 bg-neutral-900/95 border border-neutral-700 rounded-full px-3 py-1.5 shadow-xl backdrop-blur"
                  >
                    <Search className="w-4 h-4 text-neutral-400 shrink-0" />
                    <input
                      type="text"
                      value={playerSearchInput}
                      onChange={(e) => setPlayerSearchInput(e.target.value)}
                      placeholder="ショート動画を検索..."
                      className="w-full bg-transparent text-xs text-white placeholder-neutral-400 focus:outline-none"
                      autoFocus
                    />
                    {playerSearchInput && (
                      <button
                        type="button"
                        onClick={() => setPlayerSearchInput('')}
                        className="text-neutral-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="submit"
                      className="text-xs font-bold text-rose-500 hover:text-rose-400 px-1 shrink-0"
                    >
                      検索
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlayerSearchOpen(false)}
                      className="text-neutral-400 hover:text-white ml-1 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {searchQuery && (
                    <div className="px-2.5 py-1 bg-rose-600/30 border border-rose-500/40 rounded-full text-[10px] font-bold text-rose-300 flex items-center gap-1 backdrop-blur">
                      <span>「{searchQuery}」</span>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchInput('');
                        }}
                        className="hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setIsPlayerSearchOpen(true);
                      setPlayerSearchInput(searchQuery);
                    }}
                    className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors drop-shadow"
                    title="ショート動画を検索"
                  >
                    <Search className="w-5 h-5" />
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors drop-shadow"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {showMoreMenu && (
                      <div className="absolute right-0 top-10 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2 text-xs text-neutral-200 z-50 space-y-1">
                        <button
                          onClick={() => {
                            onTogglePlaybackMode(playbackMode === 'nocookie' ? 'standard' : 'nocookie');
                            setShowMoreMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-lg flex items-center justify-between"
                        >
                          <span>埋め込みモード</span>
                          <span className="text-[10px] font-bold text-rose-400">{playbackMode}</span>
                        </button>
                        <button
                          onClick={() => {
                            handleShare();
                            setShowMoreMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 rounded-lg flex items-center gap-2"
                        >
                          <CornerUpRight className="w-3.5 h-3.5" />
                          <span>リンクをコピー</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* VIDEO PLAYER */}
            {activeShort && activeVideoId ? (
              <div className="w-full h-full relative bg-black">
                <EducationPlayer
                  videoId={activeVideoId}
                  title={activeSnippet?.title}
                  playbackMode={playbackMode}
                  onTogglePlaybackMode={onTogglePlaybackMode}
                  isShort={true}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="w-full h-full bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
                <Zap className="w-10 h-10 text-neutral-600 mb-2" />
                <p className="text-xs text-neutral-300">動画情報を取得できませんでした。</p>
              </div>
            )}

            {/* BOTTOM LEFT OVERLAY */}
            {activeShort && (
              <div className="absolute bottom-5 left-3 right-16 z-30 space-y-2 pointer-events-auto text-left">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => activeChannelId && onSelectChannel(activeChannelId)}
                    className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-600/80 flex items-center justify-center shrink-0 overflow-hidden shadow-md"
                  >
                    <User className="w-4 h-4 text-neutral-300" />
                  </button>
                  <span
                    onClick={() => activeChannelId && onSelectChannel(activeChannelId)}
                    className="text-xs font-bold text-white hover:underline cursor-pointer truncate drop-shadow-md"
                  >
                    @{activeSnippet?.channelTitle?.toLowerCase().replace(/\s+/g, '') || activeSnippet?.channelTitle}
                  </span>

                  <button
                    onClick={() => toggleSubscribe(activeChannelId)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow ${
                      subscribedChannels[activeChannelId || '']
                        ? 'bg-neutral-800/90 text-neutral-300 border border-neutral-700'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    {subscribedChannels[activeChannelId || ''] ? '登録済み' : 'チャンネル登録'}
                  </button>
                </div>

                <p className="text-xs font-medium text-white line-clamp-2 drop-shadow-md leading-relaxed pr-2">
                  {activeSnippet?.title}
                </p>
              </div>
            )}

            {/* RIGHT ACTION BUTTONS */}
            {activeShort && (
              <div className="absolute right-2.5 bottom-6 z-30 flex flex-col items-center gap-4 text-white pointer-events-auto">
                {/* Like Button */}
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className="flex flex-col items-center gap-0.5 group"
                >
                  <div
                    className={`p-2.5 rounded-full backdrop-blur transition-all ${
                      isLiked
                        ? 'bg-rose-600 text-white shadow-lg'
                        : 'bg-black/40 hover:bg-black/60 text-white'
                    }`}
                  >
                    <Heart className={`w-6 h-6 ${isLiked ? 'fill-white text-white' : 'text-white'}`} />
                  </div>
                  <span className="text-[11px] font-bold drop-shadow">
                    {activeShort.statistics?.likeCount
                      ? formatViewCount(activeShort.statistics.likeCount).replace(' 回視聴', '')
                      : '8.2万'}
                  </span>
                </button>

                {/* Comments Button */}
                <button
                  onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                  className="flex flex-col items-center gap-0.5 group"
                >
                  <div className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white transition-all">
                    <MessageSquare className="w-6 h-6 fill-white/20" />
                  </div>
                  <span className="text-[11px] font-bold drop-shadow">
                    {activeShort.statistics?.commentCount
                      ? formatViewCount(activeShort.statistics.commentCount).replace(' 回視聴', '')
                      : '1,216'}
                  </span>
                </button>

                {/* Share Button */}
                <button onClick={handleShare} className="flex flex-col items-center gap-0.5 group">
                  <div className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white transition-all">
                    {copied ? <Check className="w-6 h-6 text-emerald-400" /> : <CornerUpRight className="w-6 h-6" />}
                  </div>
                  <span className="text-[11px] font-bold drop-shadow">{copied ? '完了' : '共有'}</span>
                </button>

                {/* Navigation Arrows */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <button
                    onClick={handlePrevShort}
                    disabled={selectedIndex === 0}
                    className={`p-2 rounded-full bg-black/40 backdrop-blur text-white transition-colors ${
                      selectedIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/60'
                    }`}
                    title="前のショート"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleNextShort}
                    disabled={selectedIndex === shorts.length - 1}
                    className={`p-2 rounded-full bg-black/40 backdrop-blur text-white transition-colors ${
                      selectedIndex === shorts.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-black/60'
                    }`}
                    title="次のショート"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>

                {/* Sound Disk Icon */}
                <div className="mt-2 w-9 h-9 rounded-full bg-neutral-900 border-2 border-neutral-700/80 p-0.5 overflow-hidden animate-spin-slow shadow-xl flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center">
                    <Disc className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Progress Bar Accent */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800 z-30">
              <div className="h-full bg-rose-600 animate-pulse w-2/3" />
            </div>

            {/* COMMENTS DRAWER */}
            {isCommentsOpen && (
              <div className="absolute inset-x-0 bottom-0 top-1/3 z-50 bg-neutral-900/98 rounded-t-2xl border-t border-neutral-700 p-4 flex flex-col justify-between shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>コメント</span>
                    <span className="text-xs text-neutral-400 font-normal">
                      ({commentsList.length}件)
                    </span>
                  </h3>
                  <button
                    onClick={() => setIsCommentsOpen(false)}
                    className="p-1 text-neutral-400 hover:text-white rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-3.5 text-xs text-neutral-200 scrollbar-thin">
                  {commentsLoading ? (
                    <div className="py-8 text-center text-neutral-400 space-y-2">
                      <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p>コメントを読み込み中...</p>
                    </div>
                  ) : commentsList.length === 0 ? (
                    <p className="py-8 text-center text-neutral-500">コメントはまだありません。</p>
                  ) : (
                    commentsList.map((c: any) => {
                      const commSnip = c.snippet?.topLevelComment?.snippet || c.snippet || {};
                      const commentBody = cleanCommentText(commSnip.textOriginal, commSnip.textDisplay);
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <AuthorAvatar
                            src={commSnip.authorProfileImageUrl}
                            name={commSnip.authorDisplayName}
                            size="sm"
                          />
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-neutral-200 truncate mr-2">
                                {commSnip.authorDisplayName}
                              </span>
                              <span className="text-neutral-500 text-[10px] shrink-0">
                                {formatPublishedAt(commSnip.publishedAt)}
                              </span>
                            </div>
                            <p className="text-neutral-300 leading-snug whitespace-pre-line break-words">
                              {commentBody || 'コメント内容がありません'}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleAddComment} className="pt-2 border-t border-neutral-800 flex items-center gap-2">
                  <input
                    type="text"
                    value={newCommentInput}
                    onChange={(e) => setNewCommentInput(e.target.value)}
                    placeholder="コメントを追加..."
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-full px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="submit"
                    disabled={!newCommentInput.trim()}
                    className="p-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-full transition-all shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* PC / TABLET SIDE NAVIGATION DECK */}
          <div className="hidden sm:flex flex-col items-center gap-4 z-40 shrink-0">
            {/* Up Arrow / Previous Short */}
            <button
              onClick={handlePrevShort}
              disabled={selectedIndex === 0}
              className={`group relative p-4 rounded-2xl bg-neutral-900 border border-neutral-700/90 text-white shadow-2xl transition-all duration-200 ${
                selectedIndex === 0
                  ? 'opacity-30 cursor-not-allowed border-neutral-800'
                  : 'hover:bg-rose-600 hover:border-rose-500 hover:scale-110 active:scale-95'
              }`}
              title="前のショート動画 (↑ キー)"
              id="pc-shorts-prev-btn"
            >
              <ChevronUp className="w-8 h-8" />
              <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-neutral-900/95 border border-neutral-700 text-white text-[11px] font-bold rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
                前の動画 [↑]
              </span>
            </button>

            {/* Counter Badge */}
            <div className="px-3.5 py-2.5 rounded-2xl bg-neutral-900/90 border border-neutral-800 text-center shadow-2xl min-w-[90px]">
              <div className="text-[9px] font-black text-rose-500 tracking-wider">
                SHORTS
              </div>
              <div className="text-white font-black text-base mt-0.5">
                {(selectedIndex ?? 0) + 1}
                <span className="text-neutral-500 text-xs font-normal"> / {shorts.length}</span>
              </div>
            </div>

            {/* Down Arrow / Next Short */}
            <button
              onClick={handleNextShort}
              disabled={selectedIndex === shorts.length - 1}
              className={`group relative p-4 rounded-2xl bg-neutral-900 border border-neutral-700/90 text-white shadow-2xl transition-all duration-200 ${
                selectedIndex === shorts.length - 1
                  ? 'opacity-30 cursor-not-allowed border-neutral-800'
                  : 'hover:bg-rose-600 hover:border-rose-500 hover:scale-110 active:scale-95'
              }`}
              title="次のショート動画 (↓ キー)"
              id="pc-shorts-next-btn"
            >
              <ChevronDown className="w-8 h-8" />
              <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-neutral-900/95 border border-neutral-700 text-white text-[11px] font-bold rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
                次の動画 [↓]
              </span>
            </button>

            {/* Navigation Tip Badge */}
            <div className="mt-2 px-3 py-2.5 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-[10px] text-neutral-400 text-center space-y-1 max-w-[130px] shadow-xl">
              <div className="text-rose-400 font-bold flex items-center justify-center gap-1">
                <span>ショート切り替え</span>
              </div>
              <div className="text-neutral-200 font-semibold">↑ ↓ キー / ボタン</div>
              <div className="text-[9px] text-neutral-500">ボタンで次の動画へ</div>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};
