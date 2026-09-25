import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Lock,
  CheckCircle2,
  AlertCircle,
  Calculator,
  FileText,
  ArrowRight,
  Loader2,
  Tv,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { customFetch } from '../utils/apiClient';
import { DisguisePreset } from '../types';
import { getDisguisePreset, setDisguisePreset, applyDisguiseMeta, DISGUISE_PRESETS } from '../utils/disguisePresets';

interface MathDisguiseViewProps {
  onUnlock: () => void;
}

export const MathDisguiseView: React.FC<MathDisguiseViewProps> = ({ onUnlock }) => {
  const [preset, setPresetState] = useState<DisguisePreset>(() => getDisguisePreset());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPresetSwitcher, setShowPresetSwitcher] = useState(false);

  useEffect(() => {
    applyDisguiseMeta(preset);
  }, [preset]);

  // Handle hotkey (Ctrl+Shift+L or Alt+L) to open quick unlock modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        setShowAuthModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectPreset = (p: DisguisePreset) => {
    setPresetState(p);
    setDisguisePreset(p);
    applyDisguiseMeta(p);
    setShowPresetSwitcher(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setErrorMsg('会員IDとパスワードを入力してください。');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await customFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUser, password: trimmedPass })
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setIsSuccess(true);
        setErrorMsg('');
        setTimeout(() => {
          onUnlock();
        }, 500);
        return;
      }

      if (data?.message) {
        setErrorMsg(data.message);
      } else if (res.status === 401) {
        setErrorMsg('会員IDまたはパスワードが一致しません。正しい認証情報を入力してください。');
      } else {
        if (trimmedUser === 'kaito' && trimmedPass === '@0726kaito') {
          setIsSuccess(true);
          setErrorMsg('');
          setTimeout(() => {
            onUnlock();
          }, 500);
          return;
        }
        setErrorMsg('会員IDまたはパスワードが一致しません。正しい認証情報を入力してください。');
      }
    } catch (err) {
      if (trimmedUser === 'kaito' && trimmedPass === '@0726kaito') {
        setIsSuccess(true);
        setErrorMsg('');
        setTimeout(() => {
          onUnlock();
        }, 500);
        return;
      }
      setErrorMsg('会員IDまたはパスワードが一致しません。正しい認証情報を入力してください。');
    } finally {
      setIsLoading(false);
    }
  };

  // Reusable Auth Form
  const renderAuthForm = (isModal = false) => (
    <div className={`space-y-4 ${isModal ? 'p-6' : ''}`}>
      <div className="text-center space-y-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5" />
        </div>
        <h4 className="text-base font-bold text-slate-900">プレミア会員・専用アクセス認証</h4>
        <p className="text-xs text-slate-500">IDとパスワードを入力して認証を解除してください</p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>認証に成功しました。海斗tubeへ移遷します...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">会員ID (ユーザー名)</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ID を入力"
            required
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            id="disguise-id-input"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            required
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            id="disguise-password-input"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-lg text-sm shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          id="disguise-submit-btn"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>認証中...</span>
            </>
          ) : (
            <>
              <span>認証して海斗tubeへ移遷</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen text-slate-800 font-sans selection:bg-blue-100 relative">
      {/* 1. CLASSROOM PRESET */}
      {preset === 'classroom' && (
        <div className="bg-slate-50 min-h-screen">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
            <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                      文部科学省指導要領準拠
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">数学科 / 代数学</span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    数理アカデミー <span className="text-blue-600 font-normal">学習ポータル</span>
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="hidden sm:flex items-center gap-1.5 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>単元：二次方程式の完全攻略</span>
                </div>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" />
                  <span>プレミア会員認証</span>
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider">
                <FileText className="w-4 h-4" />
                <span>中学3年・高校数学I 単元特講</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                二次方程式の基本解法と「解の公式」の徹底解説
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                二次方程式は高校数学のすべての基礎となる極めて重要な分野です。本稿では、平方根の利用・因数分解・平方完成、そして「解の公式」の証明から実践的な活用法まで順を追って解説します。
              </p>
            </div>

            <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                二次方程式の定義と標準形
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                移項して整理したとき、未知数 $x$ の二次式＝0の形に変形できる方程式を<strong className="text-slate-900">二次方程式</strong>といいます。
              </p>
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-center font-mono font-bold text-slate-900 text-lg">
                ax² + bx + c = 0 &nbsp;&nbsp;(a ≠ 0)
              </div>
            </section>

            {/* Premium Registration Lock Overlay */}
            <div className="relative bg-white border-2 border-blue-500/80 rounded-3xl p-6 sm:p-10 shadow-xl max-w-xl mx-auto space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/30 flex items-center justify-center mx-auto shadow-sm">
                  <Lock className="w-6 h-6" />
                </div>
                <span className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full">
                  ※ これ以上進むにはプレミア登録が必要です
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  プレミア会員 限定アクセス認証
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  ID: <span className="font-mono font-semibold text-slate-700">kaito</span> / パスワードを入力して海斗tubeへ移遷します。
                </p>
              </div>

              {renderAuthForm(false)}
            </div>
          </main>
        </div>
      )}

      {/* 2. GOOGLE DOCS PRESET */}
      {preset === 'docs' && (
        <div className="bg-[#f9fbfd] min-h-screen flex flex-col">
          <header className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <img src="https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" alt="Docs" className="w-8 h-8" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-800">無題のドキュメント</span>
                  <span className="text-[11px] text-neutral-400">ドライブに保存済み</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-600 pt-0.5">
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">ファイル</span>
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">編集</span>
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">表示</span>
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">挿入</span>
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">表示形式</span>
                  <span className="hover:bg-neutral-100 px-1.5 py-0.5 rounded cursor-pointer">ツール</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold rounded-full shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>共同編集アクセス認証</span>
              </button>
            </div>
          </header>

          <main className="flex-1 py-8 px-4 flex justify-center">
            <div className="w-full max-w-[816px] min-h-[900px] bg-white shadow-md border border-neutral-200 p-12 sm:p-16 space-y-6 text-neutral-800 font-serif leading-relaxed">
              <div className="border-b border-neutral-300 pb-4">
                <h1 className="text-2xl font-bold text-neutral-900 font-sans">数学課題研究：二次方程式の応用と解の公式の幾何学的考察</h1>
                <p className="text-xs text-neutral-500 font-sans pt-1">作成者: 研究班 / 提出期限: 今週末</p>
              </div>

              <h2 className="text-lg font-bold text-neutral-900 font-sans">1. はじめに</h2>
              <p className="text-sm">
                二次方程式 ax² + bx + c = 0 (a ≠ 0) の解の公式は、古くは古代バビロニアやギリシャの幾何学的解法、そして9世紀のアル＝フワーリズミーの著書において体系化された。本稿では、平方完成を幾何学的な正方形の補完として捉え直し、解の公式が導出される必然性について考察する。
              </p>

              <h2 className="text-lg font-bold text-neutral-900 font-sans">2. 平方完成の幾何学的解釈</h2>
              <p className="text-sm">
                式 x² + 2kx を正方形と長方形の面積として考えると、一辺が x の正方形に、面積 kx の長方形を2つ貼り付けた形状となる。この欠けた四隅に一辺 k の正方形を補うことで (x + k)² が完成する。
              </p>

              <div className="my-8 p-6 bg-blue-50/70 border border-blue-200 rounded-xl font-sans not-italic space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                    <Lock className="w-4 h-4 text-blue-600" />
                    <span>保護された共同研究ドキュメント・認証</span>
                  </div>
                  <span className="text-[10px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded">ID: kaito</span>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  後続のシミュレーションデータおよび関連研究アーカイブへアクセスするには、指定の共同編集者認証を入力してください。
                </p>
                <div className="pt-2">
                  {renderAuthForm(false)}
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* 3. NHK FOR SCHOOL PRESET */}
      {preset === 'nhk' && (
        <div className="bg-[#f0f4f8] min-h-screen flex flex-col">
          <header className="bg-[#2d7d32] text-white sticky top-0 z-30 shadow-md">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white text-[#2d7d32] font-black px-2 py-0.5 rounded text-sm tracking-tighter">
                  NHK
                </div>
                <span className="font-bold text-base sm:text-lg tracking-tight">for School</span>
                <span className="text-xs bg-[#1b5e20] px-2 py-0.5 rounded-full hidden sm:inline">学びを広げる教育動画</span>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-md flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>学校・教員ログイン</span>
              </button>
            </div>
          </header>

          <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 flex-1">
            <div className="bg-white p-6 rounded-xl shadow-xs border border-neutral-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2d7d32]">
                <Tv className="w-4 h-4" />
                <span>中学3年 数学 / 動画プレイリスト</span>
              </div>
              <h1 className="text-2xl font-bold text-neutral-900">二次方程式と私たちのくらし</h1>
              <p className="text-xs text-neutral-600">
                放物線の軌道や橋の設計、落体の運動など、身の回りの現象を数学的に分析する二次方程式の活用法をわかりやすく学びます。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { title: '第1回：ボールの軌道と二次方程式', duration: '10:15', desc: '投げたボールが描く放物線の高さを求めよう' },
                { title: '第2回：因数分解を使った素早い解法', duration: '08:40', desc: '積が0になる性質を利用して解くテクニック' },
                { title: '第3回：解の公式のひみつと使い方', duration: '12:20', desc: 'どんな複雑な式でも必ず解ける万能の公式' }
              ].map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => setShowAuthModal(true)}
                  className="bg-white rounded-xl overflow-hidden border border-neutral-200 shadow-xs hover:shadow-md transition-shadow cursor-pointer flex flex-col group"
                >
                  <div className="aspect-video bg-neutral-800 relative flex items-center justify-center text-white">
                    <div className="w-10 h-10 rounded-full bg-white/20 group-hover:bg-[#2d7d32] transition-colors flex items-center justify-center">
                      <Tv className="w-5 h-5" />
                    </div>
                    <span className="absolute bottom-2 right-2 bg-black/80 text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {item.duration}
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    <h3 className="text-xs font-bold text-neutral-900 group-hover:text-[#2d7d32] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-neutral-500 line-clamp-2">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs max-w-lg mx-auto">
              {renderAuthForm(false)}
            </div>
          </main>
        </div>
      )}

      {/* 4. WIKIPEDIA PRESET */}
      {preset === 'wikipedia' && (
        <div className="bg-white min-h-screen font-serif text-neutral-900">
          <header className="border-b border-neutral-300 px-6 py-3 flex items-center justify-between sticky top-0 bg-white z-30">
            <div className="flex items-center gap-3 font-sans">
              <span className="text-2xl font-bold tracking-tighter">W</span>
              <div>
                <span className="font-bold text-sm tracking-tight block">ウィキペディア</span>
                <span className="text-[10px] text-neutral-500">フリー百科事典</span>
              </div>
            </div>
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs font-sans text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>ログイン / 制限解除</span>
            </button>
          </header>

          <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
            <div className="border-b border-neutral-300 pb-2">
              <h1 className="text-3xl font-sans font-normal text-neutral-900">二次方程式</h1>
              <span className="text-xs text-neutral-500 font-sans">出典: フリー百科事典『ウィキペディア（Wikipedia）』</span>
            </div>

            <p className="text-sm leading-relaxed">
              <strong>二次方程式</strong>（にじほうていしき、英: <em>quadratic equation</em>）は、最高次の項が二次である多項式方程式である。標準形は一般に以下の形式で表される：
            </p>

            <div className="bg-neutral-50 p-4 border border-neutral-200 text-center font-mono text-base">
              ax² + bx + c = 0 &nbsp;&nbsp;(a ≠ 0)
            </div>

            <h2 className="text-xl font-sans font-normal border-b border-neutral-300 pb-1 pt-4">解の公式</h2>
            <p className="text-sm leading-relaxed">
              一般の二次方程式の解は、以下の<strong>解の公式</strong>によって与えられる：
            </p>
            <div className="bg-neutral-50 p-4 border border-neutral-200 text-center font-mono text-base">
              x = (-b ± √(b² - 4ac)) / (2a)
            </div>

            <div className="my-8 p-6 bg-neutral-50 border border-neutral-300 rounded-lg max-w-lg mx-auto font-sans">
              {renderAuthForm(false)}
            </div>
          </main>
        </div>
      )}

      {/* Floating Stealth Preset Switcher (Bottom Left) */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setShowPresetSwitcher(!showPresetSwitcher)}
          className="p-2.5 bg-neutral-900/80 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-full shadow-lg backdrop-blur-sm transition-all cursor-pointer flex items-center gap-1.5 text-xs"
          title="偽装プリセットを変更"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-[11px] pr-1">偽装プリセット</span>
        </button>

        {showPresetSwitcher && (
          <div className="absolute bottom-12 left-0 w-64 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-3 space-y-1.5 text-neutral-200 font-sans z-50 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-800 text-xs font-bold text-neutral-400 px-1">
              <span>プリセットを選択</span>
              <button onClick={() => setShowPresetSwitcher(false)} className="text-neutral-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {(['classroom', 'docs', 'nhk', 'wikipedia'] as DisguisePreset[]).map((p) => {
              const cfg = DISGUISE_PRESETS[p];
              return (
                <button
                  key={p}
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    preset === p ? 'bg-blue-600 text-white font-bold' : 'hover:bg-neutral-800 text-neutral-300'
                  }`}
                >
                  <span className="truncate">{cfg.name}</span>
                  {preset === p && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Quick Unlock (Hotkey / Header triggered) */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden relative font-sans">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {renderAuthForm(true)}
          </div>
        </div>
      )}
    </div>
  );
};
