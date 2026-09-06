# Task: 月謝(封筒グリッド両面)(縦切り5)

Issue: [#15](https://github.com/kchan-lab/hoopo/issues/15) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] `fees-shared.ts`(3状態の導出・年/トグル入力の検証)+ Unit(4件)
- [x] マイグレーション 0004: `generate_fee_records(year, month)` / `generate_current_fee_records()`(冪等・hoopo_app に EXECUTE)
- [x] ジョブ `.github/workflows/fee-records.yml`(毎月1日 00:10 JST、ping と同じシークレット)
- [x] `.env.example` に FEE_AMOUNT_YEN / FEE_NOTE、API 契約を plan.md に固定、空モジュールと index の export
- [x] Sub-issue #81(5a)/ #82(5b)を起票し親 #15 に紐付け
- [x] Integration: DB 関数の冪等性・対象外・アプリロールからの呼び出し(packages/db/test/fee-records.int.test.ts、3件)

## 5a: 保護者の月謝確認 — #81 / feat/fees-portal(Opus サブエージェント)

- [ ] `fees-guardian.ts`: getFeeSheet / 保護者 API `GET /fees`
- [ ] 月謝確認画面(封筒グリッド 4列、済/未/未来のスタンプ、年切替、お子さん切替、金額・注記)、タブバー「月謝」を有効化
- [ ] Integration(保護者 API+RLS)/ E2E(管理 API で済にする→保護者で済に見える)
- [ ] メインセッションで統合・検証 → PR(`Refs #15` + `Closes #81`)→ CI → merge commit

## 5b: 管理の月謝管理 — #82 / feat/fees-admin(Opus サブエージェント)

- [ ] `fees-coach.ts`: getFeeGrid / setFeeStatus、管理 API `GET /fee-grid` / `PUT /fee-records`
- [ ] 月謝管理画面(PC=部員×12月の表、モバイル=部員セレクト+4列グリッド、セルで済⇄未、年切替)、ナビ有効化
- [ ] Integration(管理 API+RLS)/ E2E(済⇄未 → 再表示で保持)
- [ ] メインセッションで統合・検証 → PR(`Closes #15` + `Closes #82`)→ CI → merge commit
