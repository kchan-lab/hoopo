# Plan: docker compose でローカル開発環境を定義

Issue: [#2](https://github.com/kchan-lab/hoopo/issues/2)
設計の正: CLAUDE.md「技術スタック」(ローカル開発は Docker 統一、portal=8000 / admin=8001)/ docs/DEVELOPMENT.md フェーズ0

## 目的

`docker compose up` だけで portal(:8000)/ admin(:8001)が起動し、`supabase start` で
ローカルDBスタックが立ち上がる開発環境を作る。LIFF 実機確認用のトンネル手順も docs に残す。

## 方針

- **開発用コンテナは1イメージ**(`docker/dev.Dockerfile`: node:24-slim + pnpm)を portal / admin で共用。
  リポジトリ全体を bind mount し、コンテナ内で `pnpm install` → `pnpm dev` を実行。
  compose ファイル名は公式が第一推奨とする `compose.yaml`(`docker-compose.yml` は後方互換の旧名)
- node_modules は named volume でコンテナ側に分離(ホストの実行環境と混ざらないように)
- **Supabase はアプリの compose に含めない**。Supabase CLI 自体が専用の Docker スタック
  (Postgres:54322 / API:54321 / Studio:54323)を管理するため、`supabase start` に任せる
- 接続情報は `.env.example` に集約(SUPABASE_URL / DATABASE_URL 等)。アプリからの実接続は
  Drizzle を入れる Issue #6 のスコープで、本 Issue は起動と接続情報の配線まで
- 入口は `make up`(対話で起動対象を選択 → `make dev` を実行)。実処理は `scripts/dev.sh` に置き、
  Makefile は薄いラッパーにする

### 設計判断

1. **Supabase CLI は devDependency(`supabase` npm パッケージ)で導入**: バージョンが
   リポジトリに固定され、`pnpm exec supabase start` で誰でも同じ環境になる。
   退けた案はホストへの brew / バイナリ導入(環境差が出る)
2. **pnpm は corepack でなく `npm i -g pnpm@<version>` で導入**: Node 25 以降 corepack の
   同梱が廃止される流れのため、イメージ内で明示インストールする方が将来安定
3. **本番用 Dockerfile は作らない**: 本番ビルドは Vercel が行うため、Docker はローカル開発専用
   (CLAUDE.md の想定どおり)
4. **ペイン分割は環境で使い分ける**: 想定は Windows=WSL2 / Mac=Ghostty(Ghostty に Windows 版が無いため)。
   ターミナル自体の分割を外部プロセスから指示する手段は無いので、**WSL2 は tmux で自動分割**、
   **Mac は Ghostty のキーバインドで分割して各ペインで `make logs SERVICES=…`** を正とし、
   後者の手順は起動時に画面へ出す(`SPLIT=auto` / `SPLIT=tmux` / `SPLIT=0` で切替可)
5. **ロジックは `scripts/dev.sh`、Makefile は薄く**: Make の各行が別シェルで動く制約を避け、
   対話・待機・整形をシェルスクリプトに集約する。make 未導入環境でも直接実行できる利点もある

## 完了条件

- `docker compose up` で portal が localhost:8000、admin が localhost:8001 で応答する
- `pnpm exec supabase start` でローカルスタックが起動する(Postgres:54322 / Studio:54323)
- `.env.example` と docs/LOCAL_DEV.md(セットアップ手順・cloudflared トンネル手順)がある
