import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  User,
  ShieldBan,
  Sparkles,
  Search,
  ExternalLink,
  Check,
  Plus,
  Trash2,
  Tv,
  GraduationCap,
  Code,
  Music,
  Gamepad2,
  Globe,
  Radio,
  BookOpen,
  Film,
  Clock,
  Flame,
  Loader2,
  ArrowUpDown,
  AlertTriangle,
  X,
  RefreshCw,
  Play,
  Shuffle,
  Rss
} from 'lucide-react';
import { YouTubeVideoItem } from '../types';
import { VideoCard } from './VideoCard';
import { customFetch } from '../utils/apiClient';
import {
  getSubscribedChannels,
  getBlockedChannels,
  unsubscribeChannel,
  unblockChannel,
  subscribeChannel,
  SubscribedChannel,
  BlockedChannel
} from '../utils/channelStorage';
import { formatSubscriberCount, formatPublishedAt, formatViewCount, isShortVideo } from '../utils/formatters';

interface ChannelsViewProps {
  onSelectChannel: (channelId: string) => void;
  onSelectVideo?: (video: YouTubeVideoItem) => void;
  initialSubTab?: 'subscribed' | 'feed' | 'explore' | 'blocked';
  isVideoSaved?: (video: YouTubeVideoItem) => boolean;
  onToggleSave?: (video: YouTubeVideoItem) => void;
}

// Curated Popular Educational & Topic Channels
const CURATED_CHANNELS = [
  {
    category: '教育・学習・教養',
    icon: GraduationCap,
    color: 'from-blue-600 to-indigo-700',
    channels: [
      {
        channelId: 'UCqmWJJolqAgjIdLqK3zD1QQ',
        title: '予備校のノリで学ぶ「大学の数学・物理」',
        customUrl: '@Yobinori',
        description: '大学レベルの数学・物理をわかりやすく解説する理系教育チャンネル',
        subscribers: '115万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_k2GfXqF8qP3B-bA5d3X0Lq=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UCFo4kqllbcQ4nV83WCyraiw',
        title: '中田敦彦のYouTube大学',
        customUrl: '@nakata_univ',
        description: '歴史・文学・経済・テクノロジーをわかりやすく講義する総合教育チャンネル',
        subscribers: '530万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_nNf1N8T_J1o3k4Gg=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UCQ_MqAw18jFTlBB-f8BP7dw',
        title: 'QuizKnock',
        customUrl: '@QuizKnock',
        description: '東大クイズ王の伊沢拓司率いる、知的好奇心を刺激するエンタメ教育集団',
        subscribers: '210万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_kY9P3lX8e4q0=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UCG_oqDSlIYEspNpd2H4zWhw',
        title: 'ReHacQ−リハック−',
        customUrl: '@ReHacQ',
        description: 'ビジネス・経済・政治の第一人者が本音で激論を交わす教養経済メディア',
        subscribers: '110万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_m4H7V8e3Q=s176-c-k-c0x00ffffff-no-rj'
      }
    ]
  },
  {
    category: 'プログラミング・IT・技術',
    icon: Code,
    color: 'from-emerald-600 to-teal-700',
    channels: [
      {
        channelId: 'UCti6dG0zSAetLGGYcgNML4Q',
        title: 'しまぶーのIT大学',
        customUrl: '@shimabu_it',
        description: '元YahooエンジニアによるWebプログラミング・フロントエンド入門講座',
        subscribers: '14万人',
        avatarUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UC8butISFwT-Wl7EV0hUK0BQ',
        title: 'freeCodeCamp.org',
        customUrl: '@freecodecamp',
        description: '世界最大のオープンソースプログラミング学習・フルコース動画チャンネル',
        subscribers: '980万人',
        avatarUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UC29ju8bIPH5as8OGnSu609A',
        title: 'Traversy Media',
        customUrl: '@traversymedia',
        description: 'React, Node, Python, CSSなどの実践的チュートリアル',
        subscribers: '220万人',
        avatarUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=160&auto=format&fit=crop&q=80'
      }
    ]
  },
  {
    category: '音楽・作業用BGM・集中',
    icon: Music,
    color: 'from-purple-600 to-pink-700',
    channels: [
      {
        channelId: 'UC3vg17IZ1IV73xx069jG44w',
        title: 'Official髭男dism',
        customUrl: '@officialhigedandism',
        description: 'Official髭男dism 公式アーティストチャンネル',
        subscribers: '360万人',
        avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
        title: 'Lofi Girl',
        customUrl: '@lofigirl',
        description: '24時間365日いつでも勉強・作業に集中できるLofi Hip Hopラジオ',
        subscribers: '1450万人',
        avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UC5nc_ZtjKW1htCVZVRDeRXQ',
        title: 'Chillhop Music',
        customUrl: '@ChillhopMusic',
        description: 'リラックスして作業に没頭できる極上のChill & Jazz Beats',
        subscribers: '340万人',
        avatarUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=160&auto=format&fit=crop&q=80'
      }
    ]
  },
  {
    category: '語学・英語・スキルアップ',
    icon: Globe,
    color: 'from-amber-600 to-orange-700',
    channels: [
      {
        channelId: 'UCgeaC4OEk0t54m2hWQtjjIw',
        title: 'Atsueigo',
        customUrl: '@Atsueigo',
        description: 'オーストラリア公認会計士ATSUによる実戦的英語学習と単語マスター',
        subscribers: '65万人',
        avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UCsooa4yRKGN_zEE8iknghZA',
        title: 'TED-Ed',
        customUrl: '@TEDEd',
        description: 'アニメーションで世界の一流アイデアを学べる教育プラットフォーム',
        subscribers: '1960万人',
        avatarUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=160&auto=format&fit=crop&q=80'
      }
    ]
  }
];

