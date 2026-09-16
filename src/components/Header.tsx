import React, { useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Play,
  Flame,
  LayoutGrid,
  Bookmark,
  Mic,
  X,
  Globe,
  ShieldCheck,
  Zap,
  GraduationCap,
  LogOut,
  Settings,
  Server,
  Users,
  Keyboard,
  Film,
  Music,
  Waves
} from 'lucide-react';
import { SearchFilters, PlaybackMode, ApiSettings } from '../types';

interface HeaderProps {
  filters: SearchFilters;
  onUpdateFilters: (newFilters: Partial<SearchFilters>) => void;
  onSearchSubmit: (q: string) => void;
  onOpenFilterModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenShortcutsModal?: () => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  playbackMode: PlaybackMode;
  onTogglePlaybackMode: (mode: PlaybackMode) => void;
  savedCount: number;
  apiSettings: ApiSettings;
  emergencyV3Available?: boolean;
  onActivateEmergencyV3?: () => void;
  onDeactivateEmergencyV3?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  filters,
  onUpdateFilters,
  onSearchSubmit,
  onOpenFilterModal,
  onOpenSettingsModal,
  onOpenShortcutsModal,
  activeTab,
  onChangeTab,
  playbackMode,
  onTogglePlaybackMode,
  savedCount,
  apiSettings,
  emergencyV3Available = false,
  onActivateEmergencyV3,
  onDeactivateEmergencyV3
}) => {
  const [queryInput, setQueryInput] = useState(filters.query);
  const [isListening, setIsListening] = useState(false);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    onSearchSubmit(trimmed);
  };

  const handleClear = () => {
    setQueryInput('');
    onUpdateFilters({ query: '' });
  };

  const handleVoiceSearch = () => {
    setIsListening(true);
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setQueryInput(transcript);
          onSearchSubmit(transcript);
          setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
        return;
      } catch (e) {
        console.error(e);
      }
    }

    setTimeout(() => {
      const sampleQueries = ['プログラミング', 'Lofi 勉強用BGM', '最新 AI テクノロジー', 'ショート動画'];
      const randomQuery = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
      setQueryInput(randomQuery);
      onSearchSubmit(randomQuery);
      setIsListening(false);
    }, 1200);
  };

  return (
    <header className="sticky top-0 z-40 bg-neutral-900 border-b border-neutral-800 text-white shadow-md">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3 sm:gap-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              onUpdateFilters({ query: '' });
              onChangeTab('home');
            }}
            className="flex items-center gap-2 group text-left focus:outline-none"
            id="brand-logo-btn"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-950/50 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-200 select-none">
              <span className="text-white font-black text-base sm:text-lg tracking-tighter leading-none">海</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                海斗<span className="text-rose-500">tube</span>
              </span>
            </div>
          </button>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleFormSubmit} className="flex-1 max-w-xl mx-1 sm:mx-4">
          <div className="relative flex items-center">
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="キーワードを入力..."
                className="w-full pl-4 pr-16 py-1.5 bg-neutral-950 border border-neutral-700/80 focus:border-rose-500 rounded-l-full text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors"
                id="search-input"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 text-neutral-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Voice Search Button */}
            <button
              type="button"
              onClick={handleVoiceSearch}
              title="音声検索"
              className={`p-2 bg-neutral-800 border-y border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors ${
                isListening ? 'text-rose-400 animate-pulse bg-rose-500/10' : ''
              }`}
              id="voice-search-btn"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={onOpenFilterModal}
              title="検索フィルター"
              className="p-2 bg-neutral-800 border border-l-0 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors relative"
              id="filter-modal-btn"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {(filters.order !== 'relevance' || filters.type !== 'all' || filters.videoDuration !== 'any' || filters.categoryId) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-neutral-900" />
              )}
            </button>

            {/* Submit Search Button */}
            <button
              type="submit"
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs sm:text-sm rounded-r-full border border-l-0 border-neutral-700 transition-colors flex items-center justify-center shrink-0"
              id="search-submit-btn"
            >
              <Search className="w-4 h-4 text-neutral-300" />
            </button>
          </div>
        </form>

        {/* Right Controls: Playback Mode, Region & Settings */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Active YouTube API v3 status indicator (Only when user explicitly turned it on in settings) */}
          {apiSettings.forceYoutubeV3 && (
            <button
              onClick={onDeactivateEmergencyV3}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 rounded-lg text-xs text-amber-300 font-bold transition-all shadow-sm cursor-pointer"
              title="YouTube API v3 が稼働中。クリックすると通常モードに戻します"
              id="emergency-v3-active-btn"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span className="hidden sm:inline">YouTube API v3 有効中</span>
              <span className="text-[10px] bg-amber-500/30 px-1 py-0.5 rounded">戻す</span>
            </button>
          )}

          {/* Playback Mode Selector */}
          {/* Mode Selector */}
          <div className="hidden md:flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => onTogglePlaybackMode('education')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'education'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="YouTube Player for Education（教育用埋め込み・広告なし）"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Edu</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-normal')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-normal'
                  ? 'bg-rose-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="720p ストリーム（映像＋音声合体・推奨）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>720p</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-high')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-high'
                  ? 'bg-purple-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="1080p 高画質ストリーム（映像＋音声合体）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>1080p</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-360')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-360'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="360p 低画質ストリーム（映像＋音声合体・軽量）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>360p</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-audio')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-audio'
                  ? 'bg-teal-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="音声のみ（オーディオストリーム）"
            >
              <Music className="w-3.5 h-3.5" />
              <span>音声のみ</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('nocookie')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                playbackMode === 'nocookie'
                  ? 'bg-neutral-800 text-white font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="NoCookie 埋め込みプレイヤー"
            >
              NoCookie
            </button>
          </div>

          {/* Region Selector */}
          <div className="hidden sm:flex items-center bg-neutral-800 text-neutral-300 border border-neutral-700 rounded-lg text-xs px-2 py-1.5">
            <Globe className="w-3.5 h-3.5 text-neutral-400 mr-1" />
            <select
              value={filters.regionCode}
              onChange={(e) => onUpdateFilters({ regionCode: e.target.value })}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
              id="region-select"
            >
              <option value="JP" className="bg-neutral-900">🇯🇵 JP</option>
              <option value="US" className="bg-neutral-900">🇺🇸 US</option>
              <option value="KR" className="bg-neutral-900">🇰🇷 KR</option>
              <option value="GB" className="bg-neutral-900">🇬🇧 GB</option>
              <option value="TW" className="bg-neutral-900">🇹🇼 TW</option>
            </select>
          </div>

          {/* API Settings Button */}
          <button
            onClick={onOpenSettingsModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-lg text-xs text-neutral-200 transition-colors font-medium cursor-pointer"
            title="設定"
            id="settings-modal-btn"
          >
            <Settings className="w-3.5 h-3.5 text-neutral-300" />
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-300">
              設定
            </span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="border-t border-neutral-800 bg-neutral-950 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => {
                onUpdateFilters({ query: '' });
                onChangeTab('home');
              }}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'home' && !filters.query
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-home-tab"
            >
              <Play className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              <span>ホーム</span>
            </button>

            <button
              onClick={() => onChangeTab('trending')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'trending'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-trending-tab"
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>急上昇</span>
            </button>

            <button
              onClick={() => onChangeTab('shorts')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'shorts'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-shorts-tab"
            >
              <Zap className="w-3.5 h-3.5 text-rose-400" />
              <span>ショート</span>
            </button>

            <button
              onClick={() => onChangeTab('categories')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'categories'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-categories-tab"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
              <span>カテゴリ</span>
            </button>

            <button
              onClick={() => onChangeTab('channels')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'channels'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-channels-tab"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>チャンネル一覧</span>
            </button>

            <button
              onClick={() => onChangeTab('library')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'library'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-library-tab"
            >
              <Bookmark className="w-3.5 h-3.5 text-sky-400" />
              <span>ライブラリ</span>
              {savedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-rose-600 text-white rounded-full font-bold">
                  {savedCount}
                </span>
              )}
            </button>
          </div>

          {/* Keyboard Shortcuts Trigger Button */}
          {onOpenShortcutsModal && (
            <button
              onClick={onOpenShortcutsModal}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors text-xs shrink-0 cursor-pointer border border-transparent hover:border-neutral-700"
              title="キーボードショートカット一覧 (?)"
            >
              <Keyboard className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-[11px]">ショートカット</span>
              <kbd className="px-1 py-0.2 rounded bg-neutral-800 text-[10px] font-mono text-neutral-300 border border-neutral-700">?</kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
