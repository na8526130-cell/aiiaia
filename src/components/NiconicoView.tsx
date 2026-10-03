import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tv,
  Search,
  History,
  Star,
  Settings,
  Download,
  RefreshCw,
  Trash2,
  MessageSquare,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  ExternalLink,
  Film,
  Cpu,
  ThumbsUp,
  Bookmark
} from 'lucide-react';
import { customFetch } from '../utils/apiClient';
import { YouTubeVideoItem } from '../types';

export interface NicoVideoItem {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  duration: string;
  channel: string;
  channel_url?: string;
  views?: number;
  commentsCount?: number;
  mylistCount?: number;
  publishedAt?: string;
}

export interface NicoCommentItem {
  text: string;
  timeMs: number;
  commands?: string[];
  postedAt?: string;
}

interface NicoVideoDetails {
  id: string;
  title: string;
  description: string;
  views: number;
  commentsCount: number;
  mylistCount: number;
  likeCount: number;
  duration: string;
  registeredAt: string;
  ownerName: string;
  ownerIcon: string;
  ownerId: string;
}

interface ReviewItem {
  iconInitial: string;
  displayName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface NiconicoViewProps {
  externalQuery: string;
  onSelectSaveToMainHistory?: (item: YouTubeVideoItem) => void;
  onSwitchToYouTubeMode?: () => void;
}

const QUICK_NICO_TAGS = [
  { label: 'おすすめ', query: '' },
  { label: 'ボカロ', query: 'VOCALOID' },
  { label: '歌ってみた', query: '歌ってみた' },
  { label: 'ゆっくり実況', query: 'ゆっくり実況' },
  { label: 'ゲーム', query: 'ゲーム実況' },
  { label: 'アニメ', query: 'アニメ' },
  { label: '音楽', query: '音楽' },
  { label: '東方', query: '東方' },
  { label: 'MAD・音MAD', query: '音MAD' },
  { label: 'ニコニコ技術部', query: 'ニコニコ技術部' }
];

function nicoCommentColor(commands?: string[]): string {
  const colors: Record<string, string> = {
    red: '#ff5252',
    pink: '#ff8ec7',
    orange: '#ff9d3d',
    yellow: '#fff45c',
    green: '#77ee77',
    cyan: '#63e5ff',
    blue: '#6aa9ff',
    purple: '#d18cff',
    black: '#222222',
    white: '#ffffff'
  };
  if (!Array.isArray(commands)) return '#ffffff';
  for (const cmd of commands) {
    if (colors[cmd]) return colors[cmd];
  }
  return '#ffffff';
}

function getOrInitReviewDeviceId(): string {
  try {
    let id = localStorage.getItem('reviewDeviceId');
    if (!id) {
      id =
        (typeof window !== 'undefined' && window.crypto?.randomUUID?.()) ||
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
          const random = Math.floor(Math.random() * 16);
          return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
        });
      localStorage.setItem('reviewDeviceId', id);
    }
    return id;
  } catch {
    return 'kaito-device-default';
  }
}

export function extractNicoVideoId(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  const directIdMatch = trimmed.match(/^(sm|nm|so)\d+$/i);
  if (directIdMatch) return directIdMatch[0].toLowerCase();
  const urlMatch = trimmed.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)((?:sm|nm|so)\d+)/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1].toLowerCase();
  return null;
}

