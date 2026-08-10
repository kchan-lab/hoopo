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
| [docs/plans/](docs/plans/) | Issueごとの実装プラン(plan.md / task.md) |

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

ローカル開発はDockerに統一している。前提や詳細は [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) を参照。

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

- ブランチ: `feat/xxx` → `development`(=stg、squashマージ)→ `main`(=prod、リリースPR)
- コミットは Conventional Commits。PRは小さく、CIグリーンが必須
- テストは Unit / Vitest・Integration / ローカルSupabase・E2E / Playwright の3層
- タスク管理は [GitHub Projects](https://github.com/orgs/kchan-lab/projects/13)。Issueドリブンで `docs/plans/` にプランを残す

詳細は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照。
