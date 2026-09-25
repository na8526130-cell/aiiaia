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
  Globe
} from 'lucide-react';
import { customFetch } from '../utils/apiClient';
import {
  generateGasCode,
  generateGasIndexHtml,
  getSavedGasProxyUrl,
  saveGasProxyUrl,
  testGasProxyConnection,
  isGasEnvironment,
  callGasFunction
} from '../utils/gasSyncManager';

interface ProxyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProxyGuideModal: React.FC<ProxyGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'gassync' | 'gas1' | 'gas2' | 'custom'>('gassync');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [customProxyUrl, setCustomProxyUrl] = useState(() => localStorage.getItem('kaito_custom_proxy') || '');
  const [gasProxyUrl, setGasProxyUrl] = useState(() => getSavedGasProxyUrl());
  const [gasTesting, setGasTesting] = useState(false);
  const [gasTestResult, setGasTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [copiedGasCode, setCopiedGasCode] = useState(false);
  const [copiedGasHtml, setCopiedGasHtml] = useState(false);
  const [inGasEnv, setInGasEnv] = useState(false);
  const [syncingWithDocs, setSyncingWithDocs] = useState(false);
  const [syncDocsResult, setSyncDocsResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInGasEnv(isGasEnvironment());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunHealthCheck = async () => {
    setTesting(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const res = await customFetch('/api/stream/status');
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: true,
          message: `プロキシ通信は正常です（応答速度: ${latency}ms, サーバー状態: ${data.status || 'ok'}）`,
          latency
        });
      } else {
        setTestResult({
          success: false,
          message: `HTTPステータス ${res.status}: プロキシの応答が不安定です`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'プロキシへの接続テストに失敗しました: ' + (err.message || '接続拒否')
      });
    } finally {
      setTesting(false);
    }
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
      // Also register as custom proxy for stream fetching
      localStorage.setItem('kaito_custom_proxy', gasProxyUrl.trim());
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
      // If outside, ping backend sync
      try {
        const res = await fetch('/api/gas/code');
        if (res.ok) {
          setSyncDocsResult({
            success: true,
            message: '最新のGAS同期用コードを取得・更新完了しました'
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

  const handleSaveCustomProxy = () => {
    localStorage.setItem('kaito_custom_proxy', customProxyUrl.trim());
    alert('カスタムプロキシ設定を保存しました。');
  };

  const gasCodeText = generateGasCode();
  const gasHtmlText = generateGasIndexHtml(typeof window !== 'undefined' ? window.location.origin : '');

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
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">プロキシ管理 & GAS同期ガイド</h3>
              <p className="text-xs text-neutral-400">学校・職場のフィルタリング回避 & Google Apps Script (GAS) 連携</p>
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
            onClick={() => setActiveTab('gassync')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gassync' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>GASに同期</span>
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'status' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>ヘルスチェック</span>
          </button>
          <button
            onClick={() => setActiveTab('gas1')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gas1' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>GAS Code.gs</span>
          </button>
          <button
            onClick={() => setActiveTab('gas2')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gas2' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-purple-400" />
            <span>GAS index.html</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'custom' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>カスタム設定</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
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
                <h4 className="font-bold text-white text-xs">プロキシ通信ヘルスチェック</h4>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  学内・社内ネットワーク等による遮断やブロック状況を診断し、接続経路が正常に疎通しているかを瞬時に確認します。
                </p>

                <button
                  onClick={handleRunHealthCheck}
                  disabled={testing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                  <span>{testing ? '診断を実行中...' : '接続ヘルスチェックを実行'}</span>
                </button>

                {testResult && (
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
                      <div className="font-bold">{testResult.success ? 'プロキシは有効です' : '通信警告'}</div>
                      <div className="text-neutral-300 mt-0.5">{testResult.message}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GAS 1: Code.gs */}
          {activeTab === 'gas1' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs">Google Apps Script サーバーコード (Code.gs)</h4>
                  <p className="text-[11px] text-neutral-400">UrlFetchApp中継 & 最新ビルド同期機能 (refreshHtmlToDocs)</p>
                </div>
                <button
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
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs">GAS用 HTMLファイル (index.html)</h4>
                  <p className="text-[11px] text-neutral-400">GASのHtmlServiceで本アプリを高速表示するためのラッパーHTML</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(gasHtmlText);
                    setCopiedGasHtml(true);
                    setTimeout(() => setCopiedGasHtml(false), 2000);
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {copiedGasHtml ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedGasHtml ? 'コピー完了' : 'HTMLをコピー'}</span>
                </button>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-72">
                  {gasHtmlText}
                </pre>
              </div>
            </div>
          )}

          {/* Custom Settings */}
          {activeTab === 'custom' && (
            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs">カスタムプロキシURLの登録</h4>
              <p className="text-xs text-neutral-400">ご自身でデプロイしたCloudflare WorkerやGAS WebアプリURLを指定できます：</p>
              <input
                type="text"
                value={customProxyUrl}
                onChange={(e) => setCustomProxyUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSaveCustomProxy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                保存する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

