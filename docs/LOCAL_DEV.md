# ローカル開発環境

ローカル開発は Docker に統一する(CLAUDE.md「技術スタック」)。本番ビルドは Vercel が行うため、
ここにあるのはすべて開発専用の構成。

## 前提

- Docker(docker compose が使えること)
- Node.js 24+ / pnpm(Supabase CLI の実行と、コンテナ外で lint 等を回す場合に使用)

## アプリの起動(portal / admin)

```bash
docker compose up
```

| アプリ | URL |
|---|---|
| portal(保護者向け) | http://localhost:8000 |
| admin(管理者向け) | http://localhost:8001 |

- 初回はイメージビルドとコンテナ内 `pnpm install` が走るため数分かかる
- ソースは bind mount しているので、編集は即座にホットリロードされる
- 依存を追加したら `docker compose restart`(コンテナ起動時に毎回 `pnpm install` が走る)

## DB(Supabase ローカルスタック)

Supabase CLI は devDependency で導入済み(バージョン固定)。CLI が専用の Docker コンテナ群を
起動するため、アプリの docker-compose.yml には含めていない。

```bash
pnpm exec supabase start   # 初回はイメージ取得で数分かかる
pnpm exec supabase status  # 接続情報(URL・キー)を表示
pnpm exec supabase stop    # 停止
```

| サービス | URL |
|---|---|
| API | http://localhost:54321 |
| Postgres | postgresql://postgres:postgres@localhost:54322/postgres |
| Studio(管理UI) | http://localhost:54323 |

接続情報は `.env` に設定する:

```bash
cp .env.example .env
# supabase status の出力から SUPABASE_ANON_KEY 等を転記する
```

スキーマ・マイグレーションは Drizzle Kit で管理する(Issue #6)。`supabase db push` と手動 SQL は禁止(CLAUDE.md)。

## LIFF の実機確認(トンネル)

LIFF は HTTPS の公開 URL が必要なため、スマホ実機で確認するときはトンネルを張る:

```bash
# cloudflared(推奨・アカウント不要のクイックトンネル)
cloudflared tunnel --url http://localhost:8000
```

表示された `https://xxxx.trycloudflare.com` を LINE Developers の LIFF エンドポイント URL に
設定して実機から開く。URL は起動ごとに変わるので、固定 URL が必要になったらフェーズ1の
ドメイン取得後に stg 環境(Vercel)を使う。

cloudflared の導入(WSL/Ubuntu):

```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
```

## よくあるトラブル

- **ポートが使われている**: ホスト側で `pnpm dev` を直接動かしたまま `docker compose up` すると 8000/8001 が衝突する。どちらか一方にする
- **コンテナ内の node_modules がおかしい**: `docker compose down -v` で named volume ごと作り直す
- **Supabase が起動しない**: `pnpm exec supabase stop --no-backup` してから再度 `start`
