import React, { useState } from 'react';
import { Maximize2, X, Volume2, Music, GraduationCap, Film } from 'lucide-react';
import { YouTubeVideoItem, PlaybackMode } from '../types';

interface MiniFloatingPlayerProps {
  video: YouTubeVideoItem;
  playbackMode: PlaybackMode;
  onOpenDetail: () => void;
  onClose: () => void;
}

export const MiniFloatingPlayer: React.FC<MiniFloatingPlayerProps> = ({
  video,
  playbackMode,
  onOpenDetail,
  onClose
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const videoId = typeof video.id === 'string' ? video.id : video.id?.videoId || '';
  const title = video.snippet?.title || '動画を再生中';
  const channelTitle = video.snippet?.channelTitle || '';

  // Generate embed URL
  const embedUrl =
    playbackMode === 'education'
      ? `https://www.youtubeeducation.com/embed/${videoId}?autoplay=1&mute=0&controls=1&playsinline=1`
      : playbackMode === 'nocookie'
      ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=1&playsinline=1`
      : `/api/youtube/stream-mux/${videoId}`;

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
        {playbackMode.startsWith('stream-') && playbackMode !== 'stream-audio' ? (
          <video
            src={`/api/youtube/stream-mux/${videoId}`}
            autoPlay
            controls
            playsInline
            className="w-full h-full object-contain"
          />
        ) : playbackMode === 'stream-audio' ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-neutral-900 to-neutral-950">
            <Music className="w-8 h-8 text-teal-400 animate-bounce mb-2" />
            <p className="text-xs text-neutral-300 font-medium truncate max-w-full px-2">
              {channelTitle}
            </p>
            <audio
              src={`/api/youtube/stream-direct/${videoId}?type=audio`}
              autoPlay
              controls
              className="w-full max-w-[240px] mt-2 h-8"
            />
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={title}
            className="w-full h-full border-0 pointer-events-auto"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
      </div>

      {/* Mini Footer Notice */}
      <div className="bg-neutral-950 px-3 py-1.5 flex items-center justify-between text-[10px] text-neutral-400 border-t border-neutral-900">
        <span className="truncate">次の動画を選ぶまで再生中</span>
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
