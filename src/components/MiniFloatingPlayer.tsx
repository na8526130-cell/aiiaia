import React, { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { YouTubeVideoItem, PlaybackMode } from '../types';
import { EducationPlayer } from './EducationPlayer';

interface MiniFloatingPlayerProps {
  video: YouTubeVideoItem;
  playbackMode: PlaybackMode;
  onOpenDetail: () => void;
  onClose: () => void;
  onEnded?: () => void;
}

export const MiniFloatingPlayer: React.FC<MiniFloatingPlayerProps> = ({
  video,
  playbackMode,
  onOpenDetail,
  onClose,
  onEnded
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const rawId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || '';
  const videoId =
    video.firstVideoId ||
    (typeof video.id === 'object' ? (video.id as any)?.videoId : undefined) ||
    (video as any).snippet?.resourceId?.videoId ||
    (video as any).contentDetails?.videoId ||
    (!/^(PL|UU|FL|LP|RD|OLAK5uy_)/.test(rawId) ? rawId : '');
  const title = video.snippet?.title || '動画を再生中';

  if (!videoId) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-72 sm:w-80 md:w-96 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-6 group ring-1 ring-white/10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      id="mini-floating-player"
    >
      {/* Mini Player Header Bar */}
      <div className="bg-neutral-900/90 backdrop-blur-xs px-3 py-2 flex items-center justify-between gap-2 border-b border-neutral-800">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-white truncate" title={title}>
            {title}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenDetail}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="プレイヤーを拡大"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors cursor-pointer"
            title="再生を停止"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video Content */}
      <div className="relative aspect-video bg-black w-full overflow-hidden">
        <EducationPlayer
          videoId={videoId}
          title={title}
          playbackMode={playbackMode}
          isShort={true}
          onEnded={onEnded}
          className="w-full h-full"
        />
      </div>

      {/* Mini Footer Notice */}
      <div className="bg-neutral-950 px-3 py-1.5 flex items-center justify-between text-[10px] text-neutral-400 border-t border-neutral-900">
        <span className="truncate">
          {video.customPlaylistTitle
            ? `再生リスト: ${video.customPlaylistTitle}`
            : '次の動画を選ぶまで連続再生中'}
        </span>
        <button
          onClick={onOpenDetail}
          className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer shrink-0"
        >
          全画面表示
        </button>
      </div>
    </div>
  );
};
