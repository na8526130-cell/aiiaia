import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bookmark,
  Clock,
  FolderPlus,
  Trash2,
  Play,
  Plus,
  ListVideo,
  Search,
  X,
  Calendar,
  Download,
  Upload,
  Copy,
  Check,
  Database,
  Shuffle,
  ListPlus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  Users,
  ShieldBan,
  Globe,
  Lock,
  Share2,
  Edit3,
  RefreshCw
} from 'lucide-react';
import { YouTubeVideoItem, UserCustomPlaylist } from '../types';
import { VideoCard } from './VideoCard';
import { ThumbnailImage } from './ThumbnailImage';
import {
  getSubscribedChannels,
  getBlockedChannels
} from '../utils/channelStorage';
import {
  createBackupPayload,
  encodeBackupToTextCode,
  parseBackupInput,
  restoreFromBackupPayload,
  removeVideoFromCustomPlaylist,
  updateCustomPlaylistVisibility,
  updateCustomPlaylistMeta,
  clonePlaylistToCustomPlaylists,
  buildPlaylistShareUrl,
  fetchPublicPlaylistsFromServer,
  fetchSharedPlaylistByIdOrInput,
  addToUpNextQueueNext,
  getVideoUniqueId,
  showGlobalToast
} from '../utils/userDataManager';

interface LibraryViewProps {
  savedVideos: YouTubeVideoItem[];
  watchHistory: YouTubeVideoItem[];
  customPlaylists: UserCustomPlaylist[];
  onSelectVideo: (video: YouTubeVideoItem) => void;
  onSelectChannel: (channelId: string) => void;
  onToggleSave: (video: YouTubeVideoItem) => void;
  onClearHistory: () => void;
  onRemoveHistoryItem?: (videoId: string) => void;
  onCreatePlaylist: (
    title: string,
    description: string,
    visibility?: 'public' | 'private',
    authorName?: string
  ) => void;
  onDeletePlaylist: (id: string) => void;
}

type HistoryDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'older';

