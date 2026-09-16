import React from 'react';
import { SlidersHorizontal, X, RotateCcw, Calendar, Clock, ArrowUpDown, Layers, Tag } from 'lucide-react';
import { SearchFilters, YouTubeCategoryItem } from '../types';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  categories: YouTubeCategoryItem[];
  onUpdateFilters: (newFilters: Partial<SearchFilters>) => void;
  onResetFilters: () => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  categories,
  onUpdateFilters,
  onResetFilters
}) => {
  if (!isOpen) return null;

  // Predefined upload date options
  const uploadDateOptions = [
    { label: '指定なし (全期間)', value: '' },
    {
      label: '24時間以内',
      value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    },
    {
      label: '今週 (7日以内)',
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      label: '今月 (30日以内)',
      value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      label: '今年 (1年以内)',
      value: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-white space-y-5 my-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">検索フィルター</h3>
              <p className="text-xs text-neutral-400">条件を絞り込んで動画を検索</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* 1. Upload Date Filter */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-rose-400" />
              <span>アップロード日</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {uploadDateOptions.map((item) => {
                const isSelected =
                  (!filters.publishedAfter && !item.value) ||
                  (filters.publishedAfter && item.value && filters.publishedAfter.slice(0, 10) === item.value.slice(0, 10));
                return (
                  <button
                    key={item.label}
                    onClick={() => onUpdateFilters({ publishedAfter: item.value || undefined })}
                    className={`p-2 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 border-rose-500 text-white font-bold shadow'
                        : 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Order Filter */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
              <span>並び順 (Sort Order)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'relevance', label: '関連度順' },
                { id: 'date', label: '新しい順' },
                { id: 'viewCount', label: '視聴回数順' },
                { id: 'rating', label: '高評価順' },
                { id: 'title', label: 'タイトル順' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateFilters({ order: item.id as any })}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    filters.order === item.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold shadow'
                      : 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Duration Filter */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>動画の長さ (Duration)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'any', label: 'すべての長さ' },
                { id: 'short', label: 'ショート (< 4分)' },
                { id: 'medium', label: '中編 (4〜20分)' },
                { id: 'long', label: '長編 (> 20分)' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateFilters({ videoDuration: item.id as any })}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    filters.videoDuration === item.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold shadow'
                      : 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Type Filter */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>種類 (Type)</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'all', label: 'すべて' },
                { id: 'video', label: '動画' },
                { id: 'channel', label: 'チャンネル' },
                { id: 'playlist', label: '再生リスト' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateFilters({ type: item.id as any })}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    filters.type === item.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold shadow'
                      : 'bg-neutral-800/80 border-neutral-700/80 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Category Filter */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-400" />
              <span>カテゴリ (Category)</span>
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => onUpdateFilters({ categoryId: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-rose-500"
            >
              <option value="">すべてのカテゴリ</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.snippet.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={onResetFilters}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>条件リセット</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold text-xs text-white shadow-lg transition-colors cursor-pointer"
          >
            適用して検索
          </button>
        </div>
      </div>
    </div>
  );
};
