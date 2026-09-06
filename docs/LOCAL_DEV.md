# ローカル開発環境

ローカル開発は Docker に統一する(CLAUDE.md「技術スタック」)。本番ビルドは Vercel が行うため、
ここにあるのはすべて開発専用の構成。

## 前提

想定する開発環境は **Windows: WSL2 / Mac: そのまま(ターミナルは Ghostty を推奨)**。

- Docker(docker compose が使えること)
- Node.js 24+ / pnpm(Supabase CLI の実行と、コンテナ外で lint 等を回す場合に使用)
- make(WSL2 は既定で未導入 → `sudo apt-get install -y make` / Mac は Xcode Command Line Tools に同梱。
  無くても `bash scripts/dev.sh …` で代替できる)
- tmux(任意。WSL2 でログをペイン分割したい場合に使う)

`make up` / `make dev` は起動前に必要なコマンドを確認し、足りなければ**その環境向けの導入コマンド**を
表示して止まる(例: WSL2 なら `sudo apt-get install -y make`、Mac なら `xcode-select --install`)。
Docker デーモンが起動していない場合もその旨を表示する。

## クイックスタート

```bash
make up
```

起動するサービスを対話で選ぶ。**そのまま Enter を押せば portal + admin が起動する。**

```
  1) portal     保護者向けアプリ    http://localhost:8000
  2) admin      管理者向けアプリ    http://localhost:8001
  3) supabase   DB スタック         Studio :54323 / API :54321 / Postgres :54322
  a) すべて (1,2,3)

選択 [複数可・カンマ区切り / Enter で 1,2] >
```

- 複数選びたいときはカンマ区切り(例: `1,3` = portal + DB)
- 選択後は `make dev SERVICES="…"` が実行され、起動完了後に接続先の一覧が表示される

### make のコマンド一覧

| コマンド | 内容 |
|---|---|
| `make up` | 対話で選んでから起動(Enter で portal + admin) |
| `make dev` | 選択せずに起動(既定: portal + admin) |
| `make dev SERVICES="portal supabase"` | サービスを直接指定して起動 |
| `make down` | すべて停止(アプリ + Supabase) |
| `make logs` | ログを追う |
| `make urls` | 接続先の一覧を表示 |
| `make help` | コマンド一覧 |

### ログのペイン分割(1ウィンドウで各サービスのログを並べる)

開発環境は **Windows は WSL2、Mac は Ghostty** を想定する(Ghostty は Windows 版が無いため)。

| 環境 | 分割のしかた |
|---|---|
| **WSL2(Windows)** | `tmux` を使う。`tmux` の中で `make dev` を実行すると自動でペイン分割される。tmux の外からなら `make dev SPLIT=tmux`(`hoopo` セッションを作ってアタッチ) |
| **Mac(Ghostty)** | Ghostty の分割機能をそのまま使う。`Cmd+D`(右)/ `Cmd+Shift+D`(下)で分割し、各ペインで `make logs SERVICES=portal` のようにサービスを指定して実行する。`make dev` はこの手順を画面に表示する |
| **Mac(Ghostty + tmux)** | WSL2 と同じく `make dev SPLIT=tmux` で自動分割。手順を揃えたいときはこちら |

分割したくないときは `make dev SPLIT=0`。

> Ghostty の分割は**ターミナル側のキーバインドで行う**。外部のプロセス(WSL 内のスクリプトなど)から
> Ghostty のウィンドウを分割する手段は用意されていないため、自動分割が必要なら tmux を使う。

## 各サービスの接続先

| サービス | URL | 備考 |
|---|---|---|
| portal(保護者向け) | http://localhost:8000 | |
| admin(管理者向け) | http://localhost:8001 | |
| Supabase Studio | http://localhost:54323 | DB の管理UI |
| Supabase API | http://localhost:54321 | REST / Auth |
| Postgres | postgresql://postgres:postgres@localhost:54322/postgres | |
| Mailpit | http://localhost:54324 | 送信メールの確認 |

**コンテナ内(portal / admin)から Supabase を参照するときは `localhost` ではなく
`host.docker.internal` を使う**(compose.yaml の `extra_hosts` で解決。`.env` は設定済み)。
ホストから直接叩くとき(drizzle-kit 等)は `localhost` に読み替える。

## 補足

- 初回はイメージビルドとコンテナ内 `pnpm install` が走るため数分かかる
- ソースは bind mount しているので、編集は即座にホットリロードされる
- 依存を追加したら `docker compose up -d --force-recreate deps portal admin`(one-shot の `deps` サービスが `pnpm install` を一度だけ実行してから各サービスを起動する。`up -d` だけでも終了済みの deps は再実行される(Docker Compose 5.5 で実測)が、確実に走らせるため `--force-recreate deps` を付ける。`restart` では deps が走らない)
- 依存にネイティブビルド(node-gyp 等)を伴うものを足すときは注意: deps が入れた node_modules は E2E の playwright コンテナ(別イメージ)とも共有しており、ABI 不一致で壊れる可能性がある
- Supabase CLI は devDependency で導入済み(バージョン固定)。CLI が専用の Docker コンテナ群を
  起動するため、アプリの compose.yaml には含めていない
- `.env` は `make up` で supabase を選ぶと `.env.example` から自動生成され、空の
  `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` に実際の値が入る(既存の値は上書きしない)
- `supabase/config.toml` が参照する `seed.sql` は**まだ存在しない**(シードデータは
  Drizzle スキーマと一緒に Issue #6 で作成する。存在しない間は単にスキップされる)
- スキーマ・マイグレーションは Drizzle Kit で管理する(Issue #6)。`supabase db push` と手動 SQL は禁止(CLAUDE.md)

### make を使わない場合

```bash
docker compose up -d portal admin   # アプリ
pnpm exec supabase start            # DB
bash scripts/dev.sh select          # 対話メニュー(make up と同じ)
```

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

- **ポートが使われている**: ホスト側で `pnpm dev` を直接動かしたまま起動すると 8000/8001 が衝突する。どちらか一方にする
- **コンテナ内の node_modules がおかしい**: `docker compose down -v` で named volume ごと作り直す
- **Supabase が起動しない**: `pnpm exec supabase stop --no-backup` してから再度 `start`
- **`make: command not found`**: `sudo apt-get install -y make`(または `bash scripts/dev.sh select`)
- **`Volta error: Could not find executable "pnpm"`**: Volta は pnpm の shim(入口)だけを先に置くため、
  事前チェックは通るのに実行時に失敗する。`volta install pnpm` で実体を入れる(バージョンは
  package.json の `packageManager` に合わせる)
