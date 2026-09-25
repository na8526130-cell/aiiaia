import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, Globe, Loader2, AlertCircle, RefreshCw, GraduationCap, PictureInPicture, Subtitles, Calendar, VolumeX } from 'lucide-react';
import { PlaybackMode } from '../types';
import { fetchStreamSourcesCoalesced, selectBestTrack, ag, yo, TrackItem } from '../utils/streamManager';
import { formatPremiereDateJST, formatWaitingCount } from '../utils/formatters';
import {
  fetchEducationStreamUrl,
  fetchSpreadsheetEducationConfig,
  injectEducationPlayerApi,
  USER_GESTURE_KEY
} from '../utils/educationPlayerManager';

interface EducationPlayerProps {
  videoId: string;
  title?: string;
  playbackMode?: PlaybackMode;
  onTogglePlaybackMode?: (mode: PlaybackMode) => void;
  startTime?: number;
  className?: string;
  isShort?: boolean;
  onEnded?: () => void;
  isUpcomingPremiere?: boolean;
  premiereDateStr?: string;
  waitingCount?: string | number;
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
    id: 'stream-high',
    label: '1080p 合体ストリーム',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: '1080p+音声合体',
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
    label: '音声ストリーム',
    icon: <Music className="w-3.5 h-3.5" />,
    badge: '音声のみ',
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
  isShort = false,
  onEnded,
  isUpcomingPremiere = false,
  premiereDateStr,
  waitingCount
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
  const [directStreamUrl, setDirectStreamUrl] = useState<string>('');
  const [subtitleBlobUrl, setSubtitleBlobUrl] = useState<string | null>(null);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<TrackItem | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<TrackItem | null>(null);

  // YouTube Education 4-Step Playback System State
  const [eduUrl, setEduUrl] = useState<string>('');
  const [eduLoading, setEduLoading] = useState<boolean>(true);
  const [eduError, setEduError] = useState<string | null>(null);
  const [showEduUnmutePrompt, setShowEduUnmutePrompt] = useState<boolean>(false);
  const eduIframeRef = useRef<HTMLIFrameElement>(null);
  const eduPlayerRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [pipActive, setPipActive] = useState(false);

  // Cleanup subtitle Blob URL on unmount
  useEffect(() => {
    return () => {
      if (subtitleBlobUrl) {
        yo(subtitleBlobUrl);
      }
    };
  }, [subtitleBlobUrl]);

