# Plan: Supabase 停止対策 ping ジョブ

Issue: [#54](https://github.com/kchan-lab/hoopo/issues/54)
設計の正: CLAUDE.md 技術スタック(定期ジョブは GitHub Actions schedule)/ .claude/plans/db-schema-rls-seed/plan.md 設計判断16(Free 枠の制約)

## 目的

Supabase Free プロジェクト(hoopo-stg / hoopo-prod)が約1週間の無アクセスで自動一時停止するのを、
GitHub Actions の定期 ping で防ぐ。失敗時は Discord へ通知する。

## 方針

`.github/workflows/supabase-ping.yml` を新設。毎日1回、各環境の DB へ `SELECT 1` を実行する。
接続文字列が未設定の環境はスキップ(エラーにしない)し、設定済み環境の失敗のみジョブ失敗+通知とする。
これにより **#55(プロジェクト作成)前にマージしても毎日グリーンで走り**、承認者がシークレットを
設定した日から自動で実効化する。

### 設計判断

1. **ping は REST ヘルスチェックではなく DB への `SELECT 1`**: 停止判定に確実に効くのは DB 活動。
   API ゲートウェイの health エンドポイントだけでは DB 活動としてカウントされない可能性を排除する。
   psql は ubuntu-latest ランナーに同梱されておりセットアップコスト0(checkout も不要)
2. **接続はロールを固定しない専用シークレット**(`STG_PING_DATABASE_URL` / `PROD_PING_DATABASE_URL`):
   migrate 用の `STG_DATABASE_URL`(所有者)と名前を分け、用途を明確化する。stg は最小権限の
   `hoopo_app_stg` を推奨(RLS 配下で `SELECT 1` は可能)。prod は初回リリースまで
   `hoopo_app_prod` が存在しないため、それまでは postgres(所有者)の接続文字列を設定し、
   リリース後に `hoopo_app_prod` へ差し替える。接続は Supavisor(transaction mode, 6543)経由
3. **毎日実行(cron は分をずらして `23 21 * * *` = 6:23 JST)**: 週2回でも足りるが、schedule は
   遅延・スキップが起こりうるため毎日にして余裕を持たせる(public リポジトリで Actions 分数は無料、
   1回数秒)。毎正時はキュー混雑で遅延しやすいため分をずらす
4. **未設定はスキップ、設定済みの失敗のみ通知**: シークレットは #55(stg/prod 作成)と
   #10(Discord Webhook)の完了待ち。先にマージしても偽アラートを出さないため、未設定環境は
   `::notice` でスキップ。`DISCORD_WEBHOOK_URL` 未設定時の通知は Actions の失敗表示にフォールバック
5. **PGCONNECT_TIMEOUT=15 + timeout-minutes: 5**: 一時停止済みプロジェクトへの接続は
   ハングしうるため、接続タイムアウトとジョブ全体の上限を明示する

## 完了条件

- ワークフローがマージ後の schedule / workflow_dispatch で実行され、シークレット未設定でも
  グリーン(スキップ通知)で完走する
- シークレット設定後、stg/prod へ `SELECT 1` が届き、プロジェクトが一時停止しない(#55 完了後に実測)
- 設定済み環境の ping 失敗時、Discord(`DISCORD_WEBHOOK_URL` 設定時)へ実行リンク付きで通知される