export const NiconicoView: React.FC<NiconicoViewProps> = ({
  externalQuery,
  onSelectSaveToMainHistory
}) => {
  const [subView, setSubView] = useState<'home' | 'search' | 'history' | 'reviews' | 'settings' | 'player'>('home');
  const [thumbMethod, setThumbMethod] = useState<'direct' | 'server'>(() => {
    return (localStorage.getItem('thumbMethod') as 'direct' | 'server') || 'direct';
  });
  const [sortOrder, setSortOrder] = useState<string>('-viewCounter');

  const [currentVideos, setCurrentVideos] = useState<NicoVideoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string>('');
  const [localSearchInput, setLocalSearchInput] = useState<string>(externalQuery || '');
  const [visitCount, setVisitCount] = useState<string>('-');

  // Play history
  const [playHistory, setPlayHistory] = useState<NicoVideoItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('playHistory') || '[]');
    } catch {
      return [];
    }
  });

  // Active playing video state
  const [activeVideo, setActiveVideo] = useState<NicoVideoItem | null>(null);
  const [videoDetails, setVideoDetails] = useState<NicoVideoDetails | null>(null);
  const [descExpanded, setDescExpanded] = useState<boolean>(false);
  const [playerEngine, setPlayerEngine] = useState<'stream' | 'embed'>('stream');
  const [playerLoadingMsg, setPlayerLoadingMsg] = useState<string | null>(null);
  const [playerProgressText, setPlayerProgressText] = useState<string>('');
  const [playerStreamSrc, setPlayerStreamSrc] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Niconico flowing comments state
  const [nicoComments, setNicoComments] = useState<NicoCommentItem[]>([]);
  const [commentsStatusText, setCommentsStatusText] = useState<string>('コメントを取得中...');
  const [showFlowComments, setShowFlowComments] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const commentLayerRef = useRef<HTMLDivElement | null>(null);
  const streamJobIntervalRef = useRef<any>(null);
  const activeStreamJobIdRef = useRef<string | null>(null);

  // Direct Download (DL) Overlay state
  const [dlOverlayOpen, setDlOverlayOpen] = useState<boolean>(false);
  const [dlProgress, setDlProgress] = useState<number>(0);
  const [dlSizeText, setDlSizeText] = useState<string>('容量を計算中...');
  const dlJobIdRef = useRef<string | null>(null);
  const dlIntervalRef = useRef<any>(null);

  // Reviews state
  const [reviewAverage, setReviewAverage] = useState<string>('-');
  const [reviewTotal, setReviewTotal] = useState<number>(0);
  const [reviewAvgStars, setReviewAvgStars] = useState<string>('☆☆☆☆☆');
  const [selectedReviewRating, setSelectedReviewRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [myReviewExists, setMyReviewExists] = useState<boolean>(false);
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState<boolean>(false);
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [reviewStatus, setReviewStatus] = useState<{ text: string; isError: boolean } | null>(null);

  // Base64 thumbnail cache
  const [base64ThumbMap, setBase64ThumbMap] = useState<Record<string, string>>({});

  // 100% In-House Self-Built Niconico API caller (/api/nico/:action)
  const fetchNicoJson = useCallback(
    async (action: string, params: Record<string, string> = {}, options?: RequestInit) => {
      const qs = new URLSearchParams(params).toString();
      const url = `/api/nico/${action}${qs ? '?' + qs : ''}`;
      const res = await customFetch(url, options);
      if (!res.ok) {
        let errText = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) errText = j.error;
        } catch {}
        throw new Error(errText);
      }
      return res.json();
    },
    []
  );

  // Save settings
  const handleSaveSettings = (newThumb: 'direct' | 'server', newDefaultEngine: 'stream' | 'embed') => {
    setThumbMethod(newThumb);
    setPlayerEngine(newDefaultEngine);
    try {
      localStorage.setItem('thumbMethod', newThumb);
      localStorage.setItem('nico_default_engine', newDefaultEngine);
    } catch {}
  };

  // Load recommended Niconico videos from Self-Built Snapshot Engine
  const loadRecommend = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchNicoJson('recommend');
      if (Array.isArray(data)) {
        setCurrentVideos(data);
      } else {
        setCurrentVideos([]);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'おすすめ動画の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [fetchNicoJson]);

  // Search Niconico videos from Self-Built Snapshot Engine
  const doSearch = useCallback(
    async (queryStr: string, customSort?: string) => {
      const q = queryStr.trim();
      if (!q) {
        setActiveTag('');
        setSubView('home');
        loadRecommend();
        return;
      }

      const directNicoId = extractNicoVideoId(q);
      if (directNicoId) {
        const directItem: NicoVideoItem = {
          id: directNicoId,
          title: `ニコニコ動画 (${directNicoId})`,
          thumbnail: `https://nicovideo.cdn.nimg.jp/thumbnails/${directNicoId.replace(/^[a-z]+/i, '')}/${directNicoId.replace(/^[a-z]+/i, '')}`,
          url: `https://www.nicovideo.jp/watch/${directNicoId}`,
          duration: '',
          channel: 'ニコニコ動画'
        };
        playNicoVideo(directItem);
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        const data = await fetchNicoJson('search', {
          q,
          sort: customSort || sortOrder
        });
        if (Array.isArray(data)) {
          setCurrentVideos(data);
        } else {
          setCurrentVideos([]);
        }
      } catch (e: any) {
        setErrorMsg(e?.message || '検索に失敗しました。');
      } finally {
        setLoading(false);
      }
    },
    [fetchNicoJson, loadRecommend, sortOrder]
  );

  // Initial load & visitor count
  useEffect(() => {
    fetchNicoJson('visit')
      .then((data) => {
        if (data?.count) setVisitCount(Number(data.count).toLocaleString());
      })
      .catch(() => {});

    if (externalQuery && externalQuery.trim()) {
      setLocalSearchInput(externalQuery.trim());
      setSubView('search');
      doSearch(externalQuery.trim());
    } else {
      loadRecommend();
    }
  }, []);

  // React to external search bar submissions from Header
  useEffect(() => {
    if (externalQuery && externalQuery.trim()) {
      setLocalSearchInput(externalQuery.trim());
      setSubView('search');
      doSearch(externalQuery.trim());
    }
  }, [externalQuery]);

  // Base64 thumbnail loader when thumbMethod === 'server'
  useEffect(() => {
    if (thumbMethod !== 'server') return;
    const listToLoad = [...currentVideos, ...playHistory];
    listToLoad.forEach((v) => {
      if (!v.thumbnail || base64ThumbMap[v.thumbnail]) return;
      fetchNicoJson('thumb-base64', { url: v.thumbnail })
        .then((data) => {
          if (data?.base64) {
            setBase64ThumbMap((prev) => ({ ...prev, [v.thumbnail]: data.base64 }));
          }
        })
        .catch(() => {});
    });
  }, [thumbMethod, currentVideos, playHistory]);

  // Cleanup active stream jobs on unmount
  const cleanupStreamJob = useCallback(() => {
    if (streamJobIntervalRef.current) {
      clearInterval(streamJobIntervalRef.current);
      streamJobIntervalRef.current = null;
    }
    if (activeStreamJobIdRef.current) {
      const idToCancel = activeStreamJobIdRef.current;
      activeStreamJobIdRef.current = null;
      fetchNicoJson('job-cancel', { id: idToCancel }, { method: 'POST' }).catch(() => {});
    }
  }, [fetchNicoJson]);

  const cleanupDownloadJob = useCallback(() => {
    if (dlIntervalRef.current) {
      clearInterval(dlIntervalRef.current);
      dlIntervalRef.current = null;
    }
    if (dlJobIdRef.current) {
      const idToCancel = dlJobIdRef.current;
      dlJobIdRef.current = null;
      fetchNicoJson('job-cancel', { id: idToCancel }, { method: 'POST' }).catch(() => {});
    }
  }, [fetchNicoJson]);

  useEffect(() => {
    return () => {
      cleanupStreamJob();
      cleanupDownloadJob();
    };
  }, [cleanupStreamJob, cleanupDownloadJob]);

  // Synchronize flowing comments with <video> element
  useEffect(() => {
    const player = videoRef.current;
    const layer = commentLayerRef.current;
    if (!player || !layer || !showFlowComments || nicoComments.length === 0) {
      if (layer) layer.innerHTML = '';
      return;
    }

    const entries = [...nicoComments].sort((a, b) => a.timeMs - b.timeMs);
    let nextIndex = 0;
    let lastTimeMs = 0;

    const findNextIndex = (timeMs: number) => entries.findIndex((c) => c.timeMs >= timeMs);
    const clearFlow = () => {
      if (layer) layer.innerHTML = '';
    };

    const showComment = (comment: NicoCommentItem, index: number) => {
      if (!layer) return;
      const element = document.createElement('div');
      element.className = 'nico-flow-comment';
      element.textContent = comment.text;
      element.style.top = `${6 + (index % 7) * 12}%`;
      element.style.color = nicoCommentColor(comment.commands);
      layer.appendChild(element);
      element.style.setProperty('--nico-travel', `${layer.clientWidth + element.offsetWidth + 24}px`);
      element.addEventListener('animationend', () => element.remove(), { once: true });
    };

    const sync = () => {
      const timeMs = Math.floor(player.currentTime * 1000);
      if (timeMs < lastTimeMs - 500) {
        nextIndex = findNextIndex(timeMs);
        if (nextIndex < 0) nextIndex = entries.length;
        clearFlow();
      }
      while (nextIndex < entries.length && entries[nextIndex].timeMs <= timeMs) {
        if (timeMs - entries[nextIndex].timeMs <= 1800) {
          showComment(entries[nextIndex], nextIndex);
        }
        nextIndex++;
      }
      lastTimeMs = timeMs;
    };

    const pause = () => {
      layer.querySelectorAll<HTMLElement>('.nico-flow-comment').forEach((el) => {
        el.style.animationPlayState = 'paused';
      });
    };

    const play = () => {
      layer.querySelectorAll<HTMLElement>('.nico-flow-comment').forEach((el) => {
        el.style.animationPlayState = 'running';
      });
    };

    player.addEventListener('timeupdate', sync);
    player.addEventListener('seeking', sync);
    player.addEventListener('pause', pause);
    player.addEventListener('play', play);

    return () => {
      player.removeEventListener('timeupdate', sync);
      player.removeEventListener('seeking', sync);
      player.removeEventListener('pause', pause);
      player.removeEventListener('play', play);
      clearFlow();
    };
  }, [nicoComments, showFlowComments, playerStreamSrc]);

  // Play a Niconico video using our 100% Self-Built Engine
  const playNicoVideo = async (video: NicoVideoItem) => {
    cleanupStreamJob();
    setActiveVideo(video);
    setVideoDetails(null);
    setDescExpanded(false);
    setSubView('player');
    setPlayerStreamSrc(null);
    setPlayerError(null);
    setPlayerProgressText('');
    setPlayerLoadingMsg('自作Domand HLS並列復号エンジンで動画を処理中...');
    setNicoComments([]);
    setCommentsStatusText('コメントと動画情報を取得中...');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Save to Niconico playHistory
    setPlayHistory((prev) => {
      const updated = [video, ...prev.filter((v) => v.id !== video.id)].slice(0, 50);
      try {
        localStorage.setItem('playHistory', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Also save to main app watch history
    if (onSelectSaveToMainHistory) {
      onSelectSaveToMainHistory({
        id: video.id,
        snippet: {
          title: `[ニコニコ] ${video.title}`,
          description: video.url,
          publishedAt: new Date().toISOString(),
          channelId: video.channel_url || 'niconico',
          channelTitle: video.channel || 'ニコニコ動画',
          thumbnails: {
            high: { url: video.thumbnail },
            medium: { url: video.thumbnail },
            default: { url: video.thumbnail }
          }
        },
        statistics: video.views ? { viewCount: String(video.views) } : undefined
      });
    }

    // 1. Load real Niconico comments + details directly via Self-Built nvComment Engine
    fetchNicoJson('nico-comments', { id: video.id })
      .then((data) => {
        const list: NicoCommentItem[] = Array.isArray(data?.comments) ? data.comments : [];
        setNicoComments(list);
        if (data?.details) {
          setVideoDetails(data.details);
          if (data.details.title) {
            setActiveVideo((prev) => (prev ? { ...prev, title: data.details.title } : prev));
          }
        }
        setCommentsStatusText(
          list.length > 0
            ? `ニコニコ動画の実コメント ${list.length.toLocaleString()}件を動画上に表示しています。`
            : 'この動画には表示できるコメントがありません。'
        );
      })
      .catch(() => {
        setCommentsStatusText('ニコニコ動画のコメントを取得できませんでした。');
      });

    // 2. Start Self-Built Domand HLS Decrypt + FFmpeg Mux Job
    try {
      const videoUrl = video.url || `https://www.nicovideo.jp/watch/${video.id}`;
      const startData = await fetchNicoJson('job-start', { url: videoUrl, type: 'nico' });
      if (!startData?.jobId) {
        throw new Error('ジョブIDの取得に失敗しました');
      }
      const jobId = String(startData.jobId);

      // If already cached in memory/disk, play immediately!
      if (startData.cached) {
        setPlayerLoadingMsg(null);
        setPlayerStreamSrc(`/api/nico/job-file?id=${encodeURIComponent(jobId)}&type=nico`);
        return;
      }

      activeStreamJobIdRef.current = jobId;

      streamJobIntervalRef.current = setInterval(async () => {
        try {
          const progData = await fetchNicoJson('job-progress', { id: jobId });
          if (progData.status === 'processing') {
            const pct = typeof progData.progress === 'number' ? Math.floor(progData.progress) : 0;
            const sizeInfo = progData.totalSize ? ` (${progData.totalSize})` : '';
            setPlayerProgressText(`${pct}%${sizeInfo}`);
          } else if (progData.status === 'completed') {
            if (streamJobIntervalRef.current) {
              clearInterval(streamJobIntervalRef.current);
              streamJobIntervalRef.current = null;
            }
            activeStreamJobIdRef.current = null;
            setPlayerLoadingMsg(null);
            setPlayerStreamSrc(`/api/nico/job-file?id=${encodeURIComponent(jobId)}&type=nico`);
          } else if (progData.status === 'error') {
            if (streamJobIntervalRef.current) {
              clearInterval(streamJobIntervalRef.current);
              streamJobIntervalRef.current = null;
            }
            activeStreamJobIdRef.current = null;
            setPlayerLoadingMsg(null);
            setPlayerError(
              progData.error ||
                '自作エンジンでのストリーム結合に失敗しました。「公式プレイヤー即時再生」に切り替えて視聴できます。'
            );
          }
        } catch {
          // Retry on next tick
        }
      }, 600);
    } catch {
      setPlayerLoadingMsg(null);
      setPlayerError('ストリーム処理に失敗しました。「公式プレイヤー即時再生」に切り替えて視聴できます。');
    }
  };

  // Trigger Direct Device Download (DL) via Self-Built Job Engine
  const triggerDownload = async () => {
    if (!activeVideo) return;
    const videoUrl = activeVideo.url || `https://www.nicovideo.jp/watch/${activeVideo.id}`;

    cleanupDownloadJob();
    setDlOverlayOpen(true);
    setDlProgress(0);
    setDlSizeText('容量を計算中...');

    try {
      const data = await fetchNicoJson('job-start', { url: videoUrl, type: 'nico' });
      if (!data?.jobId) throw new Error('Failed to start download job');
      const jobId = String(data.jobId);

      if (data.cached) {
        setDlProgress(100);
        setDlSizeText('保存を開始します...');
        setTimeout(() => {
          setDlOverlayOpen(false);
          const a = document.createElement('a');
          a.href = `/api/nico/job-file?id=${encodeURIComponent(jobId)}&type=nico&download=1`;
          a.download = `${activeVideo.id}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, 400);
        return;
      }

      dlJobIdRef.current = jobId;

      dlIntervalRef.current = setInterval(async () => {
        if (!dlJobIdRef.current) return;
        try {
          const progData = await fetchNicoJson('job-progress', { id: jobId });
          if (progData.status === 'processing') {
            const prog = Number(progData.progress) || 0;
            setDlProgress(prog);
            if (progData.totalSize) {
              const totalValStr = String(progData.totalSize);
              const match = totalValStr.match(/([\d.]+)([a-zA-Z]+)/);
              if (match) {
                const totalVal = parseFloat(match[1]);
                const dlVal = (totalVal * (prog / 100)).toFixed(2);
                setDlSizeText(`${dlVal}${match[2]} / ${totalVal}${match[2]}`);
              } else {
                setDlSizeText(totalValStr);
              }
            }
          } else if (progData.status === 'completed') {
            if (dlIntervalRef.current) {
              clearInterval(dlIntervalRef.current);
              dlIntervalRef.current = null;
            }
            dlJobIdRef.current = null;
            setDlProgress(100);
            setDlSizeText('保存を開始します...');

            setTimeout(() => {
              setDlOverlayOpen(false);
              const fileUrl = `/api/nico/job-file?id=${encodeURIComponent(jobId)}&type=nico&download=1`;
              const a = document.createElement('a');
              a.href = fileUrl;
              a.download = `${activeVideo.id}.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }, 600);
          } else if (progData.status === 'error') {
            throw new Error('Download processing error');
          }
        } catch {
          cleanupDownloadJob();
          setDlOverlayOpen(false);
        }
      }, 600);
    } catch {
      cleanupDownloadJob();
      setDlOverlayOpen(false);
    }
  };

  const cancelDownload = () => {
    cleanupDownloadJob();
    setDlOverlayOpen(false);
    setDlSizeText('キャンセルされました');
  };

  // Load Reviews
  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    const deviceId = getOrInitReviewDeviceId();
    try {
      const data = await fetchNicoJson('reviews', { deviceId });
      const total = Number(data?.total) || 0;
      const avg = Number(data?.average) || 0;
      setReviewTotal(total);
      setReviewAverage(total > 0 ? avg.toFixed(1) : '-');
      const rounded = Math.max(0, Math.min(5, Math.round(avg)));
      setReviewAvgStars(total > 0 ? '★'.repeat(rounded) + '☆'.repeat(5 - rounded) : '☆☆☆☆☆');

      if (data?.myReview) {
        setMyReviewExists(true);
        setSelectedReviewRating(Number(data.myReview.rating) || 5);
        setReviewComment(data.myReview.comment || '');
      } else {
        setMyReviewExists(false);
      }
      setReviewsList(Array.isArray(data?.reviews) ? data.reviews : []);
    } catch {
      setReviewsList([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [fetchNicoJson]);

  const handleSaveReview = async () => {
    if (!selectedReviewRating) {
      setReviewStatus({ text: '星評価を選択してください。', isError: true });
      return;
    }
    const chars = Array.from(reviewComment.trim());
    if (chars.length > 20) {
      setReviewStatus({ text: 'レビューは20文字以内で入力してください。', isError: true });
      return;
    }

    setReviewSubmitting(true);
    setReviewStatus({ text: '保存中...', isError: false });
    try {
      const deviceId = getOrInitReviewDeviceId();
      const data = await fetchNicoJson('review-save', {
        rating: String(selectedReviewRating),
        comment: reviewComment.trim(),
        deviceId
      });
      await loadReviews();
      setReviewStatus({
        text: data?.updated ? 'レビューを更新しました。' : 'レビューを投稿しました。',
        isError: false
      });
    } catch (e: any) {
      setReviewStatus({ text: e?.message || 'レビューを保存できませんでした。', isError: true });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const getThumbSrc = (url: string) => {
    if (thumbMethod === 'server' && base64ThumbMap[url]) {
      return base64ThumbMap[url];
    }
    return url;
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-neutral-950 text-neutral-100">
      {/* Direct Download Fullscreen Overlay (#dl-block-overlay) */}
      {dlOverlayOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center p-6">
          <Download className="w-12 h-12 text-sky-400 animate-bounce mb-3" />
          <h2 className="text-xl font-extrabold m-0">ダウンロード準備中...</h2>
          <p className="text-neutral-400 text-sm mt-2">
            自作エンジンで復号・結合し、端末に直接保存されます。このままお待ちください。
          </p>
          <div className="w-4/5 max-w-md h-3 bg-neutral-800 rounded-full overflow-hidden mt-5 border border-neutral-700">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, dlProgress))}%` }}
            />
          </div>
          <p className="text-3xl font-black text-sky-400 mt-3 mb-1">
            {Math.floor(dlProgress)}%
          </p>
          <p className="text-sm text-neutral-300 font-bold m-0">{dlSizeText}</p>
          <button
            type="button"
            onClick={cancelDownload}
            className="mt-6 px-8 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-full text-sm transition-colors cursor-pointer"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* Niconico Sub-Header & Navigation Bar */}
      <div className="bg-[#252525] border-b border-neutral-800 sticky top-14 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
          {/* Left: Niconico Mode Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setSubView('home');
                if (currentVideos.length === 0) loadRecommend();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'home' || subView === 'search'
                  ? 'bg-[#0088cc] text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>おすすめ・検索</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'history'
                  ? 'bg-[#0088cc] text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>再生履歴 ({playHistory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSubView('reviews');
                loadReviews();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'reviews'
                  ? 'bg-[#0088cc] text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span>レビュー</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('settings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'settings'
                  ? 'bg-[#0088cc] text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>再生・表示設定</span>
            </button>

            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 ml-1">
              <Cpu className="w-3 h-3" />
              <span>自作ニコニコエンジン稼働中 (外部サーバー不使用)</span>
            </span>
          </div>

          {/* Right: Quick Search, Sort & Access Counter */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={sortOrder}
              onChange={(e) => {
                const newSort = e.target.value;
                setSortOrder(newSort);
                if (localSearchInput.trim()) {
                  setSubView('search');
                  doSearch(localSearchInput.trim(), newSort);
                }
              }}
              className="px-2.5 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-[#0088cc]"
              title="並び順"
            >
              <option value="-viewCounter">再生数が多い順</option>
              <option value="-mylistCounter">マイリスト数順</option>
              <option value="-commentCounter">コメント数順</option>
              <option value="-startTime">投稿が新しい順</option>
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubView('search');
                doSearch(localSearchInput);
              }}
              className="flex items-center"
            >
              <input
                type="text"
                value={localSearchInput}
                onChange={(e) => setLocalSearchInput(e.target.value)}
                placeholder="ニコニコ検索 / sm番号..."
                className="w-40 sm:w-56 px-3 py-1 bg-neutral-900 border border-neutral-700 focus:border-[#0088cc] rounded-l-full text-xs text-white placeholder-neutral-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-[#0088cc] hover:bg-sky-500 text-white rounded-r-full border border-[#0088cc] text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>検索</span>
              </button>
            </form>

            <div
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-[11px] text-neutral-300"
              title="総アクセス数"
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>{visitCount}</span>
            </div>
          </div>
        </div>

        {/* Genre / Tag Bar when on Home or Search */}
        {(subView === 'home' || subView === 'search') && (
          <div className="max-w-7xl mx-auto px-4 py-2 border-t border-neutral-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {QUICK_NICO_TAGS.map((tag) => {
              const isActive = activeTag === tag.query;
              return (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => {
                    setActiveTag(tag.query);
                    setLocalSearchInput(tag.query);
                    if (!tag.query) {
                      setSubView('home');
                      loadRecommend();
                    } else {
                      setSubView('search');
                      doSearch(tag.query);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-sky-500 text-white'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700/80'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 1. PLAYER VIEW */}
        {subView === 'player' && activeVideo && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  cleanupStreamJob();
                  setSubView('home');
                }}
                className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-xs font-bold text-neutral-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-sky-400" />
                <span>動画一覧に戻る</span>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Switch between Self-Built MP4 Stream (with custom flowing comments) & Official Embed */}
                <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setPlayerEngine('stream')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      playerEngine === 'stream'
                        ? 'bg-[#0088cc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    自作エンジンMP4再生 (コメント弾幕)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerEngine('embed')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      playerEngine === 'embed'
                        ? 'bg-[#0088cc] text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    公式プレイヤー即時再生
                  </button>
                </div>

                {/* Flowing Comments Toggle */}
                {playerEngine === 'stream' && (
                  <button
                    type="button"
                    onClick={() => setShowFlowComments((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      showFlowComments
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    {showFlowComments ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>流れるコメント: {showFlowComments ? 'ON' : 'OFF'}</span>
                  </button>
                )}

                {/* Direct Download Button */}
                <button
                  type="button"
                  onClick={triggerDownload}
                  className="px-4 py-1.5 bg-neutral-200 hover:bg-white text-neutral-950 font-extrabold rounded-full text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DL (端末保存)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Video Player + Info + Comments */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl flex items-center justify-center">
                  {playerEngine === 'embed' ? (
                    <iframe
                      src={`https://embed.nicovideo.jp/watch/${encodeURIComponent(activeVideo.id)}?jsapi=1&playerId=1`}
                      className="w-full h-full border-0"
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      title={activeVideo.title}
                    />
                  ) : (
                    <>
                      {playerLoadingMsg && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-white p-6 text-center space-y-3">
                          <RefreshCw className="w-9 h-9 text-sky-400 animate-spin" />
                          <div className="text-sm font-bold">{playerLoadingMsg}</div>
                          {playerProgressText && (
                            <div className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-mono font-bold">
                              進行状況: {playerProgressText}
                            </div>
                          )}
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => setPlayerEngine('embed')}
                              className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded-lg text-xs text-neutral-200 font-bold cursor-pointer"
                            >
                              待たずに「公式プレイヤー即時再生」で見る
                            </button>
                          </div>
                        </div>
                      )}

                      {playerError && !playerStreamSrc && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-rose-400 p-6 text-center space-y-3">
                          <AlertCircle className="w-9 h-9 text-rose-500" />
                          <div className="text-sm font-bold max-w-md">{playerError}</div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setPlayerEngine('embed')}
                              className="px-4 py-2 bg-[#0088cc] hover:bg-sky-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                              公式プレイヤー即時再生に切替
                            </button>
                            <button
                              type="button"
                              onClick={() => playNicoVideo(activeVideo)}
                              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                              再試行
                            </button>
                          </div>
                        </div>
                      )}

                      <video
                        ref={videoRef}
                        src={playerStreamSrc || undefined}
                        playsInline
                        controls
                        autoPlay
                        className={`w-full h-full bg-black outline-none ${playerStreamSrc ? 'block' : 'hidden'}`}
                      />

                      {/* Niconico Flowing Comments Overlay Layer */}
                      <div
                        ref={commentLayerRef}
                        className="nico-comment-layer"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </div>

                {/* Video Title & Metadata */}
                <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="text-lg sm:text-xl font-extrabold text-white leading-snug">
                      {videoDetails?.title || activeVideo.title}
                    </h1>
                    <span className="px-2.5 py-1 rounded-lg bg-[#0088cc]/20 border border-[#0088cc]/40 text-sky-300 font-mono text-xs font-bold shrink-0">
                      {activeVideo.id}
                    </span>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-neutral-800">
                    <div className="flex items-center gap-3">
                      {videoDetails?.ownerIcon ? (
                        <img
                          src={videoDetails.ownerIcon}
                          alt={videoDetails.ownerName}
                          className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#0088cc]/20 border border-[#0088cc]/40 flex items-center justify-center text-sky-300 font-bold text-sm">
                          <Tv className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-white">
                          {videoDetails?.ownerName || activeVideo.channel || 'ニコニコ動画'}
                        </div>
                        <div className="text-xs text-neutral-400 flex items-center gap-2 flex-wrap">
                          {(videoDetails?.duration || activeVideo.duration) && (
                            <span>{videoDetails?.duration || activeVideo.duration}</span>
                          )}
                          {typeof (videoDetails?.views ?? activeVideo.views) === 'number' && (
                            <span>• {(videoDetails?.views ?? activeVideo.views ?? 0).toLocaleString()}回視聴</span>
                          )}
                          {videoDetails?.likeCount ? (
                            <span className="inline-flex items-center gap-1 text-rose-400">
                              <ThumbsUp className="w-3 h-3" />
                              {videoDetails.likeCount.toLocaleString()}
                            </span>
                          ) : null}
                          {videoDetails?.mylistCount ? (
                            <span className="inline-flex items-center gap-1 text-sky-400">
                              <Bookmark className="w-3 h-3" />
                              マイリスト {videoDetails.mylistCount.toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={activeVideo.url || `https://www.nicovideo.jp/watch/${activeVideo.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>ニコニコ本家で開く</span>
                      </a>
                    </div>
                  </div>

                  {/* Video Description */}
                  {videoDetails?.description && (
                    <div
                      onClick={() => setDescExpanded((prev) => !prev)}
                      className={`mt-2 p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-xl text-xs text-neutral-300 leading-relaxed cursor-pointer overflow-hidden transition-all ${
                        descExpanded ? 'max-h-none' : 'max-h-24'
                      }`}
                    >
                      <div
                        className="prose prose-invert max-w-none text-xs break-words"
                        dangerouslySetInnerHTML={{ __html: videoDetails.description }}
                      />
                    </div>
                  )}
                </div>

                {/* Comments Section */}
                <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-sky-400" />
                      <span>ニコニコ 実コメント ({nicoComments.length.toLocaleString()}件)</span>
                    </h3>
                    <span className="text-xs text-neutral-400">{commentsStatusText}</span>
                  </div>

                  {nicoComments.length > 0 && (
                    <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/60 border border-neutral-800 rounded-xl bg-neutral-950/60">
                      {nicoComments.slice(0, 200).map((c, i) => {
                        const totalSec = Math.max(0, Math.floor((c.timeMs || 0) / 1000));
                        const mm = Math.floor(totalSec / 60);
                        const ss = String(totalSec % 60).padStart(2, '0');
                        return (
                          <div
                            key={`${c.timeMs}-${i}`}
                            onClick={() => {
                              if (videoRef.current && playerStreamSrc) {
                                videoRef.current.currentTime = totalSec;
                              }
                            }}
                            className="px-3 py-2 text-xs flex items-center gap-3 hover:bg-neutral-800/60 cursor-pointer transition-colors"
                          >
                            <span className="font-mono text-sky-400 font-bold shrink-0 w-12">
                              {mm}:{ss}
                            </span>
                            <span
                              className="font-medium break-all"
                              style={{ color: nicoCommentColor(c.commands) }}
                            >
                              {c.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Related Niconico Videos */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-sky-400" />
                  <span>関連動画・おすすめ</span>
                </h3>
                <div className="space-y-2.5">
                  {currentVideos
                    .filter((v) => v.id !== activeVideo.id)
                    .slice(0, 15)
                    .map((video) => (
                      <div
                        key={video.id}
                        onClick={() => playNicoVideo(video)}
                        className="p-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 flex gap-3 cursor-pointer transition-colors group"
                      >
                        <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-neutral-950 shrink-0">
                          <img
                            src={getThumbSrc(video.thumbnail)}
                            alt={video.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                          {video.duration && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white">
                              {video.duration}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-between">
                          <h4 className="text-xs font-bold text-white line-clamp-2 group-hover:text-sky-400 transition-colors">
                            {video.title}
                          </h4>
                          <div className="text-[11px] text-neutral-400">
                            <div className="truncate">{video.channel || 'ニコニコ動画'}</div>
                            {typeof video.views === 'number' && (
                              <div>{video.views.toLocaleString()}回視聴</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. HOME / SEARCH RESULTS GRID */}
        {(subView === 'home' || subView === 'search') && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0088cc]/20 border border-[#0088cc]/40 flex items-center justify-center text-sky-400">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">
                    {subView === 'search' && localSearchInput
                      ? `ニコニコ検索: 「${localSearchInput}」`
                      : 'ニコニコ動画 おすすめトレンド'}
                  </h2>
                  <p className="text-xs text-neutral-400">
                    自作Domand HLS並列復号エンジン • 実コメント弾幕オーバーレイ &amp; 端末直接保存 (DL) 対応
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => (subView === 'search' && localSearchInput ? doSearch(localSearchInput) : loadRecommend())}
                className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-xs font-bold text-neutral-200 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
                <span>更新</span>
              </button>
            </div>

            {loading ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
                <div className="text-sm font-bold text-white">
                  {subView === 'search' ? 'ニコニコ動画を検索中...' : 'おすすめを取得中...'}
                </div>
              </div>
            ) : errorMsg ? (
              <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-2xl text-center max-w-lg mx-auto space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                <div className="text-sm font-bold text-white">{errorMsg}</div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => loadRecommend()}
                    className="px-4 py-2 bg-[#0088cc] hover:bg-sky-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    再試行
                  </button>
                </div>
              </div>
            ) : currentVideos.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl">
                動画が見つかりません。別のキーワードで検索してください。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {currentVideos.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => playNicoVideo(video)}
                    className="group bg-neutral-900/90 hover:bg-neutral-900 border border-neutral-800 hover:border-sky-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all flex flex-col shadow-md"
                  >
                    <div className="relative aspect-video bg-neutral-950 overflow-hidden">
                      <img
                        src={getThumbSrc(video.thumbnail)}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 border border-white/15 text-[10px] font-mono font-bold text-sky-300">
                        {video.id}
                      </span>
                      {video.duration && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-white font-mono text-xs font-bold">
                          {video.duration}
                        </span>
                      )}
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                      <h3 className="text-sm font-bold text-white line-clamp-2 group-hover:text-sky-400 transition-colors leading-snug">
                        {video.title}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                        <span className="truncate">
                          {video.commentsCount
                            ? `💬 ${video.commentsCount.toLocaleString()}`
                            : video.channel || 'ニコニコ動画'}
                        </span>
                        {typeof video.views === 'number' && (
                          <span className="shrink-0 font-medium text-neutral-300">
                            {video.views.toLocaleString()}回視聴
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. PLAY HISTORY VIEW */}
        {subView === 'history' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                <span>ニコニコ再生履歴 ({playHistory.length}件)</span>
              </h2>
              {playHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayHistory([]);
                    try {
                      localStorage.setItem('playHistory', '[]');
                    } catch {}
                  }}
                  className="px-3.5 py-1.5 bg-neutral-900 hover:bg-rose-500/20 border border-neutral-700 hover:border-rose-500/40 rounded-full text-xs font-bold text-neutral-200 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>履歴を削除</span>
                </button>
              )}
            </div>

            {playHistory.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-2xl">
                ニコニコ動画の再生履歴はまだありません。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {playHistory.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => playNicoVideo(video)}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-sky-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all flex flex-col"
                  >
                    <div className="relative aspect-video bg-neutral-950 overflow-hidden">
                      <img
                        src={getThumbSrc(video.thumbnail)}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      {video.duration && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-white font-mono text-xs font-bold">
                          {video.duration}
                        </span>
                      )}
                    </div>
                    <div className="p-3.5 space-y-1.5">
                      <h3 className="text-sm font-bold text-white line-clamp-2 group-hover:text-sky-400">
                        {video.title}
                      </h3>
                      <p className="text-xs text-neutral-400">
                        {video.channel || 'ニコニコ動画'}
                        {typeof video.views === 'number' ? ` • ${video.views.toLocaleString()}回視聴` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. REVIEWS VIEW */}
        {subView === 'reviews' && (
          <div className="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="border-b border-neutral-800 pb-6">
              <h2 className="text-lg font-extrabold text-white mb-4">このサイトの評価</h2>
              <div className="flex items-center gap-4">
                <div className="text-6xl font-black text-white tracking-tighter leading-none">
                  {reviewAverage}
                </div>
                <div className="text-xs text-neutral-400 space-y-1">
                  <div className="font-bold text-neutral-200">平均評価</div>
                  <div>（{reviewTotal}件）</div>
                </div>
              </div>
              <div className="text-amber-400 text-2xl tracking-widest mt-3">{reviewAvgStars}</div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">
                {myReviewExists ? 'あなたのレビュー（編集可能）' : 'このサイトを評価'}
              </h3>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setSelectedReviewRating(star);
                      setReviewStatus(null);
                    }}
                    className={`text-3xl leading-none cursor-pointer transition-transform hover:scale-110 ${
                      star <= selectedReviewRating ? 'text-amber-400' : 'text-neutral-700'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  maxLength={20}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(Array.from(e.target.value).slice(0, 20).join(''))}
                  placeholder="ひとこと（任意・20文字以内）"
                  className="flex-1 px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={handleSaveReview}
                  className="px-5 py-2 bg-[#0088cc] hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm rounded-full cursor-pointer whitespace-nowrap"
                >
                  {myReviewExists ? '編集を保存' : '投稿する'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>
                  {myReviewExists
                    ? 'この端末から投稿済みです。内容を編集できます。'
                    : '星だけでも投稿できます。投稿後はいつでも編集できます。'}
                </span>
                <span>{Array.from(reviewComment).length} / 20文字</span>
              </div>
              {reviewStatus && (
                <div
                  className={`text-xs font-bold ${
                    reviewStatus.isError ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {reviewStatus.text}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-neutral-800">
              {reviewsLoading ? (
                <div className="text-center py-6 text-xs text-neutral-400">レビューを読み込み中...</div>
              ) : reviewsList.length === 0 ? (
                <div className="text-center py-6 text-xs text-neutral-400">まだレビューはありません。</div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {reviewsList.map((rev, idx) => (
                    <div key={idx} className="py-3 space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-300 font-bold text-xs flex items-center justify-center">
                          {rev.iconInitial || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{rev.displayName}</div>
                          <div className="text-[11px] text-neutral-500">
                            {rev.updatedAt && rev.updatedAt !== rev.createdAt ? '更新 ' : '投稿 '}
                            {new Date(rev.updatedAt || rev.createdAt).toLocaleString('ja-JP')}
                          </div>
                        </div>
                      </div>
                      <div className="text-amber-400 text-xs tracking-widest">
                        {'★'.repeat(Math.max(0, Math.min(5, Number(rev.rating) || 0))) +
                          '☆'.repeat(5 - Math.max(0, Math.min(5, Number(rev.rating) || 0)))}
                      </div>
                      {rev.comment && <p className="text-xs text-neutral-200 m-0">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. SETTINGS VIEW */}
        {subView === 'settings' && (
          <div className="max-w-xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-sky-400" />
              <span>自作ニコニコエンジン 設定</span>
            </h2>

            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                <span>100% 自作ニコニコ動画エンジン稼働中（外部個人サーバー不使用）</span>
              </div>
              <p className="text-neutral-300 leading-relaxed">
                検索・おすすめはニコニコ公式 Snapshot Search API v2、コメントは nvComment API、動画再生・DLは Domand HLS (AES-128-CBC) 並列復号＋FFmpeg無劣化結合で自前サーバーから直接処理しています。
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-white">デフォルトの再生方式</label>
              <select
                value={playerEngine}
                onChange={(e) =>
                  handleSaveSettings(thumbMethod, e.target.value as 'stream' | 'embed')
                }
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="stream">自作エンジン MP4ストリーム再生 (流れるコメントオーバーレイ対応)</option>
                <option value="embed">公式埋め込みプレイヤー再生 (エンコード待機なし・即時再生)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-white">サムネイルの取得方法</label>
              <select
                value={thumbMethod}
                onChange={(e) =>
                  handleSaveSettings(e.target.value as 'direct' | 'server', playerEngine)
                }
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="direct">直接リンク (デフォルト・高速)</option>
                <option value="server">自前サーバー経由 (Base64変換・IP完全隠蔽)</option>
              </select>
              <p className="text-xs text-neutral-400">
                ※「自前サーバー経由」を選択すると、サムネイル取得時もクライアントIPが完全に隠蔽されます。
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSubView('home');
                  loadRecommend();
                }}
                className="px-5 py-2 bg-[#0088cc] hover:bg-sky-500 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                保存してホームに戻る
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
