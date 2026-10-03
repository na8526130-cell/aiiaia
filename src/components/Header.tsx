import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  AlertTriangle,
  Pin,
  Clock,
  Rss,
  Plus,
  Trash2,
  Terminal,
  Tv
} from 'lucide-react';
import { SearchFilters, PlaybackMode, ApiSettings } from '../types';
import { customFetch } from '../utils/apiClient';
import { ServerStatusBadge } from './ServerStatusBadge';
import { ProxyGuideModal } from './ProxyGuideModal';
import { StealthCloakModal } from './StealthCloakModal';
import { EyeOff, AlertOctagon, Calculator, Sun, Moon, Laptop } from 'lucide-react';
import { getThemePreference, setThemePreference, ThemeMode } from '../utils/themeManager';
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistoryItem,
  clearSearchHistory,
  getPinnedSearchTags,
  togglePinnedSearchTag
} from '../utils/userDataManager';

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
  onLockDisguise?: () => void;
  platformMode?: 'youtube' | 'niconico';
  onChangePlatformMode?: (mode: 'youtube' | 'niconico') => void;
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
  onLockDisguise,
  platformMode = 'youtube',
  onChangePlatformMode
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
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
  const [pinnedTags, setPinnedTags] = useState<string[]>(() => getPinnedSearchTags());
  const suggestRef = useRef<HTMLDivElement>(null);

  // Sync search history and pinned tags
  useEffect(() => {
    const syncTags = () => {
      setSearchHistory(getSearchHistory());
      setPinnedTags(getPinnedSearchTags());
    };
    window.addEventListener('kaito_search_tags_changed', syncTags);
    return () => window.removeEventListener('kaito_search_tags_changed', syncTags);
  }, []);

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

  // Unified suggestions list combining past search_history and live API suggestions on focus
  const unifiedSuggestions = useMemo(() => {
    const trimmed = queryInput.trim().toLowerCase();
    const matchedHistory = trimmed
      ? searchHistory.filter((h) => h.toLowerCase().includes(trimmed)).slice(0, 6)
      : searchHistory.slice(0, 10);

    const seen = new Set<string>();
    const combined: { text: string; isHistory: boolean }[] = [];

    for (const h of matchedHistory) {
      const key = h.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({ text: h, isHistory: true });
      }
    }

    for (const s of suggestions) {
      const key = String(s || '').trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        const alsoInHistory = searchHistory.some((h) => h.toLowerCase() === key);
        combined.push({ text: s, isHistory: alsoInHistory });
      }
    }

    return combined.slice(0, 12);
  }, [queryInput, searchHistory, suggestions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSuggestOpen || unifiedSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < unifiedSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : unifiedSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < unifiedSuggestions.length) {
        e.preventDefault();
        const selected = unifiedSuggestions[selectedIndex].text;
        setQueryInput(selected);
        setIsSuggestOpen(false);
        addSearchHistory(selected);
        onSearchSubmit(selected);
      }
    } else if (e.key === 'Escape') {
      setIsSuggestOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term =
      selectedIndex >= 0 && unifiedSuggestions[selectedIndex]
        ? unifiedSuggestions[selectedIndex].text
        : queryInput.trim();
    if (!term) return;
    setIsSuggestOpen(false);
    addSearchHistory(term);
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
    addSearchHistory(text);
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
        {/* Brand Logo & Creator Credit */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              onUpdateFilters({ query: '' });
              onChangeTab('home');
            }}
            className="flex items-center gap-2 group text-left focus:outline-none cursor-pointer"
            id="brand-logo-btn"
          >
            {platformMode === 'niconico' ? (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#252525] border-2 border-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform select-none">
                <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-md shadow-rose-600/20 group-hover:scale-105 transition-transform select-none">
                <span className="text-white font-black text-base sm:text-lg tracking-tighter leading-none">海</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {platformMode === 'niconico' ? (
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                  海斗<span className="text-[#0088cc]">にこ動画</span>
                </span>
              ) : (
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                  海斗<span className="text-rose-500">tube</span>
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                  platformMode === 'niconico'
                    ? 'bg-[#0088cc]/20 border border-[#0088cc]/40 text-sky-300'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                }`}
              >
                制作: 海斗
              </span>
            </div>
          </button>

          {/* Platform Mode Toggle (YouTube / ニコニコ) */}
          {onChangePlatformMode && (
            <div className="flex items-center bg-neutral-950 p-1 rounded-full border border-neutral-700/90 ml-1 shadow-inner">
              <button
                type="button"
                id="btn-yt"
                onClick={() => onChangePlatformMode('youtube')}
                className={`px-2.5 sm:px-3.5 py-1 rounded-full text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                  platformMode === 'youtube'
                    ? 'bg-white text-[#ff0000] shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>▶</span>
                <span>YouTube</span>
              </button>
              <button
                type="button"
                id="btn-nico"
                onClick={() => onChangePlatformMode('niconico')}
                className={`px-2.5 sm:px-3.5 py-1 rounded-full text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                  platformMode === 'niconico'
                    ? 'bg-[#0088cc] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Tv className="w-3 h-3" />
                <span>ニコニコ</span>
              </button>
            </div>
          )}
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
                  placeholder={
                    platformMode === 'niconico'
                      ? 'ニコニコ動画を検索 または sm番号 / URLを入力...'
                      : '検索またはYouTube / Shorts / ニコニコのURLを入力...'
                  }
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
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs sm:text-sm rounded-r-full border border-l-0 border-neutral-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                id="search-submit-btn"
              >
                <Search className="w-4 h-4 text-neutral-300" />
              </button>
            </div>
          </form>

          {/* Unified Suggestions & Search History (search_history) Popup Dropdown */}
          {isSuggestOpen && (unifiedSuggestions.length > 0 || (!queryInput.trim() && pinnedTags.length > 0)) && (
            <div
              className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in"
              id="search-suggest-dropdown"
            >
              <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/60">
                {/* Pinned Search Tags Section when input is empty */}
                {!queryInput.trim() && pinnedTags.length > 0 && (
                  <div className="px-3.5 py-2.5 space-y-1.5 bg-neutral-950/40">
                    <div className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
                      <Pin className="w-3 h-3" />
                      <span>ピン留め検索タグ</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pinnedTags.map((tag) => (
                        <span
                          key={tag}
                          onClick={() => handleSelectSuggestion(tag)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs cursor-pointer transition-colors"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinnedSearchTag(tag);
                            }}
                            className="text-rose-400 hover:text-white"
                            title="ピン留め解除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unified Search History (search_history) + Live Suggestions List */}
                {unifiedSuggestions.length > 0 && (
                  <div className="py-1">
                    {searchHistory.length > 0 && (
                      <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-neutral-400 bg-neutral-950/30">
                        <span className="font-bold flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>
                            {queryInput.trim()
                              ? '検索履歴 & サジェスト候補'
                              : '最近の検索履歴 (search_history)'}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSearchHistory();
                          }}
                          className="text-neutral-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer transition-colors"
                          title="検索履歴をすべて削除"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>履歴を全クリア</span>
                        </button>
                      </div>
                    )}

                    {unifiedSuggestions.map((entry, idx) => {
                      const isPinned = pinnedTags.some((p) => p.toLowerCase() === entry.text.toLowerCase());
                      return (
                        <div
                          key={`${entry.isHistory ? 'hist' : 'sug'}-${entry.text}-${idx}`}
                          onClick={() => handleSelectSuggestion(entry.text)}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm cursor-pointer transition-colors group ${
                            idx === selectedIndex
                              ? 'bg-neutral-800 text-white font-medium'
                              : 'text-neutral-200 hover:bg-neutral-800/70 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {entry.isHistory ? (
                              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            ) : (
                              <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            )}
                            <span className="truncate">{entry.text}</span>
                            {entry.isHistory && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold shrink-0">
                                履歴
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinnedSearchTag(entry.text);
                              }}
                              title={isPinned ? 'ピン留めを解除' : '検索バーの下にピン留めする'}
                              className={`p-1 rounded hover:bg-neutral-700 transition-colors ${
                                isPinned ? 'text-rose-400' : 'text-neutral-500 hover:text-neutral-200'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>

                            {entry.isHistory && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSearchHistoryItem(entry.text);
                                }}
                                title={`「${entry.text}」を検索履歴から削除`}
                                className="p-1 rounded hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                                aria-label="検索履歴から削除"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
              title="数学学習画面（二次方程式の解説）に戻る"
              id="return-math-disguise-btn"
            >
              <Calculator className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">数学画面に戻る</span>
            </button>
          )}

          {/* InnerTube API active badge */}
          <div
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 font-medium"
            title="InnerTube API (YouTube公式内部通信) 稼働中。APIキー不要・クォータ制限なし"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>InnerTube (キー不要)</span>
          </div>

          {/* Playback Mode Selector */}
          <div className="hidden md:flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => onTogglePlaybackMode('education')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                playbackMode === 'education'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="YouTube Player for Education（教育用埋め込み・広告なし）"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Edu</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-sync')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                playbackMode === 'stream-sync'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="タイプ2（yt.omada.cafe 1080p映像＋高音質音声 2要素同期ストリーム）"
            >
              <Waves className="w-3.5 h-3.5" />
              <span>Type2(1080p+音)</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-high')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                playbackMode === 'stream-high'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="1080p 高画質ストリーム（yt.omada.cafe 1080p映像＋高音質音声）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>1080p</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-360')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                playbackMode === 'stream-360'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="360p Google Video ストリーム（yt.omada.cafe から直接取得）"
            >
              <Film className="w-3.5 h-3.5" />
              <span>360p</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('stream-audio')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                playbackMode === 'stream-audio'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="高音質 音声ストリーム（yt.omada.cafe AACオーディオのみ）"
            >
              <Music className="w-3.5 h-3.5" />
              <span>音声</span>
            </button>
            <button
              onClick={() => onTogglePlaybackMode('nocookie')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                playbackMode === 'nocookie'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
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

      {/* Main Navigation Bar (Shown in YouTube mode) */}
      {platformMode !== 'niconico' && (
      <div className="border-t border-neutral-800 bg-neutral-950 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => {
                onUpdateFilters({ query: '' });
                onChangeTab('home');
              }}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
              onClick={() => onChangeTab('subscriptions-feed')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'subscriptions-feed'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-subscriptions-feed-tab"
            >
              <Rss className="w-3.5 h-3.5 text-emerald-400" />
              <span>新着タイムライン</span>
            </button>

            <button
              onClick={() => onChangeTab('channels')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'channels'
                  ? 'bg-neutral-800 text-white font-bold border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-white'
              }`}
              id="nav-channels-tab"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>チャンネル管理</span>
            </button>

            <button
              onClick={() => onChangeTab('library')}
              className={`px-3.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
      )}

      {/* Quick One-Tap Search Tags Bar (Pinned Tags & Recent Search History) */}
      {(pinnedTags.length > 0 || searchHistory.length > 0 || queryInput.trim()) && (
        <div className="border-t border-neutral-800/80 bg-neutral-950/90 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none text-[11px]">
            {/* Pin Current Query Button if not yet pinned */}
            {queryInput.trim() &&
              !/^https?:\/\//i.test(queryInput.trim()) &&
              !pinnedTags.some((t) => t.toLowerCase() === queryInput.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => togglePinnedSearchTag(queryInput.trim())}
                  className="px-2.5 py-1 rounded-full bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title="現在の検索ワードを検索バー下にピン留め"
                >
                  <Plus className="w-3 h-3" />
                  <span>「{queryInput.trim().slice(0, 16)}」をピン留め</span>
                </button>
              )}

            {/* Pinned Search Tags */}
            {pinnedTags.map((tag) => {
              const isActive = filters.query.trim().toLowerCase() === tag.toLowerCase();
              return (
                <div
                  key={`pin-${tag}`}
                  className={`inline-flex items-center rounded-full border transition-all whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-rose-600 border-rose-500 text-white font-bold shadow'
                      : 'bg-neutral-900/90 hover:bg-neutral-800 border-rose-500/30 text-neutral-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(tag)}
                    className="pl-2.5 pr-1.5 py-0.5 flex items-center gap-1 cursor-pointer"
                    title={`「${tag}」をワンタップ検索`}
                  >
                    <Pin className={`w-2.5 h-2.5 ${isActive ? 'text-white' : 'text-rose-400'}`} />
                    <span>{tag}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinnedSearchTag(tag);
                    }}
                    className={`pr-2 pl-0.5 py-0.5 hover:text-rose-300 cursor-pointer ${
                      isActive ? 'text-rose-200' : 'text-neutral-500'
                    }`}
                    title="ピン留め解除"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}

            {/* Unpinned Recent Search History Tags */}
            {searchHistory
              .filter((h) => !pinnedTags.some((p) => p.toLowerCase() === h.toLowerCase()))
              .slice(0, 10)
              .map((hist) => {
                const isActive = filters.query.trim().toLowerCase() === hist.toLowerCase();
                return (
                  <div
                    key={`hist-${hist}`}
                    className={`inline-flex items-center rounded-full border transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-neutral-800 border-neutral-600 text-white font-bold'
                        : 'bg-neutral-900/60 hover:bg-neutral-800/80 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(hist)}
                      className="pl-2.5 pr-1 py-0.5 flex items-center gap-1 cursor-pointer"
                      title={`履歴「${hist}」を再検索`}
                    >
                      <Clock className="w-2.5 h-2.5 text-neutral-500" />
                      <span>{hist}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinnedSearchTag(hist);
                      }}
                      className="px-1 py-0.5 text-neutral-500 hover:text-rose-400 cursor-pointer"
                      title="ピン留めする"
                    >
                      <Pin className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearchHistoryItem(hist);
                      }}
                      className="pr-2 pl-0.5 py-0.5 text-neutral-500 hover:text-rose-400 cursor-pointer"
                      title="履歴から削除"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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
