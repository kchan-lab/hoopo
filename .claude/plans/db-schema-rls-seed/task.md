# Task: Supabase プロジェクト作成+Drizzle スキーマ・RLS・シード

Issue: [#6](https://github.com/kchan-lab/hoopo/issues/6) / Plan: [plan.md](plan.md)

PR は2本の Stacked PR(plan.md 方針。PR-B の base は PR-A ブランチ)。
承認者待ちで止まるのは最終検証のみで、実装はクラウドなしで進む。

## PR-A: スキーマ+マイグレーション+シード(`Refs #6`)

- [x] docs/REQUIREMENTS.md §7 を更新(ドキュメント先行): guardian_children に team_id、
      coaches の確定列(email / auth_type)、全テーブル共通 created_at/updated_at、
      teams は id 自身がテナント境界である旨、lineups の左右未確定を §10 へ追記
- [x] packages/db に drizzle-orm / drizzle-kit / postgres を導入。drizzle.config.ts
      (`entities.roles.provider = 'supabase'`)と `db:generate` / `db:migrate` / `db:seed` を定義。
      migrate/seed に「接続先がローカル以外なら abort」ガード、クラウドは `db:migrate:stg` に分離。
      root package.json にラッパースクリプトを追加
- [x] `.env.example` に `DATABASE_URL`(マイグレーション/シード用)と `APP_DATABASE_URL`
      (アプリ・テスト用)の2本を定義
- [x] スキーマ定義: 全12テーブル+enum(attendance/status/fee/role のみ。position・relation は
      text+CHECK)+複合 FK(親に UNIQUE(id, team_id))+一意制約・CHECK 一式(plan 判断5-8)。
      held_on は date、曜日は生成列、created_at/updated_at 全テーブル
- [x] line_user_id 暗号文列+`line_user_id_lookup`(UNIQUE(team_id, lookup))+平文拒否 CHECK
- [x] 招待コード生成関数(invite-code.ts)+ Unit テスト(文字種・長さ・重複耐性)
- [x] マイグレーション生成 → ローカル Supabase(54322)へ適用(生成 SQL を目視レビュー済み)
- [x] シードスクリプト(2チーム分)。`supabase/config.toml` の `[db.seed]` を無効化
- [x] renovate.json: `supabase` をグループから分離しバージョン固定
- [ ] PR-A 作成(base: development)→ CI グリーン → squash マージ。
      PR-B ブランチは PR-A ブランチから切って並行で積む

## PR-B: RLS+Integration テスト+CI(`Closes #6`)

- [x] カスタムマイグレーション: `hoopo_app` ロール(NOLOGIN/NOBYPASSRLS)作成+テーブル単位 GRANT
      (teams は SELECT/UPDATE のみ)+ anon/authenticated REVOKE + 全テーブル FORCE RLS +
      search_path 固定(drizzle/0001_app_role_and_rls.sql)
- [x] pgPolicy: 全テーブル FOR ALL、USING/WITH CHECK 両方明示、
      `(select nullif(current_setting('app.team_id', true),'')::uuid)` 方式。teams は `id =` 条件
- [x] SECURITY DEFINER 関数2本(resolve_invite_code / resolve_guardian_by_lookup、
      search_path 固定、EXECUTE は hoopo_app のみ)
- [x] client.ts: `withTeam(teamId, fn)` のみ公開(set_config は is_local=true・トランザクション内・
      バインドパラメータ・uuid 検証)。`APP_DATABASE_URL` のみ読む。Unit テスト(入力検証)
- [x] seed.ts を withTeam 経由に変更(RLS 配下で投入=WITH CHECK 検証を兼ねる。
      teams 行と TRUNCATE のみ所有者接続。ローカルログインロールは冪等に自動作成)
- [x] `supabase/config.toml` の `[db.pooler]` を有効化(transaction mode)
- [x] Integration テスト基盤: `*.int.test.ts` + 専用 vitest config(`fileParallelism: false`、
      接続未設定は fail-fast)。リセットは beforeEach の TRUNCATE+フィクスチャ再作成
      (withTeam が自前トランザクションを張るためロールバック方式は不成立と判明。
      直列実行+シャッフル耐性で同等の独立性を担保)。vitest.config.ts の exclude に追加済み
- [x] 必須ケース実装: ①越境 SELECT/INSERT/UPDATE/DELETE ②team_id 書き換え UPDATE
      ③GUC 未設定で全遮断 ④非 uuid 値で拒否 ⑤接続再利用+プーラ経由の GUC 残留なし
      ⑥平文 line_user_id 拒否 ⑦カタログメタテスト(計21ケース、シャッフル実行もグリーン)
- [x] ci.yml に `test-int` ジョブ追加(postgres:17 サービスコンテナ、timeout-minutes 15、
      `db:generate` 後の `git diff --exit-code` + `drizzle-kit check` の生成漏れ検知つき)
- [x] `.github/rulesets/development.json` と `main.json` の必須チェックに `test-int` を追加
      (適用はマージ後)
- [ ] PR-B 作成(base: PR-A ブランチ。A マージ後は base 自動付け替え →
      `git rebase --onto` で最新 development に載せ替え)→ CI グリーン
      (PR 上で test-int の実動作を確認できる)→ squash マージ

## 外部設定(承認者のアクション)

- [ ] Supabase Free プロジェクト `hoopo-stg` / `hoopo-prod` を作成(東京リージョン。
      リージョンは後から変更不可)
- [ ] stg の Supavisor(transaction mode, 6543)接続文字列を `.env` 系ファイルに設定
      (直結 5432 は使わない。ローカル用と別ファイルに分離し、コミットしない)
- [ ] stg にログインロール `hoopo_app_stg` を作成しパスワード設定(`GRANT hoopo_app TO ...` と
      `ALTER ROLE hoopo_app_stg SET search_path = public, extensions, pg_temp` を併せて実行。
      ロール別設定は GRANT では継承されないため。手順は PR-B のドキュメントに記載。
      prod はリリースフロー Issue で同手順)

## マージ後・検証

- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm test:int` がローカルでグリーン
      (テスト順序シャッフルでもグリーン)
- [ ] e2e-check(バックエンド節): supabase start → migrate → seed → アプリロールで実接続し
      「他チーム 0 行・越境 INSERT 拒否」を実データ確認。Studio 目視は RLS 有効フラグの補助確認。
      結果は Skill のフォーマットで報告(`pnpm test:e2e` 回帰は任意)
- [ ] PR-B マージ後: 両ルールセットを `gh api PUT` で再適用し `test-int` 必須化を確認
      (e2e-check Skill の「CI 変更はマージ後に実行結果を確認」に従い、development への
      次 PR で test-int が走ることも確認)
- [ ] stg へ `db:migrate:stg` で適用(適用前にダッシュボードで一時停止していないか確認。
      適用済みの正は `__drizzle_migrations`)。prod へは適用しない(初回リリース PR で)
- [ ] フォローアップ Issue を起票: ①リリース時の prod マイグレーション適用運用
      ②Supabase 停止対策 ping の前倒し
- [ ] Issue #6 の受入条件を見直してクローズ(ボードの Done は自動)
