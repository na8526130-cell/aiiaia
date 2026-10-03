import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Globe,
  Lock,
  Copy,
  Check,
  Share2,
  ListVideo,
  FolderPlus,
  Sparkles,
  Play,
  Users
} from 'lucide-react';
import { YouTubeVideoItem, UserCustomPlaylist } from '../types';
import {
  getCustomPlaylistsFromStorage,
  addVideoToCustomPlaylist,
  removeVideoFromCustomPlaylist,
  updateCustomPlaylistVisibility,
  clonePlaylistToCustomPlaylists,
  buildPlaylistShareUrl,
  encodePlaylistShareToken,
  fetchPublicPlaylistsFromServer,
  fetchSharedPlaylistByIdOrInput,
  getVideoUniqueId,
  showGlobalToast
} from '../utils/userDataManager';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetVideo?: YouTubeVideoItem | null;
  onCreatePlaylist?: (
    title: string,
    description: string,
    visibility?: 'public' | 'private',
    authorName?: string
  ) => UserCustomPlaylist | void;
  onSelectPlaylistToPlay?: (pl: UserCustomPlaylist) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  targetVideo,
  onCreatePlaylist,
  onSelectPlaylistToPlay
}) => {
  const [activeTab, setActiveTab] = useState<'my' | 'create' | 'clone'>('my');
  const [playlists, setPlaylists] = useState<UserCustomPlaylist[]>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<UserCustomPlaylist[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'private'>('private');
  const [newAuthor, setNewAuthor] = useState(() => localStorage.getItem('kaito_playlist_author') || '');

  // Clone input state
  const [cloneInput, setCloneInput] = useState('');
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const targetVideoId = targetVideo ? getVideoUniqueId(targetVideo) : '';

  const refreshLocalPlaylists = () => {
    setPlaylists(getCustomPlaylistsFromStorage());
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshLocalPlaylists();
    const handleSync = () => refreshLocalPlaylists();
    window.addEventListener('kaito_custom_playlists_changed', handleSync);
    return () => window.removeEventListener('kaito_custom_playlists_changed', handleSync);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'clone') {
      setLoadingPublic(true);
      fetchPublicPlaylistsFromServer()
        .then((items) => setPublicPlaylists(items))
        .finally(() => setLoadingPublic(false));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const isVideoInPlaylist = (pl: UserCustomPlaylist): boolean => {
    if (!targetVideoId) return false;
    return (pl.videos || []).some((v) => getVideoUniqueId(v) === targetVideoId);
  };

  const handleToggleVideoInPlaylist = (pl: UserCustomPlaylist) => {
    if (!targetVideo || !targetVideoId) return;
    if (isVideoInPlaylist(pl)) {
      removeVideoFromCustomPlaylist(pl.id, targetVideoId);
      showGlobalToast(`「${pl.title}」から動画を削除しました`);
    } else {
      addVideoToCustomPlaylist(pl.id, targetVideo);
    }
    refreshLocalPlaylists();
  };

  const handleToggleVisibility = async (pl: UserCustomPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentVis = pl.visibility === 'public' || pl.isPublic ? 'public' : 'private';
    const nextVis = currentVis === 'public' ? 'private' : 'public';
    await updateCustomPlaylistVisibility(pl.id, nextVis, newAuthor || pl.authorName);
    refreshLocalPlaylists();
  };

  const handleCopyShareUrl = async (pl: UserCustomPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    // Ensure it is public when sharing URL
    if (pl.visibility !== 'public' && !pl.isPublic) {
      await updateCustomPlaylistVisibility(pl.id, 'public', newAuthor || pl.authorName);
      refreshLocalPlaylists();
    }
    const shareUrl = buildPlaylistShareUrl({ ...pl, visibility: 'public', isPublic: true });
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(pl.id);
    setTimeout(() => setCopiedId(null), 2200);
    showGlobalToast(`公開プレイリスト「${pl.title}」の共有URLをコピーしました！`);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    if (newAuthor.trim()) {
      try {
        localStorage.setItem('kaito_playlist_author', newAuthor.trim());
      } catch {}
    }

    if (onCreatePlaylist) {
      const created = onCreatePlaylist(trimmedTitle, newDesc.trim(), newVisibility, newAuthor.trim() || undefined);
      if (created && targetVideo) {
        addVideoToCustomPlaylist(created.id, targetVideo);
      }
    } else {
      const current = getCustomPlaylistsFromStorage();
      const newPl: UserCustomPlaylist = {
        id: Date.now().toString(),
        title: trimmedTitle,
        description: newDesc.trim(),
        createdAt: new Date().toLocaleDateString('ja-JP'),
        updatedAt: new Date().toLocaleDateString('ja-JP'),
        visibility: newVisibility,
        isPublic: newVisibility === 'public',
        authorName: newAuthor.trim() || '海斗tube ユーザー',
        videos: targetVideo ? [targetVideo] : []
      };
      const updated = [newPl, ...current];
      localStorage.setItem('kaito_custom_playlists', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('kaito_custom_playlists_changed', { detail: updated }));
      if (newVisibility === 'public') {
        await updateCustomPlaylistVisibility(newPl.id, 'public', newPl.authorName);
      } else {
        showGlobalToast(`再生リスト「${trimmedTitle}」を作成しました`);
      }
    }

    setNewTitle('');
    setNewDesc('');
    refreshLocalPlaylists();
    setActiveTab('my');
  };

  const handleCloneByInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cloneInput.trim();
    if (!raw) return;
    setCloningId('input');
    try {
      const resolved = await fetchSharedPlaylistByIdOrInput(raw);
      if (!resolved) {
        showGlobalToast('共有URLまたはプレイリストIDからプレイリストが見つかりませんでした');
        return;
      }
      await clonePlaylistToCustomPlaylists(resolved);
      setCloneInput('');
      refreshLocalPlaylists();
      setActiveTab('my');
    } finally {
      setCloningId(null);
    }
  };

  const handleClonePlaylistCard = async (pl: UserCustomPlaylist) => {
    setCloningId(pl.id);
    try {
      await clonePlaylistToCustomPlaylists(pl);
      refreshLocalPlaylists();
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full overflow-hidden text-white shadow-2xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between gap-3 bg-neutral-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <ListVideo className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">
                {targetVideo ? '再生リストへ保存・公開共有設定' : 'プレイリスト管理（公開共有 / 複製）'}
              </h3>
              {targetVideo && (
                <p className="text-[11px] text-neutral-400 truncate">
                  対象動画: {targetVideo.snippet?.title}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-neutral-800 flex items-center gap-2 text-xs font-bold bg-neutral-900">
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'my'
                ? 'bg-rose-600 text-white shadow'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <ListVideo className="w-3.5 h-3.5" />
            <span>マイリスト ({playlists.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'create'
                ? 'bg-rose-600 text-white shadow'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規作成 (公開/非公開)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clone')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'clone'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-neutral-800 text-indigo-300 hover:text-white'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>公開リストを複製 (Clone)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* TAB 1: My Playlists */}
          {activeTab === 'my' && (
            <div className="space-y-3">
              {playlists.length === 0 ? (
                <div className="py-10 text-center space-y-3 bg-neutral-950/60 border border-neutral-800 rounded-xl p-4">
                  <FolderPlus className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p className="text-neutral-300 font-semibold">まだマイ再生リストがありません</p>
                  <p className="text-[11px] text-neutral-500">
                    「新規作成」から公開（Public）または非公開（Private）のプレイリストを作成するか、他人の公開プレイリストを複製（Clone）できます。
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新しいリストを作成</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('clone')}
                      className="px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>公開リストから複製</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {playlists.map((pl) => {
                    const checked = isVideoInPlaylist(pl);
                    const isPub = pl.visibility === 'public' || Boolean(pl.isPublic);
                    return (
                      <div
                        key={pl.id}
                        onClick={() => {
                          if (targetVideo) {
                            handleToggleVideoInPlaylist(pl);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          targetVideo ? 'cursor-pointer' : ''
                        } ${
                          checked
                            ? 'bg-rose-950/30 border-rose-500/50'
                            : 'bg-neutral-950/80 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {targetVideo && (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-rose-600 rounded shrink-0 cursor-pointer"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white truncate text-xs sm:text-sm">
                                {pl.title}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                                  isPub
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                    : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                }`}
                              >
                                {isPub ? (
                                  <>
                                    <Globe className="w-2.5 h-2.5" />
                                    <span>公開 (Public)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>非公開 (Private)</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                              {pl.videos?.length || 0}本の動画
                              {pl.description ? ` • ${pl.description}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Actions: Toggle Public/Private, Copy Share Link, Clone */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleToggleVisibility(pl, e)}
                            title={isPub ? 'クリックで非公開 (Private) に変更' : 'クリックで公開 (Public) にして共有可能にする'}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                              isPub
                                ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                            }`}
                          >
                            {isPub ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            <span>{isPub ? '公開中' : '非公開'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleCopyShareUrl(pl, e)}
                            title="公開URLをコピーして他のユーザーと共有"
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === pl.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-300">URLコピー済</span>
                              </>
                            ) : (
                              <>
                                <Share2 className="w-3 h-3" />
                                <span>共有URL</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleClonePlaylistCard(pl)}
                            title="このリストを複製 (Clone)"
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Create New Playlist (Public / Private) */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block font-bold mb-1.5 text-neutral-200">プレイリスト名 *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例: テスト勉強用ボカロ・神曲まとめ"
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-rose-500 rounded-xl p-3 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold mb-1.5 text-neutral-200">公開設定 (Visibility)</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewVisibility('private')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      newVisibility === 'private'
                        ? 'bg-rose-600/15 border-rose-500 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${newVisibility === 'private' ? 'text-rose-400' : 'text-neutral-500'}`} />
                    <div>
                      <div className="font-bold text-xs">非公開 (Private)</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        自分のブラウザ（ローカル）のみに保存します
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewVisibility('public')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      newVisibility === 'public'
                        ? 'bg-emerald-600/15 border-emerald-500 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${newVisibility === 'public' ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    <div>
                      <div className="font-bold text-xs">公開 (Public)</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        URL共有や他ユーザーからの複製（Clone）を許可します
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {newVisibility === 'public' && (
                <div>
                  <label className="block font-bold mb-1.5 text-neutral-200">作成者名（公開リストに表示・任意）</label>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    placeholder="例: 海斗tube ユーザー"
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-xl p-2.5 text-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold mb-1.5 text-neutral-200">説明（任意）</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="再生リストの説明やテーマを入力..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-rose-500 rounded-xl p-3 text-white focus:outline-none h-20 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('my')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium text-neutral-300 cursor-pointer"
                >
                  戻る
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white shadow cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{targetVideo ? '作成して動画を追加' : 'プレイリストを作成'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Clone Other User's Public Playlist */}
          {activeTab === 'clone' && (
            <div className="space-y-4">
              {/* Clone by Share URL / ID / Code */}
              <form onSubmit={handleCloneByInput} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
                <label className="block font-bold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>共有URL・プレイリストID・共有コードから自分のリストへ複製</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cloneInput}
                    onChange={(e) => setCloneInput(e.target.value)}
                    placeholder="共有URL (?shared_playlist=...) または ID を貼り付け..."
                    className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!cloneInput.trim() || cloningId === 'input'}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>複製する</span>
                  </button>
                </div>
              </form>

              {/* Public Playlists Directory */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-neutral-200 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>みんなの公開プレイリスト (ワンタップ複製)</span>
                  </h4>
                  <span className="text-[11px] text-neutral-400">{publicPlaylists.length}件</span>
                </div>

                {loadingPublic ? (
                  <div className="py-8 text-center text-neutral-400">公開プレイリストを読み込み中...</div>
                ) : publicPlaylists.length === 0 ? (
                  <div className="py-8 text-center text-neutral-500 bg-neutral-950 rounded-xl border border-neutral-800">
                    公開プレイリストはまだありません
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {publicPlaylists.map((pub) => (
                      <div
                        key={pub.id}
                        className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-indigo-500/40 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white truncate">{pub.title}</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              {pub.videos?.length || 0}本
                            </span>
                          </div>
                          {pub.description && (
                            <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">{pub.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {pub.authorName || '海斗tube ユーザー'}
                            </span>
                            <span>•</span>
                            <span>複製数: {pub.cloneCount || 0}回</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {onSelectPlaylistToPlay && pub.videos?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectPlaylistToPlay(pub);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold flex items-center gap-1 cursor-pointer"
                              title="この公開プレイリストをそのまま再生"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>再生</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={cloningId === pub.id}
                            onClick={() => handleClonePlaylistCard(pub)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1 shadow cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>自分のリストへ複製</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
