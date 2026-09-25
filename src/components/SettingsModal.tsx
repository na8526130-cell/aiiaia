import React, { useState } from 'react';
import { Settings, X, Globe, Key, Check, RefreshCw, Server, Shield, Sparkles, Image as ImageIcon, Zap, Sun, Moon, Laptop } from 'lucide-react';
import { ApiSettings } from '../types';
import { PRESET_INVIDIOUS_INSTANCES, DEFAULT_SETTINGS } from '../utils/apiClient';
import {
  isBase64ThumbnailsEnabled,
  setBase64ThumbnailsEnabled,
  isInvidiousThumbnailsEnabled,
  setInvidiousThumbnailsEnabled
} from '../utils/thumbnail';
import { getThemePreference, setThemePreference, ThemeMode } from '../utils/themeManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ApiSettings;
  onSaveSettings: (newSettings: ApiSettings) => void;
  onOpenProxyGuide?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onOpenProxyGuide
}) => {
  const [invidiousUrl, setInvidiousUrl] = useState<string>(settings.invidiousUrl || 'https://yt.omada.cafe/');
  const [youtubeApiKey, setYoutubeApiKey] = useState<string>(settings.youtubeApiKey || '');
  const [useBase64, setUseBase64] = useState<boolean>(isBase64ThumbnailsEnabled());
  const [useInvidiousThumb, setUseInvidiousThumb] = useState<boolean>(isInvidiousThumbnailsEnabled());
  const [themeMode, setLocalThemeMode] = useState<ThemeMode>(() => getThemePreference());
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePresetSelect = (url: string) => {
    setInvidiousUrl(url);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInvidious = invidiousUrl.trim() ? invidiousUrl.trim() : 'https://yt.omada.cafe/';
    onSaveSettings({
      provider: 'innertube',
      innertubeUrl: 'https://yt-api.myproxy0108.workers.dev/',
      invidiousUrl: cleanInvidious.endsWith('/') ? cleanInvidious : cleanInvidious + '/',
      youtubeApiKey: youtubeApiKey.trim(),
      forceYoutubeV3: false
    });
    setBase64ThumbnailsEnabled(useBase64);
    setInvidiousThumbnailsEnabled(useInvidiousThumb);
    setThemePreference(themeMode);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setInvidiousUrl(DEFAULT_SETTINGS.invidiousUrl);
    setYoutubeApiKey('');
    setUseBase64(true);
    setUseInvidiousThumb(true);
    setLocalThemeMode('system');
    setThemePreference('system');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">環境・データ設定</h2>
              <p className="text-xs text-neutral-400">表示・キャッシュおよびバックエンド設定</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Status Indicator */}
          <div className="space-y-2.5 p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>データ配信エンジン</span>
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                最適化稼働中
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              高速・高可用プロキシエンジン経由で動画、検索、急上昇、コメントが自動取得されています。
            </p>
            {onOpenProxyGuide && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProxyGuide();
                  }}
                  className="w-full px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Google Apps Script (GAS) 同期 & プロキシ設定を開く</span>
                </button>
              </div>
            )}
          </div>

          {/* Theme Settings: デバイスに合わせる / ライトモード / ダークモード */}
          <div className="space-y-3 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>カラーテーマ設定</span>
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                {themeMode === 'system' ? 'OS連動（自動追従）' : themeMode === 'light' ? 'ライト' : 'ダーク'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocalThemeMode('system');
                  setThemePreference('system');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                  themeMode === 'system'
                    ? 'bg-rose-600/20 text-rose-300 border-rose-500 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span className="text-[11px] text-center leading-tight">デバイスに合わせる</span>
                <span className="text-[9px] text-neutral-500 font-normal">OS設定に自動追従</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocalThemeMode('light');
                  setThemePreference('light');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                  themeMode === 'light'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] text-center leading-tight">ライトモード</span>
                <span className="text-[9px] text-neutral-500 font-normal">明るい背景</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocalThemeMode('dark');
                  setThemePreference('dark');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                  themeMode === 'dark'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <Moon className="w-4 h-4 text-purple-400" />
                <span className="text-[11px] text-center leading-tight">ダークモード</span>
                <span className="text-[9px] text-neutral-500 font-normal">暗い背景</span>
              </button>
            </div>
          </div>

          {/* Invidious Instance Config */}
          <div className="space-y-3 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-500" />
              <span>Invidious サーバーインスタンス URL</span>
            </label>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-neutral-400">推奨サーバープリセット:</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_INVIDIOUS_INSTANCES.map((inst) => (
                  <button
                    key={inst.url}
                    type="button"
                    onClick={() => handlePresetSelect(inst.url)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      invidiousUrl === inst.url
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    {inst.name}
                  </button>
                ))}
              </div>
            </div>

            {/* URL Input */}
            <div className="space-y-1">
              <input
                type="url"
                value={invidiousUrl}
                onChange={(e) => setInvidiousUrl(e.target.value)}
                placeholder="https://yt.omada.cafe/"
                className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <p className="text-[11px] text-neutral-400">
                例: <code className="text-amber-400 font-mono">https://yt.omada.cafe/</code> （設定したインスタンスから直接データ・検索結果を取得します）
              </p>
            </div>
          </div>

          {/* Custom YouTube API Key */}
          <div className="space-y-2 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-rose-500" />
              <span>カスタム YouTube Data API キー (任意)</span>
            </label>
            <input
              type="password"
              value={youtubeApiKey}
              onChange={(e) => setYoutubeApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3.5 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
            <p className="text-[11px] text-neutral-400">
              ご自身のGoogle Cloud ConsoleのYouTube Data API v3キーを設定する場合に入力してください（空欄の場合はサーバー共有キーを使用します）。
            </p>
          </div>

          {/* Thumbnail Base64 & Invidious Settings (KaitoTube Reference) */}
          <div className="space-y-3 bg-neutral-950/50 p-4 rounded-xl border border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-rose-400" />
                <span>サムネイル画像最適化 (KaitoTube仕様)</span>
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                推奨
              </span>
            </div>

            {/* Base64 Toggle */}
            <div className="flex items-center justify-between p-3 bg-neutral-900 rounded-xl border border-neutral-800">
              <div className="space-y-0.5 pr-3">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  サムネイルをBase64変換
                </div>
                <div className="text-[11px] text-neutral-400 leading-relaxed">
                  サムネイル画像をData URI (Base64) に変換して直接埋め込みます。CORS制約やネットワーク制限環境での画像表示欠損を防止します。
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useBase64}
                onClick={() => setUseBase64(!useBase64)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  useBase64 ? 'bg-rose-600' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    useBase64 ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Invidious Thumbnails Toggle */}
            <div className="flex items-center justify-between p-3 bg-neutral-900 rounded-xl border border-neutral-800">
              <div className="space-y-0.5 pr-3">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Invidious サーバー経由でサムネイル取得
                </div>
                <div className="text-[11px] text-neutral-400 leading-relaxed">
                  YouTubeの公式画像サーバー (i.ytimg.com) への直接通信をバイパスし、Invidiousサーバー経由で画像を取得します。
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useInvidiousThumb}
                onClick={() => setUseInvidiousThumb(!useInvidiousThumb)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  useInvidiousThumb ? 'bg-amber-600' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    useInvidiousThumb ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg text-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>デフォルトに戻す</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300 animate-bounce" />
                    <span>保存しました！</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>設定を保存</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
