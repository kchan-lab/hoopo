# Plan: リリース時の prod マイグレーション適用運用

Issue: [#53](https://github.com/kchan-lab/hoopo/issues/53)
設計の正: docs/DEVELOPMENT.md ブランチ戦略・リリースフロー / CLAUDE.md 開発ルール(破壊的操作は確認+実行ログ)/ .claude/plans/db-schema-rls-seed/plan.md 設計判断14・15

## 目的

prod DB へのマイグレーション適用を「初回リリース PR のタイミングで、誤爆なく、決まった手順で」実行できるようにする。スクリプト(`db:migrate:prod`)と手順書(docs/DEVELOPMENT.md)の両方を整備する。

## 方針

1. `packages/db/src/migrate.ts` に `prod` ターゲットを追加(`PROD_DATABASE_URL`、Supavisor 6543・`prepare: false` は stg と共通)
2. prod のみ**実行前の確認プロンプト**を挟む(接続先ホスト名を表示し、`prod` と手入力しないと中断)
3. docs/DEVELOPMENT.md のリリースフロー節に「prod マイグレーション適用」の具体手順を追記:
   ログインロール `hoopo_app_prod` の作成 SQL(初回のみ)/ 適用コマンドと実行タイミング / 失敗時の方針
4. ターゲット→接続先の解決ロジックを純関数に切り出し、Unit テストを追加(実装 PR にはテストを含める原則)

### 設計判断

1. **確認プロンプトは「prod と手入力」方式**: CLAUDE.md の「破壊的操作は確認ダイアログ」の CLI 版。
   `--yes` フラグ方式はコピペやシェル履歴で事故るため退けた。CI からは実行しない前提
   (prod 適用は人間がリリース手順の中で行う)ので、非対話環境では確認できず失敗する挙動が正しい。
   実行ログはコンソール出力+リリース PR / release: PR に適用済みチェックを記録することで残す
2. **接続 URL は `PROD_DATABASE_URL`**: stg(`STG_DATABASE_URL`)と同じ命名規則。`.env` ではなく
   `.env.prod` 等の別ファイル(コミット禁止)に置き、`--env-file-if-exists` の対象を増やさない
   (普段のコマンドが誤って prod を読まないよう、実行時に `node --env-file=.env.prod` を明示する運用)
3. **適用タイミングは「リリース PR の CI グリーン後・マージ前」**: マージで Vercel 本番デプロイが
   自動で走るため、「マージ直後に人間が適用」では新コードが先に出る競合が起きうる(#57 レビュー
   指摘)。後方互換(additive)原則により先に適用しても旧コードは影響を受けないので、適用→マージ
   の順序で保証する。非互換変更は expand→migrate→contract に分割する方針を docs に明記
4. **DB のロールバックはしない(forward-fix)**: Free プランは PITR がなく down migration も
   管理していない。障害時はアプリを Vercel の過去デプロイ再昇格で戻し、DB は前方修正で対処する。
   これを手順書に明記して「戻せる前提」の運用を防ぐ
5. **ロール作成は初回のみの手動 SQL**: パスワードをコードに置かない原則(db-schema-rls-seed
   設計判断2d)を踏襲。`GRANT hoopo_app` + `ALTER ROLE ... SET search_path = public, extensions,
   pg_temp`(ロール別設定は GRANT で継承されないため)をセットにした SQL を docs に記載する

## 完了条件

- `pnpm db:migrate:prod` が確認プロンプト付きで動作する(接続前に中断できる)
- `local` のローカル限定ガード・`stg`/`prod` の env 名解決が Unit テストで固定されている
- docs/DEVELOPMENT.md にリリース時の prod 適用手順(ロール作成・適用・失敗時方針)が記載されている
- 初回リリースはこの手順書どおりに実行できる(実際の適用は初回リリース PR で。#55 の prod
  プロジェクト作成が前提)
