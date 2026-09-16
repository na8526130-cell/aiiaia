import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, Globe, Loader2, AlertCircle, RefreshCw, GraduationCap } from 'lucide-react';
import { PlaybackMode } from '../types';

interface EducationPlayerProps {
  videoId: string;
  title?: string;
  playbackMode?: PlaybackMode;
  onTogglePlaybackMode?: (mode: PlaybackMode) => void;
  startTime?: number;
  className?: string;
  isShort?: boolean;
}

interface ModeTab {
  id: PlaybackMode;
  label: string;
  icon: React.ReactNode;
  badge: string;
  badgeColor: string;
}

const MODES: ModeTab[] = [
  {
    id: 'education',
    label: 'Edu 埋め込み',
    icon: <GraduationCap className="w-3.5 h-3.5" />,
    badge: 'Education',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  {
    id: 'stream-normal',
    label: '720p ストリーム',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: '標準画質',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  },
  {
    id: 'stream-high',
    label: '1080p 高画質',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: '高精細',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
  },
  {
    id: 'stream-360',
    label: '360p 低画質',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: '軽量',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  {
    id: 'stream-audio',
    label: '音声のみ',
    icon: <Music className="w-3.5 h-3.5" />,
    badge: 'オーディオ',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40'
  },
  {
    id: 'nocookie',
    label: 'NoCookie 埋め込み',
    icon: <Globe className="w-3.5 h-3.5" />,
    badge: '埋め込み',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  }
];

export const EducationPlayer: React.FC<EducationPlayerProps> = ({
  videoId,
  title,
  playbackMode = 'education',
  onTogglePlaybackMode,
  startTime = 0,
  className = '',
  isShort = false
}) => {
  // Normalize mode
  const currentMode: PlaybackMode =
    playbackMode === 'education' ||
    playbackMode === 'stream-high' ||
    playbackMode === 'stream-360' ||
    playbackMode === 'stream-audio' ||
    playbackMode === 'nocookie'
      ? playbackMode
      : 'education';

  const [activeMode, setActiveMode] = useState<PlaybackMode>(currentMode);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [eduParam, setEduParam] = useState<string>('');
  const [eduParamLoaded, setEduParamLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch YouTube Education parameters dynamically from Google Spreadsheet (しあTube / StreamType1 compatible)
  useEffect(() => {
    let isMounted = true;
    const fetchEduParam = async () => {
      try {
        const res = await fetch('/api/education-param');
        if (res.ok) {
          const data = await res.json();
          if (data.param && isMounted) {
            setEduParam(data.param);
            setEduParamLoaded(true);
            return;
          }
        }
      } catch {}

      // Fallback directly to Google Spreadsheet
      try {
        const res = await fetch('https://docs.google.com/spreadsheets/d/1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg/gviz/tq?tqx=out:json');
        const text = await res.text();
        const jsonStr = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
        const data = JSON.parse(jsonStr);
        let param = data.table?.rows?.[0]?.c?.[0]?.v || '';
        param = param.replace(/&amp;/g, '&').trim();
        if (param && isMounted) {
          if (!param.startsWith('?')) param = '?' + param;
          setEduParam(param);
          setEduParamLoaded(true);
          return;
        }
      } catch {}

      if (isMounted) {
        setEduParam('?autoplay=1&mute=0&controls=1&start=0&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1');
        setEduParamLoaded(true);
      }
    };

    fetchEduParam();
    return () => { isMounted = false; };
  }, []);

  // Sync prop changes
  useEffect(() => {
    setActiveMode(currentMode);
  }, [currentMode]);

  // Reset errors and start loading when videoId or activeMode changes
  useEffect(() => {
    setStreamError(null);
    setStreamLoading(true);
  }, [videoId, activeMode, retryKey]);

  const handleSelectMode = (mode: PlaybackMode) => {
    setActiveMode(mode);
    if (onTogglePlaybackMode) {
      onTogglePlaybackMode(mode);
    }
  };

  // Determine stream or embed URLs
  const qualityParam = activeMode === 'stream-high' ? '1080' : activeMode === 'stream-360' ? '360' : '720';
  const videoStreamSrc = `/api/youtube/stream-mux/${videoId}?quality=${qualityParam}${startTime ? `&start=${startTime}` : ''}&t=${retryKey}`;
  const audioStreamSrc = `/api/youtube/stream-audio/${videoId}?t=${retryKey}`;
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0${startTime ? `&start=${startTime}` : ''}`;
  
  // Format dynamic education embed with latest spreadsheet parameter
  let activeEduParam = eduParam || '?autoplay=1&mute=0&controls=1&start=0&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1';
  if (!activeEduParam.startsWith('?')) activeEduParam = '?' + activeEduParam;
  if (startTime > 0) {
    if (activeEduParam.includes('start=')) {
      activeEduParam = activeEduParam.replace(/start=\d+/, `start=${startTime}`);
    } else {
      activeEduParam += `&start=${startTime}`;
    }
  }
  const eduEmbedSrc = `https://www.youtubeeducation.com/embed/${videoId}${activeEduParam}`;
  const posterSrc = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div
      className={`relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col ${className}`}
      id={`player-container-${videoId}`}
    >
      {/* Top Mode Selector Bar */}
      <div className="bg-neutral-950/90 border-b border-neutral-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
          {MODES.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => handleSelectMode(mode.id)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
                id={`mode-btn-${mode.id}`}
              >
                {mode.icon}
                <span>{mode.label}</span>
                <span
                  className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] border ${mode.badgeColor}`}
                >
                  {mode.badge}
                </span>
              </button>
            );
          })}
        </div>
        {eduParamLoaded && (
          <div className="text-[10px] text-emerald-400 font-mono hidden md:flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Eduパラメータ同期済</span>
          </div>
        )}
      </div>

      {/* Media Player Area */}
      <div
        className={`relative w-full bg-black flex items-center justify-center ${
          isShort ? 'aspect-[9/16] max-h-[75vh]' : 'aspect-video max-h-[78vh]'
        }`}
      >
        {activeMode === 'education' || activeMode === 'nocookie' ? (
          // Education / NoCookie Embed Player
          <iframe
            key={`${activeMode}-${videoId}`}
            src={activeMode === 'education' ? eduEmbedSrc : embedSrc}
            title={title || (activeMode === 'education' ? 'YouTube Player for Education' : 'YouTube Video')}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            id={`${activeMode}-iframe-${videoId}`}
          />
        ) : activeMode === 'stream-audio' ? (
          // Audio-Only Stream Mode
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-neutral-900 to-neutral-950">
            <img
              src={posterSrc}
              alt={title || 'Audio Cover'}
              className="w-36 h-36 sm:w-48 sm:h-48 rounded-2xl object-cover shadow-2xl mb-6 ring-2 ring-neutral-800"
            />
            <h3 className="text-white font-bold text-sm sm:text-base max-w-md line-clamp-2 mb-4">
              {title || '音声ストリーム再生中'}
            </h3>
            <audio
              ref={audioRef}
              key={`audio-${videoId}-${retryKey}`}
              src={audioStreamSrc}
              controls
              autoPlay
              onCanPlay={() => setStreamLoading(false)}
              onError={() => {
                setStreamLoading(false);
                setStreamError('音声ストリームの読み込みに失敗しました');
              }}
              className="w-full max-w-md accent-teal-500"
              id={`audio-player-${videoId}`}
            />
            {streamLoading && !streamError && (
              <div className="flex items-center gap-2 mt-4 text-xs text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span>音声を読み込み中...</span>
              </div>
            )}
            {streamError && (
              <div className="flex items-center gap-3 mt-4 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 px-4 py-2 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{streamError}</span>
                <button
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="px-2 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded font-bold transition-colors cursor-pointer"
                >
                  再試行
                </button>
              </div>
            )}
          </div>
        ) : (
          // 720p / 1080p Muxed Video Stream Mode
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {streamLoading && !streamError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs gap-3 pointer-events-none text-white">
                <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                <p className="text-xs sm:text-sm font-medium text-neutral-300">
                  {activeMode === 'stream-high' ? '1080p' : activeMode === 'stream-360' ? '360p' : '720p'}{' '}
                  映像と音声を合体処理中...
                </p>
              </div>
            )}

            {streamError ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
                <AlertCircle className="w-10 h-10 text-rose-500" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-rose-400">
                    ストリーム再生エラー
                  </p>
                  <p className="text-xs text-neutral-400 max-w-sm">
                    {streamError}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setRetryKey((k) => k + 1)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>再試行</span>
                  </button>
                  <button
                    onClick={() => handleSelectMode('nocookie')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    NoCookie プレイヤーで再生
                  </button>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                key={`video-${videoId}-${activeMode}-${retryKey}`}
                src={videoStreamSrc}
                poster={posterSrc}
                controls
                autoPlay
                playsInline
                onCanPlay={() => setStreamLoading(false)}
                onError={() => {
                  setStreamLoading(false);
                  setStreamError(
                    `${activeMode === 'stream-high' ? '1080p' : activeMode === 'stream-360' ? '360p' : '720p'} ストリームの読み込みに失敗しました。`
                  );
                }}
                className={`w-full h-full bg-black ${isShort ? 'object-contain' : 'object-contain'}`}
                id={`video-player-${videoId}`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