function classifyHistoryDate(isoStr?: string): {
  bucket: HistoryDateFilter;
  dateLabel: string;
  sortKey: string;
} {
  if (!isoStr) {
    return {
      bucket: 'older',
      dateLabel: '以前の視聴履歴',
      sortKey: '0000-00-00'
    };
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) {
    return {
      bucket: 'older',
      dateLabel: '以前の視聴履歴',
      sortKey: '0000-00-00'
    };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400 * 1000;
  const weekStart = todayStart - 7 * 86400 * 1000;
  const monthStart = todayStart - 30 * 86400 * 1000;
  const targetTime = d.getTime();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const sortKey = `${y}-${m}-${day}`;

  if (targetTime >= todayStart) {
    return { bucket: 'today', dateLabel: `今日 (${y}/${m}/${day})`, sortKey };
  }
  if (targetTime >= yesterdayStart) {
    return { bucket: 'yesterday', dateLabel: `昨日 (${y}/${m}/${day})`, sortKey };
  }
  if (targetTime >= weekStart) {
    return { bucket: 'week', dateLabel: `${y}年${Number(m)}月${Number(day)}日 (今週)`, sortKey };
  }
  if (targetTime >= monthStart) {
    return { bucket: 'month', dateLabel: `${y}年${Number(m)}月${Number(day)}日 (今月)`, sortKey };
  }
  return { bucket: 'older', dateLabel: `${y}年${Number(m)}月${Number(day)}日`, sortKey };
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  savedVideos,
  watchHistory,
  customPlaylists,
  onSelectVideo,
  onSelectChannel,
  onToggleSave,
  onClearHistory,
  onRemoveHistoryItem,
  onCreatePlaylist,
  onDeletePlaylist
}) => {
  const [activeTab, setActiveTab] = useState<'saved' | 'history' | 'playlists' | 'backup'>('saved');
  const [playlistSubTab, setPlaylistSubTab] = useState<'my' | 'public'>('my');
  const [playlistVisFilter, setPlaylistVisFilter] = useState<'all' | 'public' | 'private'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<UserCustomPlaylist | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');
  const [playlistVisibility, setPlaylistVisibility] = useState<'public' | 'private'>('private');
  const [playlistAuthor, setPlaylistAuthor] = useState(() => localStorage.getItem('kaito_playlist_author') || '');
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  // Public Playlists & Clone states
  const [publicPlaylists, setPublicPlaylists] = useState<UserCustomPlaylist[]>([]);
  const [loadingPublicPlaylists, setLoadingPublicPlaylists] = useState(false);
  const [publicSearchQuery, setPublicSearchQuery] = useState('');
  const [cloneUrlInput, setCloneUrlInput] = useState('');
  const [cloningPlaylistId, setCloningPlaylistId] = useState<string | null>(null);

  // History Search & Date Grouping states
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<HistoryDateFilter>('all');
  const [groupHistoryByDate, setGroupHistoryByDate] = useState<boolean>(true);
  const [savedQuery, setSavedQuery] = useState('');

  // Backup / Restore states
  const [includeHistoryInBackup, setIncludeHistoryInBackup] = useState(true);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [backupCodeOutput, setBackupCodeOutput] = useState('');
  const [importTextInput, setImportTextInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPublicPlaylists = (q = publicSearchQuery) => {
    setLoadingPublicPlaylists(true);
    fetchPublicPlaylistsFromServer(q)
      .then((items) => setPublicPlaylists(items))
      .finally(() => setLoadingPublicPlaylists(false));
  };

  useEffect(() => {
    if (activeTab === 'playlists' && playlistSubTab === 'public') {
      loadPublicPlaylists(publicSearchQuery);
    }
  }, [activeTab, playlistSubTab]);

  const handleOpenCreateModal = () => {
    setEditingPlaylist(null);
    setPlaylistTitle('');
    setPlaylistDesc('');
    setPlaylistVisibility('private');
    setShowCreateModal(true);
  };

  const handleOpenEditModal = (pl: UserCustomPlaylist) => {
    setEditingPlaylist(pl);
    setPlaylistTitle(pl.title);
    setPlaylistDesc(pl.description || '');
    setPlaylistVisibility(pl.visibility === 'public' || pl.isPublic ? 'public' : 'private');
    setPlaylistAuthor(pl.authorName || localStorage.getItem('kaito_playlist_author') || '');
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistTitle.trim()) return;
    if (playlistAuthor.trim()) {
      try {
        localStorage.setItem('kaito_playlist_author', playlistAuthor.trim());
      } catch {}
    }

    if (editingPlaylist) {
      await updateCustomPlaylistMeta(editingPlaylist.id, {
        title: playlistTitle.trim(),
        description: playlistDesc.trim(),
        visibility: playlistVisibility,
        authorName: playlistAuthor.trim() || '海斗tube ユーザー'
      });
    } else {
      onCreatePlaylist(
        playlistTitle.trim(),
        playlistDesc.trim(),
        playlistVisibility,
        playlistAuthor.trim() || '海斗tube ユーザー'
      );
    }

    setEditingPlaylist(null);
    setPlaylistTitle('');
    setPlaylistDesc('');
    setShowCreateModal(false);
  };

  const handleTogglePlaylistVisibility = async (pl: UserCustomPlaylist) => {
    const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
    const nextVis = isPub ? 'private' : 'public';
    await updateCustomPlaylistVisibility(pl.id, nextVis, pl.authorName || playlistAuthor || '海斗tube ユーザー');
    if (playlistSubTab === 'public') {
      loadPublicPlaylists(publicSearchQuery);
    }
  };

  const handleSharePlaylistUrl = async (pl: UserCustomPlaylist) => {
    const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
    if (!isPub) {
      await updateCustomPlaylistVisibility(pl.id, 'public', pl.authorName || playlistAuthor || '海斗tube ユーザー');
    }
    const shareUrl = buildPlaylistShareUrl({ ...pl, visibility: 'public', isPublic: true });
    navigator.clipboard.writeText(shareUrl);
    setCopiedShareId(pl.id);
    setTimeout(() => setCopiedShareId(null), 2500);
    showGlobalToast(`公開プレイリスト「${pl.title}」の共有URLをコピーしました！`);
  };

  const handleClonePlaylist = async (pl: UserCustomPlaylist) => {
    setCloningPlaylistId(pl.id);
    try {
      await clonePlaylistToCustomPlaylists(pl);
      if (playlistSubTab === 'public') {
        loadPublicPlaylists(publicSearchQuery);
      }
    } finally {
      setCloningPlaylistId(null);
    }
  };

  const handleCloneFromInputUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cloneUrlInput.trim();
    if (!raw) return;
    setCloningPlaylistId('url_input');
    try {
      const resolved = await fetchSharedPlaylistByIdOrInput(raw);
      if (!resolved) {
        showGlobalToast('共有URL・プレイリストIDを認識できませんでした。公開設定されているかご確認ください。');
        return;
      }
      await clonePlaylistToCustomPlaylists(resolved);
      setCloneUrlInput('');
      setPlaylistSubTab('my');
    } finally {
      setCloningPlaylistId(null);
    }
  };

  const filteredMyPlaylists = useMemo(() => {
    return customPlaylists.filter((pl) => {
      const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
      if (playlistVisFilter === 'public') return isPub;
      if (playlistVisFilter === 'private') return !isPub;
      return true;
    });
  }, [customPlaylists, playlistVisFilter]);

  // Filtered Saved Videos
  const filteredSavedVideos = useMemo(() => {
    const q = savedQuery.trim().toLowerCase();
    if (!q) return savedVideos;
    return savedVideos.filter((v) => {
      const title = (v.snippet?.title || '').toLowerCase();
      const ch = (v.snippet?.channelTitle || '').toLowerCase();
      return title.includes(q) || ch.includes(q);
    });
  }, [savedVideos, savedQuery]);

  // Filtered & Date-Grouped Watch History
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return watchHistory.filter((v) => {
      if (q) {
        const title = (v.snippet?.title || '').toLowerCase();
        const ch = (v.snippet?.channelTitle || '').toLowerCase();
        const desc = (v.snippet?.description || '').toLowerCase();
        if (!title.includes(q) && !ch.includes(q) && !desc.includes(q)) {
          return false;
        }
      }
      if (historyDateFilter !== 'all') {
        const info = classifyHistoryDate(v.watchedAt);
        if (historyDateFilter === 'week') {
          if (info.bucket !== 'today' && info.bucket !== 'yesterday' && info.bucket !== 'week') return false;
        } else if (historyDateFilter === 'month') {
          if (info.bucket === 'older') return false;
        } else if (info.bucket !== historyDateFilter) {
          return false;
        }
      }
      return true;
    });
  }, [watchHistory, historyQuery, historyDateFilter]);

  const groupedHistorySections = useMemo(() => {
    const groups = new Map<string, { label: string; videos: YouTubeVideoItem[] }>();
    for (const v of filteredHistory) {
      const info = classifyHistoryDate(v.watchedAt);
      const existing = groups.get(info.dateLabel);
      if (existing) {
        existing.videos.push(v);
      } else {
        groups.set(info.dateLabel, { label: info.dateLabel, videos: [v] });
      }
    }
    return Array.from(groups.values());
  }, [filteredHistory]);

  // Play Custom Playlist (Normal or Shuffled)
  const handlePlayCustomPlaylist = (pl: UserCustomPlaylist, shuffle = false) => {
    if (!pl.videos || pl.videos.length === 0) return;
    let list = [...pl.videos];
    if (shuffle) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    const first = list[0];
    onSelectVideo({
      ...first,
      playlistId: `custom_${pl.id}`,
      customPlaylistTitle: pl.title,
      customPlaylistItems: list
    });
  };

  // Export JSON File
  const handleDownloadBackupJson = () => {
    try {
      const payload = createBackupPayload(includeHistoryInBackup);
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `kaito-tube-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus({
        type: 'success',
        message: `バックアップファイル (kaito-tube-backup-${dateStr}.json) を書き出しました！`
      });
    } catch (e: any) {
      setBackupStatus({
        type: 'error',
        message: e?.message || 'JSON書き出し中にエラーが発生しました。'
      });
    }
  };

  // Generate & Copy Backup Text Code
  const handleGenerateAndCopyCode = () => {
    try {
      const payload = createBackupPayload(includeHistoryInBackup);
      const code = encodeBackupToTextCode(payload);
      setBackupCodeOutput(code);
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
      setBackupStatus({
        type: 'success',
        message: 'バックアップテキストコードを発行し、クリップボードにコピーしました！別端末やシークレットモードで貼り付けて復元できます。'
      });
    } catch (e: any) {
      setBackupStatus({
        type: 'error',
        message: e?.message || 'バックアップコード生成に失敗しました。'
      });
    }
  };

  // Import from JSON File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      try {
        const parsed = parseBackupInput(content);
        const res = restoreFromBackupPayload(parsed, restoreMode);
        setBackupStatus({
          type: 'success',
          message: `復元完了！ 登録チャンネル: ${res.subsCount}件 / 保存動画: ${res.savedCount}件 / マイ再生リスト: ${res.playlistsCount}件 / NG設定: ${res.blockedCount}件`
        });
        showGlobalToast('バックアップデータを復元しました');
      } catch (err: any) {
        setBackupStatus({
          type: 'error',
          message: err?.message || 'ファイルの読み込みに失敗しました。'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import from Pasted Text / Code
  const handleRestoreFromText = () => {
    try {
      const parsed = parseBackupInput(importTextInput);
      const res = restoreFromBackupPayload(parsed, restoreMode);
      setImportTextInput('');
      setBackupStatus({
        type: 'success',
        message: `復元完了！ 登録チャンネル: ${res.subsCount}件 / 保存動画: ${res.savedCount}件 / マイ再生リスト: ${res.playlistsCount}件 / NG設定: ${res.blockedCount}件`
      });
      showGlobalToast('テキストコードからバックアップを復元しました');
    } catch (err: any) {
      setBackupStatus({
        type: 'error',
        message: err?.message || 'バックアップコードの解析に失敗しました。'
      });
    }
  };

  const subsCount = getSubscribedChannels().length;
  const blockedCount = getBlockedChannels().length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">マイライブラリ & バックアップ</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <Database className="w-3 h-3" />
                <span>IndexedDB (VideoHistory / PlaylistsDB ArrayBuffer) 無制限保存対応</span>
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              保存した動画・日付別再生履歴・自作プレイリスト・サムネイルArrayBufferバイナリ保存・JSONバックアップ復元
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'saved' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-saved-tab"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>保存動画 ({savedVideos.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-history-tab"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>再生履歴 ({watchHistory.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('playlists')}
            className={`px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'playlists' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-playlists-tab"
          >
            <ListVideo className="w-3.5 h-3.5" />
            <span>マイ再生リスト ({customPlaylists.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border ${
              activeTab === 'backup'
                ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                : 'bg-neutral-900 border-neutral-800 text-indigo-300 hover:text-white'
            }`}
            id="library-backup-tab"
          >
            <Database className="w-3.5 h-3.5" />
            <span>JSON書き出し / 復元</span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* Tab 1: Saved Videos */}
      {/* ========================================== */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          {savedVideos.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/70 border border-neutral-800 p-3 rounded-2xl">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={savedQuery}
                  onChange={(e) => setSavedQuery(e.target.value)}
                  placeholder="保存した動画をタイトルやチャンネル名で検索..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                />
                {savedQuery && (
                  <button
                    onClick={() => setSavedQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handlePlayCustomPlaylist(
                      {
                        id: 'saved_all',
                        title: '保存済み動画リスト',
                        description: '',
                        createdAt: '',
                        videos: filteredSavedVideos
                      },
                      false
                    )
                  }
                  disabled={filteredSavedVideos.length === 0}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>すべて連続再生</span>
                </button>
                <button
                  onClick={() =>
                    handlePlayCustomPlaylist(
                      {
                        id: 'saved_all',
                        title: '保存済み動画リスト (シャッフル)',
                        description: '',
                        createdAt: '',
                        videos: filteredSavedVideos
                      },
                      true
                    )
                  }
                  disabled={filteredSavedVideos.length === 0}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 rounded-xl text-xs font-bold text-neutral-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                  <span>シャッフル再生</span>
                </button>
              </div>
            </div>
          )}

          {savedVideos.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm space-y-2 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
              <Bookmark className="w-8 h-8 text-neutral-600 mx-auto" />
              <p>保存された動画はありません。</p>
              <p className="text-xs text-neutral-500">動画の「ライブラリ保存」ボタンで追加できます。</p>
            </div>
          ) : filteredSavedVideos.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-xs">
              「{savedQuery}」に一致する保存動画はありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredSavedVideos.map((v) => (
                <VideoCard
                  key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                  video={v}
                  onSelectVideo={onSelectVideo}
                  onSelectChannel={onSelectChannel}
                  isSaved={true}
                  onToggleSave={onToggleSave}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* Tab 2: Watch History (Keyword Search & Date Grouping) */}
      {/* ========================================== */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {/* Search & Date Filter Controls Bar */}
          {watchHistory.length > 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3.5 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Keyword Search Input */}
                <div className="relative flex-1 max-w-lg">
                  <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="「前に見たあの動画なんだっけ？」タイトル・チャンネル名で履歴を即座に検索..."
                    className="w-full bg-neutral-950 border border-neutral-700/80 focus:border-rose-500 rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors"
                    id="history-search-input"
                  />
                  {historyQuery && (
                    <button
                      onClick={() => setHistoryQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Toggle Date Grouping */}
                  <button
                    onClick={() => setGroupHistoryByDate(!groupHistoryByDate)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      groupHistoryByDate
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{groupHistoryByDate ? '日付別整理: ON' : '日付別整理: OFF'}</span>
                  </button>

                  {/* Clear All History */}
                  <button
                    onClick={onClearHistory}
                    className="px-3 py-2 bg-neutral-800 hover:bg-rose-950/80 text-neutral-300 hover:text-rose-300 border border-neutral-700 hover:border-rose-500/40 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>履歴を全削除</span>
                  </button>
                </div>
              </div>

              {/* Date Filter Pills */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-neutral-800/80">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <span className="text-[11px] text-neutral-400 font-medium mr-1 shrink-0">期間絞り込み:</span>
                  {(
                    [
                      { id: 'all', label: 'すべて' },
                      { id: 'today', label: '今日' },
                      { id: 'yesterday', label: '昨日' },
                      { id: 'week', label: '今週 (7日間)' },
                      { id: 'month', label: '今月 (30日間)' },
                      { id: 'older', label: 'それ以前' }
                    ] as { id: HistoryDateFilter; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setHistoryDateFilter(tab.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                        historyDateFilter === tab.id
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-neutral-400 font-medium">
                  該当: <strong className="text-white">{filteredHistory.length}</strong> 件 / 全 {watchHistory.length} 件
                </span>
              </div>
            </div>
          )}

          {watchHistory.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm space-y-2 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
              <Clock className="w-8 h-8 text-neutral-600 mx-auto" />
              <p>再生履歴はありません。</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 space-y-3 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
              <Search className="w-8 h-8 text-neutral-600 mx-auto" />
              <p className="text-sm font-bold text-white">条件に一致する履歴が見つかりませんでした</p>
              <button
                onClick={() => {
                  setHistoryQuery('');
                  setHistoryDateFilter('all');
                }}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-lg cursor-pointer"
              >
                フィルターをリセット
              </button>
            </div>
          ) : groupHistoryByDate ? (
            <div className="space-y-8">
              {groupedHistorySections.map((section) => (
                <div key={section.label} className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-400" />
                      <h3 className="text-sm sm:text-base font-bold text-white">{section.label}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-semibold">
                        {section.videos.length}本
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {section.videos.map((v, idx) => {
                      const vidId = getVideoUniqueId(v);
                      return (
                        <div key={`${vidId}-${idx}`} className="relative group/hist">
                          <VideoCard
                            video={v}
                            onSelectVideo={onSelectVideo}
                            onSelectChannel={onSelectChannel}
                            isSaved={savedVideos.some((sv) => getVideoUniqueId(sv) === vidId)}
                            onToggleSave={onToggleSave}
                          />
                          {onRemoveHistoryItem && vidId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveHistoryItem(vidId);
                              }}
                              title="この動画を履歴から削除"
                              className="absolute top-2 left-2 z-20 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-neutral-300 hover:text-white opacity-0 group-hover/hist:opacity-100 transition-all cursor-pointer border border-neutral-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredHistory.map((v, idx) => {
                const vidId = getVideoUniqueId(v);
                return (
                  <VideoCard
                    key={`${vidId}-${idx}`}
                    video={v}
                    onSelectVideo={onSelectVideo}
                    onSelectChannel={onSelectChannel}
                    isSaved={savedVideos.some((sv) => getVideoUniqueId(sv) === vidId)}
                    onToggleSave={onToggleSave}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* Tab 3: Custom Playlists (Public / Private Sharing & Clone) */}
      {/* ========================================== */}
      {activeTab === 'playlists' && (
        <div className="space-y-6">
          {/* Sub-Navigation & Top Controls Bar */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPlaylistSubTab('my')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    playlistSubTab === 'my'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span>マイ再生リスト ({customPlaylists.length})</span>
                </button>

                <button
                  onClick={() => setPlaylistSubTab('public')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    playlistSubTab === 'public'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-neutral-950 text-indigo-300 hover:text-white border border-neutral-800'
                  }`}
                  id="public-playlists-subtab-btn"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>みんなの公開プレイリスト & URL複製 (Clone)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                  id="create-playlist-btn"
                >
                  <Plus className="w-4 h-4" />
                  <span>新しい再生リスト作成 (公開/非公開)</span>
                </button>
              </div>
            </div>

            {/* Clone by Share URL / ID Quick Bar */}
            <form
              onSubmit={handleCloneFromInputUrl}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 border-t border-neutral-800/80"
            >
              <div className="relative flex-1">
                <Copy className="w-3.5 h-3.5 text-indigo-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cloneUrlInput}
                  onChange={(e) => setCloneUrlInput(e.target.value)}
                  placeholder="他ユーザーの公開プレイリスト共有URL (?shared_playlist=...) やIDを貼り付けて自分のリストへ複製..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none"
                  id="clone-playlist-url-input"
                />
              </div>
              <button
                type="submit"
                disabled={!cloneUrlInput.trim() || cloningPlaylistId === 'url_input'}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                id="clone-playlist-url-submit"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>自分のリストへ複製 (Clone)</span>
              </button>
            </form>

            {/* Visibility Filter when in "My Playlists" */}
            {playlistSubTab === 'my' && customPlaylists.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-neutral-800/60 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-400 mr-1">公開状態で絞り込み:</span>
                  {(
                    [
                      { id: 'all', label: `すべて (${customPlaylists.length})` },
                      {
                        id: 'public',
                        label: `公開 Public (${customPlaylists.filter((p) => p.visibility === 'public' || p.isPublic).length})`
                      },
                      {
                        id: 'private',
                        label: `非公開 Private (${customPlaylists.filter((p) => p.visibility !== 'public' && !p.isPublic).length})`
                      }
                    ] as { id: 'all' | 'public' | 'private'; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setPlaylistVisFilter(f.id)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        playlistVisFilter === f.id
                          ? 'bg-neutral-800 text-white border border-neutral-600'
                          : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-neutral-500">
                  ※「公開 (Public)」にすると共有URLが発行され、他のユーザーが閲覧・複製できるようになります
                </span>
              </div>
            )}
          </div>

          {playlistSubTab === 'my' ? (
            filteredMyPlaylists.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-sm space-y-2 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
                <FolderPlus className="w-8 h-8 text-neutral-600 mx-auto" />
                <p>該当する再生リストはありません。</p>
                <p className="text-xs text-neutral-500">
                  「新しい再生リスト作成」または「みんなの公開プレイリスト」から複製できます。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredMyPlaylists.map((pl) => {
                  const isExpanded = expandedPlaylistId === pl.id;
                  const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
                  return (
                    <div
                      key={pl.id}
                      className={`bg-neutral-900 border ${
                        isPub ? 'border-emerald-500/30' : 'border-neutral-800'
                      } rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-base text-white flex items-center gap-2">
                                <ListVideo className="w-4 h-4 text-rose-400 shrink-0" />
                                <span className="truncate">{pl.title}</span>
                              </h3>

                              {/* Public / Private Badge */}
                              <button
                                onClick={() => handleTogglePlaylistVisibility(pl)}
                                title={isPub ? 'クリックで非公開 (Private) に切り替え' : 'クリックで公開 (Public) に切り替え'}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-colors cursor-pointer ${
                                  isPub
                                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                                }`}
                              >
                                {isPub ? (
                                  <>
                                    <Globe className="w-3 h-3 text-emerald-400" />
                                    <span>公開 (Public)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3 text-neutral-400" />
                                    <span>非公開 (Private)</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <p className="text-xs text-neutral-400 mt-1">{pl.description || '説明なし'}</p>
                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-neutral-500 mt-1">
                              <span>全 {pl.videos.length} 本の動画</span>
                              <span>•</span>
                              <span>作成日: {pl.createdAt}</span>
                              {pl.authorName && (
                                <>
                                  <span>•</span>
                                  <span>作成者: {pl.authorName}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Top-Right Action Icons: Share URL, Clone, Edit, Delete */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleSharePlaylistUrl(pl)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="このプレイリストを公開設定にして共有URLをコピー"
                            >
                              {copiedShareId === pl.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">URLコピー済</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>共有URL</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleClonePlaylist(pl)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-300 hover:bg-neutral-800 cursor-pointer"
                              title="このプレイリストを複製 (Clone)"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleOpenEditModal(pl)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
                              title="タイトル・公開設定を編集"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => onDeletePlaylist(pl.id)}
                              className="text-neutral-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-neutral-800 cursor-pointer"
                              title="再生リストを削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {pl.videos.length > 0 ? (
                          <div className="space-y-3">
                            <div className="aspect-video bg-neutral-950 rounded-xl overflow-hidden relative group">
                              <ThumbnailImage
                                video={pl.videos[0]}
                                fallbackUrl={pl.videos[0].snippet?.thumbnails?.medium?.url}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handlePlayCustomPlaylist(pl, false)}
                                  className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                >
                                  <Play className="w-4 h-4 fill-white" />
                                  <span>すべて再生</span>
                                </button>
                                <button
                                  onClick={() => handlePlayCustomPlaylist(pl, true)}
                                  className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                >
                                  <Shuffle className="w-4 h-4" />
                                  <span>シャッフル</span>
                                </button>
                              </div>
                            </div>

                            {/* Quick Action Bar */}
                            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handlePlayCustomPlaylist(pl, false)}
                                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5 fill-white" />
                                  <span>連続再生</span>
                                </button>
                                <button
                                  onClick={() => handlePlayCustomPlaylist(pl, true)}
                                  className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Shuffle className="w-3.5 h-3.5" />
                                  <span>シャッフル再生</span>
                                </button>
                              </div>

                              <button
                                onClick={() => setExpandedPlaylistId(isExpanded ? null : pl.id)}
                                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                              >
                                <span>{isExpanded ? '曲一覧を閉じる' : `収録曲を見る (${pl.videos.length})`}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {/* Expanded Tracklist */}
                            {isExpanded && (
                              <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-neutral-800 border border-neutral-800 rounded-xl bg-neutral-950/70">
                                {pl.videos.map((v, vIdx) => {
                                  const vId = getVideoUniqueId(v);
                                  return (
                                    <div
                                      key={`${vId}-${vIdx}`}
                                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-neutral-900/80 text-xs"
                                    >
                                      <button
                                        onClick={() =>
                                          onSelectVideo({
                                            ...v,
                                            playlistId: `custom_${pl.id}`,
                                            customPlaylistTitle: pl.title,
                                            customPlaylistItems: pl.videos
                                          })
                                        }
                                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                                      >
                                        <span className="w-5 text-center font-mono text-[11px] text-neutral-500 shrink-0">
                                          {vIdx + 1}
                                        </span>
                                        <span className="truncate font-medium text-neutral-200 hover:text-rose-400">
                                          {v.snippet?.title}
                                        </span>
                                      </button>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => addToUpNextQueueNext(v)}
                                          className="p-1 text-neutral-400 hover:text-rose-400 cursor-pointer"
                                          title="次に再生に追加"
                                        >
                                          <ListPlus className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => removeVideoFromCustomPlaylist(pl.id, vId)}
                                          className="p-1 text-neutral-500 hover:text-rose-400 cursor-pointer"
                                          title="再生リストから削除"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-xs text-neutral-500 bg-neutral-950/50 rounded-xl border border-neutral-800/70">
                            まだ動画が追加されていません
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Public Playlists Directory & Clone View */
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/70 border border-neutral-800 p-3.5 rounded-2xl">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={publicSearchQuery}
                    onChange={(e) => {
                      setPublicSearchQuery(e.target.value);
                      loadPublicPlaylists(e.target.value);
                    }}
                    placeholder="公開プレイリストをタイトルや作成者名で検索..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                  />
                  {publicSearchQuery && (
                    <button
                      onClick={() => {
                        setPublicSearchQuery('');
                        loadPublicPlaylists('');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => loadPublicPlaylists(publicSearchQuery)}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPublicPlaylists ? 'animate-spin' : ''}`} />
                  <span>一覧を更新</span>
                </button>
              </div>

              {loadingPublicPlaylists ? (
                <div className="py-16 text-center text-neutral-400 text-xs">
                  公開プレイリストを読み込み中...
                </div>
              ) : publicPlaylists.length === 0 ? (
                <div className="py-16 text-center text-neutral-400 text-sm space-y-2 bg-neutral-900/40 border border-neutral-800 rounded-2xl">
                  <Globe className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p>一致する公開プレイリストが見つかりませんでした。</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {publicPlaylists.map((pub) => {
                    const isExpanded = expandedPlaylistId === `pub_${pub.id}`;
                    return (
                      <div
                        key={pub.id}
                        className="bg-neutral-900 border border-indigo-500/30 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-base text-white flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span className="truncate">{pub.title}</span>
                                </h3>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  公開 (Public)
                                </span>
                              </div>
                              <p className="text-xs text-neutral-400 mt-1">{pub.description || '説明なし'}</p>
                              <div className="flex items-center gap-2 flex-wrap text-[11px] text-neutral-500 mt-1">
                                <span>全 {pub.videos?.length || 0} 本</span>
                                <span>•</span>
                                <span>作成者: {pub.authorName || '海斗tube ユーザー'}</span>
                                <span>•</span>
                                <span>複製された回数: {pub.cloneCount || 0}回</span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleSharePlaylistUrl(pub)}
                              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                              title="共有URLをコピー"
                            >
                              {copiedShareId === pub.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">コピー済</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>URL共有</span>
                                </>
                              )}
                            </button>
                          </div>

                          {pub.videos && pub.videos.length > 0 && (
                            <div className="space-y-3">
                              <div className="aspect-video bg-neutral-950 rounded-xl overflow-hidden relative group">
                                <ThumbnailImage
                                  video={pub.videos[0]}
                                  fallbackUrl={pub.videos[0].snippet?.thumbnails?.medium?.url}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handlePlayCustomPlaylist(pub, false)}
                                    className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <Play className="w-4 h-4 fill-white" />
                                    <span>そのまま再生</span>
                                  </button>
                                  <button
                                    onClick={() => handleClonePlaylist(pub)}
                                    className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                                  >
                                    <Copy className="w-4 h-4" />
                                    <span>自分のリストへ複製</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handlePlayCustomPlaylist(pub, false)}
                                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-white" />
                                    <span>連続再生</span>
                                  </button>
                                  <button
                                    onClick={() => handleClonePlaylist(pub)}
                                    disabled={cloningPlaylistId === pub.id}
                                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>自分のリストへ複製 (Clone)</span>
                                  </button>
                                </div>

                                <button
                                  onClick={() => setExpandedPlaylistId(isExpanded ? null : `pub_${pub.id}`)}
                                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{isExpanded ? '曲一覧を閉じる' : `収録曲を見る (${pub.videos.length})`}</span>
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-neutral-800 border border-neutral-800 rounded-xl bg-neutral-950/70">
                                  {pub.videos.map((v, vIdx) => {
                                    const vId = getVideoUniqueId(v);
                                    return (
                                      <div
                                        key={`${vId}-${vIdx}`}
                                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-neutral-900/80 text-xs"
                                      >
                                        <button
                                          onClick={() =>
                                            onSelectVideo({
                                              ...v,
                                              playlistId: `custom_${pub.id}`,
                                              customPlaylistTitle: pub.title,
                                              customPlaylistItems: pub.videos
                                            })
                                          }
                                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                                        >
                                          <span className="w-5 text-center font-mono text-[11px] text-neutral-500 shrink-0">
                                            {vIdx + 1}
                                          </span>
                                          <span className="truncate font-medium text-neutral-200 hover:text-rose-400">
                                            {v.snippet?.title}
                                          </span>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* Tab 4: JSON / Code Backup & Restore */}
      {/* ========================================== */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Status Banner */}
          {backupStatus && (
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-medium ${
                backupStatus.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {backupStatus.type === 'success' ? (
                  <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span>{backupStatus.message}</span>
              </div>
              <button
                onClick={() => setBackupStatus(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Current Data Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400">登録チャンネル</p>
                <p className="text-lg font-bold text-white">{subsCount} 件</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-400">
                <Bookmark className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400">保存した動画</p>
                <p className="text-lg font-bold text-white">{savedVideos.length} 本</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400">
                <ListVideo className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400">自作プレイリスト</p>
                <p className="text-lg font-bold text-white">{customPlaylists.length} 個</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <ShieldBan className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400">NGチャンネル設定</p>
                <p className="text-lg font-bold text-white">{blockedCount} 件</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Box: Export (JSON File & Text Code) */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">データの書き出し（エクスポート）</h3>
                  <p className="text-xs text-neutral-400">
                    登録チャンネル・保存動画・自作プレイリスト・NG設定を1つにまとめて出力します
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <input
                  type="checkbox"
                  checked={includeHistoryInBackup}
                  onChange={(e) => setIncludeHistoryInBackup(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>視聴履歴 ({watchHistory.length}件) ＆ ピン留め検索タグも一緒に含める</span>
              </label>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDownloadBackupJson}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  id="export-json-file-btn"
                >
                  <Download className="w-4 h-4" />
                  <span>JSONファイルで保存 (.json)</span>
                </button>

                <button
                  onClick={handleGenerateAndCopyCode}
                  className="flex-1 py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  id="export-backup-code-btn"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">コードをコピー完了！</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-indigo-400" />
                      <span>テキストコードを発行＆コピー</span>
                    </>
                  )}
                </button>
              </div>

              {backupCodeOutput && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-neutral-400">
                    発行されたバックアップコード（シークレットモードや別端末にそのまま貼り付け可能）:
                  </p>
                  <textarea
                    readOnly
                    value={backupCodeOutput}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-[11px] font-mono text-indigo-300 focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>

            {/* Right Box: Import / Restore */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">データの読み込み（インポート・復元）</h3>
                  <p className="text-xs text-neutral-400">
                    JSONファイルまたはバックアップコードから一括で復元します
                  </p>
                </div>
              </div>

              {/* Restore Mode Selector */}
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2 text-xs">
                <span className="text-neutral-400 font-semibold block">復元方法の選択:</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-neutral-200">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                      className="accent-rose-500"
                    />
                    <span>追加マージ（今のデータを残して統合）</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-neutral-200">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'overwrite'}
                      onChange={() => setRestoreMode('overwrite')}
                      className="accent-rose-500"
                    />
                    <span>上書き復元（バックアップで置換）</span>
                  </label>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-neutral-800 hover:bg-neutral-700 border border-dashed border-neutral-600 hover:border-rose-500 text-xs font-bold text-neutral-200 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  id="import-json-file-btn"
                >
                  <Upload className="w-4 h-4 text-rose-400" />
                  <span>JSONバックアップファイル (.json) を選択して読み込む</span>
                </button>
              </div>

              {/* Paste Code / JSON Input */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <label className="block text-xs font-semibold text-neutral-300">
                  またはバックアップコード / JSONテキストを貼り付けて復元:
                </label>
                <textarea
                  value={importTextInput}
                  onChange={(e) => setImportTextInput(e.target.value)}
                  placeholder="KAITO_BACKUP_V2:... または JSONテキストをここに貼り付け..."
                  className="w-full h-24 bg-neutral-950 border border-neutral-800 focus:border-rose-500 rounded-xl p-3 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none resize-none"
                  id="import-backup-textarea"
                />
                <button
                  onClick={handleRestoreFromText}
                  disabled={!importTextInput.trim()}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  id="restore-from-text-btn"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>貼り付けたコードから復元を実行</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Playlist Modal (with Public / Private visibility) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 text-white space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingPlaylist ? '再生リスト設定を編集' : '新規再生リストを作成'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingPlaylist(null);
                }}
                className="p-1 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-neutral-300">タイトル *</label>
                <input
                  type="text"
                  required
                  value={playlistTitle}
                  onChange={(e) => setPlaylistTitle(e.target.value)}
                  placeholder="例: お気に入りボカロ曲・作業用BGM"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1.5 text-neutral-300">公開設定 (Public / Private)</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPlaylistVisibility('private')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 ${
                      playlistVisibility === 'private'
                        ? 'bg-rose-600/15 border-rose-500 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${playlistVisibility === 'private' ? 'text-rose-400' : 'text-neutral-500'}`} />
                    <div>
                      <div className="font-bold text-xs">非公開 (Private)</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">自分のブラウザのみに保存</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlaylistVisibility('public')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 ${
                      playlistVisibility === 'public'
                        ? 'bg-emerald-600/15 border-emerald-500 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${playlistVisibility === 'public' ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    <div>
                      <div className="font-bold text-xs">公開 (Public)</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">URL共有・他人の複製を許可</div>
                    </div>
                  </button>
                </div>
              </div>

              {playlistVisibility === 'public' && (
                <div>
                  <label className="block font-semibold mb-1 text-neutral-300">公開時の作成者名（任意）</label>
                  <input
                    type="text"
                    value={playlistAuthor}
                    onChange={(e) => setPlaylistAuthor(e.target.value)}
                    placeholder="例: 海斗tube ユーザー"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1 text-neutral-300">説明（任意）</label>
                <textarea
                  value={playlistDesc}
                  onChange={(e) => setPlaylistDesc(e.target.value)}
                  placeholder="再生リストの説明を入力..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-rose-500 h-20 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingPlaylist(null);
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium text-neutral-300 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white shadow cursor-pointer"
                >
                  {editingPlaylist ? '保存する' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
