import React, { useState, useEffect } from 'react';
import { X, EyeOff, Shield, ExternalLink, AlertOctagon, Check, Laptop } from 'lucide-react';

interface StealthCloakModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CloakPreset {
  id: string;
  name: string;
  title: string;
  favicon: string;
  icon: string;
}

const CLOAK_PRESETS: CloakPreset[] = [
  {
    id: 'classroom',
    name: 'Google Classroom',
    title: 'ホーム - Google Classroom',
    favicon: 'https://ssl.gstatic.com/classroom/favicon.png',
    icon: '🎓'
  },
  {
    id: 'drive',
    name: 'Google ドライブ',
    title: 'マイドライブ - Google ドライブ',
    favicon: 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png',
    icon: '📁'
  },
  {
    id: 'google',
    name: 'Google 検索',
    title: 'Google',
    favicon: 'https://www.google.com/favicon.ico',
    icon: '🔍'
  },
  {
    id: 'desmos',
    name: 'Desmos グラフ計算機',
    title: 'Desmos | グラフ計算機',
    favicon: 'https://www.desmos.com/favicon.ico',
    icon: '📐'
  }
];

export const StealthCloakModal: React.FC<StealthCloakModalProps> = ({ isOpen, onClose }) => {
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    return localStorage.getItem('kaito_cloak_preset') || 'default';
  });
  const [panicUrl, setPanicUrl] = useState<string>(() => {
    return localStorage.getItem('kaito_panic_url') || 'https://classroom.google.com/';
  });
  const [copied, setCopied] = useState(false);

  // Apply tab cloaking
  const applyCloak = (presetId: string) => {
    setCurrentPreset(presetId);
    localStorage.setItem('kaito_cloak_preset', presetId);

    if (presetId === 'default') {
      document.title = '海斗tube - YouTube Client';
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (link) link.href = '/favicon.ico';
      return;
    }

    const preset = CLOAK_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      document.title = preset.title;
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = preset.favicon;
    }
  };

  // Open in about:blank cloaked window
  const handleOpenAboutBlank = () => {
    try {
      const win = window.open('about:blank', '_blank');
      if (!win) {
        alert('ポップアップがブロックされました。ブラウザのポップアップ許可を有効にしてください。');
        return;
      }

      const currentUrl = window.location.href;
      const doc = win.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <title>${document.title || 'Classes'}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background-color: #0f0f0f;
            }
            iframe {
              border: none;
              width: 100%;
              height: 100%;
              display: block;
            }
          </style>
        </head>
        <body>
          <iframe src="${currentUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        </body>
        </html>
      `);
      doc.close();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to open about:blank', e);
    }
  };

  // Panic button action
  const handlePanicEscape = () => {
    window.location.replace(panicUrl || 'https://classroom.google.com/');
  };

  const handleSavePanicUrl = (val: string) => {
    setPanicUrl(val);
    localStorage.setItem('kaito_panic_url', val);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">ステルス・クローキング設定</h3>
              <p className="text-xs text-neutral-400">タブ偽装・about:blank・緊急避難（パニック）</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 overflow-y-auto text-xs sm:text-sm text-neutral-300">
          {/* 1. about:blank Launcher */}
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-rose-400" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  about:blank 偽装ウィンドウ
                </span>
              </div>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30 font-semibold">
                履歴に残らない
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              ブラウザのURLバーを「about:blank」にした新規タブを開き、その中にアプリを展開します。学校の監視拡張機能や閲覧履歴にサイトURLが残りません。
            </p>
            <button
              onClick={handleOpenAboutBlank}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow cursor-pointer text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{copied ? 'ウィンドウを開きました！' : 'about:blank で開く'}</span>
            </button>
          </div>

          {/* 2. Tab Cloak Presets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                タブタイトル & アイコン偽装
              </span>
              <span className="text-[10px] text-neutral-400">ワンクリックで即時反映</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CLOAK_PRESETS.map((p) => {
                const isActive = currentPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyCloak(p.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-950/40 border-emerald-500/80 text-white ring-1 ring-emerald-500/50'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base">{p.icon}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{p.name}</div>
                        <div className="text-[10px] text-neutral-400 truncate">{p.title}</div>
                      </div>
                    </div>
                    {isActive && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>

            {currentPreset !== 'default' && (
              <button
                onClick={() => applyCloak('default')}
                className="text-xs text-neutral-400 hover:text-white underline cursor-pointer pt-1"
              >
                デフォルト（海斗tube）の表示に戻す
              </button>
            )}
          </div>

          {/* 3. Panic Button Settings */}
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  緊急避難（パニックボタン）
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              急に先生や保護者が来た時、ワンクリックで安全な学習サイトへ即座にページを差し替えます。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={panicUrl}
                onChange={(e) => handleSavePanicUrl(e.target.value)}
                placeholder="https://classroom.google.com/"
                className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handlePanicEscape}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer shadow"
              >
                今すぐ避難
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
