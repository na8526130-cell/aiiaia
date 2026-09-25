import React, { useState, useEffect, useRef } from 'react';
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
  Waves,
  AlertTriangle
} from 'lucide-react';
import { SearchFilters, PlaybackMode, ApiSettings } from '../types';
import { customFetch } from '../utils/apiClient';
import { ServerStatusBadge } from './ServerStatusBadge';
import { ProxyGuideModal } from './ProxyGuideModal';
import { StealthCloakModal } from './StealthCloakModal';
import { EyeOff, AlertOctagon, Calculator, Sun, Moon, Laptop } from 'lucide-react';
import { getThemePreference, setThemePreference, ThemeMode } from '../utils/themeManager';

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
  onLockDisguise?: () => void;
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
  onDeactivateEmergencyV3,
  onLockDisguise
}) => {
  const [queryInput, setQueryInput] = useState(filters.query);
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);
  const [isStealthModalOpen, setIsStealthModalOpen] = useState(false);
  const [hasConnectionBlock, setHasConnectionBlock] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getThemePreference());
  const suggestRef = useRef<HTMLDivElement>(null);

  // Sync theme changes
  useEffect(() => {
    const handleThemeChange = (e: any) => {
      setCurrentTheme(e.detail?.mode || getThemePreference());
    };
    const handleOpenProxy = () => setIsProxyModalOpen(true);

    window.addEventListener('kaito_theme_changed', handleThemeChange);
    window.addEventListener('kaito_open_proxy_guide', handleOpenProxy);

    return () => {
      window.removeEventListener('kaito_theme_changed', handleThemeChange);
      window.removeEventListener('kaito_open_proxy_guide', handleOpenProxy);
    };
  }, []);

  const handleCycleTheme = () => {
    const nextTheme: ThemeMode = currentTheme === 'system' ? 'light' : currentTheme === 'light' ? 'dark' : 'system';
    setThemePreference(nextTheme);
    setCurrentTheme(nextTheme);
  };

  // Restore saved cloak on mount
  useEffect(() => {
    const savedPreset = localStorage.getItem('kaito_cloak_preset');
    if (savedPreset && savedPreset !== 'default') {
      const titles: Record<string, { title: string; favicon: string }> = {
        classroom: { title: 'ホーム - Google Classroom', favicon: 'https://ssl.gstatic.com/classroom/favicon.png' },
        drive: { title: 'マイドライブ - Google ドライブ', favicon: 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png' },
        google: { title: 'Google', favicon: 'https://www.google.com/favicon.ico' },
        desmos: { title: 'Desmos | グラフ計算機', favicon: 'https://www.desmos.com/favicon.ico' }
      };
      const found = titles[savedPreset];
      if (found) {
        document.title = found.title;
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = found.favicon;
      }
    }
  }, []);

  // Panic button escape action
  const handleQuickPanic = () => {
    const url = localStorage.getItem('kaito_panic_url') || 'https://classroom.google.com/';
    window.location.replace(url);
  };

  // Sync external filters.query
  useEffect(() => {
    setQueryInput(filters.query);
  }, [filters.query]);

  // Fetch suggestions on debounce
  useEffect(() => {
    const trimmed = queryInput.trim();
    if (!trimmed || !isSuggestOpen) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(() => {
      customFetch(`/api/youtube/suggest?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSuggestions(data.slice(0, 8));
          } else if (data && Array.isArray(data[1])) {
            setSuggestions(data[1].slice(0, 8));
          }
        })
        .catch(() => {});
    }, 200);

    return () => clearTimeout(timer);
  }, [queryInput, isSuggestOpen]);

  // Handle outside click to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setIsSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for global connection block alert
  useEffect(() => {
    const handleBlock = () => setHasConnectionBlock(true);
    window.addEventListener('kaito_connection_blocked', handleBlock);
    return () => window.removeEventListener('kaito_connection_blocked', handleBlock);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSuggestOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        const selected = suggestions[selectedIndex];
        setQueryInput(selected);
        setIsSuggestOpen(false);
        onSearchSubmit(selected);
      }
    } else if (e.key === 'Escape') {
      setIsSuggestOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = selectedIndex >= 0 && suggestions[selectedIndex] ? suggestions[selectedIndex] : queryInput.trim();
    if (!term) return;
    setIsSuggestOpen(false);
    onSearchSubmit(term);
  };

  const handleClear = () => {
    setQueryInput('');
    setSuggestions([]);
    setIsSuggestOpen(false);
    onUpdateFilters({ query: '' });
  };

  const handleSelectSuggestion = (text: string) => {
    setQueryInput(text);
    setIsSuggestOpen(false);
    onSearchSubmit(text);
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
      {/* Network Connection Block Alert Banner */}
      {hasConnectionBlock && (
        <div className="bg-rose-600/90 text-white px-4 py-1.5 text-xs flex items-center justify-between border-b border-rose-500 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
            <span>ネットワーク通信またはYouTube APIへの接続が遮断されています。プロキシ設定をご確認ください。</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsProxyModalOpen(true)}
              className="px-2 py-0.5 bg-white text-rose-700 font-bold rounded text-[11px] hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              プロキシ設定
            </button>
            <button
              onClick={() => setHasConnectionBlock(false)}
              className="p-1 hover:bg-rose-700 rounded text-rose-200 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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

        {/* Search Bar Form with Suggestions Dropdown */}
        <div ref={suggestRef} className="flex-1 max-w-xl mx-1 sm:mx-4 relative">
          <form onSubmit={handleFormSubmit}>
            <div className="relative flex items-center">
              <div className="relative flex-1 flex items-center">
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => {
                    setQueryInput(e.target.value);
                    setIsSuggestOpen(true);
                  }}
                  onFocus={() => setIsSuggestOpen(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="検索またはYouTube / ShortsのURLを入力..."
                  className="w-full pl-4 pr-16 py-1.5 bg-neutral-950 border border-neutral-700/80 focus:border-rose-500 rounded-l-full text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none transition-colors"
                  id="search-input"
                  autoComplete="off"
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

          {/* Suggestions Popup Dropdown */}
          {isSuggestOpen && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
              {suggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectSuggestion(item)}
                  className={`px-4 py-2.5 flex items-center gap-3 text-xs sm:text-sm cursor-pointer transition-colors ${
                    idx === selectedIndex
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Server Load Status Badge */}
          <ServerStatusBadge />

          {/* Proxy Health / Guide Modal Trigger */}
          <button
            onClick={() => setIsProxyModalOpen(true)}
            className="p-2 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            title="プロキシ管理 & GAS同期ガイド"
            id="proxy-guide-btn"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          {/* Stealth & Cloaking Settings (Tab Cloak, about:blank, Panic) */}
          <button
            onClick={() => setIsStealthModalOpen(true)}
            className="p-2 text-neutral-400 hover:text-indigo-400 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            title="ステルス・クローキング設定 (タブ偽装・about:blank)"
            id="stealth-cloak-btn"
          >
            <EyeOff className="w-4 h-4" />
          </button>

          {/* Emergency Panic Escape Button */}
          <button
            onClick={handleQuickPanic}
            className="px-2 py-1 text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
            title="緊急避難（クリックまたは設定したURLへ即座に退避）"
            id="quick-panic-btn"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">避難</span>
          </button>

          {/* Return to Math Disguise Screen (Secondary / Camouflage) */}
          {onLockDisguise && (
            <button
              onClick={onLockDisguise}
              className="px-2 py-1 text-[11px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              title="二次方程式の解説（偽装学習画面）に戻る"
              id="return-math-disguise-btn"
            >
              <Calculator className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">数学画面に戻る</span>
            </button>
          )}

          {/* Active YouTube API v3 status indicator */}
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
              onClick={() => onTogglePlaybackMode('stream-high')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-high'
                  ? 'bg-purple-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="1080p 合体ストリーム（映像と音声を別々取得して高画質合体）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>1080p 合体</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-360')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                playbackMode === 'stream-360'
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="360p 低画質ストリーム（軽量）"
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
              title="音声ストリーム（オーディオのみ）"
            >
              <Music className="w-3.5 h-3.5" />
              <span>音声ストリーム</span>
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

          {/* Quick Theme Toggle Button */}
          <button
            onClick={handleCycleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-lg text-xs text-neutral-200 transition-colors font-medium cursor-pointer"
            title={`テーマ切り替え: 現在「${currentTheme === 'system' ? 'デバイスに合わせる(OS追従)' : currentTheme === 'light' ? 'ライトモード' : 'ダークモード'}」`}
          >
            {currentTheme === 'system' ? (
              <Laptop className="w-3.5 h-3.5 text-neutral-300" />
            ) : currentTheme === 'light' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-300">
              {currentTheme === 'system' ? 'OS連動' : currentTheme === 'light' ? 'ライト' : 'ダーク'}
            </span>
          </button>

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

      {/* Proxy Health & Integration Guide Modal */}
      <ProxyGuideModal
        isOpen={isProxyModalOpen}
        onClose={() => setIsProxyModalOpen(false)}
      />

      {/* Stealth & Cloaking Modal */}
      <StealthCloakModal
        isOpen={isStealthModalOpen}
        onClose={() => setIsStealthModalOpen(false)}
      />
    </header>
  );
};
