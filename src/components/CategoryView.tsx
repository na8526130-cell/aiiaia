import React, { useState, useEffect } from 'react';
import { LayoutGrid, Flame, Sparkles, AlertCircle } from 'lucide-react';
import { YouTubeCategoryItem, YouTubeVideoItem } from '../types';
import { VideoCard } from './VideoCard';
import { customFetch } from '../utils/apiClient';

interface CategoryViewProps {
  categories: YouTubeCategoryItem[];
  onSelectVideo: (video: YouTubeVideoItem) => void;
  onSelectChannel: (channelId: string) => void;
  regionCode: string;
}

export const CategoryView: React.FC<CategoryViewProps> = ({
  categories,
  onSelectVideo,
  onSelectChannel,
  regionCode
}) => {
  const [selectedCatId, setSelectedCatId] = useState<string>('27'); // Default Education or Music
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    customFetch(`/api/youtube/trending?videoCategoryId=${selectedCatId}&regionCode=${regionCode}&maxResults=20`)
      .then((res) => res.json())
      .then((data) => {
        setVideos(data.items || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [selectedCatId, regionCode]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">カテゴリ探訪</h1>
            <p className="text-xs text-neutral-400">YouTube Data APIを活用したジャンル別急上昇・トレンド動画</p>
          </div>
        </div>
      </div>

      {/* Categories Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCatId(cat.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCatId === cat.id
                ? 'bg-emerald-600 text-white shadow-lg border border-emerald-400'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            {cat.snippet.title}
          </button>
        ))}
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div className="py-20 text-center text-neutral-400 text-sm animate-pulse">
          カテゴリ動画を読み込み中...
        </div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center text-neutral-400 space-y-3 bg-neutral-900 border border-neutral-800 rounded-xl p-8">
          <AlertCircle className="w-10 h-10 text-neutral-500 mx-auto" />
          <p className="text-sm font-semibold text-white">このカテゴリの動画が見つかりませんでした。</p>
          <p className="text-xs text-neutral-400">他のカテゴリを選択するか、ヘッダーの設定からAPIデータソースをご確認ください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {videos.map((v) => (
            <VideoCard
              key={typeof v.id === 'string' ? v.id : (v.id as any)?.videoId || Math.random().toString()}
              video={v}
              onSelectVideo={onSelectVideo}
              onSelectChannel={onSelectChannel}
            />
          ))}
        </div>
      )}
    </div>
  );
};

