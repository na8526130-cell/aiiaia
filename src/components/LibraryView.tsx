import React, { useState } from 'react';
import {
  Bookmark,
  Clock,
  FolderPlus,
  Trash2,
  Play,
  Plus,
  ListVideo
} from 'lucide-react';
import { YouTubeVideoItem, UserCustomPlaylist } from '../types';
import { VideoCard } from './VideoCard';
import { ThumbnailImage } from './ThumbnailImage';

interface LibraryViewProps {
  savedVideos: YouTubeVideoItem[];
  watchHistory: YouTubeVideoItem[];
  customPlaylists: UserCustomPlaylist[];
  onSelectVideo: (video: YouTubeVideoItem) => void;
  onSelectChannel: (channelId: string) => void;
  onToggleSave: (video: YouTubeVideoItem) => void;
  onClearHistory: () => void;
  onCreatePlaylist: (title: string, description: string) => void;
  onDeletePlaylist: (id: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  savedVideos,
  watchHistory,
  customPlaylists,
  onSelectVideo,
  onSelectChannel,
  onToggleSave,
  onClearHistory,
  onCreatePlaylist,
  onDeletePlaylist
}) => {
  const [activeTab, setActiveTab] = useState<'saved' | 'history' | 'playlists'>('saved');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistDesc, setPlaylistDesc] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playlistTitle.trim()) {
      onCreatePlaylist(playlistTitle.trim(), playlistDesc.trim());
      setPlaylistTitle('');
      setPlaylistDesc('');
      setShowCreateModal(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Bookmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">マイライブラリ</h1>
            <p className="text-xs text-neutral-400">保存した動画・再生履歴・カスタム再生リスト</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
              activeTab === 'saved' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-saved-tab"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>保存動画 ({savedVideos.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
              activeTab === 'history' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-history-tab"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>再生履歴 ({watchHistory.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('playlists')}
            className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
              activeTab === 'playlists' ? 'bg-rose-600 text-white shadow' : 'bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            id="library-playlists-tab"
          >
            <ListVideo className="w-3.5 h-3.5" />
            <span>マイ再生リスト ({customPlaylists.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Saved Videos */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          {savedVideos.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm space-y-2">
              <Bookmark className="w-8 h-8 text-neutral-600 mx-auto" />
              <p>保存された動画はありません。</p>
              <p className="text-xs text-neutral-500">動画の「ライブラリ保存」ボタンで追加できます。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {savedVideos.map((v) => (
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

      {/* Tab 2: Watch History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {watchHistory.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={onClearHistory}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-rose-400 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>履歴を全削除</span>
              </button>
            </div>
          )}

          {watchHistory.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm space-y-2">
              <Clock className="w-8 h-8 text-neutral-600 mx-auto" />
              <p>再生履歴はありません。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {watchHistory.map((v) => (
                <VideoCard
                  key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
                  video={v}
                  onSelectVideo={onSelectVideo}
                  onSelectChannel={onSelectChannel}
                  isSaved={savedVideos.some((sv) => (typeof sv.id === 'string' ? sv.id : (sv.id as any)?.videoId) === (typeof v.id === 'string' ? v.id : (v.id as any)?.videoId))}
                  onToggleSave={onToggleSave}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Custom Playlists */}
      {activeTab === 'playlists' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow"
              id="create-playlist-btn"
            >
              <Plus className="w-4 h-4" />
              <span>新しい再生リスト作成</span>
            </button>
          </div>

          {customPlaylists.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm space-y-2">
              <FolderPlus className="w-8 h-8 text-neutral-600 mx-auto" />
              <p>作成された再生リストはありません。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {customPlaylists.map((pl) => (
                <div key={pl.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white">{pl.title}</h3>
                      <p className="text-xs text-neutral-400 mt-1">{pl.description || '説明なし'}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{pl.videos.length} 本の動画</p>
                    </div>
                    <button
                      onClick={() => onDeletePlaylist(pl.id)}
                      className="text-neutral-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {pl.videos.length > 0 && (
                    <div className="aspect-video bg-neutral-950 rounded-xl overflow-hidden relative group">
                      <ThumbnailImage
                        video={pl.videos[0]}
                        fallbackUrl={pl.videos[0].snippet?.thumbnails?.medium?.url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <button
                        onClick={() => onSelectVideo(pl.videos[0])}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 text-white space-y-4 shadow-2xl">
            <h3 className="font-bold text-lg">新規再生リストを作成</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-neutral-300">タイトル</label>
                <input
                  type="text"
                  required
                  value={playlistTitle}
                  onChange={(e) => setPlaylistTitle(e.target.value)}
                  placeholder="例: プログラミング学習用"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-rose-500"
                />
              </div>
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
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium text-neutral-300"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-white shadow"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
