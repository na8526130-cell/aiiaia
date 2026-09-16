import React, { useState, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import {
  YouTubeVideoItem,
  YouTubeCommentThreadItem,
  PlaybackMode
} from '../types';
import { EducationPlayer } from './EducationPlayer';
import { VideoCard } from './VideoCard';
import { AuthorAvatar } from './AuthorAvatar';
import { customFetch } from '../utils/apiClient';
import {
  formatViewCount,
  formatSubscriberCount,
  formatPublishedAt,
  extractTimestamps,
  cleanCommentText,
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

  // Jump to timestamp state
  const [playerStartTime, setPlayerStartTime] = useState<number>(0);

  // Channel subscriber count & avatar state
  const [channelAvatar, setChannelAvatar] = useState<string>('');
  const [subscriberCount, setSubscriberCount] = useState<string>('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const videoId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId;
  const [metaSnippet, setMetaSnippet] = useState<any>(video.snippet || {});
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

  // Helper to render comment text with clean formatting
  const renderCommentBody = (textOriginal?: string, textDisplay?: string) => {
    const cleanText = cleanCommentText(textOriginal, textDisplay);
    if (!cleanText) {
      return <span className="text-neutral-500 italic">コメント内容がありません</span>;
    }
    return <span className="whitespace-pre-line">{cleanText}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 text-white">
      {/* Back Button */}
      <button
        onClick={onBackToHome}
        className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>一覧へ戻る</span>
      </button>

      {/* Main Grid: Player + Details (Left), Related Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (Player + Video Info + Comments) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Education Video Player */}
          <EducationPlayer
            videoId={videoId}
            title={snippet.title}
            playbackMode={playbackMode}
            onTogglePlaybackMode={onTogglePlaybackMode}
            startTime={playerStartTime}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectChannel(channelId)}
                    className="font-bold text-white hover:text-rose-400 transition-colors text-left block text-base cursor-pointer"
                  >
                    {snippet.channelTitle}
                  </button>
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

              {/* Subscribe & Block Quick Actions */}
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

            {/* Action Buttons: Likes, Save */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
              <div className="flex items-center bg-neutral-800 border border-neutral-700/80 rounded-full px-3 py-1.5 gap-2 text-neutral-200">
                <ThumbsUp className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                <span>{formatViewCount(video.statistics?.likeCount).replace(' 回視聴', '')} 高評価</span>
              </div>

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

          {/* Direct Comments Section */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-rose-500" />
                <span>コメント一覧 ({comments.length}件)</span>
              </h3>
              <select
                value={commentsOrder}
                onChange={(e) => setCommentsOrder(e.target.value as any)}
                className="bg-neutral-800 border border-neutral-700 rounded-lg text-xs px-2.5 py-1 text-white focus:outline-none cursor-pointer"
              >
                <option value="relevance">評価順</option>
                <option value="time">新しい順</option>
              </select>
            </div>

            {loadingComments ? (
              <div className="py-8 text-center text-neutral-400 text-sm animate-pulse">
                コメントを読み込んでいます...
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
                    <div key={thread.id} className="pt-4 first:pt-0 flex gap-3 text-xs">
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
                          {renderCommentBody(topSnippet.textOriginal, topSnippet.textDisplay)}
                        </div>
                        <div className="flex items-center gap-3 pt-1 text-neutral-400 text-[11px]">
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="w-3.5 h-3.5 text-neutral-500" />
                            {topSnippet.likeCount || 0}
                          </span>
                        </div>

                        {/* Replies Section */}
                        {totalReplyCount > 0 && (
                          <div className="mt-3 space-y-3">
                            {!replyState && (
                              <button
                                onClick={() => handleFetchReplies(commentId)}
                                className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 mt-1 cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>返信を表示 ({totalReplyCount}件)</span>
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
                                          {renderCommentBody(repSnip?.textOriginal, repSnip?.textDisplay)}
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
        </div>

        {/* Right Column (Related / Recommended Videos Sidebar with Load More) */}
        <div className="space-y-4">
          <h2 className="font-bold text-lg text-white flex items-center gap-2">
            <ListVideo className="w-5 h-5 text-rose-500" />
            <span>関連・おすすめ動画</span>
          </h2>

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
    </div>
  );
};
