# hoopo(フーポ)

**hoopo − ミニバスれんらくポータル**

ミニバスケットボールチームの保護者連絡(練習日程・出欠・月謝・お知らせ)を、LINEグループ運用から
1つのWebアプリ(LIFF)へ移行するプロジェクト。保護者はLINEグループのリンクをタップするだけで開き、
コーチは管理画面の操作だけで連絡・集計が完結する状態を目指す。

- 運営: コーチ個人(所属チームでの無償運営)。ランニングコストは原則0円
- 画面の主役はチーム(SKC粉浜・北粉浜ミニバスケットボール)。hoopoは「powered by hoopo」に控える二層ブランディング
- 将来: 他チームへ横展開するヘッドレス型プラットフォーム(API一元提供+UI SDK配布)構想の第一歩

## ドキュメント

仕様変更は必ずドキュメントを更新してから実装する。

| ドキュメント | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 憲法。絶対原則・技術スタック・開発ルール(実装前に必読) |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 要件定義書(仕様の正) |
| [docs/DESIGN_GUIDELINES.md](docs/DESIGN_GUIDELINES.md) | UIデザイン規範(トークン・コンポーネント規約) |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 開発プロセス・テスト戦略・ブランチ戦略 |
| [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) | ローカル開発環境のセットアップ・起動手順 |
| [.claude/plans/](.claude/plans/) | Issueごとの実装プラン(plan.md / task.md) |

## 技術スタック

Next.js (App Router) + Hono / TypeScript (strict) / Biome / Supabase (PostgreSQL) + Drizzle ORM /
LIFF・LINEログイン / Vercel (Hobby) + Cloudflare。詳細は [CLAUDE.md](CLAUDE.md) を参照。

## モノレポ構成

```
apps/portal        … 保護者向け (Next.js, LIFF)     → localhost:8000
apps/admin         … 管理者向け (Next.js)           → localhost:8001
packages/api       … Hono ルート定義
packages/db        … Drizzle スキーマ・マイグレーション・RLSポリシー
packages/ui        … 共有UIプリミティブ
packages/line      … LINE/LIFF クライアント(署名検証・通数計算)
docs/              … 要件定義・設計・開発ガイド
.github/workflows  … CI/CD・定期ジョブ
```

## クイックスタート

### 前提(ホスト環境に入れておくもの)

| ツール | 必須? | 備考 |
|---|---|---|
| Docker | 必須 | docker compose (V2) が使えること。Mac / WSL2 は Docker Desktop |
| Node.js + pnpm | Supabase利用時必須 | ローカルDBスタック(`pnpm exec supabase`)の実行に使う(portal / admin のコンテナ実行だけなら不要)。バージョンは [package.json](package.json) の `engines` / `packageManager` が正。**Volta利用時は `volta install pnpm` で実体を入れる**(shimだけだと `pnpm exec` が実行時に失敗する)。Supabase CLI は devDependency で入るためホスト導入は不要 |
| make | 推奨 | `make up` / `make dev` の入口に使う(無くても `bash scripts/dev.sh` で代替可)。Mac: Xcode Command Line Tools に同梱 / WSL2: `sudo apt-get install -y make` |
| curl | 必須 | 起動確認(HTTP応答待ち)に使用。Mac / WSL2 (Ubuntu) は通常同梱 |
| gh (GitHub CLI) | 開発運用 | Issue / PR / GitHub Projects の運用(`.claude/skills/`)に使用。アプリの起動だけなら不要 |
| tmux | 任意 | ログのペイン分割(`make dev SPLIT=tmux`)に使う |
| cloudflared | 任意 | LIFF のスマホ実機確認用トンネル(手順は [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)) |

導入手順の詳細・トラブルシュートは [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) を参照。
`make up` は起動前に必要コマンドを確認し、足りなければ環境別の導入コマンドを表示して止まる。

### 起動

ローカル開発はDockerに統一している。詳細は [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) を参照。

```bash
make up
```

起動するサービスを対話で選ぶ(そのままEnterでportal + adminが起動)。

| サービス | URL |
|---|---|
| portal(保護者向け) | http://localhost:8000 |
| admin(管理者向け) | http://localhost:8001 |
| Supabase Studio | http://localhost:54323 |

## 開発フロー

- ブランチ: `feat/xxx` → `development`(=stg)→ `main`(=prod、リリースPR)。マージはすべて merge commit(squash しない)
- コミットは Conventional Commits。PRは小さく、CIグリーンが必須
- テストは Unit / Vitest・Integration / ローカルSupabase・E2E / Playwright の3層
- タスク管理は [GitHub Projects](https://github.com/orgs/kchan-lab/projects/13)。Issueドリブンで `.claude/plans/` にプランを残す

詳細は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照。
