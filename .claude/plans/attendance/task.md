# Task: 参加予定の提出 → 出欠管理・欠席者管理(縦切り4)

Issue: [#14](https://github.com/kchan-lab/hoopo/issues/14) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] `attendances-shared.ts`(3値+未回答・コメント規則・巡回・入力検証)+ Unit(9件)
- [x] API 契約を plan.md に固定、`attendances-guardian.ts` / `attendances-coach.ts` の空モジュールと index の export
- [x] Sub-issue #76(4a)/ #77(4b)を起票し親 #14 に紐付け

## 4a: 保護者の提出 — #76 / feat/attendance-portal(Opus サブエージェント)

- [x] `attendances-guardian.ts`: getAttendanceSheet / submitAttendance / getUnansweredSummary
- [x] 保護者 API: `GET /attendance` / `PUT /attendance` / `GET /attendance/summary`
- [x] 提出画面(リスト ⇄ カレンダー、お子さん切替、一括チップ、CTA「回答 n / m 件」)、ホームの未提出アラート、
      練習詳細の「参加予定を変更する」を有効化、タブバー「提出」を有効化
- [x] Integration(保護者 API+RLS+未連携の子は 404)/ E2E(提出→再表示・形式切替)
- [ ] メインセッションで統合・検証 → PR(`Refs #14` + `Closes #76`)→ CI → merge commit

## 4b: 管理の出欠・欠席者 — #77 / feat/attendance-admin(Opus サブエージェント)

- [x] `attendances-coach.ts`: getAttendanceMatrix / getAbsentees
- [x] 管理 API: `GET /attendance-matrix` / `GET /absentees`
- [x] 出欠管理画面(マトリクス・△のコメント)、欠席者管理画面(日付ピル・3グループ)、ナビ有効化
- [x] Integration(管理 API+RLS)/ E2E(API で提出→マトリクス・欠席者に反映)を作成
      (E2E は 4a の `PUT /api/attendance` に依存するため、実行はメインセッションで統合後)
- [ ] メインセッションで統合・検証 → PR(`Closes #14` + `Closes #77`)→ CI → merge commit
