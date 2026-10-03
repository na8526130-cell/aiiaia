import React, { useState, useEffect } from 'react';
import {
  Play,
  Bookmark,
  Share2,
  MoreVertical,
  Check,
  ShieldCheck,
  ShieldBan,
  Radio,
  Clock,
  ListVideo,
  ListPlus,
  FolderPlus
} from 'lucide-react';
import { YouTubeVideoItem, UserCustomPlaylist } from '../types';
import {
  formatViewCount,
  formatPublishedAt,
  formatISO8601Duration,
  isShortVideo,
  formatPremiereDateJST,
  formatWaitingCount,
  isPremiereScheduled,
  getPremiereScheduledTime
} from '../utils/formatters';
import { blockChannel } from '../utils/channelStorage';
import {
  addToUpNextQueueNext,
  addToUpNextQueueTail,
  getCustomPlaylistsFromStorage,
  addVideoToCustomPlaylist
} from '../utils/userDataManager';
import { Zap } from 'lucide-react';
import { ThumbnailImage } from './ThumbnailImage';
import { AuthorAvatar } from './AuthorAvatar';
import { ChannelBadge } from './ChannelBadge';
import { getCachedChannelAvatar, fetchChannelAvatar } from '../utils/channelAvatarCache';
import { prefetchStreamSources } from '../utils/streamManager';


interface VideoCardProps {
  video: YouTubeVideoItem;
  onSelectVideo: (video: YouTubeVideoItem) => void;
  onSelectChannel?: (channelId: string) => void;
  isSaved?: boolean;
  onToggleSave?: (video: YouTubeVideoItem) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onSelectVideo,
  onSelectChannel,
  isSaved = false,
  onToggleSave
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const [availablePlaylists, setAvailablePlaylists] = useState<UserCustomPlaylist[]>([]);
  const [copied, setCopied] = useState(false);
  const [queuedFeedback, setQueuedFeedback] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [animatedThumbFailed, setAnimatedThumbFailed] = useState(false);

  const isPlaylist = Boolean(
    video.isPlaylist ||
    video.kind === 'youtube#playlist' ||
    video.playlistId ||
    (typeof video.id === 'object' && (video.id as any)?.playlistId)
  );
  const playlistId =
    video.playlistId ||
    (typeof video.id === 'object' ? (video.id as any)?.playlistId : undefined) ||
    (isPlaylist && typeof video.id === 'string' ? video.id : undefined);
  const videoId =
    video.firstVideoId ||
    (typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || (video.id as any)?.playlistId || (video.id as any)?.channelId);
  const snippet = video.snippet || {};
  const rawThumbnail =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80';

  const rawAnimatedUrl =
    !isPlaylist
      ? video.animatedThumbnailUrl ||
        snippet.animatedThumbnailUrl ||
        (video as any).richThumbnailUrl ||
        (video as any).movingThumbnailUrl ||
        ''
      : '';

  const animatedPreviewSrc = rawAnimatedUrl
    ? rawAnimatedUrl.startsWith('data:') || rawAnimatedUrl.startsWith('/api/')
      ? rawAnimatedUrl
      : `/api/proxy/thumbnail?url=${encodeURIComponent(rawAnimatedUrl)}`
    : '';

  const thumbnail = rawThumbnail.startsWith('data:')
    ? rawThumbnail
    : `/api/proxy/thumbnail?url=${encodeURIComponent(rawThumbnail)}`;

  const title = snippet.title || '無題の動画';
  const channelTitle = snippet.channelTitle || '不明なチャンネル';
  const channelId = snippet.channelId;
  const viewCountStr = video.statistics?.viewCount;
  const publishedAtStr = snippet.publishedAt;
  const durationStr = isPlaylist ? '' : formatISO8601Duration(video.contentDetails?.duration);
  const playlistCountLabel =
    video.videoCountText ||
    (video.contentDetails?.itemCount ? `${video.contentDetails.itemCount}本の動画` : '再生リスト');

  // Live / Premiere status
  const isLive = !isPlaylist && Boolean(video.liveNow || snippet.liveBroadcastContent === 'live');
  const isUpcoming = !isPlaylist && isPremiereScheduled(video);
  const premiereTime = getPremiereScheduledTime(video);
  const waitingCount =
    (video as any).waiting ||
    (video as any).concurrentViewers ||
    (video as any).liveStreamingDetails?.concurrentViewers ||
    (video as any).liveViewers;

  // Channel Avatar state & auto-fetch
  const initialAvatar =
    snippet.channelThumbnail ||
    (video as any).authorThumbnail ||
    (video as any).authorThumbnails?.[0]?.url ||
    getCachedChannelAvatar(channelId);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(initialAvatar);

