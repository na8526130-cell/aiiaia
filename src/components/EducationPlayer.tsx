import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, Globe, Loader2, AlertCircle, RefreshCw, GraduationCap, PictureInPicture, Subtitles, Calendar, Volume2, VolumeX, Gauge, Repeat, PlayCircle, Activity, Check, Terminal, Download, X, Copy } from 'lucide-react';
import { PlaybackMode } from '../types';
import {
  fetchStreamSourcesCoalesced,
  getCachedStreamSources,
  prefetchStreamSources,
  fetchStreamStatus,
  estimateStreamWaitMs,
  clearClientStreamCache,
  selectBestTrack,
  ag,
  yo,
  TrackItem,
  StreamSourcesResult,
  KaitoStreamStatus,
  KaitoDownloadGroups
} from '../utils/streamManager';
import { isGasEnvironment } from '../utils/gasSyncManager';
import { formatPremiereDateJST, formatWaitingCount } from '../utils/formatters';
import {
  fetchEducationStreamUrl,
  fetchSpreadsheetEducationConfig,
  injectEducationPlayerApi,
  createYoutubeEducationEmbedUrl,
  USER_GESTURE_KEY
} from '../utils/educationPlayerManager';
import {
  attachDualMediaSync,
  isSafariBrowser,
  SyncPlaybackController,
  SyncStateSnapshot
} from '../utils/syncPlayback';
import {
  saveDefaultPlaybackMode,
  playbackModeToStreamType
} from '../utils/streamTypeCookie';

const PLAYBACK_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];

interface EducationPlayerProps {
  videoId: string;
  title?: string;
  playbackMode?: PlaybackMode;
  onTogglePlaybackMode?: (mode: PlaybackMode) => void;
  startTime?: number;
  seekTrigger?: number;
  className?: string;
  isShort?: boolean;
  onEnded?: () => void;
  onStreamReady?: (videoId: string) => void;
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
    badge: '通常 (Type1)',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  {
    id: 'stream-sync',
    label: 'タイプ2 (1080p+音声同期)',
    icon: <Activity className="w-3.5 h-3.5" />,
    badge: 'omada 1080p+音',
    badgeColor: 'bg-red-600/25 text-red-200 border-red-500/50'
  },
  {
    id: 'stream-high',
    label: '1080p 高画質ストリーム',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: '1080p+高音質',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  {
    id: 'stream-360',
    label: '360p Google Video',
    icon: <Film className="w-3.5 h-3.5" />,
    badge: 'omada 360p',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  {
    id: 'stream-audio',
    label: '高音質 音声ストリーム',
    icon: <Music className="w-3.5 h-3.5" />,
    badge: 'AAC 音声のみ',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  {
    id: 'stream-ytdlp',
    label: 'yt-dlp ストリーム',
    icon: <Terminal className="w-3.5 h-3.5" />,
    badge: 'yt-dlp抽出',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  {
    id: 'nocookie',
    label: 'NoCookie 埋め込み',
    icon: <Globe className="w-3.5 h-3.5" />,
    badge: '埋め込み',
    badgeColor: 'bg-neutral-800 text-neutral-300 border-neutral-700'
  }
];

export const EducationPlayer: React.FC<EducationPlayerProps> = ({
  videoId,
  title,
  playbackMode = 'education',
  onTogglePlaybackMode,
  startTime = 0,
  seekTrigger = 0,
  className = '',
  isShort = false,
  onEnded,
  onStreamReady,
  isUpcomingPremiere = false,
  premiereDateStr,
  waitingCount
}) => {
  // Normalize mode
  const currentMode: PlaybackMode =
    playbackMode === 'stream-normal'
      ? 'stream-sync'
      : (playbackMode as string) === 'stream-low'
      ? 'stream-360'
      : playbackMode === 'education' ||
        playbackMode === 'stream-sync' ||
        playbackMode === 'stream-high' ||
        playbackMode === 'stream-ytdlp' ||
        playbackMode === 'stream-360' ||
        playbackMode === 'stream-audio' ||
        playbackMode === 'nocookie'
      ? playbackMode
      : 'education';

  const [activeMode, setActiveMode] = useState<PlaybackMode>(currentMode);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamRetryCount, setStreamRetryCount] = useState(0);
  const [streamStatusText, setStreamStatusText] = useState<string>('');
  const retryTimeoutRef = useRef<any>(null);
  const streamStartTimeRef = useRef<number>(Date.now());
  const [retryKey, setRetryKey] = useState(0);
  const [eduParam, setEduParam] = useState<string>('');
  const [eduParamLoaded, setEduParamLoaded] = useState(false);
  const [directStreamUrl, setDirectStreamUrl] = useState<string>('');
  const [resolvedStreams, setResolvedStreams] = useState<StreamSourcesResult['streams'] | null>(null);
  const [streamsReady, setStreamsReady] = useState<boolean>(false);
  const [subtitleBlobUrl, setSubtitleBlobUrl] = useState<string | null>(null);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<TrackItem | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<TrackItem | null>(null);
  const [audioFallbackIndex, setAudioFallbackIndex] = useState<number>(0);

  // Server Queue Status
  const [serverQueueStatus, setServerQueueStatus] = useState<KaitoStreamStatus | null>(null);
  const [serverQueueError, setServerQueueError] = useState<boolean>(false);
  const [statusFetchedAt, setStatusFetchedAt] = useState<number>(0);
  const [statusNowTick, setStatusNowTick] = useState<number>(Date.now());

  // StreamType3 Download Modal State
  const [downloadModalOpen, setDownloadModalOpen] = useState<boolean>(false);
  const [downloadGroups, setDownloadGroups] = useState<KaitoDownloadGroups | null>(null);
  const [copiedM3u8Url, setCopiedM3u8Url] = useState<string>('');

  // Volume & Mute state for guaranteed sound on 1080p dual-sync & all stream modes
  const [playerVolume, setPlayerVolume] = useState<number>(() => {
    try {
      const saved = parseFloat(localStorage.getItem('kaito_player_volume') || '1');
      if (!Number.isNaN(saved) && saved >= 0 && saved <= 1) return saved;
    } catch {}
    return 1;
  });
  const [playerMuted, setPlayerMuted] = useState<boolean>(false);

  // Type 2 (<video> + <audio> 2-element real-time rAF sync) states
  const syncAudioRef = useRef<HTMLAudioElement>(null);
  const syncControllerRef = useRef<SyncPlaybackController | null>(null);
  const [syncQuality, setSyncQuality] = useState<'1080' | '720' | '360'>('1080');
  const [looseSync, setLooseSync] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kaito_loose_sync');
      if (saved !== null) return saved === '1';
    } catch {}
    return isSafariBrowser();
  });
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStateSnapshot>({
    diffMs: 0,
    diffText: '0 ms',
    looseSync: isSafariBrowser(),
    isSafari: isSafariBrowser(),
    audioRate: 1,
    videoRate: 1,
    synced: true
  });

