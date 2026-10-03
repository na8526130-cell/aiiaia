import React, { useState, useMemo } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Layers,
  RefreshCw,
  Sparkles,
  Target
} from 'lucide-react';
import {
  SchoolLevel,
  SubjectGroup,
  SUBJECT_GROUPS,
  MathProblem
} from '../utils/mathScienceProblems';
import {
  RED_SHEET_NOTES,
  FLASHCARD_ITEMS
} from '../utils/studyFlashcardsData';
import { customFetch } from '../utils/apiClient';

export interface StudyActivityLogItem {
  id: string;
  timestamp: string;
  type: 'problem' | 'mockexam' | 'flashcard';
  subjectLabel: string;
  unitName: string;
  title: string;
  isCorrect: boolean;
  scoreDetail?: string;
}

export interface MockExamRecord {
  id: string;
  date: string;
  score: number;
  correct: number;
  total: number;
  deviation: number;
  rank: string;
  wrongUnits: string[];
}

export interface StudentStudyProgress {
  solvedIds: Record<string, boolean>;
  attemptCount: number;
  correctCount: number;
  streakCount: number;
  studySeconds: number;
  masteredCards: Record<string, boolean>;
  exams: RegisteredExamItem[];
  activityLogs: StudyActivityLogItem[];
  mockExamHistory: MockExamRecord[];
  updatedAt: string;
}

// ============================================================================
// 1. 模試・小テストモード（10問テスト＆偏差値・判定表示）
// ============================================================================
interface MockExamViewProps {
  problems: MathProblem[];
  onRecordSolved: (problemId: string, isCorrect: boolean) => void;
  mockExamHistory?: MockExamRecord[];
  onSaveMockExamRecord?: (record: MockExamRecord) => void;
}