  // YouTube IFrame postMessage listener for ended state (fallback)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data && data.event === 'onStateChange' && data.info === 0) {
          onEnded?.();
        }
      } catch {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEnded]);

  // Time seeking when startTime updates (Transcript click)
  useEffect(() => {
    if (startTime > 0) {
      if (eduPlayerRef.current) {
        try {
          eduPlayerRef.current.seekTo(startTime, true);
          eduPlayerRef.current.playVideo();
        } catch {}
      }
      if (videoRef.current) {
        videoRef.current.currentTime = startTime;
        videoRef.current.play().catch(() => {});
      }
      if (audioRef.current) {
        audioRef.current.currentTime = startTime;
        audioRef.current.play().catch(() => {});
      }
    }
  }, [startTime]);

  // Picture-in-Picture Handler
  const handleTogglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
        return;
      }

      if (videoRef.current && document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
        setPipActive(true);
        return;
      }

      // If currently on iframe embed, switch to stream-normal for PiP capability
      if (activeMode === 'education' || activeMode === 'nocookie') {
        handleSelectMode('stream-normal');
        setTimeout(async () => {
          if (videoRef.current) {
            try {
              await videoRef.current.requestPictureInPicture();
              setPipActive(true);
            } catch (e) {
              console.warn('PiP launch error:', e);
            }
          }
        }, 1200);
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  // Step 1 ~ 5: YouTube Education 4-Step Dynamic Playback System
  useEffect(() => {
    if (activeMode !== 'education') {
      if (eduPlayerRef.current) {
        try {
          eduPlayerRef.current.destroy();
        } catch {}
        eduPlayerRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    setEduLoading(true);
    setEduError(null);
    setShowEduUnmutePrompt(false);

    const initEduSystem = async () => {
      try {
        // Step 1: バックエンドAPIからYouTube Education用URLを取得 (/api/stream/youtubeeducation/{videoId}?origin=siatube)
        const rawUrl = await fetchEducationStreamUrl(videoId);
        if (isCancelled) return;

        // Step 2: Googleスプレッドシートから動的スクリプト・設定を取得 (A1: 追加パラメータ, A2: Player APIコード)
        const config = await fetchSpreadsheetEducationConfig();
        if (isCancelled) return;

        setEduParam(config.parameterText);
        setEduParamLoaded(true);

        let finalUrl = rawUrl;
        if (startTime > 0) {
          if (finalUrl.includes('start=')) {
            finalUrl = finalUrl.replace(/start=\d+/, `start=${startTime}`);
          } else {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `start=${startTime}`;
          }
        }

        setEduUrl(finalUrl);
        setEduLoading(false);

        // Step 3: IFrame Player APIスクリプトの動的注入 (<script id="youtube-education-widget-api">)
        const YT = await injectEducationPlayerApi(config.widgetApiSource);
        if (isCancelled) return;

        // Step 4: iframe要素がマウントされるのを待機して YT.Player をバインド
        // Short timeout allows React to commit the iframe ref into the DOM
        setTimeout(() => {
          if (isCancelled || !eduIframeRef.current) return;

          if (eduPlayerRef.current) {
            try {
              eduPlayerRef.current.destroy();
            } catch {}
            eduPlayerRef.current = null;
          }

          try {
            const player = new YT.Player(eduIframeRef.current, {
              events: {
                onReady: (event: any) => {
                  if (isCancelled) return;
                  eduPlayerRef.current = event.target;

                  // ユーザー操作履歴に応じてミュート解除、または自動再生を開始
                  const hasUserGesture = typeof localStorage !== 'undefined' && localStorage.getItem(USER_GESTURE_KEY) === '1';
                  try {
                    if (hasUserGesture) {
                      event.target.unMute();
                      event.target.playVideo();
                      setShowEduUnmutePrompt(false);
                    } else {
                      event.target.mute();
                      event.target.playVideo();
                      setShowEduUnmutePrompt(true);
                    }
                  } catch (e) {
                    console.warn('[EducationPlayer] Autoplay call error:', e);
                  }
                },
                onStateChange: (event: any) => {
                  if (isCancelled) return;
                  // 1 = PLAYING, 5 = CUED, 0 = ENDED
                  if (event.data === 1) {
                    try {
                      if (event.target.isMuted && !event.target.isMuted()) {
                        setShowEduUnmutePrompt(false);
                      }
                    } catch {}
                  } else if (event.data === 5) {
                    try {
                      event.target.playVideo();
                    } catch {}
                  } else if (event.data === 0) {
                    // 動画終了時に次の動画の自動再生を呼び出す
                    onEnded?.();
                  }
                },
                onError: (event: any) => {
                  console.warn('YouTube Education Player API error:', event.data);
                }
              }
            });

            eduPlayerRef.current = player;
          } catch (bindErr) {
            console.warn('[EducationPlayer] Error creating YT.Player instance:', bindErr);
          }
        }, 100);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[EducationPlayer] Initialization failed:', err);
          setEduError(err.message || 'YouTube Education再生の初期化に失敗しました');
          setEduLoading(false);
        }
      }
    };

    initEduSystem();

    return () => {
      isCancelled = true;
      if (eduPlayerRef.current) {
        try {
          eduPlayerRef.current.destroy();
        } catch {}
        eduPlayerRef.current = null;
      }
    };
  }, [videoId, activeMode, retryKey]);

  // Unmute button handler
  const handleUnmuteEduClick = () => {
    try {
      localStorage.setItem(USER_GESTURE_KEY, '1');
      if (eduPlayerRef.current) {
        eduPlayerRef.current.unMute();
        eduPlayerRef.current.playVideo();
      }
      setShowEduUnmutePrompt(false);
    } catch (e) {
      console.warn('Unmute error:', e);
    }
  };

  // Sync prop changes
  useEffect(() => {
    setActiveMode(currentMode);
  }, [currentMode]);

  // Reset errors and fetch direct Google Video stream from Invidious
  useEffect(() => {
    setStreamError(null);
    setStreamLoading(true);
    setDirectStreamUrl('');

    if (activeMode.startsWith('stream-')) {
      let isMounted = true;
      const quality = activeMode === 'stream-high' ? '1080' : activeMode === 'stream-360' ? '360' : '720';

      // Use request coalescing (_r Map) & 5-min cache (Bu)
      fetchStreamSourcesCoalesced(videoId)
        .then(async (data) => {
          if (!isMounted || !data.streams) return;

          // Vo Track scoring for audio and subtitles
          if (data.audioTracks && data.audioTracks.length > 0) {
            const bestAudio = selectBestTrack(data.audioTracks, 'ja');
            setSelectedAudioTrack(bestAudio);
          }

          if (data.subtitleTracks && data.subtitleTracks.length > 0) {
            const bestSub = selectBestTrack(data.subtitleTracks, 'ja');
            if (bestSub) {
              setSelectedSubtitleTrack(bestSub);
              // ag: Convert VTT to Blob URL
              try {
                const bUrl = await ag(bestSub.url);
                if (isMounted) {
                  setSubtitleBlobUrl((prev) => {
                    if (prev) yo(prev); // yo: Free previous blob memory
                    return bUrl;
                  });
                } else {
                  yo(bUrl);
                }
              } catch (e) {
                console.warn('Subtitle blob generation error:', e);
              }
            }
          }

          const streamObj = data.streams;
          let streamUrl = '';
          if (activeMode === 'stream-audio') {
            streamUrl = streamObj.audio || streamObj.directAudio || `/api/youtube/stream-direct/${videoId}?quality=audio`;
          } else if (quality === '1080') {
            // For 1080p, YouTube only provides video-only streams (adaptive).
            // Direct playback of raw video-only stream has no audio, so we explicitly route through stream-mux
            // which downloads 1080p video + audio separately and combines them with ffmpeg.
            streamUrl = `/api/youtube/stream-mux/${videoId}?quality=1080`;
          } else if (quality === '360') {
            streamUrl = streamObj.combined360 || streamObj.v360 || streamObj.invidious360 || streamObj.direct360 || '';
          } else {
            streamUrl = streamObj.combined720 || streamObj.v720 || streamObj.invidious720 || streamObj.direct720 || '';
          }
          if (streamUrl) {
            setDirectStreamUrl(streamUrl);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setStreamLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [videoId, activeMode, retryKey]);

  const handleSelectMode = (mode: PlaybackMode) => {
    setActiveMode(mode);
    if (onTogglePlaybackMode) {
      onTogglePlaybackMode(mode);
    }
  };

  // Determine stream or embed URLs (uses Invidious Google Video direct streaming)
  const qualityParam = activeMode === 'stream-high' ? '1080' : activeMode === 'stream-360' ? '360' : '720';
  const videoStreamSrc =
    activeMode === 'stream-high'
      ? `/api/youtube/stream-mux/${videoId}?quality=1080${startTime ? `&start=${startTime}` : ''}&t=${retryKey}`
      : directStreamUrl || `/api/youtube/stream-direct/${videoId}?quality=${qualityParam}${startTime ? `&start=${startTime}` : ''}&t=${retryKey}`;
  const audioStreamSrc = `/api/youtube/stream-direct/${videoId}?quality=audio&t=${retryKey}`;
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

        <div className="flex items-center gap-2">
          {/* PiP (Picture in Picture) Button */}
          <button
            onClick={handleTogglePiP}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              pipActive
                ? 'bg-rose-600 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
            title="ブラウザ小窓（ピクチャー・イン・ピクチャー）で再生"
            id="pip-toggle-btn"
          >
            <PictureInPicture className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">PiP 小窓再生</span>
            <span className="sm:hidden">PiP</span>
          </button>

          {eduParamLoaded && (
            <div className="text-[10px] text-emerald-400 font-mono hidden md:flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Eduパラメータ同期済</span>
            </div>
          )}
        </div>
      </div>

      {/* Media Player Area */}
      <div
        className={`relative w-full bg-black flex items-center justify-center ${
          isShort ? 'aspect-[9/16] max-h-[75vh]' : 'aspect-video max-h-[78vh]'
        }`}
      >
        {activeMode === 'education' ? (
          // YouTube Education 4-Step Embed Player with window.YT.Player control
          <div className="relative w-full h-full">
            {eduUrl ? (
              <iframe
                ref={eduIframeRef}
                key={`edu-${videoId}-${retryKey}`}
                src={eduUrl}
                title={title || 'YouTube Player for Education'}
                className="w-full h-full border-0"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                id={`education-iframe-${videoId}`}
              />
            ) : null}

            {/* Unmute Prompt Banner if auto-played muted per browser policy */}
            {showEduUnmutePrompt && (
              <button
                onClick={handleUnmuteEduClick}
                className="absolute top-4 left-4 z-30 px-3.5 py-2 rounded-xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-neutral-700/80 shadow-2xl flex items-center gap-2 font-bold text-xs cursor-pointer backdrop-blur-md transition-all hover:scale-105"
                title="音声を有効にする"
                id="edu-unmute-banner-btn"
              >
                <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>ミュートを解除する</span>
              </button>
            )}

            {eduLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm text-white space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs font-bold text-neutral-200">YouTube Education プレイヤー準備中...</span>
              </div>
            )}

            {eduError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-neutral-950 text-white text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <p className="text-sm text-rose-300 font-bold">{eduError}</p>
                <button
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-bold border border-neutral-700 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>再試行</span>
                </button>
              </div>
            )}
          </div>
        ) : activeMode === 'nocookie' ? (
          // NoCookie Embed Player
          <iframe
            key={`nocookie-${videoId}`}
            src={embedSrc}
            title={title || 'YouTube Video'}
            className="w-full h-full border-0"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            id={`nocookie-iframe-${videoId}`}
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
              onEnded={onEnded}
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
        ) : isUpcomingPremiere ? (
          // Scheduled Premiere Standby Mode (Never treat as error!)
          <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-neutral-950 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
              <Calendar className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <span className="inline-block px-3 py-1 bg-amber-500 text-black font-black text-xs rounded-full uppercase tracking-wider">
                プレミア公開を待っています
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white pt-1">
                公開予定: {formatPremiereDateJST(premiereDateStr)}
              </h3>
              <p className="text-xs sm:text-sm text-amber-400 font-semibold">
                {formatWaitingCount(waitingCount)}
              </p>
              <p className="text-xs text-neutral-400 pt-1 leading-relaxed">
                この動画はプレミア公開前のため、ストリームはまだ配信されていません。公式の待機所画面（カウントダウンタイマー）で待機するには下のボタンを押してください。
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => handleSelectMode('education')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Edu プレイヤーで待機（カウントダウン表示）</span>
              </button>
              <button
                onClick={() => handleSelectMode('nocookie')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>NoCookie で待機</span>
              </button>
            </div>
          </div>
        ) : (
          // 1080p Muxed Video Stream Mode / 360p Stream Mode
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {streamLoading && !streamError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs gap-3 pointer-events-none text-white text-center px-4">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <p className="text-xs sm:text-sm font-medium text-neutral-200">
                  {activeMode === 'stream-high'
                    ? '1080p映像と音声を別々に取得して合体中... (数秒お待ちください)'
                    : activeMode === 'stream-360'
                    ? '360p ストリームを読み込み中...'
                    : '映像と音声を合体処理中...'}
                </p>
                {activeMode === 'stream-high' && (
                  <p className="text-[11px] text-neutral-400">
                    高画質1080p映像と最高音質音声をサーバー側で直接同期結合しています
                  </p>
                )}
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
                    onClick={() => handleSelectMode('education')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Edu 埋め込みで再生
                  </button>
                  <button
                    onClick={() => handleSelectMode('nocookie')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    NoCookie で再生
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
                onEnded={onEnded}
                onCanPlay={() => setStreamLoading(false)}
                onError={() => {
                  setStreamLoading(false);
                  setStreamError(
                    `${activeMode === 'stream-high' ? '1080p 合体' : '360p'} ストリームの読み込みに失敗しました。`
                  );
                }}
                className={`w-full h-full bg-black ${isShort ? 'object-contain' : 'object-contain'}`}
                id={`video-player-${videoId}`}
              >
                {subtitleBlobUrl && selectedSubtitleTrack && (
                  <track
                    key={subtitleBlobUrl}
                    kind={selectedSubtitleTrack.kind || 'subtitles'}
                    src={subtitleBlobUrl}
                    srcLang={selectedSubtitleTrack.lang || 'ja'}
                    label={selectedSubtitleTrack.label || '字幕'}
                    default={selectedSubtitleTrack.isDefault ?? true}
                  />
                )}
              </video>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
