import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Lock,
  CheckCircle2,
  AlertCircle,
  Calculator,
  FileText,
  ArrowRight,
  Loader2,
  X,
  Sparkles,
  HelpCircle,
  Award,
  RefreshCw,
  Check,
  LogOut,
  Sliders,
  ChevronRight,
  BarChart3,
  PenTool,
  Layers,
  Zap,
  GraduationCap,
  Clock,
  Calendar,
  EyeOff,
  Play,
  Pause
} from 'lucide-react';
import { customFetch } from '../utils/apiClient';
import { applyDisguiseMeta } from '../utils/disguisePresets';
import {
  SchoolLevel,
  SubjectGroup,
  MathCategoryId,
  MathProblem,
  SUBJECT_GROUPS,
  MATH_CATEGORIES,
  INITIAL_PROBLEMS,
  generateRandomMathProblem
} from '../utils/mathScienceProblems';
import {
  MockExamView,
  FlashcardsRedSheetView,
  StudyCalendarGoalsView,
  StudyActivityLogItem,
  MockExamRecord,
  StudentStudyProgress,
  RegisteredExamItem
} from './StudyAdvancedTools';
import {
  getDisguiseAuthConfig,
  saveDisguiseAuthConfig,
  verifyLocalDisguiseCredentials,
  resetDisguiseAuth,
  DEFAULT_AUTH_ID,
  DEFAULT_AUTH_PASSWORD,
  DisguiseAuthConfig
} from '../utils/authConfig';

interface MathDisguiseViewProps {
  onUnlock: () => void;
  initialStudyPortalOpen?: boolean;
}

