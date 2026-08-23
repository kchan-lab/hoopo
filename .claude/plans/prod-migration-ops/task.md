# Task: リリース時の prod マイグレーション適用運用

Issue: [#53](https://github.com/kchan-lab/hoopo/issues/53) / Plan: [plan.md](plan.md)

- [x] migrate.ts: ターゲット→接続先の解決を純関数(`resolveMigrateTarget`)へ切り出し
- [x] migrate.ts: `prod` ターゲット追加(`PROD_DATABASE_URL`)+ prod のみ確認プロンプト
      (ホスト名表示 → `prod` と手入力で続行、それ以外は中断)
- [x] package.json(root / packages/db)に `db:migrate:prod` を追加
- [x] .env.example に `PROD_DATABASE_URL` の説明コメントを追記(値は `.env.prod` 等・コミット禁止)
- [x] docs/DEVELOPMENT.md リリースフロー節に prod 適用手順を追記:
      ①初回のみ `hoopo_app_prod` 作成 SQL(GRANT + search_path)②適用タイミング(リリース PR
      マージ直後)③後方互換原則 ④失敗時は forward-fix(DB は戻さない・アプリは Vercel 再昇格)
- [x] Unit テスト: `resolveMigrateTarget` の local ガード / stg / prod / 不明ターゲットのケース
- [x] 検証: `pnpm db:migrate`(ローカル)が従来どおり動作、`db:migrate:prod` が確認プロンプトで
      中断できること(prod 未作成のため実接続はしない)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #53`)
