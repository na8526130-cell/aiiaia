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
  X
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
import { formatSubscriberCount, formatPublishedAt, formatViewCount } from '../utils/formatters';

interface ChannelsViewProps {
  onSelectChannel: (channelId: string) => void;
  onSelectVideo?: (video: YouTubeVideoItem) => void;
}

// Curated Popular Educational & Topic Channels
const CURATED_CHANNELS = [
  {
    category: '教育・学習・教養',
    icon: GraduationCap,
    color: 'from-blue-600 to-indigo-700',
    channels: [
      {
        channelId: 'UCQ5rZ4mG4F4wQ_W0qg5sVHQ',
        title: '予備校のノリで学ぶ「大学の数学・物理」',
        customUrl: '@Yobinori',
        description: '大学レベルの数学・物理をわかりやすく解説する理系教育チャンネル',
        subscribers: '115万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_k2GfXqF8qP3B-bA5d3X0Lq=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UC14705vdwT92BlKFgkUvCVA',
        title: '中田敦彦のYouTube大学',
        customUrl: '@nakata_univ',
        description: '歴史・文学・経済・テクノロジーをわかりやすく講義する総合教育チャンネル',
        subscribers: '530万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_nNf1N8T_J1o3k4Gg=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UC0xW_8A4B6mG5h7k_lP2q8w',
        title: 'QuizKnock',
        customUrl: '@QuizKnock',
        description: '東大クイズ王の伊沢拓司率いる、知的好奇心を刺激するエンタメ教育集団',
        subscribers: '210万人',
        avatarUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_kY9P3lX8e4q0=s176-c-k-c0x00ffffff-no-rj'
      },
      {
        channelId: 'UC6Lp7eP7QnLz8_YQ3p1hH9A',
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
        channelId: 'UCzvg9L8SvdJj8cM6Z1qE_aw',
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
        channelId: 'UC0BVm3d3I4hW8T8sP1z0_Xw',
        title: 'Atsueigo',
        customUrl: '@Atsueigo',
        description: 'オーストラリア公認会計士ATSUによる実戦的英語学習と単語マスター',
        subscribers: '65万人',
        avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=160&auto=format&fit=crop&q=80'
      },
      {
        channelId: 'UCeTuvcoQ4GOGYc68L4n48mQ',
        title: 'TED-Ed',
        customUrl: '@TEDEd',
        description: 'アニメーションで世界の一流アイデアを学べる教育プラットフォーム',
        subscribers: '1960万人',
        avatarUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=160&auto=format&fit=crop&q=80'
      }
    ]
  }
];

export const ChannelsView: React.FC<ChannelsViewProps> = ({ onSelectChannel, onSelectVideo }) => {
  const [activeSubTab, setActiveSubTab] = useState<'subscribed' | 'feed' | 'explore' | 'blocked'>('subscribed');
  const [subscriptions, setSubscriptions] = useState<SubscribedChannel[]>([]);
  const [blockedChannels, setBlockedChannels] = useState<BlockedChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Newest Feed State
  const [feedVideos, setFeedVideos] = useState<YouTubeVideoItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

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

  // Fetch newest videos from subscribed channels when feed tab is activated
  useEffect(() => {
    if (activeSubTab !== 'feed' || subscriptions.length === 0) return;

    setLoadingFeed(true);
    // Take up to 6 channels to fetch recent videos
    const targetChannels = subscriptions.slice(0, 6);
    Promise.all(
      targetChannels.map((sub) =>
        customFetch(`/api/youtube/channel/videos/${sub.channelId}?maxResults=8`)
          .then((r) => r.json())
          .then((data) => data.items || [])
          .catch(() => [])
      )
    )
      .then((results) => {
        const flattened = results.flat();
        // Remove duplicates and sort by publishedAt descending
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
      .catch(() => setLoadingFeed(false));
  }, [activeSubTab, subscriptions.length]);

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
                    <span>新しい順 (最新登録)</span>
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
                <span>💡 アイコンを右クリックまたはスマホ長押しで即座に登録解除</span>
              </span>
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
                      onContextMenu={(e) => handleOpenUnsubModal(sub, e)}
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

      {/* 2. NEWEST VIDEOS FEED TAB */}
      {activeSubTab === 'feed' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-white">登録チャンネルの新着動画</h2>
                <p className="text-xs text-neutral-400">あなたが登録したチャンネルの最新アップロード</p>
              </div>
            </div>
            {subscriptions.length > 0 && (
              <span className="text-xs font-semibold text-neutral-400">
                {subscriptions.length} チャンネルを追跡中
              </span>
            )}
          </div>

          {loadingFeed ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-neutral-400">新着動画を巡回取得しています...</p>
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl py-16 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white">新着フィードが空です</h3>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                  お気に入りのチャンネルを登録すると、ここに最新動画が新着順に自動配信されます。
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab('explore')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-xs text-white shadow-md transition-colors cursor-pointer"
              >
                おすすめチャンネルを見る
              </button>
            </div>
          ) : feedVideos.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 space-y-2">
              <Film className="w-8 h-8 text-neutral-600 mx-auto" />
              <p className="text-sm font-semibold">最新動画の取得結果がありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {feedVideos.map((video) => (
                <VideoCard
                  key={typeof video.id === 'string' ? video.id : (video.id as any)?.videoId || Math.random().toString()}
                  video={video}
                  onSelectVideo={(v) => {
                    if (onSelectVideo) onSelectVideo(v);
                  }}
                  onSelectChannel={onSelectChannel}
                  isSaved={false}
                  onToggleSave={() => {}}
                />
              ))}
            </div>
          )}
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
