# Task: 日程管理をカレンダーからまとめて登録できるようにする

Issue: [#135](https://github.com/kchan-lab/hoopo/issues/135) / Plan: [plan.md](plan.md)

## 135a: API(feat/schedule-bulk-entry-api)

- [x] `practices-shared.ts` に `parseBulkPracticeInput`(日付配列の検証・同月・件数上限・重複除去)
- [x] `practices.ts` に `createPracticesBulk`(1 トランザクション)と `listPracticePresets`(直近 6 か月の集計)
- [x] `admin-app.ts` に `POST /practices/bulk` と `GET /practices/presets`
- [x] Unit(日付検証・月またぎ・件数上限)と Integration(まとめ作成・ロールバック・プリセット集計・他チーム不可視)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #141`)

## 135b: admin UI(feat/schedule-bulk-entry-admin)

- [ ] 日程管理にカレンダー表示を追加(既存の行一覧と切り替え or 併置)
- [ ] 日付の複数選択、曜日見出しでその曜日をまとめて選択/解除
- [ ] 選択バー: プリセット選択 + 開始・終了・場所・備考 → まとめて追加
- [ ] すでに練習がある日の区別と注意表示
- [ ] E2E(曜日まとめ選択 → プリセット適用 → 登録、既存の行編集・発行が壊れていないこと)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #142`)

## 仕上げ

- [ ] docs/REQUIREMENTS.md §5.2 の日程管理の記述を更新(カレンダーからのまとめ登録とプリセット)
- [ ] stg で実機確認(月の練習を 2 タップ+保存で作れること)
