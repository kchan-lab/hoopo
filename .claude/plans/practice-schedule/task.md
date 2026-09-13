# Task: 日程管理と日程リスト/カレンダー(縦切り3)

Issue: [#13](https://github.com/kchan-lab/hoopo/issues/13) / Plan: [plan.md](plan.md)

## 3a: 管理の日程管理 — #71 / feat/practice-schedule

- [x] packages/api: `tokyo-date.ts`(今日・月範囲・曜日・格子)+ `practices-shared.ts`(入力検証)+ Unit(15件)
- [x] packages/api: `practices.ts`(月一覧・作成・更新(メニュー全置換)・削除・詳細・次回)
- [x] 管理 API: `GET /practices?month` / `POST /practices` / `PUT /practices/:id` / `DELETE /practices/:id`
      (Route Handler に PUT / DELETE のエクスポートを追加)
- [x] 日程管理画面: 月セレクタ・行の表示/編集切替・メニュー編集・二段階確認の削除。発行/通数は無効表示
- [x] Integration: CRUD・メニュー全置換・別月の除外・RLS 越境(4件)/ E2E: 登録→編集→削除、月切替と入力エラー(2件×2端末)
- [x] e2e-check: Unit 87 / Integration 53 / E2E 23 passed(2026-09-06)。
      注: ルートグループ配下に新しいディレクトリを足したときは next dev(compose)が 404 を返すことがあるので admin を再起動する
- [ ] PR(`Refs #13` + `Closes #71`)→ CI → merge commit でマージ

## 3b: 保護者の日程リスト/カレンダー — #72 / feat/practice-calendar

- [x] 保護者 API: `GET /practices?month` / `GET /practices/next` / `GET /practices/:id`(子ども未連携でも閲覧可)
- [x] タブバー(5ボタン。月謝/チーム/提出は無効)+ 日程画面(リスト ⇄ カレンダー、Cookie 保存。
      カレンダーの日付タップは ?day= で選択して下のカードに表示)+ 練習詳細ページ + ホームの次回練習
- [x] Integration: 一覧・次回・詳細・他チーム 404(2件)/ E2E: コーチ API で作成→保護者のリスト→カレンダー→
      詳細(メニュー)→戻ると表示形式が記憶、ホームの次回練習とタブバー(2件×2端末)
- [x] e2e-check: Unit 87 / Integration 55 / E2E 27 passed(2026-09-06)。
      注: 詳細→一覧の戻りリンクは `view=` を明示する(クライアントのルーターキャッシュに古い一覧が残るため)
- [ ] PR(`Closes #13` + `Closes #72`)→ CI → merge commit でマージ