export const ChannelsView: React.FC<ChannelsViewProps> = ({
  onSelectChannel,
  onSelectVideo,
  initialSubTab = 'subscribed',
  isVideoSaved,
  onToggleSave
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'subscribed' | 'feed' | 'explore' | 'blocked'>(initialSubTab);
  const [subscriptions, setSubscriptions] = useState<SubscribedChannel[]>([]);
  const [blockedChannels, setBlockedChannels] = useState<BlockedChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Newest Feed State (==== Joined Combined Timeline)
  const [feedVideos, setFeedVideos] = useState<YouTubeVideoItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedTick, setFeedTick] = useState(0);
  const [selectedFeedChannelId, setSelectedFeedChannelId] = useState<string>('all');
  const [feedTypeFilter, setFeedTypeFilter] = useState<'all' | 'video' | 'short'>('all');
  const [feedSearchQuery, setFeedSearchQuery] = useState<string>('');
  const [instantUnsubToast, setInstantUnsubToast] = useState<SubscribedChannel | null>(null);

  // Concatenated Channel IDs string (UCxxx====UCyyy====UCzzz)
  const concatenatedChannelIds = React.useMemo(() => {
    return subscriptions
      .slice(0, 30)
      .map((s) => s.channelId)
      .filter(Boolean)
      .join('====');
  }, [subscriptions]);

  // Instant right-click unsubscribe handler (@contextmenu.prevent)
  const handleInstantRightClickUnsub = (sub: SubscribedChannel, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    unsubscribeChannel(sub.channelId);
    setInstantUnsubToast(sub);
    refreshData();
  };

  const handleUndoInstantUnsub = () => {
    if (!instantUnsubToast) return;
    subscribeChannel(instantUnsubToast);
    setInstantUnsubToast(null);
    refreshData();
  };

  useEffect(() => {
    if (!instantUnsubToast) return;
    const t = setTimeout(() => setInstantUnsubToast(null), 5000);
    return () => clearTimeout(t);
  }, [instantUnsubToast]);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Subscriptions Sort Order ('newest' is default as requested)
  const [subSortOrder, setSubSortOrder] = useState<'newest' | 'name' | 'subscribers'>('newest');
  const [unsubConfirmTarget, setUnsubConfirmTarget] = useState<SubscribedChannel | null>(null);
  const touchTimerRef = useRef<any>(null);

  // Helper to parse subscriber counts like "115万人", "2.5M", "500K"
  const parseSubs = (str?: string): number => {
    if (!str) return 0;
    let n = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    if (str.includes('億')) n *= 100000000;
    else if (str.includes('万')) n *= 10000;
    else if (str.toLowerCase().includes('m')) n *= 1000000;
    else if (str.toLowerCase().includes('k')) n *= 1000;
    return n;
  };

  const refreshData = () => {
    setSubscriptions(getSubscribedChannels());
    setBlockedChannels(getBlockedChannels());
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('kaito_channel_subs_changed', refreshData);
    window.addEventListener('kaito_channel_blocked_changed', refreshData);
    return () => {
      window.removeEventListener('kaito_channel_subs_changed', refreshData);
      window.removeEventListener('kaito_channel_blocked_changed', refreshData);
    };
  }, []);

  // Fetch newest videos from subscribed channels via ==== concatenated IDs (UCxxx====UCyyy====UCzzz)
  useEffect(() => {
    const shouldFetchTimeline =
      (activeSubTab === 'feed' || (activeSubTab === 'subscribed' && subSortOrder === 'newest')) &&
      subscriptions.length > 0;
    if (!shouldFetchTimeline) return;

    let cancelled = false;
    setLoadingFeed(true);

    const joinedIds = subscriptions
      .slice(0, 25)
      .map((sub) => sub.channelId)
      .filter(Boolean)
      .join('====');

    // Send UCxxx====UCyyy====UCzzz to backend playlist endpoint to fetch UUxxx uploads in parallel
    customFetch(`/api/youtube/playlist/${encodeURIComponent(joinedIds)}`)
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            if (!cancelled) {
              setFeedVideos(data.items);
              setLoadingFeed(false);
            }
            return;
          }
        }
        // Fallback parallel channel uploads fetch
        const targetChannels = subscriptions.slice(0, 12);
        const results = await Promise.all(
          targetChannels.map((sub) =>
            customFetch(`/api/youtube/channel/videos/${sub.channelId}?maxResults=10`)
              .then((res) => res.json())
              .then((data) =>
                (data.items || []).map((v: YouTubeVideoItem) => ({
                  ...v,
                  snippet: {
                    ...v.snippet,
                    channelId: v.snippet?.channelId || sub.channelId,
                    channelTitle: v.snippet?.channelTitle || sub.channelTitle
                  }
                }))
              )
              .catch(() => [])
          )
        );
        if (cancelled) return;
        const flattened = results.flat();
        const map = new Map<string, YouTubeVideoItem>();
        for (const v of flattened) {
          const id = typeof v.id === 'string' ? v.id : (v.id as any)?.videoId;
          if (id && !map.has(id)) {
            map.set(id, v);
          }
        }
        const sorted = Array.from(map.values()).sort((a, b) => {
          const dateA = new Date(a.snippet?.publishedAt || 0).getTime();
          const dateB = new Date(b.snippet?.publishedAt || 0).getTime();
          return dateB - dateA;
        });
        setFeedVideos(sorted);
        setLoadingFeed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingFeed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubTab, subSortOrder, subscriptions.length, feedTick]);

  const handleUnsubscribe = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    unsubscribeChannel(channelId);
    refreshData();
  };

  const handleUnblock = (channelId: string) => {
    unblockChannel(channelId);
    refreshData();
  };

  const handleQuickSubscribeCurated = (channel: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const isSub = subscriptions.some((s) => s.channelId === channel.channelId);
    if (isSub) {
      unsubscribeChannel(channel.channelId);
    } else {
      subscribeChannel({
        channelId: channel.channelId,
        channelTitle: channel.title,
        customUrl: channel.customUrl,
        avatarUrl: channel.avatarUrl,
        subscriberCount: channel.subscribers,
        description: channel.description,
        subscribedAt: new Date().toISOString()
      });
    }
    refreshData();
  };

  const filteredSubs = subscriptions.filter((s) =>
    s.channelTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.customUrl && s.customUrl.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Apply Sort (Default: 'newest' / 新しい順)
  const sortedSubs = [...filteredSubs].sort((a, b) => {
    if (subSortOrder === 'newest') {
      const timeA = new Date(a.subscribedAt || 0).getTime();
      const timeB = new Date(b.subscribedAt || 0).getTime();
      return timeB - timeA;
    } else if (subSortOrder === 'name') {
      return a.channelTitle.localeCompare(b.channelTitle, 'ja');
    } else if (subSortOrder === 'subscribers') {
      return parseSubs(b.subscriberCount) - parseSubs(a.subscriberCount);
    }
    return 0;
  });

  const handleOpenUnsubModal = (sub: SubscribedChannel, e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setUnsubConfirmTarget(sub);
  };

  const handleConfirmQuickUnsub = () => {
    if (unsubConfirmTarget) {
      unsubscribeChannel(unsubConfirmTarget.channelId);
      setUnsubConfirmTarget(null);
      refreshData();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-white animate-in fade-in duration-200">
      {/* Quick Unsubscribe Confirmation Modal */}
      {unsubConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 text-center relative">
            <button
              onClick={() => setUnsubConfirmTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto overflow-hidden">
              {unsubConfirmTarget.avatarUrl ? (
                <img src={unsubConfirmTarget.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">チャンネル登録の解除</h3>
              <p className="text-xs text-neutral-300 font-semibold truncate px-2">
                「{unsubConfirmTarget.channelTitle}」
              </p>
              <p className="text-[11px] text-neutral-400 pt-1">
                右クリック / 長押しショートカットによる登録解除です。登録を解除しますか？
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnsubConfirmTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmQuickUnsub}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg transition-colors cursor-pointer"
              >
                登録を解除
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-neutral-900 via-neutral-900 to-rose-950/40 p-5 sm:p-6 rounded-2xl border border-neutral-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
            <Tv className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>チャンネル管理 & ディレクトリ</span>
            </h1>
            <p className="text-xs text-neutral-400">
              登録したチャンネル一覧・人気のおすすめチャンネル・非表示ブロックの管理
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('subscribed')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'subscribed'
                ? 'bg-rose-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>登録チャンネル ({subscriptions.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('feed')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'feed'
                ? 'bg-rose-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>最新動画フィード</span>
          </button>

          <button
            onClick={() => setActiveSubTab('explore')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'explore'
                ? 'bg-rose-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>おすすめチャンネル</span>
          </button>

          <button
            onClick={() => setActiveSubTab('blocked')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'blocked'
                ? 'bg-rose-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShieldBan className="w-3.5 h-3.5" />
            <span>非表示中 ({blockedChannels.length})</span>
          </button>
        </div>
      </div>

      {/* Instant Right-Click Unsubscribe Undo Toast */}
      {instantUnsubToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-neutral-900/95 border border-rose-500/40 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/15 border border-rose-500/30 overflow-hidden shrink-0 flex items-center justify-center">
            {instantUnsubToast.avatarUrl ? (
              <img src={instantUnsubToast.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Trash2 className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="text-xs">
            <p className="font-bold text-white">右クリック一発登録解除しました</p>
            <p className="text-[11px] text-neutral-400 truncate max-w-[200px]">{instantUnsubToast.channelTitle}</p>
          </div>
          <button
            type="button"
            onClick={handleUndoInstantUnsub}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition-colors"
          >
            元に戻す
          </button>
          <button
            type="button"
            onClick={() => setInstantUnsubToast(null)}
            className="p-1 text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Subscribed Channels Circular Icons Bar (Right-click @contextmenu.prevent to instantly unsubscribe) */}
      {subscriptions.length > 0 && (
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-rose-400" />
              <span>登録チャンネル クイックバー ({subscriptions.length})</span>
            </span>
            <span className="text-rose-300/90 font-medium">
              💡 丸アイコンを左クリックで開く / 右クリックで一発登録解除
            </span>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto py-1 px-1 scrollbar-none">
            {subscriptions.map((sub) => (
              <button
                key={`top_circle_${sub.channelId}`}
                type="button"
                onClick={() => onSelectChannel(sub.channelId)}
                onContextMenu={(e) => handleInstantRightClickUnsub(sub, e)}
                title={`${sub.channelTitle}\n左クリック: チャンネルを開く\n右クリック: 即座に登録解除`}
                className="group flex flex-col items-center gap-1 shrink-0 w-16 cursor-pointer select-none"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-950 border-2 border-neutral-700 group-hover:border-rose-500 overflow-hidden flex items-center justify-center transition-all shadow-md relative">
                  {sub.avatarUrl ? (
                    <img src={sub.avatarUrl} alt={sub.channelTitle} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
                <span className="text-[10px] text-neutral-300 group-hover:text-white truncate w-full text-center font-medium">
                  {sub.channelTitle}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 1. SUBSCRIBED CHANNELS TAB */}
      {activeSubTab === 'subscribed' && (
        <div className="space-y-5">
          {/* Controls Bar: Search & Sort Tabs */}
          {subscriptions.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-900/60 p-3 rounded-2xl border border-neutral-800">
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="登録チャンネルを検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Sort Order Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] text-neutral-400 shrink-0 font-medium">並び替え:</span>
                <div className="flex items-center bg-neutral-950 p-0.5 rounded-xl border border-neutral-800 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setSubSortOrder('newest')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      subSortOrder === 'newest'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Clock className="w-3 h-3 text-rose-300" />
                    <span>新しい順 (====合同タイムライン)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubSortOrder('name')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      subSortOrder === 'name'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>名前順</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubSortOrder('subscribers')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      subSortOrder === 'subscribers'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>登録者数順</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shortcut hint */}
          {subscriptions.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
              <span>全 {sortedSubs.length} 件のチャンネル</span>
              <span className="text-neutral-400 flex items-center gap-1">
                <span>💡 丸アイコンを右クリックで一発登録解除 / スマホ長押しで確認解除</span>
              </span>
            </div>
          )}

          {/* Combined Timeline Section when 'newest' tab is selected */}
          {subSortOrder === 'newest' && subscriptions.length > 0 && (
            <div className="bg-neutral-900/90 border border-emerald-500/30 rounded-2xl p-4 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                      <Rss className="w-3 h-3" />
                      <span>合同タイムライン (新しい順)</span>
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono truncate max-w-[260px] sm:max-w-md" title={concatenatedChannelIds}>
                      ID連結: {concatenatedChannelIds}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300">
                    全登録チャンネルのアップロード動画（UUxxx）を並列取得し、投稿日時順に1本のリストへ統合表示しています
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={feedVideos.length === 0}
                    onClick={() => {
                      if (feedVideos.length > 0 && onSelectVideo) {
                        onSelectVideo({
                          ...feedVideos[0],
                          playlistId: concatenatedChannelIds || 'custom_subs_timeline',
                          customPlaylistTitle: '登録チャンネル合同タイムライン (新しい順)',
                          customPlaylistItems: feedVideos
                        });
                      }
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>合同タイムラインを連続再生 ({feedVideos.length}本)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFeedTick((t) => t + 1)}
                    disabled={loadingFeed}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>再取得</span>
                  </button>
                </div>
              </div>

              {loadingFeed ? (
                <div className="py-10 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
                  <p className="text-xs text-neutral-400">
                    {subscriptions.length} チャンネルのアップロード動画 (UUxxx) を並列取得・統合中...
                  </p>
                </div>
              ) : feedVideos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-1">
                  {feedVideos.slice(0, 16).map((video, idx) => {
                    const vId = typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || idx;
                    return (
                      <VideoCard
                        key={`combined_newest_${vId}_${idx}`}
                        video={{
                          ...video,
                          playlistId: concatenatedChannelIds || 'custom_subs_timeline',
                          customPlaylistTitle: '登録チャンネル合同タイムライン (新しい順)',
                          customPlaylistItems: feedVideos
                        }}
                        onSelect={(v) => onSelectVideo && onSelectVideo(v)}
                        onSelectChannel={onSelectChannel}
                        isSaved={isVideoSaved ? isVideoSaved(video) : false}
                        onToggleSave={onToggleSave}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          {sortedSubs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedSubs.map((sub) => (
                <div
                  key={sub.channelId}
                  onClick={() => onSelectChannel(sub.channelId)}
                  onContextMenu={(e) => handleOpenUnsubModal(sub, e)}
                  onTouchStart={() => {
                    touchTimerRef.current = setTimeout(() => {
                      setUnsubConfirmTarget(sub);
                    }, 500);
                  }}
                  onTouchEnd={() => {
                    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                  }}
                  onTouchMove={() => {
                    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                  }}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer select-none"
                  title="クリックでチャンネルを開く / 右クリックで登録解除"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      onContextMenu={(e) => handleInstantRightClickUnsub(sub, e)}
                      title="右クリックで即座に一発登録解除"
                      className="w-14 h-14 rounded-full bg-neutral-950 border border-neutral-700 overflow-hidden shrink-0 flex items-center justify-center relative group/avatar hover:border-rose-500 transition-colors"
                    >
                      {sub.avatarUrl ? (
                        <img src={sub.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-neutral-400" />
                      )}
                    </div>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-white group-hover:text-rose-400 transition-colors truncate">
                        {sub.channelTitle}
                      </h3>
                      {sub.customUrl && (
                        <p className="text-[11px] text-rose-400 truncate">{sub.customUrl}</p>
                      )}
                      {sub.subscriberCount && (
                        <p className="text-[11px] text-neutral-400">
                          登録者: {formatSubscriberCount(sub.subscriberCount)}
                        </p>
                      )}
                    </div>
                  </div>

                  {sub.description && (
                    <p className="text-xs text-neutral-400 line-clamp-2 mt-3 leading-relaxed">
                      {sub.description}
                    </p>
                  )}

                  <div className="pt-4 mt-3 border-t border-neutral-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      <span>チャンネル画面を開く</span>
                      <span>→</span>
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenUnsubModal(sub, e);
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="登録解除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl py-16 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white">登録中のチャンネルはありません</h3>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                  動画詳細画面やおすすめチャンネル一覧から「チャンネル登録」するとここに一覧表示されます。
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab('explore')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-xs text-white shadow-md transition-colors"
              >
                おすすめチャンネルを探す
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. NEWEST VIDEOS FEED TAB (新着タイムライン / 登録チャンネルフィード) */}
      {activeSubTab === 'feed' && (
        <div className="space-y-5">
          {/* Feed Header & Quick Play / Refresh Controls */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <Rss className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>登録チャンネルの新着タイムライン</span>
                    {subscriptions.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                        {subscriptions.length} チャンネル購読中
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-neutral-400">
                    登録しているYouTuberたちの最新アップロード動画を時系列順で一覧表示します
                  </p>
                </div>
              </div>

              {subscriptions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const visible = feedVideos.filter((v) => {
                        if (selectedFeedChannelId !== 'all' && v.snippet?.channelId !== selectedFeedChannelId) return false;
                        if (feedTypeFilter === 'short' && !isShortVideo(v)) return false;
                        if (feedTypeFilter === 'video' && isShortVideo(v)) return false;
                        return true;
                      });
                      if (visible.length > 0 && onSelectVideo) {
                        onSelectVideo({
                          ...visible[0],
                          playlistId: 'custom_subs_timeline',
                          customPlaylistTitle: '登録チャンネル新着タイムライン',
                          customPlaylistItems: visible
                        });
                      }
                    }}
                    disabled={feedVideos.length === 0}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>新着を連続再生</span>
                  </button>

                  <button
                    onClick={() => {
                      const visible = feedVideos.filter((v) => {
                        if (selectedFeedChannelId !== 'all' && v.snippet?.channelId !== selectedFeedChannelId) return false;
                        if (feedTypeFilter === 'short' && !isShortVideo(v)) return false;
                        if (feedTypeFilter === 'video' && isShortVideo(v)) return false;
                        return true;
                      });
                      if (visible.length > 0 && onSelectVideo) {
                        const shuffled = [...visible];
                        for (let i = shuffled.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        }
                        onSelectVideo({
                          ...shuffled[0],
                          playlistId: 'custom_subs_timeline_shuffle',
                          customPlaylistTitle: '登録チャンネル新着 (シャッフル)',
                          customPlaylistItems: shuffled
                        });
                      }
                    }}
                    disabled={feedVideos.length === 0}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>シャッフル</span>
                  </button>

                  <button
                    onClick={() => setFeedTick((t) => t + 1)}
                    disabled={loadingFeed}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>更新</span>
                  </button>
                </div>
              )}
            </div>

            {/* Subscribed Channel Avatar Filter Strip & Search */}
            {subscriptions.length > 0 && (
              <div className="pt-3 border-t border-neutral-800/80 space-y-3">
                {/* Horizontal Channel Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedFeedChannelId('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      selectedFeedChannelId === 'all'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>すべてのチャンネル</span>
                  </button>

                  {subscriptions.map((sub) => {
                    const isSelected = selectedFeedChannelId === sub.channelId;
                    return (
                      <button
                        key={sub.channelId}
                        onClick={() => setSelectedFeedChannelId(isSelected ? 'all' : sub.channelId)}
                        onContextMenu={(e) => handleInstantRightClickUnsub(sub, e)}
                        title="左クリック: フィルター / 右クリック: 一発登録解除"
                        className={`pl-1.5 pr-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 border ${
                          isSelected
                            ? 'bg-rose-600 border-rose-400 text-white shadow'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {sub.avatarUrl ? (
                            <img src={sub.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-3 h-3 text-neutral-400" />
                          )}
                        </div>
                        <span className="max-w-[130px] truncate">{sub.channelTitle}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Keyword & Video Type Filter Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={feedSearchQuery}
                      onChange={(e) => setFeedSearchQuery(e.target.value)}
                      placeholder="新着タイムライン内をキーワード検索..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                    {feedSearchQuery && (
                      <button
                        onClick={() => setFeedSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    {(
                      [
                        { id: 'all', label: 'すべて' },
                        { id: 'video', label: '通常動画のみ' },
                        { id: 'short', label: 'ショートのみ' }
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setFeedTypeFilter(t.id)}
                        className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                          feedTypeFilter === t.id
                            ? 'bg-neutral-800 text-white border border-neutral-600'
                            : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {loadingFeed ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-neutral-400">登録チャンネルの最新アップロードを巡回取得しています...</p>
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl py-16 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                <Rss className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white">まだ登録チャンネルがありません</h3>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                  お気に入りのYouTuberやアーティストをチャンネル登録すると、ここに最新動画が時系列で自動配信されます。
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab('explore')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-xs text-white shadow-md transition-colors cursor-pointer"
              >
                おすすめチャンネルを見る
              </button>
            </div>
          ) : (() => {
            const visibleFeed = feedVideos.filter((v) => {
              if (selectedFeedChannelId !== 'all' && v.snippet?.channelId !== selectedFeedChannelId) {
                return false;
              }
              if (feedTypeFilter === 'short' && !isShortVideo(v)) return false;
              if (feedTypeFilter === 'video' && isShortVideo(v)) return false;
              if (feedSearchQuery.trim()) {
                const q = feedSearchQuery.trim().toLowerCase();
                const title = (v.snippet?.title || '').toLowerCase();
                const ch = (v.snippet?.channelTitle || '').toLowerCase();
                if (!title.includes(q) && !ch.includes(q)) return false;
              }
              return true;
            });

            if (visibleFeed.length === 0) {
              return (
                <div className="py-16 text-center text-neutral-400 space-y-2 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
                  <Film className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p className="text-sm font-semibold text-white">条件に一致する新着動画がありません</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {visibleFeed.map((video) => (
                  <VideoCard
                    key={typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || Math.random().toString()}
                    video={video}
                    onSelectVideo={(v) => {
                      if (onSelectVideo) onSelectVideo(v);
                    }}
                    onSelectChannel={onSelectChannel}
                    isSaved={isVideoSaved ? isVideoSaved(video) : false}
                    onToggleSave={onToggleSave}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* 3. EXPLORE FEATURED CHANNELS TAB */}
      {activeSubTab === 'explore' && (
        <div className="space-y-8">
          {CURATED_CHANNELS.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.category} className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-neutral-800 pb-2.5">
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${section.color} text-white shadow-sm`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-white">{section.category}</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {section.channels.map((ch) => {
                    const isSub = subscriptions.some((s) => s.channelId === ch.channelId);
                    return (
                      <div
                        key={ch.channelId}
                        onClick={() => onSelectChannel(ch.channelId)}
                        className="group bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="w-13 h-13 rounded-full bg-neutral-950 border border-neutral-700 overflow-hidden shrink-0 flex items-center justify-center">
                            {ch.avatarUrl ? (
                              <img src={ch.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 text-neutral-400" />
                            )}
                          </div>

                          <div className="space-y-0.5 min-w-0 flex-1">
                            <h3 className="font-bold text-sm text-white group-hover:text-rose-400 transition-colors line-clamp-1">
                              {ch.title}
                            </h3>
                            <p className="text-[11px] text-rose-400 truncate">{ch.customUrl}</p>
                            <p className="text-[11px] text-neutral-400">登録者: {ch.subscribers}</p>
                          </div>
                        </div>

                        <p className="text-xs text-neutral-400 line-clamp-2 mt-3 leading-relaxed">
                          {ch.description}
                        </p>

                        <div className="pt-3.5 mt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-neutral-300 group-hover:text-white flex items-center gap-1">
                            <span>詳細</span>
                            <span>→</span>
                          </span>

                          <button
                            onClick={(e) => handleQuickSubscribeCurated(ch, e)}
                            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition-all ${
                              isSub
                                ? 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                                : 'bg-rose-600 hover:bg-rose-500 text-white shadow'
                            }`}
                          >
                            {isSub ? (
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. BLOCKED CHANNELS TAB */}
      {activeSubTab === 'blocked' && (
        <div className="space-y-4">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 text-xs text-neutral-300 space-y-1">
            <p className="font-bold text-white text-sm flex items-center gap-1.5">
              <ShieldBan className="w-4 h-4 text-rose-400" />
              <span>非表示（ブロック）中のチャンネルについて</span>
            </p>
            <p className="text-neutral-400">
              ここに登録されているチャンネルの動画は、ホーム・検索・急上昇などのフィードから自動的に除外されます。
            </p>
          </div>

          {blockedChannels.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {blockedChannels.map((b) => (
                <div
                  key={b.channelId}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0">
                      {b.avatarUrl ? (
                        <img src={b.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <User className="w-5 h-5 text-neutral-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-white truncate">{b.channelTitle}</h4>
                      <p className="text-[10px] text-neutral-500 font-mono truncate">{b.channelId}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUnblock(b.channelId)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-rose-400 hover:text-rose-300 border border-neutral-700 transition-colors shrink-0 cursor-pointer"
                  >
                    非表示を解除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl py-14 text-center space-y-2">
              <ShieldBan className="w-8 h-8 text-neutral-600 mx-auto" />
              <p className="text-sm font-semibold text-neutral-300">非表示中のチャンネルはありません</p>
              <p className="text-xs text-neutral-500">
                動画カードの「...」メニューやチャンネル画面から非表示に追加できます。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