  // Playback Speed Selector (0.25x ~ 4x)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    try {
      const saved = parseFloat(localStorage.getItem('kaito_playback_speed') || '1');
      if (PLAYBACK_SPEED_OPTIONS.includes(saved)) return saved;
    } catch {}
    return 1;
  });

  // Persistent Bottom Bar: Repeat ("繰り返し") & Autoplay ("自動再生") with exclusive lock
  const [repeatEnabled, setRepeatEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kaito_player_repeat') === '1';
    } catch {
      return false;
    }
  });
  const [autoplayNextEnabled, setAutoplayNextEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kaito_player_autoplay');
      if (saved !== null) return saved === '1' || saved === 'true';
      return true;
    } catch {
      return true;
    }
  });
  const [savedCookieFeedback, setSavedCookieFeedback] = useState<boolean>(false);

  // YouTube Education 4-Step Playback System State
  const [eduUrl, setEduUrl] = useState<string>('');
  const [eduLoading, setEduLoading] = useState<boolean>(true);
  const [eduError, setEduError] = useState<string | null>(null);
  const [showEduUnmutePrompt, setShowEduUnmutePrompt] = useState<boolean>(false);
  const eduIframeRef = useRef<HTMLIFrameElement>(null);
  const nocookieIframeRef = useRef<HTMLIFrameElement>(null);
  const eduPlayerRef = useRef<any>(null);
  const eduAutoplayTimersRef = useRef<number[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [pipActive, setPipActive] = useState(false);

  // Keep latest onEnded callback and repeat/autoplay flags in ref so async callbacks never use stale values
  const onEndedRef = useRef(onEnded);
  const repeatEnabledRef = useRef(repeatEnabled);
  const autoplayNextEnabledRef = useRef(autoplayNextEnabled);
  const activeModeRef = useRef(activeMode);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    repeatEnabledRef.current = repeatEnabled;
  }, [repeatEnabled]);
  useEffect(() => {
    autoplayNextEnabledRef.current = autoplayNextEnabled;
  }, [autoplayNextEnabled]);
  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  const hasEndedRef = useRef(false);
  useEffect(() => {
    hasEndedRef.current = false;
  }, [videoId, activeMode, retryKey, seekTrigger]);

  // Listen for external autoplay toggle events
  useEffect(() => {
    const onAutoplayEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setAutoplayNextEnabled(detail.enabled);
      }
    };
    window.addEventListener('kaito-autoplay-changed', onAutoplayEvent);
    return () => window.removeEventListener('kaito-autoplay-changed', onAutoplayEvent);
  }, []);

  const clearEduAutoplayTimers = () => {
    eduAutoplayTimersRef.current.forEach((id) => window.clearTimeout(id));
    eduAutoplayTimersRef.current = [];
  };

  const triggerEndedOnce = () => {
    const modeNow = activeModeRef.current;
    // 1. If "繰り返し" (Repeat) is ON -> loop current video from 0s (and never advance to next video)
    if (repeatEnabledRef.current) {
      hasEndedRef.current = false;
      if (modeNow === 'education' || modeNow === 'nocookie') {
        const targetIframe = modeNow === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
        if (eduPlayerRef.current && modeNow === 'education') {
          try {
            if (typeof eduPlayerRef.current.seekTo === 'function') {
              eduPlayerRef.current.seekTo(0, true);
            }
            if (typeof eduPlayerRef.current.playVideo === 'function') {
              eduPlayerRef.current.playVideo();
            }
            return;
          } catch {}
        }
        postIframeMessage(targetIframe, { event: 'command', func: 'seekTo', args: [0, true], id: 1, channel: 'widget' });
        postIframeMessage(targetIframe, { event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' });
        return;
      }
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = 0;
          if (syncAudioRef.current) {
            syncAudioRef.current.currentTime = 0;
            syncAudioRef.current.play().catch(() => {});
          }
          videoRef.current.play().catch(() => {});
          return;
        } catch {}
      }
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
          return;
        } catch {}
      }
      return;
    }

    // 2. If "自動再生" (Autoplay) is OFF -> stop at end without advancing
    if (!autoplayNextEnabledRef.current) {
      return;
    }

    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    onEndedRef.current?.();
  };

  // Send direct postMessage commands to YouTube / YouTube Education iframe
  const postIframeMessage = (iframe: HTMLIFrameElement | null, payload: Record<string, any>) => {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
    } catch {}
  };

  const attachIframeBridgeAndPlay = (iframe: HTMLIFrameElement | null) => {
    if (!iframe || !iframe.contentWindow) return;
    const targetSec = Math.max(0, Math.floor(startTime));
    const sendHandshakeAndPlay = () => {
      postIframeMessage(iframe, { event: 'listening', id: 1, channel: 'widget' });
      postIframeMessage(iframe, {
        event: 'command',
        func: 'addEventListener',
        args: ['onStateChange'],
        id: 1,
        channel: 'widget'
      });
      postIframeMessage(iframe, {
        event: 'command',
        func: 'addEventListener',
        args: ['onReady'],
        id: 1,
        channel: 'widget'
      });
      if (targetSec > 0) {
        postIframeMessage(iframe, {
          event: 'command',
          func: 'seekTo',
          args: [targetSec, true],
          id: 1,
          channel: 'widget'
        });
      }
      postIframeMessage(iframe, {
        event: 'command',
        func: 'playVideo',
        args: [],
        id: 1,
        channel: 'widget'
      });
    };

    sendHandshakeAndPlay();
    setTimeout(sendHandshakeAndPlay, 120);
    setTimeout(sendHandshakeAndPlay, 400);
    setTimeout(sendHandshakeAndPlay, 1000);
  };

  // Cleanup subtitle Blob URL on unmount
  useEffect(() => {
    return () => {
      clearEduAutoplayTimers();
      if (subtitleBlobUrl) {
        yo(subtitleBlobUrl);
      }
    };
  }, [subtitleBlobUrl]);

  // Periodic listening heartbeat + progress check for active embed iframes so state changes (ended=0) are never missed
  useEffect(() => {
    if (activeMode !== 'education' && activeMode !== 'nocookie') return;
    const interval = window.setInterval(() => {
      const targetIframe = activeMode === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
      if (targetIframe && targetIframe.contentWindow) {
        postIframeMessage(targetIframe, { event: 'listening', id: 1, channel: 'widget' });
      }
      if (activeMode === 'education' && eduPlayerRef.current) {
        try {
          if (typeof eduPlayerRef.current.getPlayerState === 'function') {
            const st = eduPlayerRef.current.getPlayerState();
            if (st === 0) {
              triggerEndedOnce();
              return;
            }
          }
          if (
            typeof eduPlayerRef.current.getCurrentTime === 'function' &&
            typeof eduPlayerRef.current.getDuration === 'function'
          ) {
            const cur = Number(eduPlayerRef.current.getCurrentTime());
            const dur = Number(eduPlayerRef.current.getDuration());
            if (dur > 1 && cur >= dur - 0.35) {
              triggerEndedOnce();
            }
          }
        } catch {}
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeMode, videoId, eduUrl]);

  // YouTube IFrame postMessage listener for autoplay & ended state (works for both Education and NoCookie)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data) return;

        // 1. Direct onStateChange event (0 = ENDED, 1 = PLAYING, 5 = CUED)
        if (data.event === 'onStateChange') {
          if (data.info === 0) {
            triggerEndedOnce();
          } else if (data.info === 5) {
            const targetIframe = activeMode === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
            postIframeMessage(targetIframe, { event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' });
          } else if (data.info === 1) {
            hasEndedRef.current = false;
          }
        }

        // 2. infoDelivery event from YouTube embed widget
        if (data.event === 'infoDelivery' && data.info) {
          if (data.info.playerState === 0) {
            triggerEndedOnce();
          } else if (data.info.playerState === 1) {
            hasEndedRef.current = false;
          } else if (data.info.playerState === 5) {
            const targetIframe = activeMode === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
            postIframeMessage(targetIframe, { event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' });
          }
          // Check currentTime vs duration in infoDelivery in case playerState=0 is skipped
          if (
            typeof data.info.currentTime === 'number' &&
            typeof data.info.duration === 'number' &&
            data.info.duration > 1 &&
            data.info.currentTime >= data.info.duration - 0.35 &&
            data.info.playerState !== 1
          ) {
            triggerEndedOnce();
          }
        }

        // 3. onReady / initialDelivery -> ensure video starts playing immediately
        if (data.event === 'onReady' || data.event === 'initialDelivery') {
          const targetIframe = activeMode === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
          postIframeMessage(targetIframe, { event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' });
        }
      } catch {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeMode, videoId]);

  // Time seeking for direct <video> / <audio> streams when startTime or seekTrigger updates
  useEffect(() => {
    if (startTime > 0 || seekTrigger > 0) {
      const targetSec = Math.max(0, Math.floor(startTime));
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = targetSec;
          videoRef.current.play().catch(() => {});
        } catch {}
      }
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = targetSec;
          audioRef.current.play().catch(() => {});
        } catch {}
      }
    }
  }, [startTime, seekTrigger]);

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

  // Step 1 ~ 5: YouTube Education 4-Step Dynamic Playback System (reloads URL on timestamp jump)
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
        // Step 1: バックエンドAPIからYouTube Education用URLを取得 (/api/stream/youtubeeducation/{videoId})
        const rawUrl = await fetchEducationStreamUrl(videoId);
        if (isCancelled) return;

        // Step 2: Googleスプレッドシートから動的スクリプト・設定を取得 (A1: 追加パラメータ, A2: Player APIコード)
        const config = await fetchSpreadsheetEducationConfig();
        if (isCancelled) return;

        setEduParam(config.parameterText);
        setEduParamLoaded(true);

        const targetSec = Math.max(0, Math.floor(startTime));
        // Build normalized YouTube Education embed URL with widgetid=1, origin, and forigin
        // so YT.Player and postMessage widget bridge always receive onReady & onStateChange(0)
        const finalUrl = createYoutubeEducationEmbedUrl(videoId, config.parameterText, {
          autoplay: true,
          start: targetSec,
          origin: typeof window !== 'undefined' ? window.location.origin : ''
        });

        setEduUrl(finalUrl);
        setEduLoading(false);

        // Step 3: IFrame Player APIスクリプトの動的注入 (<script id="youtube-education-widget-api">)
        const YT = await injectEducationPlayerApi(config.widgetApiSource);
        if (isCancelled) return;

        // Step 4: iframe要素がマウントされるのを待機して YT.Player をバインド + 段階的リトライ (0ms, 120ms, 400ms, 1000ms)
        const scheduleEduAutoplay = () => {
          clearEduAutoplayTimers();
          [0, 120, 400, 1000].forEach((delay) => {
            const tid = window.setTimeout(() => {
              if (isCancelled) return;
              if (eduPlayerRef.current && typeof eduPlayerRef.current.playVideo === 'function') {
                try {
                  eduPlayerRef.current.playVideo();
                } catch {}
              }
              if (eduIframeRef.current) {
                postIframeMessage(eduIframeRef.current, {
                  event: 'listening',
                  id: 1,
                  channel: 'widget'
                });
                postIframeMessage(eduIframeRef.current, {
                  event: 'command',
                  func: 'playVideo',
                  args: [],
                  id: 1,
                  channel: 'widget'
                });
              }
            }, delay);
            eduAutoplayTimersRef.current.push(tid);
          });
        };

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

                  try {
                    if (targetSec > 0) {
                      try {
                        event.target.seekTo(targetSec, true);
                      } catch {}
                    }
                    event.target.unMute();
                    event.target.playVideo();
                    scheduleEduAutoplay();
                    setShowEduUnmutePrompt(false);

                    // Fallback: if browser blocks unmuted autoplay, retry muted after 600ms
                    setTimeout(() => {
                      if (isCancelled || !eduPlayerRef.current) return;
                      try {
                        const state =
                          typeof event.target.getPlayerState === 'function'
                            ? event.target.getPlayerState()
                            : 1;
                        // state !== 1 (PLAYING) and state !== 3 (BUFFERING)
                        if (state !== 1 && state !== 3 && state !== 0) {
                          event.target.mute();
                          event.target.playVideo();
                          setShowEduUnmutePrompt(true);
                        }
                      } catch {}
                    }, 600);
                  } catch (e) {
                    console.warn('[EducationPlayer] Autoplay call error:', e);
                  }
                },
                onStateChange: (event: any) => {
                  if (isCancelled) return;
                  // 1 = PLAYING, 5 = CUED, 0 = ENDED
                  if (event.data === 1) {
                    clearEduAutoplayTimers();
                    hasEndedRef.current = false;
                    try {
                      if (event.target.isMuted && !event.target.isMuted()) {
                        setShowEduUnmutePrompt(false);
                      }
                    } catch {}
                  } else if (event.data === 5 || event.data === -1) {
                    try {
                      event.target.playVideo();
                    } catch {}
                  } else if (event.data === 0) {
                    // 動画終了時に次の動画の自動再生またはループを呼び出す
                    triggerEndedOnce();
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
  }, [videoId, activeMode, retryKey, startTime, seekTrigger]);

  // Unmute button handler
  const handleUnmuteEduClick = () => {
    try {
      localStorage.setItem(USER_GESTURE_KEY, '1');
      setPlayerMuted(false);
      if (playerVolume === 0) {
        setPlayerVolume(1);
      }
      if (syncControllerRef.current) {
        syncControllerRef.current.setMuted(false);
        syncControllerRef.current.setVolume(playerVolume > 0 ? playerVolume : 1);
      }
      if (eduPlayerRef.current) {
        eduPlayerRef.current.unMute();
        eduPlayerRef.current.playVideo();
      } else if (eduIframeRef.current?.contentWindow) {
        eduIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
          '*'
        );
        eduIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          '*'
        );
      }
      if (syncAudioRef.current) {
        syncAudioRef.current.muted = false;
        syncAudioRef.current.volume = playerVolume > 0 ? playerVolume : 1;
        syncAudioRef.current.play().catch(() => {});
      }
      if (videoRef.current) {
        if (!useDualAudioSync) {
          videoRef.current.muted = false;
          videoRef.current.volume = playerVolume > 0 ? playerVolume : 1;
        }
        videoRef.current.play().catch(() => {});
      }
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = playerVolume > 0 ? playerVolume : 1;
        audioRef.current.play().catch(() => {});
      }
      setShowEduUnmutePrompt(false);
    } catch (e) {
      console.warn('Unmute error:', e);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !playerMuted;
    setPlayerMuted(nextMuted);
    if (!nextMuted) {
      setShowEduUnmutePrompt(false);
    }
    if (syncControllerRef.current) {
      syncControllerRef.current.setMuted(nextMuted);
    }
    if (syncAudioRef.current) {
      syncAudioRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current && !videoRef.current.paused) {
        syncAudioRef.current.play().catch(() => {});
      }
    }
    if (videoRef.current && !useDualAudioSync) {
      videoRef.current.muted = nextMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.min(1, Math.max(0, newVol));
    setPlayerVolume(clamped);
    const nextMuted = clamped === 0;
    setPlayerMuted(nextMuted);
    if (!nextMuted) {
      setShowEduUnmutePrompt(false);
    }
    try {
      localStorage.setItem('kaito_player_volume', String(clamped));
    } catch {}
    if (syncControllerRef.current) {
      syncControllerRef.current.setVolume(clamped);
      syncControllerRef.current.setMuted(nextMuted);
    }
    if (syncAudioRef.current) {
      syncAudioRef.current.volume = clamped;
      syncAudioRef.current.muted = nextMuted;
    }
    if (videoRef.current && !useDualAudioSync) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = nextMuted;
    }
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = nextMuted;
    }
  };

  // Helper to programmatically start HTML5 <video> or <audio> playback with unmuted->muted fallback
  const attemptMediaAutoplay = (mediaEl: HTMLMediaElement | null) => {
    if (!mediaEl) return;
    if (!mediaEl.paused) return;
    try {
      const playPromise = mediaEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err: any) => {
          const errName = String(err?.name || '');
          // Ignore AbortError caused by rapid load/seek transitions; never mute on AbortError!
          if (errName === 'AbortError') {
            return;
          }
          // Browser blocked unmuted autoplay (NotAllowedError): mute and play immediately
          try {
            mediaEl.muted = true;
            setShowEduUnmutePrompt(true);
            mediaEl.play().catch(() => {});
          } catch {}
        });
      }
    } catch {}
  };

  // Sync prop changes
  useEffect(() => {
    setActiveMode(currentMode);
  }, [currentMode]);

  // Reset errors and fetch stream via KaitoTube Self-Hosted Stream Engine (/api/stream/:id + PoW guard_sid)
  useEffect(() => {
    setStreamError(null);
    setStreamRetryCount(0);
    setAudioFallbackIndex(0);
    setStreamStatusText('');
    setShowEduUnmutePrompt(false);
    streamStartTimeRef.current = Date.now();
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    const pickStreamUrlForMode = (streamObj: StreamSourcesResult['streams'], qualityStr: string): string => {
      if (activeMode === 'stream-audio') {
        return (
          streamObj.omadaAudio ||
          streamObj.audio ||
          streamObj.combined360 ||
          streamObj.directAudio ||
          `/api/youtube/stream-direct/${videoId}?quality=audio`
        );
      } else if (activeMode === 'stream-360') {
        return (
          streamObj.combined360 ||
          streamObj.omadaV360 ||
          streamObj.v360 ||
          streamObj.direct360 ||
          `/api/youtube/stream-direct/${videoId}?quality=360`
        );
      } else if (qualityStr === '1080') {
        return (
          streamObj.omadaV1080 ||
          streamObj.v1080 ||
          streamObj.omadaV720 ||
          streamObj.v720 ||
          streamObj.combined360 ||
          `/api/youtube/stream-mux/${videoId}?quality=1080`
        );
      } else if (qualityStr === '720') {
        return (
          streamObj.omadaV720 ||
          streamObj.combined720 ||
          streamObj.v720 ||
          streamObj.combined360 ||
          streamObj.omadaV360 ||
          `/api/youtube/stream-direct/${videoId}?quality=720`
        );
      }
      return (
        streamObj.combined360 ||
        streamObj.omadaV360 ||
        streamObj.v360 ||
        `/api/youtube/stream-direct/${videoId}?quality=360`
      );
    };

    if (!activeMode.startsWith('stream-')) {
      // Pre-warm streams in background while watching in Type 1 (embed) mode and notify parent once stream is resolved
      let embedMounted = true;
      if (getCachedStreamSources(videoId)) {
        onStreamReady?.(videoId);
      } else {
        fetchStreamSourcesCoalesced(videoId)
          .catch(() => {})
          .finally(() => {
            if (embedMounted) onStreamReady?.(videoId);
          });
      }
      setStreamLoading(false);
      return () => {
        embedMounted = false;
      };
    }

    let isMounted = true;
    const quality =
      activeMode === 'stream-high'
        ? '1080'
        : activeMode === 'stream-ytdlp' || activeMode === 'stream-sync'
        ? syncQuality
        : activeMode === 'stream-360'
        ? '360'
        : '720';

    const applyResolvedStreamData = (data: StreamSourcesResult) => {
      if (!isMounted) return;
      if (data.downloadGroups) {
        setDownloadGroups(data.downloadGroups);
      }

      if (data.premiereScheduled) {
        setStreamLoading(false);
        setStreamsReady(true);
        setStreamError(data.errorMessage || 'この動画はプレミア公開前のため、まだストリームが配信されていません。');
        onStreamReady?.(videoId);
        return;
      }

      const streamObj = data.streams || {};
      const hasAnyStream = Boolean(
        streamObj.v1080 ||
          streamObj.v720 ||
          streamObj.v360 ||
          streamObj.combined360 ||
          streamObj.audio ||
          streamObj.omadaV360 ||
          streamObj.omadaV1080
      );

      if (!hasAnyStream) {
        setStreamLoading(false);
        setStreamsReady(true);
        setStreamError(data.errorMessage || '利用可能なストリームがありません。再試行するか他の再生モードをお試しください。');
        onStreamReady?.(videoId);
        return;
      }

      // Immediately set stream URLs & ready state FIRST (do NOT wait for subtitle VTT network fetch!)
      setResolvedStreams(streamObj);
      setStreamsReady(true);
      const streamUrl = pickStreamUrlForMode(streamObj, quality);
      if (streamUrl) {
        setDirectStreamUrl(streamUrl);
      }
      onStreamReady?.(videoId);

      if (data.audioTracks && data.audioTracks.length > 0) {
        const bestAudio = selectBestTrack(data.audioTracks, 'ja');
        setSelectedAudioTrack(bestAudio);
      }

      if (data.subtitleTracks && data.subtitleTracks.length > 0) {
        const bestSub = selectBestTrack(data.subtitleTracks, 'ja');
        if (bestSub) {
          setSelectedSubtitleTrack(bestSub);
          // Load VTT Blob URL asynchronously in background without blocking video playback
          ag(bestSub.url)
            .then((bUrl) => {
              if (isMounted) {
                setSubtitleBlobUrl((prev) => {
                  if (prev) yo(prev);
                  return bUrl;
                });
              } else {
                yo(bUrl);
              }
            })
            .catch(() => {});
        }
      }
    };

    // Fast 0ms synchronous cache hit when switching quality/mode or when prefetched on card hover
    if (retryKey === 0) {
      const syncCached = getCachedStreamSources(videoId);
      if (syncCached) {
        applyResolvedStreamData(syncCached);
        return () => {
          isMounted = false;
        };
      }
    }

    setStreamLoading(true);
    setDirectStreamUrl('');
    setResolvedStreams(null);
    setStreamsReady(false);

    // Poll /api/stream/status while loading
    const pollStatus = () => {
      fetchStreamStatus()
        .then((st) => {
          if (!isMounted) return;
          setServerQueueStatus(st);
          const now = Date.now();
          setStatusFetchedAt(now);
          setStatusNowTick(now);
          setServerQueueError(false);
        })
        .catch(() => {
          if (!isMounted) return;
          setServerQueueError(true);
        });
    };
    pollStatus();
    const statusPollTimer = window.setInterval(pollStatus, 8000);
    const statusTickTimer = window.setInterval(() => {
      if (isMounted) setStatusNowTick(Date.now());
    }, 1000);

    // Use request coalescing (_r Map) & 5-min cache (Bu); force refresh if retryKey > 0
    fetchStreamSourcesCoalesced(videoId, retryKey > 0)
      .then((data) => {
        applyResolvedStreamData(data);
      })
      .catch((err) => {
        if (isMounted) {
          setStreamLoading(false);
          setStreamsReady(true);
          setStreamError(err?.message || 'ストリームURLの取得に失敗しました。再試行してください。');
          onStreamReady?.(videoId);
        }
      });

    return () => {
      isMounted = false;
      window.clearInterval(statusPollTimer);
      window.clearInterval(statusTickTimer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [videoId, activeMode, syncQuality, retryKey]);

  // Resilient error handlers that retry with backoff before showing fatal error
  const handleVideoError = () => {
    if (streamRetryCount < 3) {
      const nextRetry = streamRetryCount + 1;
      setStreamRetryCount(nextRetry);
      setStreamLoading(true);
      setStreamStatusText(`ストリームを再接続・取得中... (試行 ${nextRetry}/3)`);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        setRetryKey((k) => k + 1);
      }, 800);
    } else if (isShort) {
      // In Shorts / MiniPlayer where top mode tabs are hidden, seamlessly fallback to YouTube Education embed
      setStreamLoading(false);
      setStreamStatusText('');
      setStreamError(null);
      setActiveMode('education');
    } else {
      setStreamLoading(false);
      setStreamStatusText('');
      setStreamError(
        `${
          activeMode === 'stream-ytdlp'
            ? `yt-dlp (${syncQuality}p)`
            : activeMode === 'stream-high'
            ? '1080p 合体'
            : '360p'
        } ストリームの読み込みに失敗しました（複数回再試行済み）。他の再生モードをお試しください。`
      );
    }
  };

  const handleAudioError = () => {
    if (streamRetryCount < 3) {
      const nextRetry = streamRetryCount + 1;
      setStreamRetryCount(nextRetry);
      setStreamLoading(true);
      setStreamStatusText(`音声ストリームを再接続・取得中... (試行 ${nextRetry}/3)`);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        setRetryKey((k) => k + 1);
      }, 800);
    } else {
      setStreamLoading(false);
      setStreamStatusText('');
      setStreamError('音声ストリームの読み込みに失敗しました（複数回再試行済み）。他の再生モードをお試しください。');
    }
  };

  const handleSelectMode = (mode: PlaybackMode) => {
    setActiveMode(mode);
    setStreamRetryCount(0);
    setStreamStatusText('');
    setStreamError(null);
    // Save default playback mode to both localStorage and 10-year Cookie (StreamType)
    saveDefaultPlaybackMode(mode);
    setSavedCookieFeedback(true);
    setTimeout(() => setSavedCookieFeedback(false), 1800);
    if (onTogglePlaybackMode) {
      onTogglePlaybackMode(mode);
    }
  };

  // Playback Speed Change Handler (0.25x ~ 4x)
  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    try {
      localStorage.setItem('kaito_playback_speed', String(newSpeed));
    } catch {}
    if (syncControllerRef.current) {
      syncControllerRef.current.setBasePlaybackRate(newSpeed);
    }
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = newSpeed;
      } catch {}
    }
    if (syncAudioRef.current) {
      try {
        syncAudioRef.current.playbackRate = newSpeed;
      } catch {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.playbackRate = newSpeed;
      } catch {}
    }
    // Also send to YouTube Education / NoCookie iframe (supports up to 2x natively)
    const iframeRate = Math.min(2, newSpeed);
    if (eduPlayerRef.current && typeof eduPlayerRef.current.setPlaybackRate === 'function') {
      try {
        eduPlayerRef.current.setPlaybackRate(iframeRate);
      } catch {}
    }
    const targetIframe = activeMode === 'education' ? eduIframeRef.current : nocookieIframeRef.current;
    postIframeMessage(targetIframe, {
      event: 'command',
      func: 'setPlaybackRate',
      args: [iframeRate],
      id: 1,
      channel: 'widget'
    });
  };

  // Toggle "繰り返し" (Repeat) with exclusive control over "自動再生" (Autoplay)
  const handleToggleRepeatCheckbox = (checked: boolean) => {
    setRepeatEnabled(checked);
    try {
      localStorage.setItem('kaito_player_repeat', checked ? '1' : '0');
    } catch {}
  };

  const handleToggleAutoplayCheckbox = (checked: boolean) => {
    if (repeatEnabled) return; // Exclusive control: disabled while repeat is ON
    setAutoplayNextEnabled(checked);
    try {
      localStorage.setItem('kaito_player_autoplay', checked ? '1' : '0');
      window.dispatchEvent(
        new CustomEvent('kaito-autoplay-changed', {
          detail: { enabled: checked }
        })
      );
    } catch {}
  };

  const handleToggleLooseSync = (checked: boolean) => {
    setLooseSync(checked);
    try {
      localStorage.setItem('kaito_loose_sync', checked ? '1' : '0');
    } catch {}
    if (syncControllerRef.current) {
      syncControllerRef.current.setLooseSync(checked);
    }
  };

  const handleReloadPlayer = () => {
    clearClientStreamCache();
    fetch('/api/proxy/clear-cache', { method: 'POST' }).catch(() => {});
    setStreamError(null);
    setEduError(null);
    setStreamRetryCount(0);
    setStreamStatusText('プロキシ・ストリームを再読込み中...');
    if (activeMode.startsWith('stream-')) {
      setStreamLoading(true);
    } else if (activeMode === 'education') {
      setEduLoading(true);
    }
    streamStartTimeRef.current = Date.now();
    setRetryKey((k) => k + 1);
  };

  const isGasEnv = isGasEnvironment();

  const candidateVideoUrl =
    syncQuality === '1080'
      ? resolvedStreams?.v1080 || resolvedStreams?.omadaV1080 || resolvedStreams?.v720 || resolvedStreams?.combined360
      : syncQuality === '720'
      ? resolvedStreams?.v720 || resolvedStreams?.omadaV720 || resolvedStreams?.combined720 || resolvedStreams?.combined360
      : resolvedStreams?.combined360 || resolvedStreams?.omadaV360 || resolvedStreams?.v360;

  // Determine stream or embed URLs with fallback depending on streamRetryCount
  let videoStreamSrc = '';
  if (activeMode.startsWith('stream-') && !streamsReady) {
    // Wait for /api/stream/:id to finish resolving before mounting <video>
    videoStreamSrc = '';
  } else if (activeMode === 'stream-ytdlp' || activeMode === 'stream-sync') {
    if (streamRetryCount === 0) {
      videoStreamSrc =
        candidateVideoUrl ||
        directStreamUrl ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=${syncQuality}&t=${retryKey}` : '');
    } else if (streamRetryCount === 1) {
      videoStreamSrc =
        resolvedStreams?.v720 ||
        resolvedStreams?.combined720 ||
        resolvedStreams?.combined360 ||
        resolvedStreams?.v360 ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=720&t=${retryKey}` : '');
    } else {
      videoStreamSrc =
        resolvedStreams?.combined360 ||
        resolvedStreams?.omadaV360 ||
        resolvedStreams?.v360 ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=360&t=${retryKey}` : '');
    }
  } else if (activeMode === 'stream-high') {
    if (streamRetryCount === 0) {
      videoStreamSrc =
        candidateVideoUrl ||
        resolvedStreams?.v1080 ||
        resolvedStreams?.omadaV1080 ||
        resolvedStreams?.v720 ||
        resolvedStreams?.combined360 ||
        directStreamUrl ||
        (!isGasEnv ? `/api/youtube/stream-mux/${videoId}?quality=1080&t=${retryKey}` : '');
    } else if (streamRetryCount === 1) {
      videoStreamSrc =
        (!isGasEnv ? `/api/youtube/stream-mux/${videoId}?quality=1080&t=${retryKey}` : '') ||
        resolvedStreams?.v720 ||
        resolvedStreams?.combined360 ||
        '';
    } else {
      videoStreamSrc =
        resolvedStreams?.combined360 ||
        resolvedStreams?.omadaV360 ||
        resolvedStreams?.v360 ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=360&t=${retryKey}` : '');
    }
  } else {
    // 360p mode
    if (streamRetryCount === 0) {
      videoStreamSrc =
        resolvedStreams?.combined360 ||
        resolvedStreams?.omadaV360 ||
        resolvedStreams?.v360 ||
        directStreamUrl ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=360&t=${retryKey}` : '');
    } else {
      videoStreamSrc =
        resolvedStreams?.v360 ||
        resolvedStreams?.combined360 ||
        (!isGasEnv ? `/api/youtube/stream-direct/${videoId}?quality=360&t=${retryKey}` : '');
    }
  }

  // Determine whether the current videoStreamSrc is already a single muxed stream (with audio included)
  const isPlayingMuxedSingleStream =
    Boolean(
      videoStreamSrc &&
        ((resolvedStreams?.combined360 && videoStreamSrc === resolvedStreams.combined360) ||
          (resolvedStreams?.combined720 && videoStreamSrc === resolvedStreams.combined720) ||
          videoStreamSrc.includes('/api/youtube/stream-mux/') ||
          videoStreamSrc.includes('quality=360'))
    ) ||
    syncQuality === '360' ||
    streamRetryCount >= 2;

  const useDualAudioSync =
    !isPlayingMuxedSingleStream &&
    (activeMode === 'stream-sync' ||
      activeMode === 'stream-high' ||
      activeMode === 'stream-ytdlp');

  // Build ordered list of high-quality audio candidates with automatic fallback to muxed 360p / direct proxy on error
  const audioCandidates = React.useMemo(() => {
    const list: string[] = [];
    const pushUnique = (u?: string | null) => {
      if (u && typeof u === 'string' && u.trim() && !list.includes(u.trim())) {
        list.push(u.trim());
      }
    };
    pushUnique(resolvedStreams?.audio);
    pushUnique(resolvedStreams?.omadaAudio);
    pushUnique(selectedAudioTrack?.url);
    if (downloadGroups?.audio) {
      downloadGroups.audio.forEach((a) => pushUnique(a.url));
    }
    pushUnique(resolvedStreams?.combined360);
    pushUnique(resolvedStreams?.omadaV360);
    if (!isGasEnv) {
      pushUnique(`/api/youtube/stream-direct/${videoId}?quality=audio&t=${retryKey}`);
      pushUnique(`/api/youtube/stream-direct/${videoId}?quality=360&t=${retryKey}`);
    }
    return list;
  }, [resolvedStreams, selectedAudioTrack, downloadGroups, isGasEnv, videoId, retryKey]);

  let audioStreamSrc = '';
  if (activeMode.startsWith('stream-') && !streamsReady) {
    audioStreamSrc = '';
  } else if (audioCandidates.length > 0) {
    const idx = Math.min(audioFallbackIndex, audioCandidates.length - 1);
    audioStreamSrc = audioCandidates[idx] || audioCandidates[0];
  } else if (!isGasEnv) {
    audioStreamSrc = `/api/youtube/stream-direct/${videoId}?quality=audio&t=${retryKey}`;
  }

  // Compute server queue status display strings
  const queueStatusTitle = (() => {
    if (!serverQueueStatus && !serverQueueError) return 'サーバー状況を確認しています…';
    if (serverQueueError && !serverQueueStatus) return 'ストリームを取得しています…';
    const cnt = serverQueueStatus?.processing?.count || 0;
    return cnt === 0 ? 'サーバーは空いています' : `サーバーで${cnt}件を処理中です`;
  })();
  const queuePositionDetail = (() => {
    const ids = serverQueueStatus?.processing?.ids || [];
    const idx = ids.indexOf(videoId);
    return idx < 0 ? '' : `この動画を処理中です（${idx + 1}番目）`;
  })();
  const queueEstimatedWait = (() => {
    if (!serverQueueStatus) return '';
    const elapsed = Math.max(0, statusNowTick - statusFetchedAt);
    const waitMs = estimateStreamWaitMs(serverQueueStatus, videoId, elapsed);
    return waitMs <= 0 ? 'まもなく完了予定' : `約${Math.max(1, Math.ceil(waitMs / 1000))}秒`;
  })();

  // Attach <video> + <audio> 2-element real-time rAF synchronizer when playing 1080p/720p + high-quality audio
  useEffect(() => {
    if (!useDualAudioSync || !videoStreamSrc || !audioStreamSrc) {
      if (syncControllerRef.current) {
        syncControllerRef.current.destroy();
        syncControllerRef.current = null;
      }
      return;
    }

    const vEl = videoRef.current;
    const aEl = syncAudioRef.current;
    if (!vEl || !aEl) return;

    const controller = attachDualMediaSync(vEl, aEl, {
      initialPlaybackRate: playbackSpeed,
      initialLooseSync: looseSync,
      initialVolume: playerVolume,
      initialMuted: playerMuted,
      onSyncUpdate: (snap) => {
        setSyncSnapshot(snap);
      },
      onAutoplayBlocked: () => {
        setPlayerMuted(true);
        setShowEduUnmutePrompt(true);
      }
    });
    syncControllerRef.current = controller;

    return () => {
      controller.destroy();
      if (syncControllerRef.current === controller) {
        syncControllerRef.current = null;
      }
    };
  }, [useDualAudioSync, activeMode, videoId, retryKey, syncQuality, videoStreamSrc, audioStreamSrc]);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&widgetid=1${currentOrigin ? `&origin=${encodeURIComponent(currentOrigin)}&forigin=${encodeURIComponent(currentOrigin + '/')}` : ''}${startTime ? `&start=${startTime}` : ''}`;
  
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
      className={`relative bg-neutral-900 ${isShort ? 'border-0 rounded-none' : 'border border-neutral-800 rounded-2xl'} overflow-hidden shadow-2xl flex flex-col ${className}`}
      id={`player-container-${videoId}`}
    >
      {/* Top Mode Selector Bar (Hidden in vertical Shorts stage to avoid overlapping top controls) */}
      {!isShort && (
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
            {/* StreamType3 ダウンロードボタン */}
            <button
              onClick={() => setDownloadModalOpen(true)}
              className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700"
              title="ストリーム・音声・字幕をダウンロード"
              id="stream-download-btn"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">ダウンロード</span>
              <span className="sm:hidden">DL</span>
            </button>

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
      )}

      {/* Media Player Area */}
      <div
        className={`relative w-full bg-black flex items-center justify-center ${
          isShort ? 'flex-1 h-full' : 'aspect-video max-h-[78vh]'
        }`}
      >
        {activeMode === 'education' ? (
          // YouTube Education 4-Step Embed Player with window.YT.Player control
          <div className="relative w-full h-full">
            {eduUrl ? (
              <iframe
                ref={eduIframeRef}
                key={`edu-${videoId}-${retryKey}-${Math.floor(startTime)}-${seekTrigger}`}
                src={eduUrl}
                title={title || 'YouTube Player for Education'}
                className="w-full h-full border-0"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                id={`education-iframe-${videoId}`}
                onLoad={(e) => {
                  attachIframeBridgeAndPlay(e.currentTarget);
                }}
              />
            ) : null}

            {/* Unmute Prompt Banner if auto-played muted per browser policy */}
            {showEduUnmutePrompt && (
              <button
                onClick={handleUnmuteEduClick}
                className={`absolute ${
                  isShort ? 'top-16 left-1/2 -translate-x-1/2 z-40' : 'top-4 left-4 z-30'
                } px-3.5 py-2 rounded-xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-neutral-700/80 shadow-2xl flex items-center gap-2 font-bold text-xs cursor-pointer backdrop-blur-md transition-all hover:scale-105 whitespace-nowrap`}
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
            ref={nocookieIframeRef}
            key={`nocookie-${videoId}-${Math.floor(startTime)}-${seekTrigger}`}
            src={embedSrc}
            title={title || 'YouTube Video'}
            className="w-full h-full border-0"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            id={`nocookie-iframe-${videoId}`}
            onLoad={(e) => {
              attachIframeBridgeAndPlay(e.currentTarget);
            }}
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
              {title || '音声ストリーム再生中 (yt.omada.cafe)'}
            </h3>
            {audioStreamSrc ? (
              <audio
                ref={audioRef}
                key={`audio-${videoId}-${retryKey}-${audioStreamSrc}`}
                src={audioStreamSrc}
                controls
                autoPlay
                onEnded={triggerEndedOnce}
                onLoadedMetadata={(e) => {
                  e.currentTarget.volume = playerVolume;
                  e.currentTarget.muted = playerMuted;
                  attemptMediaAutoplay(e.currentTarget);
                }}
                onCanPlay={(e) => {
                  setStreamLoading(false);
                  setStreamRetryCount(0);
                  setStreamStatusText('');
                  setStreamError(null);
                  attemptMediaAutoplay(e.currentTarget);
                }}
                onError={handleAudioError}
                className="w-full max-w-md accent-red-600"
                id={`audio-player-${videoId}`}
              />
            ) : null}
            {showEduUnmutePrompt && (
              <button
                onClick={handleUnmuteEduClick}
                className="mt-3 px-3.5 py-2 rounded-xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-neutral-700/80 shadow-2xl flex items-center gap-2 font-bold text-xs cursor-pointer transition-all hover:scale-105"
                title="音声を有効にする"
              >
                <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>ミュートを解除する</span>
              </button>
            )}
            {streamLoading && !streamError && (
              <div className="flex items-center gap-2 mt-4 text-xs text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span>{streamStatusText || '音声を読み込み中...'}</span>
              </div>
            )}
            {streamError && (
              <div className="flex items-center gap-3 mt-4 text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 px-4 py-2 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{streamError}</span>
                <button
                  onClick={() => {
                    setStreamError(null);
                    setStreamRetryCount(0);
                    setStreamStatusText('');
                    setStreamLoading(true);
                    streamStartTimeRef.current = Date.now();
                    setRetryKey((k) => k + 1);
                  }}
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
            {showEduUnmutePrompt && (
              <button
                onClick={handleUnmuteEduClick}
                className={`absolute ${
                  isShort ? 'top-16 left-1/2 -translate-x-1/2 z-40' : 'top-4 left-4 z-30'
                } px-3.5 py-2 rounded-xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-neutral-700/80 shadow-2xl flex items-center gap-2 font-bold text-xs cursor-pointer backdrop-blur-md transition-all hover:scale-105 whitespace-nowrap`}
                title="音声を有効にする"
                id="stream-unmute-banner-btn"
              >
                <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>ミュートを解除する</span>
              </button>
            )}

            {streamLoading && !streamError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xs gap-3 pointer-events-none text-white text-center px-4">
                <Loader2 className="w-9 h-9 animate-spin text-rose-500" />
                <div className="min-w-[min(380px,calc(100vw-48px))] px-5 py-4 rounded-xl border border-white/25 bg-black/75 text-white text-center leading-relaxed space-y-1 shadow-2xl">
                  <div className="text-sm sm:text-base font-bold">{queueStatusTitle}</div>
                  {queuePositionDetail && (
                    <div className="text-xs sm:text-sm text-sky-300">{queuePositionDetail}</div>
                  )}
                  {queueEstimatedWait && (
                    <div className="text-xs sm:text-sm text-amber-300 font-bold">
                      おおよその待ち時間: {queueEstimatedWait}
                    </div>
                  )}
                  {streamStatusText && (
                    <div className="text-xs text-neutral-300 pt-1">{streamStatusText}</div>
                  )}
                </div>
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
                    onClick={handleReloadPlayer}
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
              <>
                {videoStreamSrc ? (
                  <video
                    ref={videoRef}
                    key={`video-${videoId}-${activeMode}-${syncQuality}-${retryKey}-${videoStreamSrc}`}
                    src={videoStreamSrc}
                    poster={posterSrc}
                    controls
                    autoPlay
                    playsInline
                    muted={useDualAudioSync ? true : playerMuted}
                    loop={repeatEnabled}
                    onEnded={triggerEndedOnce}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (!Number.isFinite(v.duration) || v.duration <= 1) return;
                      const remaining = v.duration - v.currentTime;
                      if (repeatEnabledRef.current) {
                        if (remaining <= 0.25) {
                          try {
                            v.currentTime = 0;
                            if (useDualAudioSync && syncAudioRef.current) {
                              syncAudioRef.current.currentTime = 0;
                              syncAudioRef.current.play().catch(() => {});
                            }
                            v.play().catch(() => {});
                          } catch {}
                        }
                      } else if (remaining <= 0.3 && (v.ended || v.paused || syncAudioRef.current?.ended)) {
                        triggerEndedOnce();
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      try {
                        e.currentTarget.playbackRate = playbackSpeed;
                        if (!useDualAudioSync) {
                          e.currentTarget.volume = playerVolume;
                          e.currentTarget.muted = playerMuted;
                        } else {
                          e.currentTarget.muted = true;
                        }
                        if (startTime > 0 && e.currentTarget.currentTime < 1) {
                          e.currentTarget.currentTime = Math.floor(startTime);
                        }
                      } catch {}
                      attemptMediaAutoplay(e.currentTarget);
                      if (useDualAudioSync && syncControllerRef.current) {
                        syncControllerRef.current.forceSyncNow();
                      }
                    }}
                    onCanPlay={(e) => {
                      setStreamLoading(false);
                      setStreamRetryCount(0);
                      setStreamStatusText('');
                      setStreamError(null);
                      try {
                        e.currentTarget.playbackRate = playbackSpeed;
                      } catch {}
                      attemptMediaAutoplay(e.currentTarget);
                      if (useDualAudioSync && syncControllerRef.current) {
                        syncControllerRef.current.forceSyncNow();
                      }
                    }}
                    onPlay={(e) => {
                      if (!useDualAudioSync && !e.currentTarget.muted) {
                        setShowEduUnmutePrompt(false);
                      }
                      if (useDualAudioSync && syncControllerRef.current) {
                        syncControllerRef.current.forceSyncNow();
                      }
                    }}
                    onVolumeChange={(e) => {
                      if (!useDualAudioSync) {
                        setPlayerVolume(e.currentTarget.volume);
                        setPlayerMuted(e.currentTarget.muted);
                        if (!e.currentTarget.muted && e.currentTarget.volume > 0) {
                          setShowEduUnmutePrompt(false);
                        }
                      } else if (!e.currentTarget.muted) {
                        // User clicked native unmute on <video>: transfer unmute to <audio> and keep <video> muted
                        const newVol = e.currentTarget.volume > 0 ? e.currentTarget.volume : playerVolume || 1;
                        e.currentTarget.muted = true;
                        setPlayerMuted(false);
                        setPlayerVolume(newVol);
                        setShowEduUnmutePrompt(false);
                        if (syncControllerRef.current) {
                          syncControllerRef.current.setVolume(newVol);
                          syncControllerRef.current.setMuted(false);
                        }
                      }
                    }}
                    onError={handleVideoError}
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
                ) : null}

                {/* Hidden <audio> element for 1080p/720p (<video> + <audio> 2要素リアルタイム同期 from KaitoTube / yt.omada.cafe) */}
                {useDualAudioSync && audioStreamSrc && (
                  <audio
                    ref={syncAudioRef}
                    key={`sync-audio-${videoId}-${retryKey}-${audioStreamSrc}`}
                    src={audioStreamSrc}
                    preload="auto"
                    autoPlay
                    playsInline
                    loop={repeatEnabled}
                    className="hidden"
                    onEnded={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (
                        v.ended ||
                        !Number.isFinite(v.duration) ||
                        v.duration <= 0 ||
                        v.duration - v.currentTime <= 1.5
                      ) {
                        triggerEndedOnce();
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      try {
                        e.currentTarget.playbackRate = playbackSpeed;
                        e.currentTarget.volume = playerVolume;
                        e.currentTarget.muted = playerMuted;
                        if (videoRef.current && Math.abs(videoRef.current.currentTime - e.currentTarget.currentTime) > 0.3) {
                          e.currentTarget.currentTime = videoRef.current.currentTime;
                        }
                        if (videoRef.current && !videoRef.current.paused && e.currentTarget.paused) {
                          syncControllerRef.current?.forceSyncNow();
                        }
                      } catch {}
                    }}
                    onCanPlay={(e) => {
                      try {
                        e.currentTarget.volume = playerVolume;
                        e.currentTarget.muted = playerMuted;
                        if (videoRef.current && !videoRef.current.paused && e.currentTarget.paused) {
                          syncControllerRef.current?.forceSyncNow();
                        }
                      } catch {}
                    }}
                    onError={() => {
                      // Automatic fallback to next audio stream candidate (e.g. combined360 or server audio proxy)
                      if (audioFallbackIndex < audioCandidates.length - 1) {
                        setAudioFallbackIndex((idx) => idx + 1);
                      }
                    }}
                    id={`sync-audio-player-${videoId}`}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Persistent Bottom Control Bar: 「繰り返し」「自動再生」「再読込み」＋ 最大4倍速セレクター ＋ 2要素同期モニター */}
      {!isShort && (
        <div
          className="bg-neutral-950/95 border-t border-neutral-800 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          id="player-bottom-persistent-bar"
        >
          {/* Left: 「繰り返し」「自動再生」「再読込み」常設バー (Exclusive Control: Repeat ON -> Autoplay disabled) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 繰り返し (Repeat) Checkbox */}
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border select-none cursor-pointer transition-colors ${
                repeatEnabled
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
              }`}
              title="ONにすると現在の動画をループ再生し、「自動再生」は自動的に無効化されます"
            >
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(e) => handleToggleRepeatCheckbox(e.target.checked)}
                className="accent-amber-500 rounded cursor-pointer"
                id="player-bar-repeat-checkbox"
              />
              <Repeat className="w-3.5 h-3.5 text-amber-400" />
              <span>繰り返し</span>
            </label>

            {/* 自動再生 (Autoplay Next) Checkbox - Automatically disabled when Repeat is ON */}
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border select-none transition-colors ${
                repeatEnabled
                  ? 'bg-neutral-900/40 border-neutral-800/50 text-neutral-600 cursor-not-allowed opacity-60'
                  : autoplayNextEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold cursor-pointer'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white cursor-pointer'
              }`}
              title={
                repeatEnabled
                  ? '「繰り返し」がONのため自動再生は無効化されています（排他制御）'
                  : '動画終了時に次の動画を自動再生します'
              }
            >
              <input
                type="checkbox"
                checked={!repeatEnabled && autoplayNextEnabled}
                disabled={repeatEnabled}
                onChange={(e) => handleToggleAutoplayCheckbox(e.target.checked)}
                className="accent-emerald-500 rounded disabled:cursor-not-allowed cursor-pointer"
                id="player-bar-autoplay-checkbox"
              />
              <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>自動再生</span>
            </label>

            {/* 再読込み (One-Tap Stream Reload) Button */}
            <button
              type="button"
              onClick={handleReloadPlayer}
              className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-white border border-red-800/70 font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
              title="ワンタップでストリーム・プレイヤーを再取得・再読込みします"
              id="player-bar-reload-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${streamLoading || eduLoading ? 'animate-spin' : ''}`} />
              <span>再読込み</span>
            </button>

            {/* 音量 & ミュート切替コントロール (1080p 2要素同期ストリームでも確実に音量を操作可能) */}
            {activeMode.startsWith('stream-') && (
              <div className="flex items-center gap-1.5 bg-neutral-900 border border-red-900/50 rounded-lg px-2.5 py-1">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`flex items-center gap-1 font-bold transition-colors cursor-pointer ${
                    playerMuted || playerVolume === 0 ? 'text-red-400' : 'text-white hover:text-red-300'
                  }`}
                  title={playerMuted ? 'ミュート解除' : 'ミュート'}
                  id="player-bar-mute-btn"
                >
                  {playerMuted || playerVolume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className="text-[11px]">
                    {playerMuted || playerVolume === 0 ? '消音中' : `${Math.round(playerVolume * 100)}%`}
                  </span>
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={playerMuted ? 0 : playerVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-16 sm:w-20 accent-red-600 cursor-pointer h-1.5"
                  title="ストリーム音量調整"
                  id="player-bar-volume-slider"
                />
              </div>
            )}
          </div>

          {/* Center / Right: 4x Playback Speed Selector + Type2 Real-Time Sync Monitor + Cookie Default Indicator */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Type 2 (<video> + <audio>) / 1080p High / yt-dlp Quality & Sync Controls */}
            {(activeMode === 'stream-sync' || activeMode === 'stream-high' || activeMode === 'stream-ytdlp') && (
              <div className="flex items-center gap-2 bg-neutral-900 border border-red-800/50 rounded-lg px-2.5 py-1">
                {useDualAudioSync && (
                  <>
                    <span
                      className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        syncSnapshot.synced
                          ? 'bg-red-600/20 text-red-300 border border-red-500/30'
                          : 'bg-red-900/40 text-red-200'
                      }`}
                      title="requestAnimationFrame による <video> と <audio> のリアルタイム同期ズレ (ミリ秒)"
                    >
                      同期ズレ: {syncSnapshot.diffText}
                    </span>

                    <label
                      className="inline-flex items-center gap-1 text-[11px] text-neutral-300 cursor-pointer select-none"
                      title="Safari専用「緩い同期モード（looseSync）」: ±0.5秒以内は無補正、0.5〜1秒は±10%微調整、1秒以上は1秒クールダウン付きシーク同期で音飛びを防止します"
                    >
                      <input
                        type="checkbox"
                        checked={looseSync}
                        onChange={(e) => handleToggleLooseSync(e.target.checked)}
                        className="accent-red-600 rounded cursor-pointer"
                      />
                      <span>緩い同期{syncSnapshot.isSafari ? '(Safari)' : ''}</span>
                    </label>
                  </>
                )}

                {(activeMode === 'stream-sync' || activeMode === 'stream-high' || activeMode === 'stream-ytdlp') && (
                  <select
                    value={syncQuality}
                    onChange={(e) => setSyncQuality(e.target.value as '1080' | '720' | '360')}
                    className="bg-neutral-950 border border-red-900/60 rounded px-1.5 py-0.5 text-[11px] text-white font-bold focus:outline-none cursor-pointer"
                    title="ストリーム画質"
                  >
                    <option value="1080">1080p (Full HD + 高音質)</option>
                    <option value="720">720p (HD + 高音質)</option>
                    <option value="360">360p (Google Video 軽量)</option>
                  </select>
                )}
              </div>
            )}

            {/* Playback Speed Selector up to 4x (0.25x ~ 4x) */}
            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1">
              <Gauge className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] text-neutral-400">速度:</span>
              <select
                value={playbackSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                id="player-speed-selector"
                title="最大4倍速（3x・4x対応）までの再生速度セレクター"
              >
                {PLAYBACK_SPEED_OPTIONS.map((spd) => (
                  <option key={spd} value={spd} className="bg-neutral-900 text-white">
                    {spd}x {spd === 1 ? '(標準)' : spd >= 3 ? '⚡高速' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 10-Year StreamType Cookie & LocalStorage Dual-Save Badge */}
            <div
              className="hidden sm:flex items-center gap-1 text-[10px] text-neutral-400 bg-neutral-900/80 border border-neutral-800 px-2 py-1 rounded-lg font-mono"
              title="起動時のデフォルト再生方式を localStorage と 10年間有効Cookie (StreamType) に二重保存しています"
            >
              {savedCookieFeedback ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Cookie(10年)+LS保存済</span>
                </>
              ) : (
                <span>
                  既定: {playbackModeToStreamType(activeMode) === 'type2' ? 'Type2(Stream)' : '通常(Edu)'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* StreamType3 Download Popup Modal (Matches StreamType3 in reference code) */}
      {downloadModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setDownloadModalOpen(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto text-white relative shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>ダウンロード ({title || videoId})</span>
              </h3>
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!downloadGroups && !resolvedStreams ? (
              <div className="py-6 text-center text-xs text-neutral-300 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                <span>ストリーム情報を取得中…</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* 標準 (360p muxed) */}
                {(downloadGroups?.muxed?.length || resolvedStreams?.combined360) && (
                  <div className="space-y-1.5">
                    <strong className="block text-neutral-200">標準（360p 映像+音声）:</strong>
                    {(downloadGroups?.muxed?.length
                      ? downloadGroups.muxed
                      : [{ url: resolvedStreams?.combined360 || '', resolution: '360p' }]
                    ).map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-neutral-800/70 px-3 py-2 rounded-lg">
                        <span>{m.resolution || '360p'} (MP4)</span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          ダウンロード
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* 音声のみ */}
                {(downloadGroups?.audio?.length || resolvedStreams?.audio) && (
                  <div className="space-y-1.5">
                    <strong className="block text-neutral-200">音声のみ:</strong>
                    {(downloadGroups?.audio?.length
                      ? downloadGroups.audio
                      : [{ url: resolvedStreams?.audio || '', ext: 'm4a', language: '日本語' }]
                    ).map((a, i) => (
                      <div key={i} className="flex items-center justify-between bg-neutral-800/70 px-3 py-2 rounded-lg">
                        <span>
                          {a.ext.toUpperCase()} {a.language ? `(${a.language})` : ''}
                        </span>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          ダウンロード
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* 映像のみ */}
                {downloadGroups?.video && downloadGroups.video.length > 0 && (
                  <div className="space-y-1.5">
                    <strong className="block text-neutral-200">映像のみ (高画質):</strong>
                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                      {downloadGroups.video.map((v, i) => (
                        <div key={i} className="flex items-center justify-between bg-neutral-800/70 px-3 py-2 rounded-lg">
                          <span>
                            {v.resolution} ({v.ext})
                          </span>
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                          >
                            ダウンロード
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* m3u8 */}
                {downloadGroups?.hls && downloadGroups.hls.length > 0 && (
                  <div className="space-y-1.5">
                    <strong className="block text-neutral-200">m3u8 (HLS URLコピー):</strong>
                    {downloadGroups.hls.map((h, i) => (
                      <div key={i} className="space-y-1 bg-neutral-800/70 p-2.5 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{h.resolution || 'HLS'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(h.url).catch(() => {});
                              setCopiedM3u8Url(h.url);
                              setTimeout(() => setCopiedM3u8Url(''), 1500);
                            }}
                            className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedM3u8Url === h.url ? 'コピーしました' : 'URLをコピー'}</span>
                          </button>
                        </div>
                        <div className="font-mono text-[11px] text-sky-400 truncate">{h.url}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 字幕 (VTT) */}
                {downloadGroups?.subtitles && downloadGroups.subtitles.length > 0 && (
                  <div className="space-y-1.5">
                    <strong className="block text-neutral-200">字幕（VTT）:</strong>
                    {downloadGroups.subtitles.map((sub, i) => (
                      <div key={i} className="flex items-center justify-between bg-neutral-800/70 px-3 py-2 rounded-lg">
                        <span>{sub.label}</span>
                        <a
                          href={sub.src || sub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white font-bold"
                        >
                          ダウンロード
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
