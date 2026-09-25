import React, { useState, useEffect } from 'react';
import { Pickaxe, Sparkles, Trophy, X, Activity } from 'lucide-react';
import { recordActualVisit, getActualAccessStats } from '../utils/accessStats';

export const MinecraftVisitorCounter: React.FC = () => {
  const [totalVisits, setTotalVisits] = useState(1);
  const [todayVisits, setTodayVisits] = useState(1);
  const [expLevel, setExpLevel] = useState(1);
  const [showStatsModal, setShowStatsModal] = useState(false);

  const updateStats = () => {
    const stats = recordActualVisit();
    setTotalVisits(stats.totalVisits);
    setTodayVisits(stats.todayVisits);
    setExpLevel(Math.min(99, Math.max(1, Math.floor(Math.sqrt(stats.totalVisits)))));
  };

  useEffect(() => {
    updateStats();
    const handleUpdate = () => {
      const stats = getActualAccessStats();
      setTotalVisits(stats.totalVisits);
      setTodayVisits(stats.todayVisits);
      setExpLevel(Math.min(99, Math.max(1, Math.floor(Math.sqrt(stats.totalVisits)))));
    };

    window.addEventListener('kaito_access_stats_updated', handleUpdate);
    return () => window.removeEventListener('kaito_access_stats_updated', handleUpdate);
  }, []);

  return (
    <>
      {/* Minecraft-styled Visitor Counter Pill */}
      <button
        onClick={() => setShowStatsModal(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1e2319] hover:bg-[#2b3323] border-2 border-[#476033] rounded-sm text-[#79c33b] font-mono text-[11px] font-black tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer select-none"
        title="マインクラフト風 訪問者カウンター (クリックでステータス表示)"
        id="minecraft-visitor-counter-btn"
      >
        <span className="w-2 h-2 rounded-full bg-[#55ff55] animate-pulse shadow-[0_0_8px_#55ff55]" />
        <span className="text-[#aaffaa] drop-shadow-[1px_1px_0px_#000]">Lv.{expLevel}</span>
        <span className="text-neutral-500">|</span>
        <span className="text-[#ffff55] drop-shadow-[1px_1px_0px_#000]">VISITOR #{totalVisits}</span>
      </button>

      {/* Minecraft Stats Popover Modal */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2c2c2c] border-4 border-[#181818] rounded-none max-w-sm w-full p-5 text-white font-mono shadow-[0_0_20px_rgba(0,0,0,0.8)] relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-[#181818] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#476033] border border-[#79c33b] flex items-center justify-center text-[#aaffaa]">
                  <Pickaxe className="w-4 h-4" />
                </div>
                <h3 className="font-black text-sm text-[#ffff55] drop-shadow-[1px_1px_0px_#000]">
                  MINECRAFT COUNTER
                </h3>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* EXP Bar */}
            <div className="space-y-1 mb-4">
              <div className="flex justify-between text-[11px] text-[#55ff55] font-black">
                <span>EXP LEVEL</span>
                <span>LEVEL {expLevel}</span>
              </div>
              <div className="h-3 w-full bg-[#111] border-2 border-[#333] p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#55ff55] to-[#ffff55] transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalVisits % 50) * 2)}%` }}
                />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="bg-[#1e1e1e] border-2 border-[#181818] p-2.5 space-y-0.5">
                <span className="text-[10px] text-neutral-400">TOTAL VISITS</span>
                <p className="text-base font-black text-[#55ffff]">{totalVisits}</p>
              </div>
              <div className="bg-[#1e1e1e] border-2 border-[#181818] p-2.5 space-y-0.5">
                <span className="text-[10px] text-neutral-400">TODAY VISITS</span>
                <p className="text-base font-black text-[#ffaa00]">{todayVisits}</p>
              </div>
            </div>

            {/* Minecraft Quote & Close */}
            <div className="text-[10px] text-neutral-400 text-center mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#ffff55] inline-block mr-1" />
              <span>You gained YouTube exploration experience!</span>
            </div>

            <button
              onClick={() => setShowStatsModal(false)}
              className="w-full py-2 bg-[#476033] hover:bg-[#5b7a42] border-2 border-[#79c33b] text-[#ffff55] font-black text-xs shadow-md transition-colors cursor-pointer"
            >
              RESUME GAME
            </button>
          </div>
        </div>
      )}
    </>
  );
};
