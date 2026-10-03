/**
 * syncPlayback.ts
 * ブラウザ内 <video> (1080p/720p 映像) ＋ <audio> (高音質音声) 2要素リアルタイム同期エンジン
 *
 * - requestAnimationFrame で毎フレームミリ秒単位のズレ (diffText ms) を監視・同期
 * - 1080p 映像のみストリーム (itag=137) 再生時に Chrome 等で <video> 側のミュートボタンが
 *   無効化される問題に対応し、AbortError で誤って音声がミュートされる不具合を完全解消
 * - Safari判定時は音飛びを防ぐ「緩い同期モード (looseSync)」を自動適用（手動切替も可）
 * - 0.25x 〜 最大4x (3x / 4x 含む) までの再生速度セレクターと完全連動
 */

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

export interface SyncStateSnapshot {
  diffMs: number;
  diffText: string;
  looseSync: boolean;
  isSafari: boolean;
  audioRate: number;
  videoRate: number;
  synced: boolean;
}

export interface SyncPlaybackController {
  setBasePlaybackRate: (rate: number) => void;
  setLooseSync: (loose: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  forceSyncNow: () => void;
  destroy: () => void;
}

export function attachDualMediaSync(
  video: HTMLVideoElement,
  audio: HTMLAudioElement,
  options?: {
    initialPlaybackRate?: number;
    initialLooseSync?: boolean;
    initialVolume?: number;
    initialMuted?: boolean;
    onSyncUpdate?: (snapshot: SyncStateSnapshot) => void;
    onAutoplayBlocked?: () => void;
  }
): SyncPlaybackController {
  const isSafari = isSafariBrowser();
  let looseSync = options?.initialLooseSync !== undefined ? options.initialLooseSync : isSafari;
  let baseRate = options?.initialPlaybackRate || 1;
  let desiredVolume = options?.initialVolume !== undefined ? options.initialVolume : 1;
  let desiredMuted = options?.initialMuted !== undefined ? options.initialMuted : false;
  let rafId: number | null = null;
  let destroyed = false;
  let lastSeekSyncTime = 0;
  let lastUiNotifyTime = 0;
  let lastRafTickTime = 0;
  let playAttemptInFlight = false;
  let playAttemptStartedAt = 0;
  let unlockListenerAttached = false;

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  const applyBaseRateToVideo = () => {
    try {
      if (Math.abs(video.playbackRate - baseRate) > 0.001) {
        video.playbackRate = baseRate;
      }
    } catch {}
  };

  const applyVolumeAndMuteToAudio = () => {
    try {
      // Keep <video> muted during dual-sync so video autoplay never blocks and audio comes purely from <audio>
      if (!video.muted) {
        video.muted = true;
      }
      audio.volume = clamp(desiredVolume, 0, 1);
      audio.muted = desiredMuted;
    } catch {}
  };

  const removeUnlockListeners = () => {
    if (!unlockListenerAttached || typeof window === 'undefined') return;
    unlockListenerAttached = false;
    window.removeEventListener('pointerdown', handleUserGestureUnlock, true);
    window.removeEventListener('keydown', handleUserGestureUnlock, true);
    window.removeEventListener('touchstart', handleUserGestureUnlock, true);
  };

  function handleUserGestureUnlock() {
    if (destroyed) {
      removeUnlockListeners();
      return;
    }
    removeUnlockListeners();
    desiredMuted = false;
    if (desiredVolume <= 0) desiredVolume = 1;
    applyVolumeAndMuteToAudio();
    if (!video.paused && !video.ended) {
      try {
        if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.3) {
          audio.currentTime = video.currentTime;
        }
        audio.play().catch(() => {});
      } catch {}
    }
  }

  const attachOneTimeGestureUnlock = () => {
    if (unlockListenerAttached || typeof window === 'undefined') return;
    unlockListenerAttached = true;
    window.addEventListener('pointerdown', handleUserGestureUnlock, true);
    window.addEventListener('keydown', handleUserGestureUnlock, true);
    window.addEventListener('touchstart', handleUserGestureUnlock, true);
  };

