import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'K / Space', desc: '再生 / 一時停止' },
    { key: 'J / ←', desc: '10秒 / 5秒 巻き戻し' },
    { key: 'L / →', desc: '10秒 / 5秒 早送り' },
    { key: 'M', desc: 'ミュート (消音) 切り替え' },
    { key: 'F', desc: '全画面 (フルスクリーン) 切替' },
    { key: '0 〜 9', desc: '動画の 0% 〜 90% にジャンプ' },
    { key: 'Shift + >', desc: '再生速度を速くする (+0.25x)' },
    { key: 'Shift + <', desc: '再生速度を遅くする (-0.25x)' },
    { key: 'Esc', desc: 'モーダル / 詳細画面を閉じる' },
    { key: '?', desc: 'このショートカットガイドを表示' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-5 shadow-2xl text-white space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">キーボードショートカット</h3>
              <p className="text-xs text-neutral-400">YouTube公式準拠の快適操作</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800/80 text-xs"
            >
              <span className="text-neutral-300 font-medium">{sc.desc}</span>
              <kbd className="px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 font-mono text-[11px] font-bold text-rose-300 shadow-inner">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-neutral-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
