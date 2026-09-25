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
  Clock
} from 'lucide-react';
import { YouTubeVideoItem } from '../types';
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
import { Zap } from 'lucide-react';
import { ThumbnailImage } from './ThumbnailImage';
import { AuthorAvatar } from './AuthorAvatar';
import { ChannelBadge } from './ChannelBadge';
import { getCachedChannelAvatar, fetchChannelAvatar } from '../utils/channelAvatarCache';


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
  const [copied, setCopied] = useState(false);

  const videoId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || (video.id as any)?.channelId;
  const snippet = video.snippet || {};
  const rawThumbnail =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80';

  const thumbnail = rawThumbnail.startsWith('data:')
    ? rawThumbnail
    : `/api/proxy/thumbnail?url=${encodeURIComponent(rawThumbnail)}`;

  const title = snippet.title || '無題の動画';
  const channelTitle = snippet.channelTitle || '不明なチャンネル';
  const channelId = snippet.channelId;
  const viewCountStr = video.statistics?.viewCount;
  const publishedAtStr = snippet.publishedAt;
  const durationStr = formatISO8601Duration(video.contentDetails?.duration);

  // Live / Premiere status
  const isLive = Boolean(video.liveNow || snippet.liveBroadcastContent === 'live');
  const isUpcoming = isPremiereScheduled(video);
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

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  };

  return (
    <div
      className="group bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer"
      onClick={() => onSelectVideo(video)}
      id={`video-card-${videoId}`}
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

        {/* Hover Play Icon Overlay */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>
        </div>

        {/* Duration Badge */}
        {durationStr && durationStr !== '0:00' && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[11px] font-mono font-semibold tracking-wide">
            {durationStr}
          </div>
        )}

        {/* Shorts Badge */}
        {isShortVideo(video) && (
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
                  setShowMenu(!showMenu);
                }}
                className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                title="メニュー"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 bottom-full mb-1 w-44 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1 z-30 text-xs text-neutral-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onToggleSave && (
                    <button
                      onClick={() => {
                        onToggleSave(video);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2"
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'text-rose-400 fill-rose-400' : ''}`} />
                      <span>{isSaved ? '保存済みから削除' : 'ライブラリに保存'}</span>
                    </button>
                  )}
                  <button
                    onClick={handleCopyLink}
                    className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copied ? 'コピー完了' : '動画リンクをコピー'}</span>
                  </button>

                  {channelId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        blockChannel(channelId, channelTitle);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-700 text-rose-300 hover:text-rose-200 flex items-center gap-2 border-t border-neutral-700/60"
                      title="このチャンネルの動画を非表示にします"
                    >
                      <ShieldBan className="w-3.5 h-3.5 text-rose-400" />
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
          {isUpcoming ? (
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
