import React, { useState, useEffect } from 'react';
import {
  User,
  Video,
  Users,
  Eye,
  X,
  Play,
  ExternalLink,
  Check,
  Plus,
  Ban,
  ShieldBan,
  Film,
  Sparkles,
  ArrowUpDown,
  Flame
} from 'lucide-react';
import { YouTubeChannelItem, YouTubeVideoItem } from '../types';
import { VideoCard } from './VideoCard';
import { ThumbnailImage } from './ThumbnailImage';
import { customFetch } from '../utils/apiClient';
import {
  formatSubscriberCount,
  formatViewCount,
  formatPublishedAt,
  isShortVideo
} from '../utils/formatters';
import {
  isChannelBlocked,
  blockChannel,
  unblockChannel,
  isChannelSubscribed,
  subscribeChannel,
  unsubscribeChannel
} from '../utils/channelStorage';

interface ChannelModalProps {
  channelId: string | null;
  onClose: () => void;
  onSelectVideo: (video: YouTubeVideoItem) => void;
  isSaved: boolean;
  onToggleSave: (video: YouTubeVideoItem) => void;
}

export const ChannelModal: React.FC<ChannelModalProps> = ({
  channelId,
  onClose,
  onSelectVideo,
  isSaved,
  onToggleSave
}) => {
  const [channelData, setChannelData] = useState<YouTubeChannelItem | null>(null);
  const [channelVideos, setChannelVideos] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'shorts' | 'about'>('home');
  const [videoSort, setVideoSort] = useState<'newest' | 'popular' | 'oldest'>('newest');
  const [videoFilter, setVideoFilter] = useState<'all' | 'normal' | 'shorts'>('all');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // Subscription & Block state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    setLoading(true);

    setIsSubscribed(isChannelSubscribed(channelId));
    setIsBlocked(isChannelBlocked(channelId));

    Promise.all([
      customFetch(`/api/youtube/channel/${channelId}`).then((r) => r.json()),
      customFetch(`/api/youtube/channel/videos/${channelId}?maxResults=50`).then((r) => r.json())
    ])
      .then(([chanRes, vidsRes]) => {
        if (chanRes.items?.[0]) setChannelData(chanRes.items[0]);
        if (vidsRes.items) {
          setChannelVideos(vidsRes.items);
          setNextPageToken(vidsRes.nextPageToken || null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [channelId]);

  const handleLoadMore = async () => {
    if (!channelId || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await customFetch(`/api/youtube/channel/videos/${channelId}?maxResults=50&pageToken=${encodeURIComponent(nextPageToken)}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setChannelVideos((prev) => {
          const existingIds = new Set(prev.map((v) => typeof v.id === 'string' ? v.id : (v.id as any)?.videoId));
          const newItems = data.items.filter((v: any) => {
            const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
            return id && !existingIds.has(id);
          });
          return [...prev, ...newItems];
        });
        setNextPageToken(data.nextPageToken || null);
      } else {
        setNextPageToken(null);
      }
    } catch (err) {
      console.error('Error loading more channel videos:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleSubscribe = () => {
    if (!channelId || !channelData) return;
    const snippet = channelData.snippet;
    const avatar = snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url;

    if (isSubscribed) {
      unsubscribeChannel(channelId);
      setIsSubscribed(false);
    } else {
      subscribeChannel({
        channelId,
        channelTitle: snippet?.title || 'チャンネル',
        customUrl: snippet?.customUrl,
        avatarUrl: avatar,
        subscriberCount: channelData.statistics?.subscriberCount,
        videoCount: channelData.statistics?.videoCount,
        description: snippet?.description,
        subscribedAt: new Date().toISOString()
      });
      setIsSubscribed(true);
    }
  };

  const toggleBlock = () => {
    if (!channelId) return;
    const title = channelData?.snippet?.title || 'チャンネル';
    const avatar = channelData?.snippet?.thumbnails?.medium?.url;

    if (isBlocked) {
      unblockChannel(channelId);
      setIsBlocked(false);
    } else {
      if (window.confirm(`「${title}」を非表示・ブロックしますか？\n検索結果やおすすめフィードから非表示になります。`)) {
        blockChannel(channelId, title, avatar);
        setIsBlocked(true);
      }
    }
  };

  if (!channelId) return null;

  const snippet = channelData?.snippet;
  const statistics = channelData?.statistics;
  const branding = channelData?.brandingSettings;
  const avatar = snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url;
  const banner = branding?.image?.bannerExternalUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1600&auto=format&fit=crop&q=80';

  // Accurate classification using formatters.isShortVideo
  const normalVideos = channelVideos.filter((v) => !isShortVideo(v));
  const shortVideos = channelVideos.filter((v) => isShortVideo(v));

  // Filter and sort for the Videos tab
  const displayedVideos = channelVideos.filter((v) => {
    if (videoFilter === 'normal') return !isShortVideo(v);
    if (videoFilter === 'shorts') return isShortVideo(v);
    return true;
  });

  const sortedDisplayedVideos = [...displayedVideos].sort((a, b) => {
    if (videoSort === 'popular') {
      const vA = parseInt(a.statistics?.viewCount || '0', 10);
      const vB = parseInt(b.statistics?.viewCount || '0', 10);
      return vB - vA;
    }
    if (videoSort === 'oldest') {
      const dateA = new Date(a.snippet?.publishedAt || 0).getTime();
      const dateB = new Date(b.snippet?.publishedAt || 0).getTime();
      return dateA - dateB;
    }
    // newest default
    const dateA = new Date(a.snippet?.publishedAt || 0).getTime();
    const dateB = new Date(b.snippet?.publishedAt || 0).getTime();
    return dateB - dateA;
  });

  // Featured video: pick top normal video or first available
  const featuredVideo = normalVideos[0] || channelVideos[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-5xl w-full shadow-2xl text-white my-6 max-h-[92vh] overflow-y-auto flex flex-col relative">
        {/* Header Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 p-2 bg-black/60 hover:bg-black/90 rounded-full text-white border border-neutral-700 transition-colors cursor-pointer"
          title="閉じる (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-24 text-center text-neutral-400 text-sm animate-pulse space-y-3">
            <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>チャンネル情報を読み込んでいます...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Hero Channel Banner */}
            <div className="relative h-32 sm:h-48 w-full bg-neutral-950 overflow-hidden shrink-0">
              <img src={banner} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
            </div>

            {/* Hero Identity Header */}
            <div className="px-6 pb-4 pt-2 -mt-10 relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left border-b border-neutral-800/80">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950 border-4 border-neutral-900 shadow-xl overflow-hidden shrink-0">
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-neutral-400 m-auto" />
                )}
              </div>

              <div className="flex-1 space-y-1.5 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                      <span>{snippet?.title || 'チャンネル'}</span>
                      {isBlocked && (
                        <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold border border-neutral-700">
                          非表示中
                        </span>
                      )}
                    </h1>
                    <p className="text-xs text-rose-400 font-semibold">{snippet?.customUrl || `@${channelId}`}</p>
                  </div>

                  {/* Actions: Subscribe & Block */}
                  <div className="flex items-center justify-center sm:justify-end gap-2">
                    <button
                      onClick={toggleSubscribe}
                      className={`px-4 py-2 rounded-full font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
                        isSubscribed
                          ? 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      {isSubscribed ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>登録済み</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>チャンネル登録</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={toggleBlock}
                      className={`px-3 py-2 rounded-full text-xs font-semibold flex items-center gap-1 transition-colors border cursor-pointer ${
                        isBlocked
                          ? 'bg-rose-950/60 text-rose-300 border-rose-600/40 hover:bg-rose-900/60'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:bg-neutral-700'
                      }`}
                      title={isBlocked ? '非表示を解除' : 'このチャンネルをフィードから非表示'}
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                      <span>{isBlocked ? '非表示解除' : '非表示'}</span>
                    </button>
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1 text-xs text-neutral-400">
                  <span className="font-semibold text-white">
                    {formatSubscriberCount(statistics?.subscriberCount)}
                  </span>
                  <span>•</span>
                  <span>{statistics?.videoCount || channelVideos.length} 本の動画</span>
                  <span>•</span>
                  <span>通常動画 {normalVideos.length}本</span>
                  <span>•</span>
                  <span>ショート {shortVideos.length}本</span>
                  <span>•</span>
                  <span>総再生 {formatViewCount(statistics?.viewCount)}</span>
                </div>

                {/* Description Preview */}
                {snippet?.description && (
                  <div className="pt-2">
                    <p className={`text-xs text-neutral-300 leading-relaxed ${isDescExpanded ? '' : 'line-clamp-2'}`}>
                      {snippet.description}
                    </p>
                    <button
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                      className="text-[11px] font-bold text-rose-400 hover:underline mt-1 cursor-pointer"
                    >
                      {isDescExpanded ? '閉じる' : '...もっと見る'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Channel Tabs Bar */}
            <div className="px-6 border-b border-neutral-800 bg-neutral-950/60 sticky top-0 z-20 flex items-center gap-6 text-sm font-semibold overflow-x-auto">
              <button
                onClick={() => setActiveTab('home')}
                className={`py-3 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'home'
                    ? 'border-rose-500 text-rose-400'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                ホーム
              </button>
              <button
                onClick={() => setActiveTab('videos')}
                className={`py-3 border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'videos'
                    ? 'border-rose-500 text-rose-400'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <span>すべての動画</span>
                <span className="px-1.5 py-0.2 rounded-full bg-neutral-800 text-[11px] text-neutral-300">
                  {channelVideos.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('shorts')}
                className={`py-3 border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'shorts'
                    ? 'border-rose-500 text-rose-400'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <span>ショート</span>
                <span className="px-1.5 py-0.2 rounded-full bg-neutral-800 text-[11px] text-neutral-300">
                  {shortVideos.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('about')}
                className={`py-3 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'about'
                    ? 'border-rose-500 text-rose-400'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                概要
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6 flex-1 space-y-6">
              {/* 1. HOME TAB */}
              {activeTab === 'home' && (
                <div className="space-y-8">
                  {/* Featured Video Section */}
                  {featuredVideo && (
                    <div className="space-y-3">
                      <span className="text-xs font-black text-rose-400 tracking-wider uppercase flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                        <span>注目の動画</span>
                      </span>
                      <div
                        onClick={() => {
                          onSelectVideo(featuredVideo);
                          onClose();
                        }}
                        className="group bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 flex flex-col md:flex-row gap-5 cursor-pointer shadow-lg transition-all"
                      >
                        <div className="relative aspect-video w-full md:w-80 rounded-xl overflow-hidden bg-neutral-900 shrink-0">
                          <ThumbnailImage
                            video={featuredVideo}
                            fallbackUrl={
                              featuredVideo.snippet?.thumbnails?.high?.url ||
                              featuredVideo.snippet?.thumbnails?.medium?.url ||
                              ''
                            }
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
                              <Play className="w-6 h-6 fill-white ml-0.5" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 flex-1 flex flex-col justify-between">
                          <div className="space-y-1">
                            <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-rose-400 transition-colors line-clamp-2">
                              {featuredVideo.snippet?.title}
                            </h3>
                            <p className="text-xs text-neutral-400">
                              {formatViewCount(featuredVideo.statistics?.viewCount)} • {formatPublishedAt(featuredVideo.snippet?.publishedAt)}
                            </p>
                            <p className="text-xs text-neutral-300 line-clamp-3 pt-1 leading-relaxed">
                              {featuredVideo.snippet?.description}
                            </p>
                          </div>

                          <div className="pt-2">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 group-hover:translate-x-1 transition-transform">
                              <span>今すぐ再生</span>
                              <span>→</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Normal Videos Section (横画面・通常動画) */}
                  {normalVideos.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-rose-400" />
                          <h3 className="font-bold text-base text-white">最新の通常動画</h3>
                        </div>
                        {normalVideos.length > 6 && (
                          <button
                            onClick={() => setActiveTab('videos')}
                            className="text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                          >
                            すべて見る ({normalVideos.length}本) →
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {normalVideos.slice(0, 6).map((v) => (
                          <VideoCard
                            key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                            video={v}
                            onSelectVideo={(sel) => {
                              onSelectVideo(sel);
                              onClose();
                            }}
                            isSaved={isSaved}
                            onToggleSave={onToggleSave}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shorts Section (縦画面ショート) */}
                  {shortVideos.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-amber-400" />
                          <h3 className="font-bold text-base text-white">ショート動画</h3>
                        </div>
                        {shortVideos.length > 5 && (
                          <button
                            onClick={() => setActiveTab('shorts')}
                            className="text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                          >
                            ショート一覧 ({shortVideos.length}本) →
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {shortVideos.slice(0, 5).map((v) => {
                          const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
                          const thumb = v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url;
                          return (
                            <div
                              key={id}
                              onClick={() => {
                                onSelectVideo(v);
                                onClose();
                              }}
                              className="group relative aspect-[9/16] bg-neutral-950 rounded-xl overflow-hidden border border-neutral-800 hover:border-rose-500/50 cursor-pointer shadow-md transition-all flex flex-col justify-end"
                            >
                              <ThumbnailImage
                                video={v}
                                videoId={id}
                                fallbackUrl={thumb}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                              <div className="relative p-2.5 z-10 space-y-0.5">
                                <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                                  {v.snippet?.title}
                                </h4>
                                <p className="text-[10px] text-neutral-400">
                                  {formatViewCount(v.statistics?.viewCount)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {normalVideos.length === 0 && shortVideos.length === 0 && (
                    <div className="py-12 text-center text-neutral-500 text-sm">
                      動画が見つかりませんでした。
                    </div>
                  )}
                </div>
              )}

              {/* 2. VIDEOS TAB (ALL VIDEOS WITH SUB-FILTERS & LOAD MORE) */}
              {activeTab === 'videos' && (
                <div className="space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                    {/* Category Filter */}
                    <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
                      <button
                        onClick={() => setVideoFilter('all')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoFilter === 'all'
                            ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        すべて ({channelVideos.length})
                      </button>
                      <button
                        onClick={() => setVideoFilter('normal')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoFilter === 'normal'
                            ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        通常動画 ({normalVideos.length})
                      </button>
                      <button
                        onClick={() => setVideoFilter('shorts')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoFilter === 'shorts'
                            ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        ショート ({shortVideos.length})
                      </button>
                    </div>

                    {/* Sort Options */}
                    <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
                      <button
                        onClick={() => setVideoSort('newest')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoSort === 'newest'
                            ? 'bg-rose-600 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        最新順
                      </button>
                      <button
                        onClick={() => setVideoSort('popular')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoSort === 'popular'
                            ? 'bg-rose-600 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        人気順 (再生数)
                      </button>
                      <button
                        onClick={() => setVideoSort('oldest')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          videoSort === 'oldest'
                            ? 'bg-rose-600 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        古い順
                      </button>
                    </div>
                  </div>

                  {sortedDisplayedVideos.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {sortedDisplayedVideos.map((v) => (
                          <VideoCard
                            key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                            video={v}
                            onSelectVideo={(sel) => {
                              onSelectVideo(sel);
                              onClose();
                            }}
                            isSaved={isSaved}
                            onToggleSave={onToggleSave}
                          />
                        ))}
                      </div>

                      {nextPageToken && (
                        <div className="flex justify-center pt-6 pb-4">
                          <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
                          >
                            {loadingMore ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>動画を読み込み中...</span>
                              </>
                            ) : (
                              <span>さらに次の動画を読み込む（全動画を取得）</span>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-16 text-center text-neutral-400 space-y-2">
                      <Film className="w-8 h-8 text-neutral-600 mx-auto" />
                      <p className="text-sm font-semibold">該当する動画が見つかりませんでした</p>
                    </div>
                  )}
                </div>
              )}

              {/* 3. SHORTS TAB (ONLY SHORTS) */}
              {activeTab === 'shorts' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-base text-white">
                      ショート動画一覧 ({shortVideos.length}本)
                    </h3>
                  </div>

                  {shortVideos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                      {shortVideos.map((v) => {
                        const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
                        const thumb = v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url;
                        return (
                          <div
                            key={id}
                            onClick={() => {
                              onSelectVideo(v);
                              onClose();
                            }}
                            className="group relative aspect-[9/16] bg-neutral-950 rounded-xl overflow-hidden border border-neutral-800 hover:border-rose-500/60 cursor-pointer shadow-md transition-all flex flex-col justify-end"
                          >
                            <ThumbnailImage
                              video={v}
                              videoId={id}
                              fallbackUrl={thumb}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="relative p-3 z-10 space-y-1">
                              <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                                {v.snippet?.title}
                              </h4>
                              <p className="text-[10px] text-neutral-400">
                                {formatViewCount(v.statistics?.viewCount)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-neutral-400 space-y-2">
                      <Flame className="w-8 h-8 text-neutral-600 mx-auto" />
                      <p className="text-sm font-semibold">このチャンネルにはショート動画がありません</p>
                    </div>
                  )}
                </div>
              )}

              {/* 4. ABOUT TAB */}
              {activeTab === 'about' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div className="md:col-span-2 bg-neutral-950 p-5 rounded-2xl border border-neutral-800 space-y-3">
                    <h3 className="font-bold text-white text-base">チャンネル説明</h3>
                    <p className="text-neutral-300 leading-relaxed whitespace-pre-line text-xs md:text-sm">
                      {snippet?.description || '説明欄のテキストはありません。'}
                    </p>
                  </div>

                  <div className="bg-neutral-950 p-5 rounded-2xl border border-neutral-800 space-y-4">
                    <h3 className="font-bold text-white text-base">詳細ステータス</h3>
                    <dl className="space-y-3 text-xs text-neutral-300 divide-y divide-neutral-800/80">
                      <div className="pt-2 flex justify-between">
                        <dt className="text-neutral-400">チャンネル登録者</dt>
                        <dd className="font-bold text-white">{formatSubscriberCount(statistics?.subscriberCount)}</dd>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <dt className="text-neutral-400">総視聴回数</dt>
                        <dd className="font-bold text-white">{formatViewCount(statistics?.viewCount)}</dd>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <dt className="text-neutral-400">投稿動画数</dt>
                        <dd className="font-bold text-white">{statistics?.videoCount || channelVideos.length} 本</dd>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <dt className="text-neutral-400">チャンネル ID</dt>
                        <dd className="font-mono text-neutral-400 truncate max-w-[140px]">{channelId}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
