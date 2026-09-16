# 海斗tube (KaitoTube) - デプロイガイド (Render / Vercel / GAS)

YouTube API v3 & YouTube Education プレイヤーを統合した動画閲覧・学習Webアプリケーションです。

---

## 🚀 デプロイ設定の準備（完了済み）

本リポジトリには、GitHub経由で **Render**、**Vercel**、およびサーバーレス無料運用の **Google Apps Script (GAS)** へ直接デプロイするための設定ファイルがすべて同梱されています。

---

## 1. 🐙 GitHubへリポジトリをプッシュする手順

1. AI Studio画面右上の **「GitHubにエクスポート」** ボタンから自身のGitHubアカウントにコードをプッシュします。
2. （または手動でターミナルからリポジトリを作成してコミット・プッシュします）

---

## 2. 🔷 Render（レンダー）でのデプロイ手順

RenderはNode.jsサーバーを常時稼働させるのに最適なプラットフォームです。

### 設定方法（Blueprints / 自動認識）：
1. [Render Dashboard](https://dashboard.render.com/) にログインします。
2. **「New +」** -> **「Blueprint」** を選択します。
3. GitHubアカウントを連携し、本リポジトリを選択します。
4. リポジトリ内の `render.yaml` が自動検出され、ワンクリックでWebサービスが作成されます。

### 手動設定で行う場合（Web Service）：
- **Environment**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Environment Variables (環境変数)**:
  - `NODE_ENV`: `production`
  - `YOUTUBE_API_KEY`: *(任意: ご自身のYouTube Data API v3キー)*
  - `GEMINI_API_KEY`: *(任意: AI動画要約機能を使う場合のGemini APIキー)*

---

## 3. ▲ Vercel（バーセル）でのデプロイ手順

Vercelは高速なサーバーレス配信・フロントエンドホスティングに優れています。

### 設定方法：
1. [Vercel Dashboard](https://vercel.com/dashboard) にログインします。
2. **「Add New...」** -> **「Project」** を選択します。
3. GitHubリポジトリを選択し、**「Import」** をクリックします。
4. Framework Preset は **Vite**（またはOther）が自動検出されます。
5. **Environment Variables (環境変数)** 設定項目に必要に応じて以下を入力します:
   - `GEMINI_API_KEY`: *(任意)*
   - `YOUTUBE_API_KEY`: *(任意)*
6. **「Deploy」** ボタンを押すと、数秒でAPI（`/api/index.ts`）と静的ページ（`dist`）が自動デプロイされます！

---

## 4. 📜 Google Apps Script (GAS) 版でのデプロイ手順

Google Apps Script の Web App 機能を使えば、サーバー契約不要・完全無料で海斗tubeを公開できます。

### 設定方法：
1. [Google Apps Script (script.google.com)](https://script.google.com/) で新規プロジェクトを作成します。
2. プロジェクト内の `Code.gs` に、本リポジトリの **`gas/Code.gs`** をコピー＆ペーストします。
3. 左メニューの「＋」から「HTML」ファイルを追加し、ファイル名を **`index`** にします。
4. `index.html` の中身に、本リポジトリの **`gas/index.html`** をコピー＆ペーストします。
5. （任意）左メニューの「プロジェクトの設定」→「スクリプトプロパティ」で `YOUTUBE_API_KEY` や `GEMINI_API_KEY` を登録します。
6. 右上の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選択し、
   - **次のユーザーとして実行**: `自分`
   - **アクセスできるユーザー**: `全員 (Anyone)`
   に設定してデプロイします。
7. 生成されたウェブアプリURLにアクセスすると、海斗tubeがそのまま起動します！
*(※詳細な解説は `gas/README.md` をご覧ください)*

---

## 🛠 開発・ビルドコマンド

```bash
# 開発サーバー起動
npm run dev

# 生産用ビルド (Vite + Expressバンドル)
npm run build

# GAS用スタンドアロンHTML再生成
npm run build:gas

# 本番サーバー起動
npm run start
```

