# momolog_system

動画撮影・加工・YouTube自動投稿を担うユーザー向けアプリ。

## 技術スタック
- SvelteKit (Svelte 5) + JavaScript
- Tailwind CSS v4
- Firebase (Auth, Firestore, Storage)
- Netlify デプロイ
- GitHub Actions CI/CD

## 開発コマンド
- `npm run dev` - ローカル開発サーバー起動
- `npm run build` - プロダクションビルド
- `npm run preview` - ビルドプレビュー

## プロジェクト構造
- `src/lib/firebase/` - Firebase設定・ヘルパー
- `src/lib/stores/` - Svelteストア（認証状態等）
- `src/routes/` - ページルーティング
  - `/` - ログイン
  - `/dashboard` - ダッシュボード（団体選択）
  - `/upload` - 動画アップロード
  - `/edit` - 動画加工（未実装）
  - `/status` - 投稿ステータス確認

## 環境変数
`.env.example` を参照。Firebase Consoleから取得した値を `.env` に設定。

## 認証
Firebase Authentication (Google Sign-In) を使用。
未認証ユーザーは `/` にリダイレクト。