  const safePlayAudio = () => {
    if (destroyed || video.paused || video.ended) return;
    if (!audio.src) return;
    if (!audio.paused) {
      applyVolumeAndMuteToAudio();
      return;
    }
    const now = performance.now();
    if (playAttemptInFlight && now - playAttemptStartedAt < 1500) return;

    try {
      applyVolumeAndMuteToAudio();
      playAttemptInFlight = true;
      playAttemptStartedAt = now;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          playAttemptInFlight = false;
          applyVolumeAndMuteToAudio();
        }).catch((err: any) => {
          playAttemptInFlight = false;
          if (destroyed || video.paused) return;
          const errName = String(err?.name || '');
          // Ignore AbortError (interrupted by seek or load); tick/canplay will retry naturally without muting!
          if (errName === 'AbortError') {
            return;
          }
          // Only if browser explicitly blocked unmuted autoplay (NotAllowedError):
          if (errName === 'NotAllowedError') {
            try {
              options?.onAutoplayBlocked?.();
              attachOneTimeGestureUnlock();
            } catch {}
          }
        });
      } else {
        playAttemptInFlight = false;
      }
    } catch {
      playAttemptInFlight = false;
    }
  };

  const handlePlay = () => {
    applyVolumeAndMuteToAudio();
    applyBaseRateToVideo();
    if (audio.paused) {
      try {
        if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.35) {
          audio.currentTime = video.currentTime;
        }
      } catch {}
      safePlayAudio();
    }
  };

  const handleAudioReady = () => {
    applyVolumeAndMuteToAudio();
    try {
      audio.playbackRate = baseRate;
      if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        audio.currentTime = video.currentTime;
      }
    } catch {}
    if (!video.paused && audio.paused) {
      safePlayAudio();
    }
  };

  const handlePause = () => {
    if (video.seeking) return;
    if (!audio.paused) {
      try {
        audio.pause();
      } catch {}
    }
  };

  const handleSeeking = () => {
    try {
      if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.2) {
        audio.currentTime = video.currentTime;
      }
    } catch {}
  };

  const handleSeeked = () => {
    try {
      if (audio.readyState >= 1) {
        audio.currentTime = video.currentTime;
      }
      lastSeekSyncTime = performance.now();
      if (!video.paused && audio.paused) {
        safePlayAudio();
      }
    } catch {}
  };

  const handleWaiting = () => {
    // Only pause audio if audio is already playing and ahead of a stalled video
    if (!audio.paused && audio.readyState >= 2) {
      try {
        audio.pause();
      } catch {}
    }
  };

  const handlePlaying = () => {
    applyVolumeAndMuteToAudio();
    try {
      if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        audio.currentTime = video.currentTime;
      }
      if (audio.paused) {
        safePlayAudio();
      }
    } catch {}
  };

  const handleRateChange = () => {
    const vRate = video.playbackRate;
    if (vRate && Math.abs(vRate - baseRate) > 0.02) {
      baseRate = vRate;
    }
  };

  const performSyncStep = (now: number) => {
    if (destroyed) return;
    try {
      const videoNearEnd =
        video.ended ||
        (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 0.25);
      const audioNearEnd =
        audio.ended ||
        (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.25);

      // Start audio whenever video is playing (even if audio.readyState === 0 so audio never deadlocks)
      if (!video.paused && !video.seeking && !videoNearEnd && !audioNearEnd && video.readyState >= 2) {
        if (audio.paused && !audio.ended) {
          safePlayAudio();
        } else if (!audio.paused && audio.muted !== desiredMuted) {
          applyVolumeAndMuteToAudio();
        }
      }

      if (
        !video.paused &&
        !video.seeking &&
        !videoNearEnd &&
        !audioNearEnd &&
        video.readyState >= 2 &&
        audio.readyState >= 2 &&
        !audio.paused
      ) {
        // diff > 0 means video is ahead of audio; diff < 0 means audio is ahead of video
        const diffSec = video.currentTime - audio.currentTime;
        const absDiff = Math.abs(diffSec);
        const diffMs = Math.round(diffSec * 1000);

        if (looseSync) {
          if (absDiff >= 1.0) {
            if (now - lastSeekSyncTime >= 1000) {
              audio.currentTime = video.currentTime;
              audio.playbackRate = baseRate;
              lastSeekSyncTime = now;
            }
          } else if (absDiff > 0.5) {
            const factor = clamp(diffSec * 0.1, -0.1, 0.1);
            const targetAudioRate = clamp(baseRate * (1 + factor), 0.25, 4.0);
            if (Math.abs(audio.playbackRate - targetAudioRate) > 0.005) {
              audio.playbackRate = targetAudioRate;
            }
          } else {
            if (Math.abs(audio.playbackRate - baseRate) > 0.002) {
              audio.playbackRate = baseRate;
            }
          }
        } else {
          if (absDiff >= 0.65) {
            if (now - lastSeekSyncTime >= 400) {
              audio.currentTime = video.currentTime;
              audio.playbackRate = baseRate;
              lastSeekSyncTime = now;
            }
          } else if (absDiff > 0.025) {
            const adjust = clamp(diffSec * 0.45, -0.25, 0.25);
            const targetAudioRate = clamp(baseRate + adjust * baseRate, 0.25, 4.0);
            if (Math.abs(audio.playbackRate - targetAudioRate) > 0.003) {
              audio.playbackRate = Number(targetAudioRate.toFixed(3));
            }
          } else {
            if (Math.abs(audio.playbackRate - baseRate) > 0.002) {
              audio.playbackRate = baseRate;
            }
          }
        }

        if (options?.onSyncUpdate && now - lastUiNotifyTime >= 150) {
          lastUiNotifyTime = now;
          const sign = diffMs > 0 ? '+' : '';
          options.onSyncUpdate({
            diffMs,
            diffText: `${sign}${diffMs} ms`,
            looseSync,
            isSafari,
            audioRate: Number(audio.playbackRate.toFixed(2)),
            videoRate: Number(video.playbackRate.toFixed(2)),
            synced: absDiff < (looseSync ? 0.55 : 0.08)
          });
        }
      } else if (options?.onSyncUpdate && now - lastUiNotifyTime >= 350) {
        lastUiNotifyTime = now;
        const diffSec = (video.currentTime || 0) - (audio.currentTime || 0);
        const diffMs = Math.round(diffSec * 1000);
        const sign = diffMs > 0 ? '+' : '';
        options.onSyncUpdate({
          diffMs,
          diffText: `${sign}${diffMs} ms`,
          looseSync,
          isSafari,
          audioRate: Number((audio.playbackRate || baseRate).toFixed(2)),
          videoRate: Number((video.playbackRate || baseRate).toFixed(2)),
          synced: Math.abs(diffSec) < 0.1
        });
      }
    } catch {}
  };

  // Fallback sync on timeupdate when tab is in background or PiP (where requestAnimationFrame is throttled)
  const handleTimeUpdate = () => {
    const now = performance.now();
    if (now - lastRafTickTime > 200) {
      performSyncStep(now);
    }
  };

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeking', handleSeeking);
  video.addEventListener('seeked', handleSeeked);
  video.addEventListener('waiting', handleWaiting);
  video.addEventListener('playing', handlePlaying);
  video.addEventListener('canplay', handlePlaying);
  video.addEventListener('timeupdate', handleTimeUpdate);
  video.addEventListener('ratechange', handleRateChange);

  audio.addEventListener('loadedmetadata', handleAudioReady);
  audio.addEventListener('loadeddata', handleAudioReady);
  audio.addEventListener('canplay', handleAudioReady);
  audio.addEventListener('canplaythrough', handleAudioReady);
  audio.addEventListener('playing', applyVolumeAndMuteToAudio);

  // Initial setup: keep video muted so only <audio> outputs sound, and apply user volume/mute to <audio>
  try {
    video.muted = true;
  } catch {}
  applyVolumeAndMuteToAudio();
  applyBaseRateToVideo();
  try {
    audio.playbackRate = baseRate;
  } catch {}
  if (!video.paused && audio.paused) {
    safePlayAudio();
  }

  const tick = (now: number) => {
    if (destroyed) return;
    lastRafTickTime = now;
    performSyncStep(now);
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    setBasePlaybackRate(rate: number) {
      baseRate = clamp(rate, 0.25, 4.0);
      try {
        video.playbackRate = baseRate;
        audio.playbackRate = baseRate;
      } catch {}
    },
    setLooseSync(loose: boolean) {
      looseSync = loose;
      try {
        audio.playbackRate = baseRate;
      } catch {}
    },
    setVolume(vol: number) {
      desiredVolume = clamp(vol, 0, 1);
      try {
        audio.volume = desiredVolume;
        if (desiredVolume > 0 && desiredMuted) {
          desiredMuted = false;
          audio.muted = false;
          removeUnlockListeners();
        }
        if (desiredVolume > 0 && !video.paused && audio.paused) {
          safePlayAudio();
        }
      } catch {}
    },
    setMuted(muted: boolean) {
      desiredMuted = muted;
      try {
        audio.muted = muted;
        if (!muted) {
          removeUnlockListeners();
          if (desiredVolume <= 0) {
            desiredVolume = 1;
            audio.volume = 1;
          }
          if (!video.paused && audio.paused) {
            safePlayAudio();
          }
        }
      } catch {}
    },
    forceSyncNow() {
      try {
        applyVolumeAndMuteToAudio();
        if (audio.readyState >= 1 && Math.abs(video.currentTime - audio.currentTime) > 0.25) {
          audio.currentTime = video.currentTime;
        }
        audio.playbackRate = baseRate;
        video.playbackRate = baseRate;
        lastSeekSyncTime = performance.now();
        if (!video.paused && audio.paused) {
          safePlayAudio();
        }
      } catch {}
    },
    destroy() {
      destroyed = true;
      removeUnlockListeners();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ratechange', handleRateChange);
      audio.removeEventListener('loadedmetadata', handleAudioReady);
      audio.removeEventListener('loadeddata', handleAudioReady);
      audio.removeEventListener('canplay', handleAudioReady);
      audio.removeEventListener('canplaythrough', handleAudioReady);
      audio.removeEventListener('playing', applyVolumeAndMuteToAudio);
    }
  };
}