  useEffect(() => {
    if (avatarUrl) return;
    if (channelId) {
      fetchChannelAvatar(channelId).then((url) => {
        if (url) setAvatarUrl(url);
      });
    }
  }, [channelId, avatarUrl]);

  useEffect(() => {
    if (!isHovered || isPlaylist || !videoId) return;
    const timer = window.setTimeout(() => {
      prefetchStreamSources(String(videoId));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [isHovered, isPlaylist, videoId]);

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = isPlaylist && playlistId
      ? `https://www.youtube.com/playlist?list=${playlistId}`
      : `https://www.youtube.com/watch?v=${videoId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  };

  return (
    <div
      className={`group bg-neutral-900 border ${
        isPlaylist ? 'border-indigo-500/40 hover:border-indigo-400' : 'border-neutral-800 hover:border-neutral-700'
      } rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col cursor-pointer`}
      onClick={() => {
        if (!isPlaylist && videoId) {
          prefetchStreamSources(String(videoId));
        }
        onSelectVideo(video);
      }}
      onMouseDown={() => {
        if (!isPlaylist && videoId) {
          prefetchStreamSources(String(videoId));
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      id={`video-card-${playlistId || videoId}`}
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-video bg-neutral-950 overflow-hidden">
        <ThumbnailImage
          video={video}
          videoId={videoId}
          fallbackUrl={rawThumbnail}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Animated WebP Hover Preview (animatedThumbnailOverlayViewModel / movingThumbnail) */}
        {isHovered && animatedPreviewSrc && !animatedThumbFailed && (
          <img
            src={animatedPreviewSrc}
            alt={title}
            onError={() => setAnimatedThumbFailed(true)}
            className="absolute inset-0 w-full h-full object-cover z-10 animate-in fade-in duration-150"
          />
        )}

        {/* Hover Play Icon Overlay */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className={`px-3.5 py-2 rounded-full ${isPlaylist ? 'bg-indigo-600' : 'bg-rose-600'} text-white flex items-center gap-1.5 shadow-lg text-xs font-bold`}>
            <Play className="w-4 h-4 fill-white" />
            <span>{isPlaylist ? 'すべて再生' : '再生'}</span>
          </div>
        </div>

        {/* Quick "Add to Up Next Queue" Hover Button (Top Right) */}
        {!isPlaylist && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addToUpNextQueueNext(video);
              setQueuedFeedback(true);
              setTimeout(() => setQueuedFeedback(false), 1800);
            }}
            title="次に再生（一時キュー）に追加"
            className={`absolute top-2 right-2 z-20 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-lg border transition-all cursor-pointer ${
              queuedFeedback
                ? 'bg-emerald-600 text-white border-emerald-400 opacity-100'
                : 'bg-black/85 hover:bg-rose-600 text-white border-neutral-700/80 opacity-0 group-hover:opacity-100'
            }`}
          >
            {queuedFeedback ? (
              <>
                <Check className="w-3 h-3" />
                <span>予約済</span>
              </>
            ) : (
              <>
                <ListPlus className="w-3.5 h-3.5" />
                <span>次に再生</span>
              </>
            )}
          </button>
        )}

        {/* Playlist Right / Bottom Overlay Badge */}
        {isPlaylist && (
          <>
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-indigo-600/95 border border-indigo-400/60 text-[10px] font-bold text-white flex items-center gap-1 shadow-md z-10">
              <ListVideo className="w-3 h-3" />
              <span>再生リスト</span>
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/85 border border-neutral-700/80 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow">
              <ListVideo className="w-3.5 h-3.5 text-indigo-400" />
              <span>{playlistCountLabel}</span>
            </div>
          </>
        )}

        {/* Duration Badge */}
        {!isPlaylist && durationStr && durationStr !== '0:00' && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[11px] font-mono font-semibold tracking-wide">
            {durationStr}
          </div>
        )}

        {/* Shorts Badge */}
        {!isPlaylist && isShortVideo(video) && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-600 border border-rose-500 text-[10px] font-bold text-white flex items-center gap-1 shadow-md z-10">
            <Zap className="w-3 h-3 fill-white" />
            <span>Shorts</span>
          </div>
        )}

        {/* Live Badge */}
        {isLive && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-600 border border-rose-500 text-[10px] font-bold text-white flex items-center gap-1 shadow-md z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>ライブ配信中</span>
          </div>
        )}

        {/* Upcoming Premiere Badge */}
        {!isLive && isUpcoming && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/85 border border-amber-500/60 text-[10px] font-bold text-amber-300 flex items-center gap-1 shadow-md z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>プレミア公開 • {formatWaitingCount(waitingCount)}</span>
          </div>
        )}

      </div>

      {/* Video Details */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {/* Title */}
          <h3 className="font-semibold text-white text-sm line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
            {title}
          </h3>

          {/* Channel Name & Quick Actions */}
          <div className="mt-2.5 flex items-center justify-between text-xs text-neutral-400">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (channelId && onSelectChannel) onSelectChannel(channelId);
              }}
              className="flex items-center gap-1.5 hover:text-white transition-colors truncate text-left group/author"
            >
              <AuthorAvatar
                src={avatarUrl}
                name={channelTitle}
                size="sm"
                className="w-5 h-5 text-[10px]"
              />
              <span className="truncate font-medium">{channelTitle}</span>
              <ChannelBadge
                channelTitle={channelTitle}
                isArtist={(video as any).isArtist || (video as any).authorMusic}
                isVerified={(video as any).verified || (video as any).isVerified || (video as any).authorVerified}
              />
            </button>

            {/* Menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextOpen = !showMenu;
                  setShowMenu(nextOpen);
                  setShowPlaylistSubmenu(false);
                  if (nextOpen) {
                    setAvailablePlaylists(getCustomPlaylistsFromStorage());
                  }
                }}
                className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                title="メニュー"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 bottom-full mb-1 w-52 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl py-1.5 z-30 text-xs text-neutral-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isPlaylist && (
                    <>
                      <button
                        onClick={() => {
                          addToUpNextQueueNext(video);
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2 text-white font-semibold cursor-pointer"
                      >
                        <ListPlus className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>次に再生に追加（直後に予約）</span>
                      </button>

                      <button
                        onClick={() => {
                          addToUpNextQueueTail(video);
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2 text-neutral-300 cursor-pointer"
                      >
                        <ListVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>キューの最後尾に追加</span>
                      </button>

                      <div className="border-t border-neutral-700/60 my-1" />
                    </>
                  )}

                  {onToggleSave && (
                    <button
                      onClick={() => {
                        onToggleSave(video);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Bookmark className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'text-rose-400 fill-rose-400' : ''}`} />
                      <span>{isSaved ? '保存済みから削除' : 'ライブラリに保存'}</span>
                    </button>
                  )}