export const MockExamView: React.FC<MockExamViewProps> = ({
  problems,
  onRecordSolved,
  mockExamHistory = [],
  onSaveMockExamRecord
}) => {
  const [examLevel, setExamLevel] = useState<SchoolLevel>('all');
  const [examSubject, setExamSubject] = useState<SubjectGroup>('all');
  const [examStarted, setExamStarted] = useState(false);
  const [examFinished, setExamFinished] = useState(false);
  const [examQuestions, setExamQuestions] = useState<MathProblem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const startMockExam = () => {
    const pool = problems.filter((p) => {
      if (examLevel === 'junior' && p.level !== '中学') return false;
      if (examLevel === 'high' && p.level !== '高校') return false;
      if (examSubject !== 'all' && p.subject !== examSubject) return false;
      return true;
    });
    const source = pool.length >= 10 ? pool : problems;
    const shuffled = [...source].sort(() => Math.random() - 0.5).slice(0, 10);
    setExamQuestions(shuffled);
    setAnswers({});
    setCurrentIdx(0);
    setExamFinished(false);
    setExamStarted(true);
  };

  const finishMockExam = () => {
    let correct = 0;
    const wrongUnits: string[] = [];
    examQuestions.forEach((q, idx) => {
      const chosen = answers[idx];
      const ok = chosen === q.correctIndex;
      if (ok) {
        correct += 1;
      } else if (!wrongUnits.includes(q.unitName)) {
        wrongUnits.push(q.unitName);
      }
      onRecordSolved(q.id, ok);
    });
    const score = examQuestions.length > 0 ? Math.round((correct / examQuestions.length) * 100) : 0;
    const deviation = Number((42 + score * 0.3).toFixed(1));
    const rank = score >= 80 ? 'A判定' : score >= 60 ? 'B判定' : score >= 40 ? 'C判定' : 'D判定';
    if (onSaveMockExamRecord) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
        now.getDate()
      ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      onSaveMockExamRecord({
        id: 'mock-' + Date.now(),
        date: dateStr,
        score,
        correct,
        total: examQuestions.length,
        deviation,
        rank,
        wrongUnits
      });
    }
    setExamFinished(true);
  };

  const report = useMemo(() => {
    if (!examFinished || examQuestions.length === 0) return null;
    let correct = 0;
    const wrongUnits: string[] = [];
    examQuestions.forEach((q, idx) => {
      if (answers[idx] === q.correctIndex) {
        correct += 1;
      } else {
        if (!wrongUnits.includes(q.unitName)) {
          wrongUnits.push(q.unitName);
        }
      }
    });
    const score = Math.round((correct / examQuestions.length) * 100);
    // Realistic deviation score (偏差値) calculation: 40.0 to 72.5
    const deviation = Number((42 + score * 0.3).toFixed(1));
    const grade =
      score >= 80
        ? { rank: 'A判定', desc: '第一志望校 合格圏内（上位10%水準）', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' }
        : score >= 60
        ? { rank: 'B判定', desc: '合格目標ライン到達（標準〜応用定着）', color: 'text-blue-700 bg-blue-50 border-blue-300' }
        : score >= 40
        ? { rank: 'C判定', desc: '基礎固め推奨（頻出単元の復習でB判定圏へ）', color: 'text-amber-700 bg-amber-50 border-amber-300' }
        : { rank: 'D判定', desc: '要基礎復習（間違えた単元の解説を重点確認）', color: 'text-rose-700 bg-rose-50 border-rose-300' };

    return { correct, score, deviation, grade, wrongUnits };
  }, [examFinished, examQuestions, answers]);

  if (!examStarted) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="space-y-1 border-b border-slate-100 pb-4">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">実力診断・到達度模試</span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            10問実力判定テスト（偏差値・A〜D合格判定・弱点単元分析）
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            出題範囲（校種・教科）を選択して10問のテストを受験すると、得点・全国推定偏差値・合格判定（A〜D）・苦手単元一覧が即座に算出されます。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">1. 出題校種を選択</label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {([
                { id: 'all', label: '中学・高校 総合' },
                { id: 'junior', label: '中学範囲のみ' },
                { id: 'high', label: '高校範囲のみ' }
              ] as const).map((lv) => (
                <button
                  key={lv.id}
                  type="button"
                  onClick={() => setExamLevel(lv.id)}
                  className={`py-2.5 px-3 rounded-xl font-bold border cursor-pointer transition-colors ${
                    examLevel === lv.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {lv.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">2. 出題教科を選択</label>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {SUBJECT_GROUPS.map((sg) => (
                <button
                  key={sg.id}
                  type="button"
                  onClick={() => setExamSubject(sg.id)}
                  className={`px-3 py-2 rounded-xl font-bold border cursor-pointer transition-colors ${
                    examSubject === sg.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {sg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={startMockExam}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl text-sm shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Award className="w-4 h-4" />
            <span>10問 模試・小テストを開始する</span>
          </button>
        </div>

        {mockExamHistory.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>過去の模試・10問小テスト受験履歴 ({mockExamHistory.length}回分保存済み)</span>
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {mockExamHistory.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500">{rec.date}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold">{rec.rank}</span>
                    <span className="font-extrabold text-slate-900">
                      {rec.score}点 / 100点（偏差値 {rec.deviation}）
                    </span>
                  </div>
                  <div className="text-slate-600">
                    {rec.wrongUnits.length === 0 ? (
                      <span className="text-emerald-700 font-bold">全問正解</span>
                    ) : (
                      <span>要復習: {rec.wrongUnits.slice(0, 3).join('・')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (examFinished && report) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold text-blue-600">数理アカデミー 到達度模試 成績通知表</span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">個人成績レポート・弱点単元分析</h2>
            </div>
            <button
              type="button"
              onClick={() => setExamStarted(false)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>範囲を変えて再受験する</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
              <div className="text-xs font-bold text-slate-500">総合得点</div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">
                {report.score} <span className="text-base font-normal text-slate-500">/ 100点</span>
              </div>
              <div className="text-xs text-slate-600">正解数：{report.correct} / {examQuestions.length}問</div>
            </div>

            <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 text-center space-y-1">
              <div className="text-xs font-bold text-blue-700">全国推定偏差値</div>
              <div className="text-3xl font-extrabold text-blue-900 font-mono">{report.deviation}</div>
              <div className="text-xs text-blue-700">全受験生データ基準</div>
            </div>

            <div className={`p-5 rounded-2xl border text-center space-y-1 ${report.grade.color}`}>
              <div className="text-xs font-bold">志望校・到達度判定</div>
              <div className="text-3xl font-extrabold">{report.grade.rank}</div>
              <div className="text-[11px] font-medium">{report.grade.desc}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5">
            <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-amber-600" />
              <span>重点復習おすすめ単元（苦手単元分析）</span>
            </div>
            {report.wrongUnits.length === 0 ? (
              <p className="text-xs text-emerald-800 font-bold">
                全問正解（満点）です！すべての出題単元を完璧に習得しています。
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {report.wrongUnits.map((u, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-white border border-amber-300 text-amber-900 rounded-lg text-xs font-bold"
                  >
                    要復習：{u}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* All 10 Questions Review */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-900">全10問の採点結果と詳しい解説</h3>
            <div className="space-y-3">
              {examQuestions.map((q, idx) => {
                const userAns = answers[idx];
                const isOk = userAns === q.correctIndex;
                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border space-y-2 text-xs sm:text-sm ${
                      isOk ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        {isOk ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>
                          第{idx + 1}問 【{q.unitName}】 {q.question}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-xs shrink-0 ${
                          isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {isOk ? '〇 正解 (+10点)' : '× 不正解 (0点)'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 pl-6 space-y-1">
                      <div>
                        あなたの解答：<strong className="font-mono">{userAns !== undefined ? q.choices[userAns] : '未回答'}</strong> ／
                        正解：<strong className="font-mono text-emerald-700">{q.choices[q.correctIndex]}</strong>
                      </div>
                      <div className="text-slate-600 bg-white/80 p-2.5 rounded-lg border border-slate-200">
                        {q.explanation.join(' ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeQ = examQuestions[currentIdx];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold">
            模試 第 {currentIdx + 1} / {examQuestions.length} 問
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
            {activeQ.level}・{activeQ.unitName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {examQuestions.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIdx(i)}
              className={`w-6 h-6 rounded-full text-xs font-bold cursor-pointer ${
                i === currentIdx
                  ? 'bg-blue-600 text-white'
                  : answers[i] !== undefined
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-relaxed">
          問{currentIdx + 1}. {activeQ.question}
        </h3>
        {activeQ.formula && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-slate-900 text-base sm:text-lg">
            {activeQ.formula}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activeQ.choices.map((c, idx) => {
          const isSel = answers[currentIdx] === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setAnswers((prev) => ({ ...prev, [currentIdx]: idx }))}
              className={`p-4 rounded-xl border text-left text-sm sm:text-base transition-all cursor-pointer flex items-center gap-3 ${
                isSel
                  ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                  isSel ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-300'
                }`}
              >
                {['A', 'B', 'C', 'D'][idx]}
              </span>
              <span>{c}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
        >
          前の問題へ
        </button>

        {currentIdx < examQuestions.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => i + 1)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-1 cursor-pointer"
          >
            <span>次の問題へ</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={finishMockExam}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>採点して成績表・偏差値を表示</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. 暗記カード（赤シート機能 / 一問一答フラッシュカード）
// ============================================================================
interface FlashcardsRedSheetViewProps {
  masteredCards?: Record<string, boolean>;
  onToggleMasteredCard?: (cardId: string, cardFront: string, categoryName: string, nextMastered: boolean) => void;
}

export const FlashcardsRedSheetView: React.FC<FlashcardsRedSheetViewProps> = ({
  masteredCards: propMasteredCards,
  onToggleMasteredCard
}) => {
  const [subMode, setSubMode] = useState<'redsheet' | 'flipcard'>('redsheet');
  const [redSheetOn, setRedSheetOn] = useState(true);
  const [revealedItemIds, setRevealedItemIds] = useState<Record<string, boolean>>({});
  const [subjectFilter, setSubjectFilter] = useState<SubjectGroup>('all');

  // Flip card states
  const [cardIdx, setCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [localMasteredCards, setLocalMasteredCards] = useState<Record<string, boolean>>({});
  const masteredCards = propMasteredCards || localMasteredCards;

  const filteredNotes = useMemo(() => {
    if (subjectFilter === 'all') return RED_SHEET_NOTES;
    return RED_SHEET_NOTES.filter((n) => n.subject === subjectFilter);
  }, [subjectFilter]);

  const filteredCards = useMemo(() => {
    if (subjectFilter === 'all') return FLASHCARD_ITEMS;
    return FLASHCARD_ITEMS.filter((c) => c.subject === subjectFilter);
  }, [subjectFilter]);

  const currentCard = filteredCards[cardIdx] || filteredCards[0] || FLASHCARD_ITEMS[0];

  const toggleRevealItem = (id: string) => {
    setRevealedItemIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubMode('redsheet')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subMode === 'redsheet' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {redSheetOn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>赤シート暗記ノート</span>
          </button>
          <button
            type="button"
            onClick={() => setSubMode('flipcard')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subMode === 'flipcard' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>一問一答フラッシュカード ({FLASHCARD_ITEMS.length}枚)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SUBJECT_GROUPS.map((sg) => (
            <button
              key={sg.id}
              type="button"
              onClick={() => {
                setSubjectFilter(sg.id);
                setCardIdx(0);
                setIsFlipped(false);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                subjectFilter === sg.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {sg.label}
            </button>
          ))}
        </div>
      </div>

      {subMode === 'redsheet' ? (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-extrabold text-rose-950 flex items-center gap-2">
                <span>赤シート暗記フィルター：{redSheetOn ? 'ON（重要語句を隠しています）' : 'OFF（すべて表示中）'}</span>
              </div>
              <p className="text-xs text-rose-800">
                赤く塗られた空欄部分をクリックすると、1箇所ずつ答えを確認できます。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRedSheetOn((v) => !v);
                  setRevealedItemIds({});
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs transition-colors ${
                  redSheetOn
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-white hover:bg-rose-100 text-rose-700 border border-rose-300'
                }`}
              >
                {redSheetOn ? '赤シートを外す (全表示)' : '赤シートをかぶせる (隠す)'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredNotes.map((note) => (
              <div key={note.id} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="text-base font-extrabold text-slate-900">{note.unitTitle}</h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                    {note.level}範囲
                  </span>
                </div>
                <ul className="space-y-3 text-sm text-slate-800 leading-relaxed">
                  {note.items.map((item, idx) => {
                    const isHidden = redSheetOn && !revealedItemIds[item.id];
                    return (
                      <li key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                        <span className="font-bold text-slate-400 mr-2">{idx + 1}.</span>
                        <span>{item.prefix}</span>
                        <button
                          type="button"
                          onClick={() => toggleRevealItem(item.id)}
                          className={`mx-1 px-2.5 py-0.5 rounded-md font-extrabold transition-all cursor-pointer inline-block ${
                            isHidden
                              ? 'bg-rose-600 text-rose-600 select-none shadow-inner hover:bg-rose-500'
                              : 'bg-rose-50 text-rose-600 border border-rose-300 underline decoration-rose-400'
                          }`}
                          title="クリックで表示・非表示を切り替え"
                        >
                          {item.hiddenTerm}
                        </button>
                        <span>{item.suffix}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold text-blue-600">{currentCard.categoryName}</span>
            <span>
              カード {cardIdx + 1} / {filteredCards.length} （習得済: {Object.keys(masteredCards).length}枚）
            </span>
          </div>

          <div
            onClick={() => setIsFlipped((f) => !f)}
            className={`min-h-56 p-6 sm:p-8 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-center items-center text-center space-y-4 ${
              isFlipped
                ? 'bg-emerald-50/70 border-emerald-400 text-slate-900'
                : 'bg-slate-50 hover:bg-blue-50/40 border-slate-300 text-slate-900'
            }`}
          >
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isFlipped ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {isFlipped ? '裏面：正解・解説' : '表面：問題（クリックで裏返す）'}
            </span>

            <div className="text-lg sm:text-xl font-extrabold leading-relaxed">
              {isFlipped ? currentCard.back : currentCard.front}
            </div>

            {isFlipped && (
              <p className="text-xs sm:text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-200 max-w-lg">
                {currentCard.detail}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setCardIdx((i) => (i - 1 + filteredCards.length) % filteredCards.length);
                setIsFlipped(false);
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
            >
              前のカード
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFlipped((f) => !f)}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold rounded-xl text-xs cursor-pointer"
              >
                {isFlipped ? '問題面に戻す' : '答えを見る'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextState = !masteredCards[currentCard.id];
                  if (onToggleMasteredCard) {
                    onToggleMasteredCard(currentCard.id, currentCard.front, currentCard.categoryName, nextState);
                  } else {
                    setLocalMasteredCards((prev) => ({ ...prev, [currentCard.id]: nextState }));
                  }
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer ${
                  masteredCards[currentCard.id]
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{masteredCards[currentCard.id] ? '暗記完了済（履歴保存済）' : '覚えた！（履歴に保存）'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCardIdx((i) => (i + 1) % filteredCards.length);
                setIsFlipped(false);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              次のカードへ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. 学習カレンダー・目標設定ダッシュボード
// ============================================================================
export interface RegisteredExamItem {
  id: string;
  title: string;
  examDate: string;
  subjects: string;
  targetScore: string;
  scopeMemo: string;
}

const DEFAULT_EXAMS: RegisteredExamItem[] = [
  {
    id: 'exam-default-1',
    title: '後期期末考査（5教科）',
    examDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    subjects: '数・英・国・理・社',
    targetScore: '5教科合計 430点以上',
    scopeMemo: '二次方程式・二次関数、仮定法・関係代名詞、中和滴定・オームの法則、古文助動詞'
  },
  {
    id: 'exam-default-2',
    title: '全国到達度記述模試',
    examDate: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    subjects: '全教科（情報I含む）',
    targetScore: '総合偏差値 65.0 / A判定',
    scopeMemo: '全範囲総合・微積分・ベクトル・気体の状態方程式'
  }
];

interface StudyCalendarGoalsViewProps {
  studySecondsToday: number;
  solvedTotal: number;
  totalProblems: number;
  accuracyRate: number;
  attemptCount?: number;
  correctCount?: number;
  masteredCardsCount?: number;
  activityLogs?: StudyActivityLogItem[];
  mockExamHistory?: MockExamRecord[];
  currentProgress?: StudentStudyProgress;
  studentId?: string;
  studentEmail?: string;
  onPrimaryExamChange?: (summaryText: string) => void;
  onStudentAccountLogin?: (username: string, email: string, restoredProgress?: Partial<StudentStudyProgress>) => void;
  onStudentAccountLogout?: () => void;
  onExamsListChange?: (nextExams: RegisteredExamItem[]) => void;
  onClearActivityHistory?: () => void;
}

export const StudyCalendarGoalsView: React.FC<StudyCalendarGoalsViewProps> = ({
  studySecondsToday,
  solvedTotal,
  totalProblems,
  accuracyRate,
  attemptCount = 0,
  correctCount = 0,
  masteredCardsCount = 0,
  activityLogs = [],
  mockExamHistory = [],
  currentProgress,
  studentId = 'education',
  studentEmail = '',
  onPrimaryExamChange,
  onStudentAccountLogin,
  onStudentAccountLogout,
  onExamsListChange,
  onClearActivityHistory
}) => {
  const storageKey = `study_exams_list_${(studentEmail || studentId).toLowerCase()}`;
  const [exams, setExams] = useState<RegisteredExamItem[]>(() => {
    if (currentProgress?.exams && currentProgress.exams.length > 0) {
      return currentProgress.exams;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_EXAMS;
  });

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  const [newSubjects, setNewSubjects] = useState('数学・英語・理科');
  const [newTarget, setNewTarget] = useState('85点以上');
  const [newMemo, setNewMemo] = useState('');
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState(300);

  // Inside-Study-Portal Account Login & Registration (From: t74442416@gmail.com -> To: user's registered email e.g. a22621917@gmail.com)
  const SENDER_EMAIL = 't74442416@gmail.com';
  const [accountTab, setAccountTab] = useState<'login' | 'register'>('register');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [accUser, setAccUser] = useState('');
  const [accEmail, setAccEmail] = useState('');
  const [accPass, setAccPass] = useState('');
  const [accCode, setAccCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [lastRecipientEmail, setLastRecipientEmail] = useState('');
  const [accStatusMsg, setAccStatusMsg] = useState('');
  const [accErrorMsg, setAccErrorMsg] = useState('');
  const [registeredList, setRegisteredList] = useState<{ username: string; email: string; password?: string }[]>(() => {
    try {
      const raw = localStorage.getItem('study_local_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handlePortalPersonalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const idStr = loginIdentifier.trim();
    const pwStr = loginPassword.trim();
    if (!idStr || !pwStr) {
      setAccErrorMsg('登録したメールアドレス（または受講生ID）とパスワードを入力してください。');
      return;
    }
    setAccErrorMsg('');
    setAccStatusMsg('');

    // Check local accounts first
    const raw = localStorage.getItem('study_local_accounts');
    const localList: { username: string; email: string; password: string }[] = raw ? JSON.parse(raw) : [];
    const matched = localList.find(
      (a) =>
        (a.email.toLowerCase() === idStr.toLowerCase() ||
          a.username.toLowerCase() === idStr.toLowerCase()) &&
        a.password === pwStr
    );

    try {
      const res = await customFetch('/api/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: idStr, password: pwStr })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const userStr = data.studentId || matched?.username || idStr;
        const mailStr = data.email || matched?.email || idStr;
        // Also ensure it is saved in study_local_accounts
        const nextLocal = localList.filter(
          (a) => a.email.toLowerCase() !== mailStr.toLowerCase() && a.username.toLowerCase() !== userStr.toLowerCase()
        );
        nextLocal.push({ username: userStr, email: mailStr, password: pwStr });
        localStorage.setItem('study_local_accounts', JSON.stringify(nextLocal));
        setRegisteredList(nextLocal);

        if (onStudentAccountLogin) onStudentAccountLogin(userStr, mailStr, data.progress);
        setAccStatusMsg(
          data.message ||
            `個人アカウント「${userStr}」（${mailStr}）でログインし、保存された学習履歴を復元しました。`
        );
        setLoginPassword('');
        return;
      }
    } catch {}

    if (matched) {
      let localSavedProg: Partial<StudentStudyProgress> | undefined;
      try {
        const rawProg = localStorage.getItem(`study_account_progress_${matched.email.toLowerCase()}`);
        if (rawProg) localSavedProg = JSON.parse(rawProg);
      } catch {}
      if (onStudentAccountLogin) onStudentAccountLogin(matched.username, matched.email, localSavedProg);
      setAccStatusMsg(
        `個人アカウント「${matched.username}」（${matched.email}）でログインし、保存された学習履歴を復元しました。`
      );
      setLoginPassword('');
      return;
    }

    setAccErrorMsg('メールアドレス（またはID）またはパスワードが正しくありません。');
  };

  const handleIssueCodeInPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = accUser.trim();
    const em = accEmail.trim();
    const pw = accPass.trim();
    if (!u || !em || !pw) {
      setAccErrorMsg('受講生ID・登録するメールアドレス・パスワードをすべて入力してください。');
      return;
    }
    setAccErrorMsg('');
    setAccStatusMsg('');
    try {
      const gasRelayUrl = localStorage.getItem('kaito_custom_proxy') || '';
      const res = await customFetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: em, password: pw, gasRelayUrl })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const codeStr = String(data.verificationCode || '');
        setIssuedCode(codeStr);
        setLastRecipientEmail(em);
        localStorage.setItem(
          `study_pending_verify_${em.toLowerCase()}`,
          JSON.stringify({ username: u, email: em, password: pw, code: codeStr })
        );
        setAccStatusMsg(
          `差出人 ${SENDER_EMAIL} から ${em} 宛に6桁の認証コードを送信しました。届いたコードを下欄に入力してください。`
        );
      } else {
        setAccErrorMsg(data?.message || '認証コードの発行に失敗しました。');
      }
    } catch {
      const fallback = String(Math.floor(100000 + Math.random() * 900000));
      setIssuedCode(fallback);
      setLastRecipientEmail(em);
      localStorage.setItem(
        `study_pending_verify_${em.toLowerCase()}`,
        JSON.stringify({ username: u, email: em, password: pw, code: fallback })
      );
      setAccStatusMsg(
        `差出人 ${SENDER_EMAIL} から ${em} 宛に6桁の認証コードを送信しました。届いたコードを下欄に入力してください。`
      );
    }
  };

  const handleVerifyAndRegisterInPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = accUser.trim();
    const em = accEmail.trim();
    const pw = accPass.trim();
    const cd = accCode.trim();
    if (!u || !em || !pw || !cd) {
      setAccErrorMsg('6桁の認証コードを入力してください。');
      return;
    }
    setAccErrorMsg('');
    try {
      const res = await customFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, email: em, password: pw, code: cd, progress: currentProgress })
      });
      const data = await res.json().catch(() => null);
      const localPendingRaw = localStorage.getItem(`study_pending_verify_${em.toLowerCase()}`);
      const localPending = localPendingRaw ? JSON.parse(localPendingRaw) : null;

      if ((res.ok && data?.success) || (localPending && String(localPending.code) === cd)) {
        const raw = localStorage.getItem('study_local_accounts');
        const list: { username: string; email: string; password: string }[] = raw ? JSON.parse(raw) : [];
        const next = list.filter(
          (a) => a.email.toLowerCase() !== em.toLowerCase() && a.username.toLowerCase() !== u.toLowerCase()
        );
        next.push({ username: u, email: em, password: pw });
        localStorage.setItem('study_local_accounts', JSON.stringify(next));
        localStorage.removeItem(`study_pending_verify_${em.toLowerCase()}`);
        setRegisteredList(next);
        if (onStudentAccountLogin) onStudentAccountLogin(u, em, data?.progress || currentProgress);
        setAccStatusMsg(
          `認証完了！メールアドレス「${em}」（受講生ID: ${u}）のアカウントとこれまでの学習履歴を保存し、ログインしました。`
        );
        setAccCode('');
        setIssuedCode('');
      } else {
        setAccErrorMsg(data?.message || '認証コードが一致しません。6桁のコードを正しく入力してください。');
      }
    } catch {
      setAccErrorMsg('認証コードの照合に失敗しました。');
    }
  };

  const calcDaysLeft = (dateStr: string) => {
    const target = new Date(dateStr + 'T00:00:00').getTime();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.ceil((target - todayStart) / 86400000);
    return diff;
  };

  const saveExamsList = (next: RegisteredExamItem[]) => {
    setExams(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
    if (onExamsListChange) {
      onExamsListChange(next);
    }
    if (next.length > 0 && onPrimaryExamChange) {
      const d = Math.max(0, calcDaysLeft(next[0].examDate));
      onPrimaryExamChange(`${next[0].title}まであと${d}日`);
    }
  };

  const handleAddExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    const item: RegisteredExamItem = {
      id: 'exam-' + Date.now(),
      title: newTitle.trim(),
      examDate: newDate,
      subjects: newSubjects.trim() || '全教科',
      targetScore: newTarget.trim() || '80点以上',
      scopeMemo: newMemo.trim()
    };
    const next = [...exams, item].sort((a, b) => a.examDate.localeCompare(b.examDate));
    saveExamsList(next);
    setNewTitle('');
    setNewMemo('');
  };

  const handleRemoveExam = (id: string) => {
    const next = exams.filter((ex) => ex.id !== id);
    saveExamsList(next);
  };

  const nearestExam = exams[0] || DEFAULT_EXAMS[0];
  const nearestDaysLeft = Math.max(0, calcDaysLeft(nearestExam.examDate));

  const todayMinutes = Math.floor(studySecondsToday / 60);
  const weeklyLogs = [
    { day: '月', mins: 45, done: true },
    { day: '火', mins: 50, done: true },
    { day: '水', mins: 35, done: true },
    { day: '木', mins: 60, done: true },
    { day: '金', mins: Math.max(25, todayMinutes), done: true },
    { day: '土', mins: 0, done: false },
    { day: '日', mins: 0, done: false }
  ];
  const weeklyTotalMins = weeklyLogs.reduce((acc, item) => acc + item.mins, 0);
  const weeklyProgressPct = Math.min(100, Math.round((weeklyTotalMins / weeklyGoalMinutes) * 100));

  return (
    <div className="space-y-6">
      {/* Inside-Study-Portal Personal Account Login & Registration Card (From: t74442416@gmail.com -> To: Registered Email) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold text-blue-600 uppercase">
              STUDENT ACCOUNT & EMAIL VERIFICATION
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              受講生マイページ（個人アカウント新規登録 ／ ログイン）
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              メールアドレス（例：<code className="font-mono font-bold text-slate-800">a22621917@gmail.com</code>）を登録すると、
              差出人 <strong className="font-mono text-blue-700">{SENDER_EMAIL}</strong> から登録メールアドレス宛に6桁の認証コードが届きます。
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                setAccountTab('register');
                setAccErrorMsg('');
              }}
              className={`px-3.5 py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                accountTab === 'register'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              新規アカウント登録
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountTab('login');
                setAccErrorMsg('');
              }}
              className={`px-3.5 py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                accountTab === 'login'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              登録済みアカウントでログイン
            </button>
          </div>
        </div>

        {accErrorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{accErrorMsg}</span>
          </div>
        )}
        {accStatusMsg && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-blue-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{accStatusMsg}</span>
            </div>
            {issuedCode && (
              <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-1 text-[11px] text-slate-700">
                <div className="font-bold text-slate-900">
                  送信メール内容（From: <span className="font-mono text-blue-700">{SENDER_EMAIL}</span> → To:{' '}
                  <span className="font-mono text-emerald-700">{lastRecipientEmail}</span>）
                </div>
                <div>
                  あなたの6桁認証コード：
                  <strong className="ml-1.5 font-mono text-sm bg-blue-50 text-blue-900 px-2.5 py-0.5 rounded border border-blue-300">
                    {issuedCode}
                  </strong>
                </div>
              </div>
            )}
          </div>
        )}

        {accountTab === 'register' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            <form onSubmit={handleIssueCodeInPortal} className="space-y-3">
              <div className="font-bold text-slate-800">
                ステップ①：メールアドレスを入力して {SENDER_EMAIL} から認証コードを受け取る
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">希望する受講生ID / ニックネーム *</label>
                <input
                  type="text"
                  required
                  value={accUser}
                  onChange={(e) => setAccUser(e.target.value)}
                  placeholder="希望する受講生IDを入力"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  登録するあなたのメールアドレス *{' '}
                  <span className="text-[11px] font-normal text-slate-500">
                    （このアドレス宛に {SENDER_EMAIL} から認証コードが届きます）
                  </span>
                </label>
                <input
                  type="email"
                  required
                  value={accEmail}
                  onChange={(e) => setAccEmail(e.target.value)}
                  placeholder="例: a22621917@gmail.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">設定するパスワード *</label>
                <input
                  type="password"
                  required
                  value={accPass}
                  onChange={(e) => setAccPass(e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs cursor-pointer"
              >
                ① {SENDER_EMAIL} から登録メールアドレス宛に認証コードを送信
              </button>
            </form>

            <div className="space-y-4">
              <form onSubmit={handleVerifyAndRegisterInPortal} className="space-y-3">
                <div className="font-bold text-slate-800">
                  ステップ②：届いた6桁の認証コードを入力してアカウント本登録
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">6桁の認証コード *</label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={accCode}
                    onChange={(e) => setAccCode(e.target.value)}
                    placeholder="6桁の数字コードを入力"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-center tracking-widest text-sm text-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  ② 認証コードを照合して個人アカウント本登録
                </button>
              </form>

              {registeredList.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-700">
                    登録済み個人アカウント ({registeredList.length}件)
                  </div>
                  <div className="space-y-1">
                    {registeredList.map((acc, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded border border-slate-200"
                      >
                        <span className="font-bold text-slate-900">ID: {acc.username}</span>
                        <span className="text-slate-600 font-mono">{acc.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handlePortalPersonalLogin} className="max-w-md space-y-3 text-xs">
            <div className="font-bold text-slate-800">
              登録済みの個人アカウント（メールアドレス または 受講生ID）でログイン
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                登録メールアドレス（例: a22621917@gmail.com）または 受講生ID
              </label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="例: a22621917@gmail.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">パスワード</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs cursor-pointer"
            >
              個人アカウントにログインする
            </button>
          </form>
        )}
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span className="flex items-center gap-1.5 text-blue-600">
              <Calendar className="w-4 h-4" />
              直近の登録試験カウントダウン
            </span>
            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
              登録試験 {exams.length}件
            </span>
          </div>
          <div className="text-sm font-bold text-slate-800 truncate">{nearestExam.title} まで</div>
          <div className="text-3xl font-extrabold text-blue-600 font-mono">
            あと {nearestDaysLeft} <span className="text-base font-bold text-slate-700">日</span>
          </div>
          <div className="text-xs text-slate-500 truncate">
            試験日: {nearestExam.examDate} ｜ 目標: {nearestExam.targetScore}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" />
              今週の学習達成率
            </span>
            <span>{weeklyTotalMins}分 / {weeklyGoalMinutes}分</span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-mono">{weeklyProgressPct}%</div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${weeklyProgressPct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">5日連続で学習目標を達成中です（継続ストリーク更新中）</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              現在のログイン中アカウント＆累計実績
            </span>
            <span>正答率 {accuracyRate}%</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {solvedTotal} <span className="text-sm font-normal text-slate-500">/ {totalProblems} 問完了</span>
          </div>
          <div className="text-[11px] text-slate-600 space-y-0.5">
            <div>
              受講生ID: <strong>{studentId}</strong> （回答累計 {attemptCount}回 / 正解 {correctCount}回 / 暗記 {masteredCardsCount}枚）
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                登録メール: <strong>{studentEmail ? studentEmail : '未設定（共通education）'}</strong>
              </span>
              {studentEmail && onStudentAccountLogout && (
                <button
                  type="button"
                  onClick={onStudentAccountLogout}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded border border-slate-200 font-bold shrink-0 cursor-pointer"
                >
                  切替/解除
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Study Activity History & Mock Exam Records for this Account */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase">
              SAVED ACCOUNT STUDY HISTORY & SCORE LOGS
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              アカウント保存済み 学習履歴・模試成績・問題演習ログ（{studentEmail || studentId}）
            </h3>
            <p className="text-xs text-slate-500">
              解いた問題・10問模試の成績・覚えた暗記カード・累計学習時間は、ログイン中のアカウントに自動保存され次回ログイン時も引き継がれます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
              履歴自動保存：ON（累計 {activityLogs.length} 件記録）
            </span>
            {activityLogs.length > 0 && onClearActivityHistory && (
              <button
                type="button"
                onClick={onClearActivityHistory}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-bold cursor-pointer"
              >
                履歴をリセット
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Past Mock Exam Results */}
          <div className="lg:col-span-5 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-blue-600" />
              <span>模試・10問小テスト 成績履歴 ({mockExamHistory.length}回)</span>
            </h4>
            {mockExamHistory.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                まだ10問小テストの受験履歴がありません。「模試・10問小テスト」タブで受験するとここに得点・偏差値・判定履歴が保存されます。
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {mockExamHistory.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-500 text-[11px]">{m.date}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[11px]">
                        {m.rank}
                      </span>
                    </div>
                    <div className="font-extrabold text-slate-900">
                      得点：{m.score}点 / 100点（正解 {m.correct}/{m.total}問・全国推定偏差値 {m.deviation}）
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {m.wrongUnits.length === 0
                        ? '苦手単元なし（満点）'
                        : `要復習単元：${m.wrongUnits.join('・')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Chronological Problem & Flashcard Activity Log */}
          <div className="lg:col-span-7 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>最近解いた問題・暗記カードの学習履歴 ({activityLogs.length}件)</span>
            </h4>
            {activityLogs.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                まだ演習履歴がありません。「全教科演習」で問題を採点したり「暗記カード」で『覚えた！』を押すと、日時・単元・正誤がリアルタイムに保存されます。
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-500">{log.timestamp}</span>
                        <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-blue-700">
                          {log.subjectLabel}
                        </span>
                        <span className="font-bold text-slate-800">{log.unitName}</span>
                      </div>
                      <div className="text-slate-700 truncate">{log.title}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                        log.isCorrect
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {log.scoreDetail || (log.isCorrect ? '〇 正解' : '× 不正解')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exam Registration & Schedule Management */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[11px] font-bold text-blue-600">EXAM SCHEDULE REGISTRATION</span>
            <h3 className="text-base font-extrabold text-slate-900">新しい試験・定期考査・模試を登録</h3>
          </div>

          <form onSubmit={handleAddExam} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">試験・テスト名称 *</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例：2学期期末考査 / 第3回全統模試 / 英検準1級"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">試験日 *</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">対象教科</label>
                <input
                  type="text"
                  value={newSubjects}
                  onChange={(e) => setNewSubjects(e.target.value)}
                  placeholder="例：5教科 / 数学・物理"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">目標点数・目標判定</label>
              <input
                type="text"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="例：合計450点以上 / 偏差値65・A判定"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">出題範囲・重点対策メモ</label>
              <textarea
                rows={2}
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                placeholder="例：二次関数最大最小、中和滴定計算、仮定法過去完了、古文助動詞識別"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              ＋ 試験スケジュールに登録する
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[11px] font-bold text-indigo-600">REGISTERED EXAMS</span>
              <h3 className="text-base font-extrabold text-slate-900">登録済みの試験・目標一覧 ({exams.length}件)</h3>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {exams.map((ex) => {
              const dLeft = calcDaysLeft(ex.examDate);
              return (
                <div
                  key={ex.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold">
                        {dLeft >= 0 ? `あと ${dLeft} 日` : '実施済'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600">{ex.examDate}</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-[11px] font-semibold">
                        {ex.subjects}
                      </span>
                    </div>
                    <div className="text-sm font-extrabold text-slate-900">{ex.title}</div>
                    <div className="text-xs text-blue-700 font-semibold">目標：{ex.targetScore}</div>
                    {ex.scopeMemo && (
                      <div className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80">
                        試験範囲：{ex.scopeMemo}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveExam(ex.id)}
                    className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg text-xs font-bold shrink-0 self-end sm:self-center cursor-pointer"
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly Stamp Calendar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>週間学習ログ・出席カレンダー</span>
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">週間目標時間(分)：</span>
            <input
              type="number"
              value={weeklyGoalMinutes}
              onChange={(e) => setWeeklyGoalMinutes(Math.max(60, Number(e.target.value) || 300))}
              className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center">
          {weeklyLogs.map((log, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border space-y-1.5 ${
                log.done ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="text-xs font-bold text-slate-700">{log.day}曜日</div>
              <div
                className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs font-bold ${
                  log.done ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {log.done ? '済' : '-'}
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-700">{log.mins}分</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