export const MathDisguiseView: React.FC<MathDisguiseViewProps> = ({
  onUnlock,
  initialStudyPortalOpen = false
}) => {
  const [authConfig, setAuthConfig] = useState<DisguiseAuthConfig>(() => getDisguiseAuthConfig());
  const [username, setUsername] = useState(() => getDisguiseAuthConfig().customId || DEFAULT_AUTH_ID);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPasswordSettingsModal, setShowPasswordSettingsModal] = useState(false);
  const [configIdInput, setConfigIdInput] = useState(() => authConfig.customId);
  const [configPassInput, setConfigPassInput] = useState(() => authConfig.customPassword);
  const [configRequirePass, setConfigRequirePass] = useState(() => authConfig.requirePassword);
  const [configQuickUnlock, setConfigQuickUnlock] = useState(() => authConfig.allowQuickUnlock);
  const [configSuccessMsg, setConfigSuccessMsg] = useState('');

  // Interactive Study Portal State (opened ONLY when ID=education / PW=matheducation, or via Boss Key)
  const [isStudyPortalOpen, setIsStudyPortalOpen] = useState<boolean>(() => Boolean(initialStudyPortalOpen));
  const [studentDisplayId, setStudentDisplayId] = useState<string>(() => {
    try {
      const savedSession = localStorage.getItem('study_active_personal_account');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed?.username) return String(parsed.username);
      }
    } catch {}
    return 'education';
  });
  const [studentEmail, setStudentEmail] = useState<string>(() => {
    try {
      const savedSession = localStorage.getItem('study_active_personal_account');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed?.email) return String(parsed.email);
      }
    } catch {}
    return '';
  });
  const [primaryExamSummary, setPrimaryExamSummary] = useState('後期期末考査まであと14日');
  const [schoolLevelFilter, setSchoolLevelFilter] = useState<SchoolLevel>('all');
  const [subjectFilter, setSubjectFilter] = useState<SubjectGroup>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | '基礎' | '標準' | '応用'>('all');
  const [activeCategory, setActiveCategory] = useState<MathCategoryId>('all');
  const [problems, setProblems] = useState<MathProblem[]>(INITIAL_PROBLEMS);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [answerMode, setAnswerMode] = useState<'choice' | 'input'>('choice');
  const [submissionState, setSubmissionState] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const activeAccountKey = (studentEmail || studentDisplayId || 'education').toLowerCase();

  const loadLocalProgress = (accKey: string): Partial<StudentStudyProgress> => {
    try {
      const raw = localStorage.getItem(`study_account_progress_${accKey.toLowerCase()}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  };

  const initialProg = useMemo(() => loadLocalProgress(activeAccountKey), []);

  const [solvedIds, setSolvedIds] = useState<Record<string, boolean>>(() => initialProg.solvedIds || {});
  const [attemptCount, setAttemptCount] = useState<number>(() => initialProg.attemptCount || 0);
  const [correctCount, setCorrectCount] = useState<number>(() => initialProg.correctCount || 0);
  const [streakCount, setStreakCount] = useState<number>(() => initialProg.streakCount || 0);
  const [masteredCards, setMasteredCards] = useState<Record<string, boolean>>(() => initialProg.masteredCards || {});
  const [activityLogs, setActivityLogs] = useState<StudyActivityLogItem[]>(() => initialProg.activityLogs || []);
  const [mockExamHistory, setMockExamHistory] = useState<MockExamRecord[]>(() => initialProg.mockExamHistory || []);
  const [savedExams, setSavedExams] = useState<RegisteredExamItem[]>(() => initialProg.exams || []);
  const [genSeed, setGenSeed] = useState(1);

  // Study Timer (Stopwatch & Pomodoro 25min) - starts at 24m15s (1455s) so it looks like continuous study
  const [studySeconds, setStudySeconds] = useState<number>(() => {
    if (typeof initialProg.studySeconds === 'number' && initialProg.studySeconds >= 60) {
      return initialProg.studySeconds;
    }
    const saved = Number(localStorage.getItem('study_portal_elapsed_sec') || '1455');
    return isNaN(saved) || saved < 60 ? 1455 : saved;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'pomodoro'>('stopwatch');
  const [pomodoroRemaining, setPomodoroRemaining] = useState<number>(25 * 60);

  // Quadratic & Science Simulator State
  const [simA, setSimA] = useState('1');
  const [simB, setSimB] = useState('-5');
  const [simC, setSimC] = useState('6');
  const [ohmV, setOhmV] = useState('100');
  const [ohmR, setOhmR] = useState('20');
  const [ohmTimeSec, setOhmTimeSec] = useState('300');
  const [activePortalTab, setActivePortalTab] = useState<
    'practice' | 'mockexam' | 'flashcards' | 'calendar' | 'simulator' | 'formulas'
  >('practice');

  useEffect(() => {
    if (initialStudyPortalOpen) {
      setIsStudyPortalOpen(true);
    }
  }, [initialStudyPortalOpen]);

  // Live Study Timer tick
  useEffect(() => {
    if (!isStudyPortalOpen || !timerRunning) return;
    const id = setInterval(() => {
      setStudySeconds((prev) => {
        const next = prev + 1;
        try {
          localStorage.setItem('study_portal_elapsed_sec', String(next));
        } catch {}
        return next;
      });
      setPomodoroRemaining((prev) => (prev > 0 ? prev - 1 : 25 * 60));
    }, 1000);
    return () => clearInterval(id);
  }, [isStudyPortalOpen, timerRunning]);

  useEffect(() => {
    applyDisguiseMeta();
  }, []);

  const currentProgressSnapshot: StudentStudyProgress = useMemo(
    () => ({
      solvedIds,
      attemptCount,
      correctCount,
      streakCount,
      studySeconds,
      masteredCards,
      exams: savedExams,
      activityLogs,
      mockExamHistory,
      updatedAt: new Date().toISOString()
    }),
    [
      solvedIds,
      attemptCount,
      correctCount,
      streakCount,
      studySeconds,
      masteredCards,
      savedExams,
      activityLogs,
      mockExamHistory
    ]
  );

  const applyRestoredProgress = (prog?: Partial<StudentStudyProgress>, fallbackKey?: string) => {
    const localBackup = fallbackKey ? loadLocalProgress(fallbackKey) : {};
    const mergedSolved = { ...(localBackup.solvedIds || {}), ...(prog?.solvedIds || {}) };
    const mergedCards = { ...(localBackup.masteredCards || {}), ...(prog?.masteredCards || {}) };
    const nextAttempt = Math.max(prog?.attemptCount ?? 0, localBackup.attemptCount ?? 0);
    const nextCorrect = Math.max(prog?.correctCount ?? 0, localBackup.correctCount ?? 0);
    const nextStreak = prog?.streakCount ?? localBackup.streakCount ?? 0;
    const nextSec = Math.max(prog?.studySeconds ?? 1455, localBackup.studySeconds ?? 1455);
    const nextLogs =
      (prog?.activityLogs && prog.activityLogs.length > 0 ? prog.activityLogs : localBackup.activityLogs) || [];
    const nextMocks =
      (prog?.mockExamHistory && prog.mockExamHistory.length > 0
        ? prog.mockExamHistory
        : localBackup.mockExamHistory) || [];
    const nextExams = (prog?.exams && prog.exams.length > 0 ? prog.exams : localBackup.exams) || [];

    setSolvedIds(mergedSolved);
    setAttemptCount(nextAttempt);
    setCorrectCount(nextCorrect);
    setStreakCount(nextStreak);
    setStudySeconds(nextSec);
    setMasteredCards(mergedCards);
    setActivityLogs(nextLogs);
    setMockExamHistory(nextMocks);
    setSavedExams(nextExams);
  };

  // Fetch server-saved progress when personal account is active
  useEffect(() => {
    if (!isStudyPortalOpen) return;
    const idKey = (studentEmail || studentDisplayId || '').trim();
    if (!idKey || idKey === 'education') return;

    customFetch(`/api/auth/student-progress?identifier=${encodeURIComponent(idKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && data.progress) {
          applyRestoredProgress(data.progress, idKey);
        }
      })
      .catch(() => {});
  }, [isStudyPortalOpen, studentEmail]);

  // Auto-save progress to localStorage whenever study history changes, and sync to server
  useEffect(() => {
    if (!isStudyPortalOpen) return;
    const key = `study_account_progress_${activeAccountKey}`;
    try {
      localStorage.setItem(key, JSON.stringify(currentProgressSnapshot));
    } catch {}

    // Debounced sync to server for personal accounts (or education)
    const timer = setTimeout(() => {
      customFetch('/api/auth/student-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: activeAccountKey,
          email: studentEmail,
          studentId: studentDisplayId,
          progress: currentProgressSnapshot
        })
      }).catch(() => {});
    }, 600);

    return () => clearTimeout(timer);
  }, [
    isStudyPortalOpen,
    activeAccountKey,
    studentEmail,
    studentDisplayId,
    solvedIds,
    attemptCount,
    correctCount,
    streakCount,
    masteredCards,
    savedExams,
    activityLogs,
    mockExamHistory
  ]);

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

  const visibleCategories = useMemo(() => {
    return MATH_CATEGORIES.filter((c) => {
      if (c.id === 'all') return true;
      if (schoolLevelFilter !== 'all' && c.level !== schoolLevelFilter) return false;
      if (subjectFilter !== 'all' && c.subject !== subjectFilter) return false;
      return true;
    });
  }, [schoolLevelFilter, subjectFilter]);

  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      if (schoolLevelFilter === 'junior' && p.level !== '中学') return false;
      if (schoolLevelFilter === 'high' && p.level !== '高校') return false;
      if (subjectFilter !== 'all' && p.subject !== subjectFilter) return false;
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      if (difficultyFilter !== 'all' && p.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [problems, schoolLevelFilter, subjectFilter, activeCategory, difficultyFilter]);

  const currentProblem = filteredProblems[currentProblemIdx] || filteredProblems[0] || problems[0];

  // Dynamic URL parameter & Tab Title sync with current subject/unit
  useEffect(() => {
    if (!isStudyPortalOpen) {
      document.title = '数理アカデミー 学習ポータル';
      try {
        if (window.location.search) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {}
      return;
    }

    if (activePortalTab === 'practice' && currentProblem) {
      document.title = `${currentProblem.categoryLabel} ${currentProblem.unitName} - 数理アカデミー`;
      try {
        const params = new URLSearchParams();
        params.set('mode', 'study');
        params.set('subject', currentProblem.subject);
        params.set('unit', currentProblem.unitName);
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      } catch {}
    } else if (activePortalTab === 'mockexam') {
      document.title = '【全国到達度模試】10問実力判定テスト - 数理アカデミー';
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?mode=mockexam`);
      } catch {}
    } else if (activePortalTab === 'flashcards') {
      document.title = '【赤シート暗記・一問一答】重要用語演習 - 数理アカデミー';
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?mode=flashcards`);
      } catch {}
    } else if (activePortalTab === 'calendar') {
      document.title = '【学習計画・進捗管理】定期考査カウントダウン - 数理アカデミー';
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?mode=calendar`);
      } catch {}
    } else if (activePortalTab === 'simulator') {
      document.title = '【数学・物理】関数・回路計算シミュレーター - 数理アカデミー';
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?mode=simulator`);
      } catch {}
    } else {
      document.title = '【全教科】重要公式・要点まとめ - 数理アカデミー';
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?mode=formulas`);
      } catch {}
    }
  }, [isStudyPortalOpen, activePortalTab, currentProblem]);

  const resetQuestionState = () => {
    setSelectedChoice(null);
    setTextAnswer('');
    setSubmissionState('idle');
  };

  const handleSelectCategory = (cat: MathCategoryId) => {
    setActiveCategory(cat);
    setCurrentProblemIdx(0);
    resetQuestionState();
  };

  const handleSelectSchoolLevel = (lvl: SchoolLevel) => {
    setSchoolLevelFilter(lvl);
    setActiveCategory('all');
    setCurrentProblemIdx(0);
    resetQuestionState();
  };

  const handleSelectSubject = (subj: SubjectGroup) => {
    setSubjectFilter(subj);
    setActiveCategory('all');
    setCurrentProblemIdx(0);
    resetQuestionState();
  };

  const handleGenerateProblemsBatch = (count: number) => {
    const generated: MathProblem[] = [];
    let seed = genSeed;
    for (let i = 0; i < count; i++) {
      seed += 1;
      generated.push(generateRandomMathProblem(seed));
    }
    setGenSeed(seed);
    setProblems((prev) => [...generated, ...prev]);
    setSchoolLevelFilter('all');
    setSubjectFilter('all');
    setDifficultyFilter('all');
    setActiveCategory('all');
    setCurrentProblemIdx(0);
    resetQuestionState();
  };

  const handleCheckAnswer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentProblem) return;

    let isCorrect = false;
    if (answerMode === 'choice') {
      if (selectedChoice === null) return;
      isCorrect = selectedChoice === currentProblem.correctIndex;
    } else {
      const normalized = textAnswer.trim().replace(/\s+/g, '');
      if (!normalized) return;
      isCorrect = currentProblem.acceptedTextAnswers.some(
        (ans) => ans.replace(/\s+/g, '').toLowerCase() === normalized.toLowerCase()
      );
    }

    const now = new Date();
    const ts = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newLog: StudyActivityLogItem = {
      id: 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: ts,
      type: 'problem',
      subjectLabel: currentProblem.categoryLabel,
      unitName: currentProblem.unitName,
      title: currentProblem.question,
      isCorrect,
      scoreDetail: isCorrect ? '〇 正解' : '× 不正解'
    };
    setActivityLogs((prev) => [newLog, ...prev].slice(0, 100));

    setAttemptCount((c) => c + 1);
    if (isCorrect) {
      setSubmissionState('correct');
      setCorrectCount((c) => c + 1);
      setStreakCount((s) => s + 1);
      setSolvedIds((prev) => ({ ...prev, [currentProblem.id]: true }));
    } else {
      setSubmissionState('wrong');
      setStreakCount(0);
    }
  };

  const simulatorResult = useMemo(() => {
    const a = parseFloat(simA);
    const b = parseFloat(simB);
    const c = parseFloat(simC);
    if (isNaN(a) || isNaN(b) || isNaN(c) || a === 0) {
      return null;
    }
    const d = b * b - 4 * a * c;
    const vertexX = -b / (2 * a);
    const vertexY = c - (b * b) / (4 * a);
    let solutionText = '';
    let natureText = '';
    if (d > 0) {
      const sqrtD = Math.sqrt(d);
      const isPerfectSquare = Math.abs(Math.round(sqrtD) - sqrtD) < 1e-9;
      const x1 = (-b + sqrtD) / (2 * a);
      const x2 = (-b - sqrtD) / (2 * a);
      natureText = 'D > 0 （異なる2つの実数解）';
      solutionText = isPerfectSquare
        ? `x = ${Number(x1.toFixed(4))},  ${Number(x2.toFixed(4))}`
        : `x = (${-b} ± √${d}) / ${2 * a}  （近似値: ${x1.toFixed(3)}, ${x2.toFixed(3)}）`;
    } else if (d === 0) {
      const x0 = -b / (2 * a);
      natureText = 'D = 0 （ただ1つの実数解・重解）';
      solutionText = `x = ${Number(x0.toFixed(4))} （重解）`;
    } else {
      const absD = Math.abs(d);
      natureText = 'D < 0 （実数解なし・異なる2つの虚数解）';
      solutionText = `x = (${-b} ± √${absD}i) / ${2 * a}`;
    }
    return { a, b, c, d, vertexX, vertexY, natureText, solutionText };
  }, [simA, simB, simC]);

  const ohmResult = useMemo(() => {
    const v = parseFloat(ohmV);
    const r = parseFloat(ohmR);
    const t = parseFloat(ohmTimeSec);
    if (isNaN(v) || isNaN(r) || isNaN(t) || r <= 0 || t < 0) return null;
    const currentI = v / r;
    const powerW = v * currentI;
    const jouleJ = powerW * t;
    const cal = jouleJ / 4.2;
    return {
      v,
      r,
      t,
      currentI: Number(currentI.toFixed(3)),
      powerW: Number(powerW.toFixed(2)),
      jouleJ: Number(jouleJ.toFixed(1)),
      cal: Number(cal.toFixed(1))
    };
  }, [ohmV, ohmR, ohmTimeSec]);

  const enterStudyPortal = (userStr: string, emailStr?: string) => {
    setIsSuccess(true);
    setErrorMsg('');
    // If the user previously logged into a personal account inside the study portal, preserve it!
    try {
      const savedSessionRaw = localStorage.getItem('study_active_personal_account');
      if (savedSessionRaw && !emailStr) {
        const savedSession = JSON.parse(savedSessionRaw);
        if (savedSession?.username && savedSession?.email) {
          setStudentDisplayId(savedSession.username);
          setStudentEmail(savedSession.email);
          applyRestoredProgress(undefined, savedSession.email);
        }
      } else {
        setStudentDisplayId(userStr || 'education');
        setStudentEmail(emailStr || '');
      }
    } catch {
      setStudentDisplayId(userStr || 'education');
      setStudentEmail(emailStr || '');
    }
    setTimeout(() => {
      setIsSuccess(false);
      setShowAuthModal(false);
      setIsStudyPortalOpen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 400);
  };

  const handleQuickUnlock = () => {
    setIsSuccess(true);
    setErrorMsg('');
    setTimeout(() => {
      onUnlock();
    }, 300);
  };

  const handleSavePasswordSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = configIdInput.trim() || DEFAULT_AUTH_ID;
    const cleanPass = configPassInput.trim() || DEFAULT_AUTH_PASSWORD;
    const updated = saveDisguiseAuthConfig({
      customId: cleanId,
      customPassword: cleanPass,
      requirePassword: configRequirePass,
      allowQuickUnlock: configQuickUnlock
    });
    setAuthConfig(updated);
    setUsername(cleanId);
    setConfigSuccessMsg('パスワード設定を保存しました！');
    setTimeout(() => {
      setConfigSuccessMsg('');
      setShowPasswordSettingsModal(false);
    }, 900);
  };

  const handleResetPasswordSettings = () => {
    const updated = resetDisguiseAuth();
    setAuthConfig(updated);
    setConfigIdInput(DEFAULT_AUTH_ID);
    setConfigPassInput(DEFAULT_AUTH_PASSWORD);
    setConfigRequirePass(true);
    setConfigQuickUnlock(true);
    setUsername(DEFAULT_AUTH_ID);
    setConfigSuccessMsg('初期値 (ID: kaito / PW: @0726kaito) にリセットしました。');
    setTimeout(() => {
      setConfigSuccessMsg('');
    }, 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim() || authConfig.customId || 'kaito';
    const trimmedPass = password.trim();

    // If password requirement is disabled, allow unlock immediately
    if (!authConfig.requirePassword) {
      setIsSuccess(true);
      setErrorMsg('');
      setTimeout(() => {
        onUnlock();
      }, 300);
      return;
    }

    if (!trimmedPass) {
      setErrorMsg('パスワードを入力してください。（パスワードが未設定または不要な場合は「ワンクリック解除」をご利用ください）');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    // 1. Direct check for dedicated study portal account (ONLY ID: education / PW: matheducation)
    if (trimmedUser === 'education' && trimmedPass === 'matheducation') {
      setIsLoading(false);
      enterStudyPortal('education', '');
      return;
    }

    // 2. Direct local verification (fastest, works offline / GAS sync)
    const localCheck = verifyLocalDisguiseCredentials(trimmedUser, trimmedPass);
    if (localCheck.success) {
      if (localCheck.mode === 'study') {
        setIsLoading(false);
        enterStudyPortal('education', '');
        return;
      }
      setIsSuccess(true);
      setErrorMsg('');
      setTimeout(() => {
        onUnlock();
      }, 400);
      setIsLoading(false);
      return;
    }

    // 3. Fallback: Query server / GAS verification endpoint
    try {
      const res = await customFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUser, password: trimmedPass })
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        if (data.mode === 'study') {
          enterStudyPortal('education', '');
          return;
        }
        setIsSuccess(true);
        setErrorMsg('');
        setTimeout(() => {
          onUnlock();
        }, 400);
        return;
      }

      setErrorMsg(data?.message || '受講生IDまたはパスワードが正しくありません。');
    } catch {
      setErrorMsg('受講生IDまたはパスワードが正しくありません。');
    } finally {
      setIsLoading(false);
    }
  };

  const renderAuthForm = (isModal: boolean) => (
    <div className={`space-y-4 ${isModal ? 'p-6' : 'p-0'}`}>
      <div className="text-center space-y-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-5 h-5" />
        </div>
        <h4 className="text-base font-bold text-slate-900">特講受講生・専用アクセス認証</h4>
        <p className="text-xs text-slate-500">
          全教科の問題演習・インタラクティブ教材・解説へ進むには受講生認証を行ってください
        </p>
      </div>

      {/* Info / Password hint banner */}
      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
        <div className="flex items-center justify-between font-bold">
          <span>💡 認証パスワード案内</span>
          <button
            type="button"
            onClick={() => setShowPasswordSettingsModal(true)}
            className="text-[11px] text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
          >
            パスワード設定・変更
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-blue-700">
          初期パスワード: <code className="bg-white/80 px-1 py-0.5 rounded border border-blue-300 font-mono font-bold text-blue-900">@0726kaito</code> （ID省略可）
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>認証に成功しました。数理アカデミー総合演習ポータルへ移動します...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">受講生ID (アカウント名・省略可)</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="受講生ID (省略可・デフォルト: kaito)"
            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            id="disguise-id-input"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700">パスワード / アクセスキー</label>
            <button
              type="button"
              onClick={() => setPassword(authConfig.customPassword || DEFAULT_AUTH_PASSWORD)}
              className="text-[11px] text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              初期パスワード自動入力
            </button>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力 (初期値: @0726kaito)"
            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            id="disguise-password-input"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-lg text-sm shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          id="disguise-submit-btn"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>認証照合中...</span>
            </>
          ) : (
            <>
              <span>受講生認証して演習を開始</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Quick Unlock Button (Always accessible so users are never locked out) */}
        {authConfig.allowQuickUnlock && (
          <button
            type="button"
            onClick={handleQuickUnlock}
            className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>ワンクリックで解除（パスワード省略）</span>
          </button>
        )}
      </form>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>設定されたパスワードでお困りですか？</span>
        <button
          type="button"
          onClick={() => setShowPasswordSettingsModal(true)}
          className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
        >
          パスワード設定・リセット
        </button>
      </div>
    </div>
  );

  // ============================================================================
  // REAL INTERACTIVE STUDY PORTAL VIEW (中学・高校 全教科・全単元 総合演習)
  // ============================================================================
  if (isStudyPortalOpen) {
    const solvedTotal = Object.keys(solvedIds).length;
    const accuracyRate = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 100;
    const jhCount = problems.filter((p) => p.level === '中学').length;
    const hsCount = problems.filter((p) => p.level === '高校').length;
    const studyMin = Math.floor(studySeconds / 60);
    const studySec = studySeconds % 60;
    const pomoMin = Math.floor(pomodoroRemaining / 60);
    const pomoSec = pomodoroRemaining % 60;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
        {/* Top Study Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                    受講生ID: {studentDisplayId}
                  </span>
                  <span className="text-[11px] text-slate-500 hidden lg:inline truncate">
                    {primaryExamSummary} ｜ 今週の達成率 75%
                  </span>
                </div>
                <h1 className="text-sm sm:text-lg font-bold text-slate-900 truncate">
                  数理アカデミー <span className="text-blue-600 font-semibold">中学・高校 全教科総合演習システム</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Live Study Stopwatch / Pomodoro Timer */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => setTimerMode((m) => (m === 'stopwatch' ? 'pomodoro' : 'stopwatch'))}
                  className="font-mono font-extrabold text-blue-950 cursor-pointer text-left"
                  title="クリックで「本日の学習時間」と「ポモドーロ25分タイマー」を切替"
                >
                  {timerMode === 'stopwatch' ? (
                    <span>
                      本日の学習時間：{studyMin}分{String(studySec).padStart(2, '0')}秒
                    </span>
                  ) : (
                    <span>
                      集中ポモドーロ：残り {String(pomoMin).padStart(2, '0')}:{String(pomoSec).padStart(2, '0')}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTimerRunning((r) => !r)}
                  className="p-1 rounded bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer"
                  title={timerRunning ? 'タイマーを一時停止' : 'タイマーを再開'}
                >
                  {timerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              </div>

              <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-1 font-semibold text-slate-700">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>{solvedTotal}/{problems.length}問</span>
                </div>
                <div className="h-3 w-px bg-slate-300" />
                <div className="flex items-center gap-1 font-semibold text-blue-700">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>正答率 {accuracyRate}%</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActivePortalTab('calendar')}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-lg border border-indigo-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <span>{studentEmail ? `個人: ${studentEmail}` : 'アカウント登録 / ログイン'}</span>
              </button>

              <button
                onClick={() => {
                  setIsStudyPortalOpen(false);
                  setPassword('');
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          </div>
        </header>

        {/* Sub-navigation Tabs */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between flex-wrap gap-2 py-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActivePortalTab('practice')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'practice'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>全教科演習 ({problems.length}問)</span>
              </button>
              <button
                onClick={() => setActivePortalTab('mockexam')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'mockexam'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>模試・10問小テスト</span>
              </button>
              <button
                onClick={() => setActivePortalTab('flashcards')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'flashcards'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>暗記カード・赤シート</span>
              </button>
              <button
                onClick={() => setActivePortalTab('calendar')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'calendar'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>試験登録・アカウント登録/ログイン</span>
              </button>
              <button
                onClick={() => setActivePortalTab('simulator')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'simulator'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>計算シミュレーター</span>
              </button>
              <button
                onClick={() => setActivePortalTab('formulas')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activePortalTab === 'formulas'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>全教科 要点まとめ</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleGenerateProblemsBatch(10)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>+10問 自動生成</span>
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 py-6">
          {activePortalTab === 'practice' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Sidebar: Grade, Subject, Category & Problem List */}
              <div className="lg:col-span-4 space-y-4">
                {/* School Level, Subject & Difficulty Filter Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>校種・教科・難易度フィルター</span>
                    </h2>
                    <span className="text-[11px] font-bold text-blue-600">該当: {filteredProblems.length}問</span>
                  </div>

                  {/* School Level Filter */}
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <button
                      onClick={() => handleSelectSchoolLevel('all')}
                      className={`py-2 px-2 rounded-xl font-bold border transition-colors cursor-pointer ${
                        schoolLevelFilter === 'all'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      すべて ({problems.length})
                    </button>
                    <button
                      onClick={() => handleSelectSchoolLevel('junior')}
                      className={`py-2 px-2 rounded-xl font-bold border transition-colors cursor-pointer ${
                        schoolLevelFilter === 'junior'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      中学 ({jhCount})
                    </button>
                    <button
                      onClick={() => handleSelectSchoolLevel('high')}
                      className={`py-2 px-2 rounded-xl font-bold border transition-colors cursor-pointer ${
                        schoolLevelFilter === 'high'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      高校 ({hsCount})
                    </button>
                  </div>

                  {/* Subject Filter */}
                  <div className="pt-1">
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5">教科を選択</div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {SUBJECT_GROUPS.map((subj) => {
                        const isActive = subjectFilter === subj.id;
                        return (
                          <button
                            key={subj.id}
                            onClick={() => handleSelectSubject(subj.id)}
                            className={`px-2.5 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {subj.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Difficulty Filter */}
                  <div className="pt-1">
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5">難易度絞り込み</div>
                    <div className="grid grid-cols-4 gap-1.5 text-xs">
                      {(['all', '基礎', '標準', '応用'] as const).map((diff) => (
                        <button
                          key={diff}
                          onClick={() => {
                            setDifficultyFilter(diff);
                            setCurrentProblemIdx(0);
                            resetQuestionState();
                          }}
                          className={`py-1.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                            difficultyFilter === diff
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {diff === 'all' ? '全難易度' : diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Category / Unit Selector */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>教科・単元を選択</span>
                  </h2>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {visibleCategories.map((cat) => {
                      const isActive = activeCategory === cat.id;
                      const count =
                        cat.id === 'all'
                          ? problems.filter((p) => {
                              if (schoolLevelFilter === 'junior' && p.level !== '中学') return false;
                              if (schoolLevelFilter === 'high' && p.level !== '高校') return false;
                              if (subjectFilter !== 'all' && p.subject !== subjectFilter) return false;
                              return true;
                            }).length
                          : problems.filter((p) => p.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleSelectCategory(cat.id)}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isActive
                              ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{cat.label}</div>
                            <div className="text-[10px] text-slate-500 font-normal truncate">{cat.desc}</div>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold shrink-0">
                            {count}問
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Problem List in Current Filter */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">問題リスト</h3>
                    <span className="text-xs text-slate-500">
                      {filteredProblems.length > 0 ? currentProblemIdx + 1 : 0} / {filteredProblems.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {filteredProblems.map((prob, idx) => {
                      const isCurrent = idx === currentProblemIdx;
                      const isSolved = Boolean(solvedIds[prob.id]);
                      return (
                        <button
                          key={prob.id}
                          onClick={() => {
                            setCurrentProblemIdx(idx);
                            resetQuestionState();
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-blue-600 text-white border-blue-600 font-bold'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          <div className="truncate flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                isCurrent
                                  ? 'bg-white/20 text-white'
                                  : isSolved
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isSolved ? '✓' : idx + 1}
                            </span>
                            <div className="truncate">
                              <div className="truncate font-semibold">{prob.unitName}</div>
                              <div
                                className={`text-[10px] truncate ${
                                  isCurrent ? 'text-blue-100' : 'text-slate-500'
                                }`}
                              >
                                {prob.question}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                              isCurrent ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {prob.level}・{prob.difficulty}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Active Problem Workspace */}
              <div className="lg:col-span-8 space-y-6">
                {currentProblem ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
                    {/* Problem Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            currentProblem.level === '中学'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}
                        >
                          {currentProblem.level}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                          {currentProblem.categoryLabel}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold">
                          単元：{currentProblem.unitName}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            currentProblem.difficulty === '基礎'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : currentProblem.difficulty === '標準'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {currentProblem.difficulty}
                        </span>
                        {solvedIds[currentProblem.id] && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> 正解済み
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                        <button
                          type="button"
                          onClick={() => setAnswerMode('choice')}
                          className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                            answerMode === 'choice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          4択から選ぶ
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswerMode('input')}
                          className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                            answerMode === 'input' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          直接記述入力
                        </button>
                      </div>
                    </div>

                    {/* Problem Statement */}
                    <div className="space-y-4">
                      <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-relaxed">
                        問題 {currentProblemIdx + 1}. {currentProblem.question}
                      </h3>
                      {currentProblem.formula && (
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-slate-900 text-base sm:text-lg">
                          {currentProblem.formula}
                        </div>
                      )}
                    </div>

                    {/* Answer Input Area */}
                    {answerMode === 'choice' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {currentProblem.choices.map((choiceText, idx) => {
                          const isSelected = selectedChoice === idx;
                          const showCorrectHighlight =
                            submissionState !== 'idle' && idx === currentProblem.correctIndex;
                          const showWrongHighlight =
                            submissionState === 'wrong' && isSelected && idx !== currentProblem.correctIndex;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setSelectedChoice(idx);
                                if (submissionState !== 'idle') setSubmissionState('idle');
                              }}
                              className={`p-4 rounded-xl border text-left text-sm sm:text-base transition-all cursor-pointer flex items-center justify-between ${
                                showCorrectHighlight
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-2 ring-emerald-500/30'
                                  : showWrongHighlight
                                  ? 'bg-rose-50 border-rose-400 text-rose-900 font-bold'
                                  : isSelected
                                  ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold ring-2 ring-blue-500/20'
                                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-6 h-6 rounded-full text-xs font-sans font-bold flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                                  }`}
                                >
                                  {['A', 'B', 'C', 'D'][idx]}
                                </span>
                                <span>{choiceText}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <form onSubmit={handleCheckAnswer} className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700">
                          解答を直接入力
                        </label>
                        <input
                          type="text"
                          value={textAnswer}
                          onChange={(e) => {
                            setTextAnswer(e.target.value);
                            if (submissionState !== 'idle') setSubmissionState('idle');
                          }}
                          placeholder="答えの語句・数式・数値を入力..."
                          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </form>
                    )}

                    {/* Action Buttons (No Hint button) */}
                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleCheckAnswer()}
                        disabled={answerMode === 'choice' ? selectedChoice === null : !textAnswer.trim()}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>解答を採点する</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = (currentProblemIdx + 1) % filteredProblems.length;
                          setCurrentProblemIdx(nextIdx);
                          resetQuestionState();
                        }}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs sm:text-sm border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>次の問題へ</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Grading Result & Step-by-Step Solution */}
                    {submissionState !== 'idle' && (
                      <div
                        className={`p-5 rounded-2xl border space-y-3 ${
                          submissionState === 'correct'
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                            : 'bg-rose-50/70 border-rose-300 text-rose-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-extrabold text-base">
                            {submissionState === 'correct' ? (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                <span className="text-emerald-800">正解です！</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-5 h-5 text-rose-600" />
                                <span className="text-rose-800">
                                  不正解です。正解は「{currentProblem.choices[currentProblem.correctIndex]}」です。
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="bg-white/90 p-4 rounded-xl border border-slate-200 space-y-2 text-xs sm:text-sm text-slate-800">
                          <div className="font-bold text-slate-900">【詳しい解説・要点】</div>
                          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                            {currentProblem.explanation.map((step, sIdx) => (
                              <li key={sIdx} className="font-medium">
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                    <p className="text-sm text-slate-600">該当する条件の問題がありません。フィルター条件を変更してください。</p>
                    <button
                      onClick={() => {
                        setSchoolLevelFilter('all');
                        setSubjectFilter('all');
                        setDifficultyFilter('all');
                        setActiveCategory('all');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      フィルターをリセット
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePortalTab === 'simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Simulator 1: Quadratic Equation & Parabola */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="space-y-1 border-b border-slate-100 pb-3">
                  <span className="text-[11px] font-bold text-indigo-600">【中学3年・高校数学I】</span>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-blue-600" />
                    <span>二次方程式・放物線 計算シミュレーター</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    係数 a, b, c を入力すると、判別式 D・解の公式の解・放物線の頂点座標を即座に算出します。
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">係数 a (a ≠ 0)</label>
                    <input
                      type="number"
                      value={simA}
                      onChange={(e) => setSimA(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">係数 b</label>
                    <input
                      type="number"
                      value={simB}
                      onChange={(e) => setSimB(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">定数項 c</label>
                    <input
                      type="number"
                      value={simC}
                      onChange={(e) => setSimC(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                </div>

                {simulatorResult ? (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs sm:text-sm">
                    <div className="text-center font-mono font-extrabold text-base sm:text-lg text-blue-950 bg-blue-50/70 py-2.5 rounded-xl border border-blue-200">
                      {simulatorResult.a}x²{' '}
                      {simulatorResult.b >= 0 ? `+ ${simulatorResult.b}x` : `- ${Math.abs(simulatorResult.b)}x`}{' '}
                      {simulatorResult.c >= 0 ? `+ ${simulatorResult.c}` : `- ${Math.abs(simulatorResult.c)}`} = 0
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <div className="text-slate-500 font-bold text-xs">判別式 D = b² - 4ac</div>
                      <div className="text-base font-mono font-bold text-slate-900">D = {simulatorResult.d}</div>
                      <div className="text-blue-700 font-semibold text-xs">{simulatorResult.natureText}</div>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <div className="text-slate-500 font-bold text-xs">放物線 y = ax² + bx + c の頂点座標</div>
                      <div className="text-base font-mono font-bold text-slate-900">
                        ({Number(simulatorResult.vertexX.toFixed(3))}, {Number(simulatorResult.vertexY.toFixed(3))})
                      </div>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <div className="text-xs text-slate-500 font-bold">解の公式による解</div>
                      <div className="text-sm sm:text-base font-mono font-extrabold text-emerald-700">
                        {simulatorResult.solutionText}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                    係数 a には 0 以外の数値を入力してください。
                  </div>
                )}
              </div>

              {/* Simulator 2: Physics Ohm's Law, Electric Power & Heat */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="space-y-1 border-b border-slate-100 pb-3">
                  <span className="text-[11px] font-bold text-emerald-700">【中学理科・高校物理基礎】</span>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <span>オームの法則・消費電力・発熱量シミュレーター</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    電圧 V [V]・抵抗 R [Ω]・通電時間 t [秒] から、電流 I・消費電力 P・発熱量 Q [J] を自動計算します。
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電圧 V [V]</label>
                    <input
                      type="number"
                      value={ohmV}
                      onChange={(e) => setOhmV(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">抵抗 R [Ω]</label>
                    <input
                      type="number"
                      value={ohmR}
                      onChange={(e) => setOhmR(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">時間 t [秒]</label>
                    <input
                      type="number"
                      value={ohmTimeSec}
                      onChange={(e) => setOhmTimeSec(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-sm text-slate-900"
                    />
                  </div>
                </div>

                {ohmResult ? (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs sm:text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="text-slate-500 font-bold text-xs">電流 I = V / R</div>
                        <div className="text-base font-mono font-extrabold text-blue-700">
                          {ohmResult.currentI} A ({ohmResult.currentI * 1000} mA)
                        </div>
                      </div>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <div className="text-slate-500 font-bold text-xs">消費電力 P = V × I</div>
                        <div className="text-base font-mono font-extrabold text-amber-700">{ohmResult.powerW} W</div>
                      </div>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                      <div className="text-xs text-slate-500 font-bold">発熱量（電力量） Q = P × t</div>
                      <div className="text-base font-mono font-extrabold text-emerald-700">
                        {ohmResult.jouleJ.toLocaleString()} J （約 {ohmResult.cal.toLocaleString()} cal）
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                    抵抗 R には正の数値を入力してください。
                  </div>
                )}
              </div>
            </div>
          )}

          {activePortalTab === 'formulas' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                  中学・高校 数学
                </span>
                <h3 className="text-base font-bold text-slate-900">1. 解の公式・三平方・正弦余弦定理・微積分1/6公式</h3>
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 font-mono text-xs sm:text-sm font-bold text-blue-950 space-y-1">
                  <div>x = (-b ± √(b² - 4ac)) / (2a),   a² + b² = c²</div>
                  <div>a / sin A = 2R,   a² = b² + c² - 2bc cos A</div>
                  <div>∫_α^β (x - α)(x - β) dx = -(β - α)³ / 6</div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  相似比 $m:n$ のとき面積比は $m^2:n^2$、体積比は $m^3:n^3$ となります。
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                  中学・高校 英語
                </span>
                <h3 className="text-base font-bold text-slate-900">2. 時制・仮定法・関係詞・分詞構文の核心ルール</h3>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 font-mono text-xs sm:text-sm font-bold text-emerald-950 space-y-1">
                  <div>時・条件の副詞節(if/when)：未来でも現在形</div>
                  <div>仮定法過去完了：If S had p.p., S would have p.p.</div>
                  <div>関係副詞 where = in/at which （完全文が続く）</div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  提案・要求・命令動詞（suggest, insist, demand）の that節内は <strong>(should) ＋ 動詞の原形</strong> を用います。
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
                  中学・高校 国語（現代文・古文・漢文）
                </span>
                <h3 className="text-base font-bold text-slate-900">3. 係り結びの法則・古文助動詞・漢文重要句形</h3>
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs sm:text-sm font-bold text-amber-950 space-y-1">
                  <div>ぞ・なむ・や・か ⇒ 連体形 ／ こそ ⇒ 已然形</div>
                  <div>過去の助動詞：「き（体験過去）」「けり（伝聞過去）」</div>
                  <div>部分否定「不常〜（常には〜ず）」 vs 全部否定「常不〜」</div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  識別頻出「る・らる」は自発・可能・受身・尊敬の4義を文脈（心情語や主語の身分）から判別します。
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200">
                  中学・高校 理科（物理・化学・生物・地学）
                </span>
                <h3 className="text-base font-bold text-slate-900">4. 力学・電磁気・物質量(mol)・DNA複製・天体地学</h3>
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 font-mono text-xs sm:text-sm font-bold text-purple-950 space-y-1">
                  <div>ma = F,  v² - v₀² = 2ax,  PV = nRT</div>
                  <div>中和：a·c_a·V_a = b·c_b·V_b,  pH = -log₁₀[H⁺]</div>
                  <div>シャルガフの規則：A = T,  G = C（相補的塩基対）</div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  1パーセク（年周視差1秒）＝ <strong>約3.26光年</strong>。絶対等級 M = m + 5 - 5 log₁₀ d です。
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 rounded border border-rose-200">
                  中学・高校 社会（地理・歴史・公民・政経・倫理）
                </span>
                <h3 className="text-base font-bold text-slate-900">5. 気候区分・日本史世界史の画期・日本国憲法と金融政策</h3>
                <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 text-xs sm:text-sm font-bold text-rose-950 space-y-1">
                  <div>地中海性気候(Cs)：夏乾燥（亜熱帯高圧帯）・冬湿潤</div>
                  <div>大日本帝国憲法(1889)・日本国憲法(1946公布/1947施行)</div>
                  <div>日銀の公開市場操作：不況時は「買いオペ」で通貨供給増</div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  衆議院の優越：予算先議権・条約承認・内閣総理大臣の指名・内閣不信任決議権（衆議院のみ）。
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                  高校 情報I（デジタル・アルゴリズム・ネットワーク）
                </span>
                <h3 className="text-base font-bold text-slate-900">6. 基数変換・データ量・二分探索・公開鍵暗号</h3>
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 font-mono text-xs sm:text-sm font-bold text-indigo-950 space-y-1">
                  <div>1 Byte = 8 bit,  PCMデータ量 = Hz × bit × ch × 秒</div>
                  <div>二分探索の最大比較回数：O(log₂ N) （1024件で最大10回）</div>
                  <div>デジタル署名：送信者の「秘密鍵」で署名→「公開鍵」で検証</div>
                </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    ド・モルガンの法則：NOT(A・B) = (NOT A) + (NOT B)、NOT(A + B) = (NOT A)・(NOT B) です。
                  </p>
                </div>
              </div>
            )}

          {activePortalTab === 'mockexam' && (
            <MockExamView
              problems={problems}
              mockExamHistory={mockExamHistory}
              onRecordSolved={(probId, isOk) => {
                setAttemptCount((c) => c + 1);
                if (isOk) {
                  setCorrectCount((c) => c + 1);
                  setStreakCount((s) => s + 1);
                  setSolvedIds((prev) => ({ ...prev, [probId]: true }));
                } else {
                  setStreakCount(0);
                }
              }}
              onSaveMockExamRecord={(rec) => {
                setMockExamHistory((prev) => [rec, ...prev].slice(0, 50));
                const examLog: StudyActivityLogItem = {
                  id: 'act-mock-' + Date.now(),
                  timestamp: rec.date,
                  type: 'mockexam',
                  subjectLabel: '【10問実力判定テスト】',
                  unitName: `偏差値 ${rec.deviation}（${rec.rank}）`,
                  title: `10問模試を受験（正解 ${rec.correct}/${rec.total}問）`,
                  isCorrect: rec.score >= 60,
                  scoreDetail: `${rec.score}点 (${rec.rank})`
                };
                setActivityLogs((prev) => [examLog, ...prev].slice(0, 100));
              }}
            />
          )}

          {activePortalTab === 'flashcards' && (
            <FlashcardsRedSheetView
              masteredCards={masteredCards}
              onToggleMasteredCard={(cardId, cardFront, categoryName, nextState) => {
                setMasteredCards((prev) => ({ ...prev, [cardId]: nextState }));
                if (nextState) {
                  const now = new Date();
                  const ts = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
                    now.getDate()
                  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
                    2,
                    '0'
                  )}`;
                  const cardLog: StudyActivityLogItem = {
                    id: 'act-card-' + Date.now(),
                    timestamp: ts,
                    type: 'flashcard',
                    subjectLabel: '【一問一答カード】',
                    unitName: categoryName,
                    title: cardFront,
                    isCorrect: true,
                    scoreDetail: '暗記完了'
                  };
                  setActivityLogs((prev) => [cardLog, ...prev].slice(0, 100));
                }
              }}
            />
          )}

          {activePortalTab === 'calendar' && (
            <StudyCalendarGoalsView
              studySecondsToday={studySeconds}
              solvedTotal={solvedTotal}
              totalProblems={problems.length}
              accuracyRate={accuracyRate}
              attemptCount={attemptCount}
              correctCount={correctCount}
              masteredCardsCount={Object.values(masteredCards).filter(Boolean).length}
              activityLogs={activityLogs}
              mockExamHistory={mockExamHistory}
              currentProgress={currentProgressSnapshot}
              studentId={studentDisplayId}
              studentEmail={studentEmail}
              onPrimaryExamChange={(txt) => setPrimaryExamSummary(txt)}
              onExamsListChange={(nextExams) => setSavedExams(nextExams)}
              onClearActivityHistory={() => {
                setActivityLogs([]);
                setMockExamHistory([]);
              }}
              onStudentAccountLogin={(user, mail, restoredProg) => {
                setStudentDisplayId(user);
                setStudentEmail(mail);
                try {
                  localStorage.setItem(
                    'study_active_personal_account',
                    JSON.stringify({ username: user, email: mail })
                  );
                } catch {}
                if (restoredProg) {
                  applyRestoredProgress(restoredProg, mail || user);
                } else {
                  applyRestoredProgress(undefined, mail || user);
                }
              }}
              onStudentAccountLogout={() => {
                try {
                  localStorage.removeItem('study_active_personal_account');
                } catch {}
                setStudentDisplayId('education');
                setStudentEmail('');
                applyRestoredProgress(undefined, 'education');
              }}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                  文科省指導要領準拠
                </span>
                <span className="text-[11px] text-slate-500 font-medium">中学・高校 総合学習科</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                数理アカデミー <span className="text-blue-600 font-semibold">学習ポータル</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="hidden sm:flex items-center gap-1.5 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>単元：二次方程式の完全攻略</span>
            </div>
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>特講受講生認証</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Educational Content */}
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

        {/* Section 1 */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            二次方程式の定義と標準形
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            移項して整理したとき、未知数 $x$ の二次式＝0の形に変形できる方程式を<strong className="text-slate-900">二次方程式</strong>といいます。
          </p>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono font-bold text-slate-900 text-lg">
            ax² + bx + c = 0 &nbsp;&nbsp;(a ≠ 0)
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            最高次の係数 $a$ が 0 でないことが定義上の必須条件です。$a = 0$ のときは一次方程式となります。
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            二次方程式を解くための3大解法
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>① 平方根の利用</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                x² = k の形に変形し、x = ±√k として素早く解を導出します。
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>② 因数分解の活用</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                $(x - \alpha)(x - \beta) = 0$ に変形し、$AB = 0 \iff A=0$ または $B=0$ を用います。
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>③ 平方完成と解の公式</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                因数分解が困難なすべての二次方程式に適用できる万能の手法です。
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Quadratic Formula */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
            二次方程式の「解の公式」と判別式
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            二次方程式 $ax^2 + bx + c = 0$ の解は、以下の公式によって常に求めることができます：
          </p>
          <div className="p-5 bg-blue-50/60 rounded-xl border border-blue-200 text-center font-mono font-bold text-blue-950 text-xl">
            x = (-b ± √(b² - 4ac)) / (2a)
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>根号の中身：判別式 D = b² - 4ac の性質</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li><strong className="text-slate-900">D &gt; 0</strong> のとき：異なる2つの実数解をもつ</li>
              <li><strong className="text-slate-900">D = 0</strong> のとき：ただ1つの実数解（重解）をもつ</li>
              <li><strong className="text-slate-900">D &lt; 0</strong> のとき：実数解をもたない（異なる2つの虚数解）</li>
            </ul>
          </div>
        </section>

        {/* Student Special Lecture Access Form Box */}
        <div className="relative bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-lg max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold rounded-full">
              ※ 中学・高校 全教科総合演習システムを利用するには認証が必要です
            </span>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              受講生 限定アクセス認証
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              受講生IDとパスワードを入力して中学・高校 全教科総合演習システムへアクセスします。
            </p>
          </div>

          {renderAuthForm(false)}
        </div>
      </main>

      {/* Modal Quick Unlock (Hotkey / Header triggered) */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden relative font-sans">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {renderAuthForm(true)}
          </div>
        </div>
      )}

      {/* Disguise Password Settings Modal */}
      {showPasswordSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden relative font-sans">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">偽装解除パスワード設定</h3>
                  <p className="text-xs text-slate-500">解除パスワードの変更・省略設定を行えます</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePasswordSettings} className="p-6 space-y-4 text-xs sm:text-sm">
              {configSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{configSuccessMsg}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-700 text-xs">
                <span className="font-bold text-slate-900">💡 現在の解除パスワード設定</span>
                <p>
                  受講生ID: <code className="font-mono font-bold text-blue-800 bg-white px-1 py-0.5 rounded border border-slate-200">{authConfig.customId}</code> / パスワード: <code className="font-mono font-bold text-blue-800 bg-white px-1 py-0.5 rounded border border-slate-200">{authConfig.customPassword}</code>
                </p>
                <p className="text-[11px] text-slate-500">
                  ※ パスワードが合っていれば受講生IDの入力は省略しても解除されます。
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">解除パスワード（自由に変更可能）</label>
                <input
                  type="text"
                  value={configPassInput}
                  onChange={(e) => setConfigPassInput(e.target.value)}
                  placeholder="新しいパスワードを入力 (例: @0726kaito)"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">受講生ID / アカウント名（自由に変更可能）</label>
                <input
                  type="text"
                  value={configIdInput}
                  onChange={(e) => setConfigIdInput(e.target.value)}
                  placeholder="受講生ID (例: kaito)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-xs text-slate-800 block">パスワード保護を必須にする</span>
                    <span className="text-[11px] text-slate-500 block">
                      OFFにすると、パスワードを入力せずにそのまま解除できるようになります。
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={configRequirePass}
                    onChange={(e) => setConfigRequirePass(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-xs text-slate-800 block">「ワンクリック解除」ボタンを表示</span>
                    <span className="text-[11px] text-slate-500 block">
                      ログイン画面に1タップで即座に動画画面へ進むボタンを表示します。
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={configQuickUnlock}
                    onChange={(e) => setConfigQuickUnlock(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>パスワード設定を保存</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetPasswordSettings}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>初期値に戻す</span>
                </button>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSettingsModal(false);
                    handleQuickUnlock();
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  ⚡ 設定を閉じて今すぐ動画画面へ進む（ロック解除）
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
