import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Server,
  Code2,
  ExternalLink,
  Activity,
  CheckCircle,
  AlertCircle,
  Loader2,
  HelpCircle,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Globe,
  Cpu,
  Download
} from 'lucide-react';
import {
  customFetch,
  getApiSettings,
  saveApiSettings,
  getCustomProxyUrl,
  saveCustomProxyUrl
} from '../utils/apiClient';
import {
  clearClientStreamCache,
  runPoWWorkerDiagnostic,
  getPoWGuardSessionStatus,
  resetPoWGuardSession,
  getLastPoWDiagnostic,
  PoWDiagnosticReport
} from '../utils/streamManager';
import {
  generateGasCode,
  generateGasIndexHtml,
  getSavedGasProxyUrl,
  saveGasProxyUrl,
  testGasProxyConnection,
  isGasEnvironment,
  callGasFunction
} from '../utils/gasSyncManager';
import {
  generateInnerTubeWorkerCode,
  generateWranglerToml,
  testCustomInnerTubeWorker
} from '../utils/innertubeWorkerGenerator';

interface ProxyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SubsystemCheckItem {
  id: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
}

export const ProxyGuideModal: React.FC<ProxyGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'worker' | 'status' | 'gassync' | 'gas1' | 'gas2' | 'custom'>('worker');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
    items?: SubsystemCheckItem[];
  } | null>(null);
  const [cacheClearMsg, setCacheClearMsg] = useState<string | null>(null);
  const [customProxyUrl, setCustomProxyUrl] = useState(() => getCustomProxyUrl());
  const [customProxyTesting, setCustomProxyTesting] = useState(false);
  const [customProxyFeedback, setCustomProxyFeedback] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);
  const [gasProxyUrl, setGasProxyUrl] = useState(() => getSavedGasProxyUrl());
  const [gasTesting, setGasTesting] = useState(false);
  const [gasTestResult, setGasTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [copiedGasCode, setCopiedGasCode] = useState(false);
  const [copiedGasHtml, setCopiedGasHtml] = useState(false);
  const [inGasEnv, setInGasEnv] = useState(false);
  const [syncingWithDocs, setSyncingWithDocs] = useState(false);
  const [syncDocsResult, setSyncDocsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [liveGasCode, setLiveGasCode] = useState<string>('');
  const [liveGasHtml, setLiveGasHtml] = useState<string>('');

  // Self-Built InnerTube Cloudflare Worker State
  const [workerUrlInput, setWorkerUrlInput] = useState<string>(() => getApiSettings().innertubeUrl || '/api/worker');
  const [activeWorkerUrl, setActiveWorkerUrl] = useState<string>(() => getApiSettings().innertubeUrl || '/api/worker');
  const [workerCode, setWorkerCode] = useState<string>(() => generateInnerTubeWorkerCode());
  const [wranglerToml, setWranglerToml] = useState<string>(() => generateWranglerToml());
  const [copiedWorkerJs, setCopiedWorkerJs] = useState(false);
  const [copiedWrangler, setCopiedWrangler] = useState(false);
  const [workerTesting, setWorkerTesting] = useState(false);
  const [workerTestResult, setWorkerTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    engine?: string;
  } | null>(null);
  const [powTesting, setPowTesting] = useState(false);
  const [powReport, setPowReport] = useState<PoWDiagnosticReport | null>(() => getLastPoWDiagnostic());
  const [powSessionInfo, setPowSessionInfo] = useState(() => getPoWGuardSessionStatus());

  useEffect(() => {
    if (isOpen) {
      setInGasEnv(isGasEnvironment());
      setPowSessionInfo(getPoWGuardSessionStatus());
      setPowReport(getLastPoWDiagnostic());
      const currentUrl = getApiSettings().innertubeUrl || '/api/worker';
      setWorkerUrlInput(currentUrl);
      setActiveWorkerUrl(currentUrl);
      setCustomProxyUrl(getCustomProxyUrl());
      fetch('/api/worker/code')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.workerJs) setWorkerCode(data.workerJs);
          if (data?.wranglerToml) setWranglerToml(data.wranglerToml);
        })
        .catch(() => {});
      fetch('/api/gas/code')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.code) setLiveGasCode(data.code);
          if (data?.html) setLiveGasHtml(data.html);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndApplyWorker = async (targetUrl?: string) => {
    const urlToTest = (targetUrl ?? workerUrlInput).trim() || '/api/worker';
    setWorkerUrlInput(urlToTest);
    setWorkerTesting(true);
    setWorkerTestResult(null);
    const report = await testCustomInnerTubeWorker(urlToTest);
    setWorkerTesting(false);
    setWorkerTestResult(report);
    if (report.success) {
      const current = getApiSettings();
      saveApiSettings({
        ...current,
        provider: 'innertube',
        innertubeUrl: urlToTest
      });
      setActiveWorkerUrl(urlToTest);
      clearClientStreamCache();
    }
  };

  const handleDownloadWorkerFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunPoWWorkerTest = async (forceFresh = false) => {
    setPowTesting(true);
    try {
      if (forceFresh) {
        resetPoWGuardSession();
      }
      const report = await runPoWWorkerDiagnostic();
      setPowReport(report);
      setPowSessionInfo(getPoWGuardSessionStatus());
    } catch (err: any) {
      setPowReport({
        ok: false,
        sessionId: '',
        challengeId: '',
        nonce: '',
        difficultyBits: 12,
        counter: 0,
        hash: '',
        solveTimeMs: 0,
        totalTimeMs: 0,
        usedWebWorker: false,
        verifiedUntil: 0,
        workerEndpoint: '/api/worker',
        message: err?.message || 'PoW認証テストに失敗しました'
      });
    } finally {
      setPowTesting(false);
    }
  };

  const handleRunHealthCheck = async () => {
    setTesting(true);
    setTestResult(null);
    const overallStart = performance.now();
    const checks: SubsystemCheckItem[] = [];

    // 1. InnerTube Engine Check
    const t1 = performance.now();
    try {
      const currentSettings = getApiSettings();
      const report = await testCustomInnerTubeWorker(currentSettings.innertubeUrl || '/api/worker');
      checks.push({
        id: 'innertube',
        label: 'InnerTube データ・検索プロキシ',
        ok: report.success,
        latencyMs: report.latencyMs,
        detail: report.message
      });
    } catch (e: any) {
      checks.push({
        id: 'innertube',
        label: 'InnerTube データ・検索プロキシ',
        ok: false,
        latencyMs: Math.round(performance.now() - t1),
        detail: e?.message || 'InnerTube テスト失敗'
      });
    }

    // 2. Stream Proxy & Server Queue Check
    const t2 = performance.now();
    try {
      const res = await customFetch('/api/stream/status');
      const lat2 = Math.round(performance.now() - t2);
      if (res.ok) {
        const data = await res.json();
        checks.push({
          id: 'stream',
          label: '動画・音声 Range ストリーム中継',
          ok: true,
          latencyMs: lat2,
          detail: `${data.message || '稼働中'}（処理累計: ${data.totalProcessed ?? 0}件）`
        });
      } else {
        checks.push({
          id: 'stream',
          label: '動画・音声 Range ストリーム中継',
          ok: false,
          latencyMs: lat2,
          detail: `HTTP ${res.status}`
        });
      }
    } catch (e: any) {
      checks.push({
        id: 'stream',
        label: '動画・音声 Range ストリーム中継',
        ok: false,
        latencyMs: Math.round(performance.now() - t2),
        detail: e?.message || 'ストリーム中継テスト失敗'
      });
    }

    // 3. Thumbnail Base64 / CORS Proxy Check
    const t3 = performance.now();
    try {
      const res = await fetch('/api/proxy/thumbnail?videoId=dQw4w9WgXcQ&format=json');
      const lat3 = Math.round(performance.now() - t3);
      if (res.ok) {
        const data = await res.json();
        const ok = Boolean(data?.success && data?.dataUri?.startsWith('data:image/'));
        checks.push({
          id: 'thumbnail',
          label: 'サムネイル Base64 変換プロキシ',
          ok,
          latencyMs: lat3,
          detail: ok ? 'Base64 Data URI 変換・CORSバイパス正常' : '画像プロキシ応答あり'
        });
      } else {
        checks.push({
          id: 'thumbnail',
          label: 'サムネイル Base64 変換プロキシ',
          ok: false,
          latencyMs: lat3,
          detail: `HTTP ${res.status}`
        });
      }
    } catch (e: any) {
      checks.push({
        id: 'thumbnail',
        label: 'サムネイル Base64 変換プロキシ',
        ok: false,
        latencyMs: Math.round(performance.now() - t3),
        detail: e?.message || 'サムネイルプロキシ失敗'
      });
    }

    // 4. Custom Proxy Check (if configured)
    const savedCustom = getCustomProxyUrl();
    if (savedCustom) {
      const t4 = performance.now();
      try {
        const res = await fetch(`/api/proxy/test-custom?url=${encodeURIComponent(savedCustom)}`);
        const data = await res.json();
        checks.push({
          id: 'custom',
          label: `カスタムプロキシ (${savedCustom})`,
          ok: Boolean(data?.success),
          latencyMs: data?.latencyMs || Math.round(performance.now() - t4),
          detail: data?.message || ''
        });
      } catch (e: any) {
        checks.push({
          id: 'custom',
          label: `カスタムプロキシ (${savedCustom})`,
          ok: false,
          latencyMs: Math.round(performance.now() - t4),
          detail: e?.message || '接続テスト失敗'
        });
      }
    }

    const totalLatency = Math.round(performance.now() - overallStart);
    const allOk = checks.every((c) => c.ok);
    const anyOk = checks.some((c) => c.ok);

    setTestResult({
      success: anyOk,
      latency: totalLatency,
      items: checks,
      message: allOk
        ? `全プロキシ経路（${checks.length}項目）が正常に疎通しています（総合診断: ${totalLatency}ms）`
        : anyOk
        ? `一部の経路に警告がありますが、フォールバック経路で通信可能です（総合診断: ${totalLatency}ms）`
        : 'プロキシ経路への通信に失敗しました。サーバー内蔵エンジン (/api/worker) への切替をお試しください。'
    });
    setTesting(false);
  };

  const handleClearProxyCaches = async () => {
    const clientCleared = clearClientStreamCache();
    try {
      const res = await fetch('/api/proxy/clear-cache', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      setCacheClearMsg(
        data?.message
          ? `${data.message} / クライアントキャッシュ: ${clientCleared}件クリア完了`
          : `プロキシ＆ストリームキャッシュをクリアしました（クライアント: ${clientCleared}件）`
      );
    } catch {
      setCacheClearMsg(`クライアントキャッシュ（${clientCleared}件）をクリアしました`);
    }
    setTimeout(() => setCacheClearMsg(null), 4000);
  };

  const handleTestAndSaveGas = async () => {
    if (!gasProxyUrl.trim()) return;
    setGasTesting(true);
    setGasTestResult(null);

    const result = await testGasProxyConnection(gasProxyUrl.trim());
    setGasTestResult(result);
    setGasTesting(false);

    if (result.success) {
      saveGasProxyUrl(gasProxyUrl.trim());
      saveCustomProxyUrl(gasProxyUrl.trim());
      setCustomProxyUrl(gasProxyUrl.trim());
    }
  };

  const handleSyncGasDocs = async () => {
    setSyncingWithDocs(true);
    setSyncDocsResult(null);

    if (inGasEnv) {
      try {
        const res = await callGasFunction('refreshHtmlToDocs');
        setSyncDocsResult({
          success: true,
          message: `GAS環境との同期に成功しました (${res?.bytes ? res.bytes + ' bytes' : '最新'})`
        });
      } catch (err: any) {
        setSyncDocsResult({
          success: false,
          message: 'GAS関数の呼び出しに失敗しました: ' + (err.message || '不明')
        });
      } finally {
        setSyncingWithDocs(false);
      }
    } else {
      try {
        const res = await fetch('/api/gas/code');
        if (res.ok) {
          const data = await res.json();
          if (data?.code) setLiveGasCode(data.code);
          if (data?.html) setLiveGasHtml(data.html);
          setSyncDocsResult({
            success: true,
            message: '最新のGASコード (Code.gs / index.html) を取得・更新完了しました'
          });
        } else {
          throw new Error('API response status ' + res.status);
        }
      } catch (err: any) {
        setSyncDocsResult({
          success: false,
          message: '同期エラー: ' + err.message
        });
      } finally {
        setSyncingWithDocs(false);
      }
    }
  };

  const handleSaveCustomProxy = async (applyAsWorkerToo = false) => {
    const clean = customProxyUrl.trim();
    if (!clean) {
      saveCustomProxyUrl('');
      setCustomProxyFeedback({
        success: true,
        message: 'カスタムプロキシ設定を解除し、標準のサーバー内蔵プロキシに戻しました。'
      });
      return;
    }

    setCustomProxyTesting(true);
    setCustomProxyFeedback(null);
    try {
      const res = await fetch(`/api/proxy/test-custom?url=${encodeURIComponent(clean)}`);
      const data = await res.json();
      saveCustomProxyUrl(clean);
      if (applyAsWorkerToo || clean.includes('workers.dev') || clean === '/api/worker') {
        const current = getApiSettings();
        saveApiSettings({
          ...current,
          provider: 'innertube',
          innertubeUrl: clean
        });
        setWorkerUrlInput(clean);
        setActiveWorkerUrl(clean);
      }
      setCustomProxyFeedback({
        success: Boolean(data?.success),
        latencyMs: data?.latencyMs,
        message: data?.success
          ? `${data.message} — カスタムプロキシ設定を保存・適用しました！`
          : `URLを保存しましたが疎通確認で警告があります: ${data?.message || '応答なし'}`
      });
    } catch (err: any) {
      saveCustomProxyUrl(clean);
      setCustomProxyFeedback({
        success: false,
        message: `設定を保存しましたがテスト通信に失敗しました: ${err?.message || '不明なエラー'}`
      });
    } finally {
      setCustomProxyTesting(false);
    }
  };

  const gasCodeText = liveGasCode || generateGasCode();
  const gasHtmlText = liveGasHtml || generateGasIndexHtml(typeof window !== 'undefined' ? window.location.origin : '');
  const gasHtmlPreviewText =
    gasHtmlText.length > 16000
      ? `${gasHtmlText.slice(0, 16000)}\n\n/* ... プレビュー表示は先頭 16,000 文字まで省略されています（全体: ${Math.round(gasHtmlText.length / 1024)} KB）。「HTMLをコピー」または「ダウンロード」で完全な全コードが取得されます ... */`
      : gasHtmlText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base leading-tight">自作 InnerTube Worker &amp; GAS プロキシ管理</h3>
                <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] font-bold text-neutral-300">
                  制作: 海斗
                </span>
              </div>
              <p className="text-xs text-neutral-400">自作 Cloudflare Worker 1ファイル完結コード発行・内蔵エンジン切替・GAS連携</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 px-3 py-1.5 overflow-x-auto text-xs gap-1">
          <button
            onClick={() => setActiveTab('worker')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'worker' ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-rose-400" />
            <span>自作 InnerTube Worker</span>
          </button>
          <button
            onClick={() => setActiveTab('gassync')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'gassync' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>GASに同期</span>
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'status' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>ヘルスチェック</span>
          </button>
          <button
            onClick={() => setActiveTab('gas1')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'gas1' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>GAS Code.gs</span>
          </button>
          <button
            onClick={() => setActiveTab('gas2')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'gas2' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-purple-400" />
            <span>GAS index.html</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'custom' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>カスタム設定</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {/* Self-Built InnerTube Cloudflare Worker Tab */}
          {activeTab === 'worker' && (
            <div className="space-y-4">
              {/* Built-in vs External Worker Switcher */}
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold text-white">
                      海斗tube 自作 InnerTube Worker エンドポイント設定
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 text-[10px] font-mono">
                      現在有効: {activeWorkerUrl === '/api/worker' ? 'サーバー内蔵 (/api/worker)' : activeWorkerUrl}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                      APIキー不要
                    </span>
                  </div>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  YouTube公式内部プロトコル（<code className="text-rose-300 font-mono">youtubei/v1</code>）と Range 動画ストリーム中継を直接処理する自作 Worker がアプリ内に内蔵（<code className="text-emerald-400 font-mono">/api/worker</code>）されています。下の <code className="text-rose-300 font-mono">worker.js</code> をご自身の Cloudflare Workers にデプロイして独自URLで運用することも可能です。
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestAndApplyWorker('/api/worker')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      workerUrlInput === '/api/worker'
                        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>サーバー内蔵 Worker (/api/worker・推奨・最速・IP一致) を使う</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestAndApplyWorker('https://proxy.wa0260966.workers.dev/')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      workerUrlInput.includes('proxy.wa0260966.workers.dev')
                        ? 'bg-rose-600/25 border-rose-500 text-rose-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>自作 Cloudflare Worker (proxy.wa0260966.workers.dev) に切替</span>
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={workerUrlInput}
                    onChange={(e) => setWorkerUrlInput(e.target.value)}
                    placeholder="/api/worker または https://kaito-innertube.your-name.workers.dev"
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestAndApplyWorker()}
                    disabled={workerTesting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 shadow"
                  >
                    {workerTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    <span>{workerTesting ? '疎通テスト中...' : 'テスト＆適用'}</span>
                  </button>
                </div>

                {workerTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      workerTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {workerTestResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        {workerTestResult.success
                          ? `接続成功・適用完了 (${workerTestResult.latencyMs}ms)`
                          : '接続テスト失敗'}
                      </div>
                      <div className="text-neutral-300">{workerTestResult.message}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* PoW Guard Authentication Worker Panel */}
              <div className="p-4 rounded-xl bg-neutral-950/90 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">
                      PoW 認証 Worker (SHA-256 Proof of Work / Web Worker + Cloudflare Worker)
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      powSessionInfo.verified
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {powSessionInfo.verified ? 'PoW認証済みセッション有効' : '初回ストリーム取得時に自動認証'}
                  </span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  外部サーバーに一切依存せず、<strong>Cloudflare Worker 側でチャレンジ発行・HMAC署名検証</strong>（<code>/api/__guard/challenge</code>・<code>/api/__guard/verify</code>）を行い、<strong>ブラウザ側 Web Worker スレッドで SHA-256 PoW 計算</strong>を非同期実行します。
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunPoWWorkerTest(true)}
                    disabled={powTesting}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow"
                  >
                    {powTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>{powTesting ? 'Web Worker で SHA-256 PoW 計算中...' : 'PoW 認証 Worker テスト実行（新規チャレンジ計算）'}</span>
                  </button>
                  {powSessionInfo.sessionId && (
                    <span className="text-[11px] font-mono text-neutral-400 truncate max-w-xs">
                      guard_sid: {powSessionInfo.sessionId.slice(0, 16)}...
                    </span>
                  )}
                </div>

                {powReport && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1.5 font-mono ${
                      powReport.ok
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-sans font-bold">
                      <span className="flex items-center gap-1.5">
                        {powReport.ok ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        {powReport.ok
                          ? `PoW 認証成功 (${powReport.usedWebWorker ? 'Web Worker 並列スレッド' : '非同期スレッド'})`
                          : powReport.message || 'PoW 認証エラー'}
                      </span>
                      {powReport.ok && (
                        <span className="text-[11px] text-emerald-400">
                          計算: {powReport.solveTimeMs}ms / 合計: {powReport.totalTimeMs}ms
                        </span>
                      )}
                    </div>
                    {powReport.ok && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-neutral-300 pt-1">
                        <div>Difficulty: {powReport.difficultyBits} bits (先頭ゼロビット)</div>
                        <div>Solved Counter: {powReport.counter}</div>
                        <div className="sm:col-span-2 truncate">Nonce: {powReport.nonce}</div>
                        <div className="sm:col-span-2 truncate text-emerald-300">
                          SHA-256: {powReport.hash}
                        </div>
                        <div className="sm:col-span-2 truncate text-neutral-400">
                          Session ID: {powReport.sessionId}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* worker.js Code Copy & Download */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Cloudflare Worker 完全版ソースコード (cloudflare-worker/worker.js)</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      急上昇・検索・動画ストリーム・Shorts・字幕(VTT)・コメント・====合同タイムライン・動くWebP全対応
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadWorkerFile('worker.js', workerCode)}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>worker.js 保存</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(workerCode);
                        setCopiedWorkerJs(true);
                        setTimeout(() => setCopiedWorkerJs(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {copiedWorkerJs ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWorkerJs ? 'コピー完了！' : 'worker.js をコピー'}</span>
                    </button>
                  </div>
                </div>

                <pre className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-60">
                  {workerCode}
                </pre>
              </div>

              {/* wrangler.toml + Quick Deploy Guide */}
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2.5 text-xs text-neutral-300">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cloudflare Workers への30秒デプロイ手順</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(wranglerToml);
                      setCopiedWrangler(true);
                      setTimeout(() => setCopiedWrangler(false), 2000);
                    }}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedWrangler ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>wrangler.toml をコピー</span>
                  </button>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-neutral-400 pl-1 leading-relaxed">
                  <li>
                    Cloudflare ダッシュボードの <strong>Workers & Pages</strong> で新規 Worker を作成（またはプロジェクト内 <code>cloudflare-worker/</code> で <code>npx wrangler deploy</code> を実行）
                  </li>
                  <li>
                    上の「<strong>worker.js をコピー</strong>」を押して Cloudflare Worker のコードエディタに貼り付け、「Deploy」をクリック
                  </li>
                  <li>
                    発行された <code>https://xxx.workers.dev</code> のURLを上の入力欄に貼り付けて「<strong>テスト＆適用</strong>」をクリック！
                  </li>
                </ol>
              </div>
            </div>
          )}
          {/* GAS Sync Tab */}
          {activeTab === 'gassync' && (
            <div className="space-y-4">
              {/* Detection Status Banner */}
              <div className="p-3.5 rounded-xl border flex items-center justify-between bg-neutral-950/60 border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-white">実行環境の判定</div>
                    <div className="text-[11px] text-neutral-400">
                      {inGasEnv
                        ? 'Google Apps Script (GAS) サンドボックス内で動作中'
                        : 'Webブラウザ通常環境（GAS Web Appとリアルタイム同期可能）'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSyncGasDocs}
                  disabled={syncingWithDocs}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingWithDocs ? 'animate-spin' : ''}`} />
                  <span>{syncingWithDocs ? '同期中...' : '今すぐ同期'}</span>
                </button>
              </div>

              {syncDocsResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    syncDocsResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {syncDocsResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{syncDocsResult.message}</span>
                </div>
              )}

              {/* GAS Web App URL Input */}
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>GAS Webアプリ同期URL</span>
                  <span className="text-[10px] text-neutral-400 font-normal">script.google.com/macros/s/.../exec</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={gasProxyUrl}
                    onChange={(e) => setGasProxyUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleTestAndSaveGas}
                    disabled={gasTesting || !gasProxyUrl.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
                  >
                    {gasTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    <span>{gasTesting ? '接続中...' : '同期・接続テスト'}</span>
                  </button>
                </div>

                {gasTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      gasTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {gasTestResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">{gasTestResult.success ? '同期完了 & 有効' : '同期失敗'}</div>
                      <div className="text-neutral-300 mt-0.5">{gasTestResult.message}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Deploy Guide */}
              <div className="p-4 bg-neutral-950/40 rounded-xl border border-neutral-800 space-y-2.5 text-xs text-neutral-300">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>30秒で完了するGAS同期手順</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-neutral-400 pl-1 leading-relaxed">
                  <li>
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Google Apps Script</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    を開き「新しいプロジェクト」を作成
                  </li>
                  <li>
                    上のタブ「<strong>GAS Code.gs</strong>」のコードをコピーして貼り付け
                  </li>
                  <li>
                    「ファイル追加（＋）」→「HTML」で <code>index.html</code> を作成し、「<strong>GAS index.html</strong>」のコードを貼り付け
                  </li>
                  <li>
                    右上の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選択（アクセス権: <strong>全員</strong>）してデプロイ
                  </li>
                  <li>
                    発行されたURLを上の入力欄に貼り付けて「<strong>同期・接続テスト</strong>」をクリック
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Health Check */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-white text-xs">マルチレイヤー・プロキシ通信ヘルスチェック</h4>
                    <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">
                      InnerTube検索・動画Rangeストリーム中継・サムネイルBase64変換・カスタムプロキシの4階層を診断します。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleRunHealthCheck}
                    disabled={testing}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                  >
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    <span>{testing ? '全経路を診断中...' : '4階層ヘルスチェックを実行'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearProxyCaches}
                    className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                    <span>プロキシキャッシュをクリア＆再接続</span>
                  </button>
                </div>

                {cacheClearMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{cacheClearMsg}</span>
                  </div>
                )}

                {testResult && (
                  <div className="space-y-2.5 pt-1">
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        testResult.success
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">{testResult.success ? 'プロキシ診断結果: 正常稼働中' : '通信警告'}</div>
                        <div className="text-neutral-300 mt-0.5">{testResult.message}</div>
                      </div>
                    </div>

                    {testResult.items && testResult.items.length > 0 && (
                      <div className="grid grid-cols-1 gap-2">
                        {testResult.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start gap-2">
                              {item.ok ? (
                                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div className="font-bold text-white">{item.label}</div>
                                <div className="text-[11px] text-neutral-400 mt-0.5">{item.detail}</div>
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                                item.ok
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {item.latencyMs}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GAS 1: Code.gs */}
          {activeTab === 'gas1' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-xs">Google Apps Script サーバーコード (Code.gs)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      v3.0.0 最新版 ({Math.round(gasCodeText.length / 1024)} KB)
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    学習ポータル認証分岐・全教科問題演習・ストリーム最優先取得・UrlFetchApp.fetchAll並列高速抽出・1080p＋AAC同期完全対応
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncGasDocs}
                    disabled={syncingWithDocs}
                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncingWithDocs ? 'animate-spin' : ''}`} />
                    <span>最新再取得</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadWorkerFile('Code.gs', gasCodeText)}
                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Code.gs DL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(gasCodeText);
                      setCopiedGasCode(true);
                      setTimeout(() => setCopiedGasCode(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {copiedGasCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedGasCode ? 'コピー完了' : 'コードをコピー'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-72">
                  {gasCodeText}
                </pre>
              </div>
            </div>
          )}

          {/* GAS 2: index.html */}
          {activeTab === 'gas2' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-xs">GAS用 HTMLファイル (index.html)</h4>
                    <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-200 border border-neutral-700 text-[10px] font-bold">
                      v3.0.0 最新版 ({Math.max(1, Math.round(gasHtmlText.length / 1024))} KB)
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    GASのHtmlServiceで本アプリを動作させるための最新HTML単一バンドル（中学・高校全教科全単元演習＋Base64ステルスバンドル対応）
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadWorkerFile('index.html', gasHtmlText)}
                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-neutral-300" />
                    <span>index.html DL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(gasHtmlText);
                      setCopiedGasHtml(true);
                      setTimeout(() => setCopiedGasHtml(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {copiedGasHtml ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedGasHtml ? 'コピー完了' : 'HTMLをコピー'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-72">
                  {gasHtmlPreviewText}
                </pre>
              </div>
            </div>
          )}

          {/* Custom Settings */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-amber-400" />
                    <span>カスタムプロキシURLの登録・疎通テスト</span>
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                    {getCustomProxyUrl() ? 'カスタムプロキシ設定済' : '標準（内蔵プロキシ）'}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  ご自身でデプロイした Cloudflare Worker（<code className="text-amber-300 font-mono">https://xxx.workers.dev</code>）、Google Apps Script Webアプリ（<code className="text-emerald-300 font-mono">https://script.google.com/macros/s/.../exec</code>）、または汎用中継プロキシURLを指定して通信経路に適用できます。
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customProxyUrl}
                    onChange={(e) => setCustomProxyUrl(e.target.value)}
                    placeholder="https://your-worker.workers.dev または https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveCustomProxy(true)}
                    disabled={customProxyTesting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {customProxyTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    <span>{customProxyTesting ? 'テスト中...' : 'テスト＆保存'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomProxyUrl('https://proxy.wa0260966.workers.dev');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-300 cursor-pointer"
                  >
                    プリセット: proxy.wa0260966.workers.dev
                  </button>
                  {customProxyUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomProxyUrl('');
                        saveCustomProxyUrl('');
                        setCustomProxyFeedback({
                          success: true,
                          message: 'カスタムプロキシを解除し、標準のサーバー内蔵プロキシに戻しました。'
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] text-rose-300 cursor-pointer"
                    >
                      カスタム設定をクリア（標準に戻す）
                    </button>
                  )}
                </div>

                {customProxyFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      customProxyFeedback.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {customProxyFeedback.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">
                        {customProxyFeedback.success ? 'カスタムプロキシ設定完了' : '確認メッセージ'}
                      </div>
                      <div className="text-neutral-300 mt-0.5">{customProxyFeedback.message}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