                  {/* Add to Custom Playlist Submenu */}
                  {!isPlaylist && availablePlaylists.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowPlaylistSubmenu(!showPlaylistSubmenu)}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>マイ再生リストに追加</span>
                        </span>
                        <span className="text-[10px] text-neutral-400">{showPlaylistSubmenu ? '▲' : '▼'}</span>
                      </button>
                      {showPlaylistSubmenu && (
                        <div className="bg-neutral-900/90 border-y border-neutral-700/60 py-1 max-h-36 overflow-y-auto">
                          {availablePlaylists.map((pl) => (
                            <button
                              key={pl.id}
                              onClick={() => {
                                addVideoToCustomPlaylist(pl.id, video);
                                setShowMenu(false);
                                setShowPlaylistSubmenu(false);
                              }}
                              className="w-full px-5 py-1.5 text-left hover:bg-neutral-700 text-[11px] text-neutral-300 hover:text-white flex items-center justify-between gap-2 truncate cursor-pointer"
                            >
                              <span className="truncate">{pl.title}</span>
                              <span className="text-[10px] text-neutral-500 shrink-0">{pl.videos?.length || 0}本</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleCopyLink}
                    className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Share2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>{copied ? 'コピー完了' : '動画リンクをコピー'}</span>
                  </button>

                  {channelId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        blockChannel(channelId, channelTitle);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-700 text-rose-300 hover:text-rose-200 flex items-center gap-2 border-t border-neutral-700/60 cursor-pointer"
                      title="このチャンネルの動画を非表示にします"
                    >
                      <ShieldBan className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>チャンネルを非表示</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Views & Date */}
        <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
          {isPlaylist ? (
            <>
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                <ListVideo className="w-3.5 h-3.5" />
                <span>再生リストをすべて表示</span>
              </span>
              <span>{playlistCountLabel}</span>
            </>
          ) : isUpcoming ? (
            <>
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {formatWaitingCount(waitingCount)}
              </span>
              <span className="truncate max-w-[140px] text-right" title={`公開予定: ${formatPremiereDateJST(premiereTime)}`}>
                公開予定: {formatPremiereDateJST(premiereTime)}
              </span>
            </>
          ) : isLive ? (
            <>
              <span className="text-rose-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {waitingCount ? `${Number(waitingCount).toLocaleString()}人が視聴中` : 'ライブ配信中'}
              </span>
              <span>{formatPublishedAt(publishedAtStr)}</span>
            </>
          ) : (
            <>
              <span>{formatViewCount(viewCountStr)}</span>
              <span>{formatPublishedAt(publishedAtStr)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
