# Task: 出場メンバー2D配置(縦切り7b)

Issue: [#29](https://github.com/kchan-lab/hoopo/issues/29) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] `lineups-shared.ts`(ポジション・コート座標・入力検証)+ Unit(8件)、空モジュールと index の export、API 契約を plan.md に固定
- [x] Sub-issue #101(7b-1)/ #102(7b-2)を起票し親 #29 に紐付け

## 7b-1: 管理のチーム編成 — #101 / feat/lineups-admin(Opus サブエージェント)

- [x] `lineups-coach.ts`: getLineupForCoach / saveLineup、管理 API 2ルート、Integration
- [x] 日程管理の各行に「編成」→ /lineups/[practiceId](5枠セレクト+ベンチ、保存)、E2E
- [x] メインセッションで検証(Integration 149 / E2E 63+2)→ PR(`Refs #29` + `Closes #101`)→ CI → merge commit

## 7b-2: 保護者の出場メンバー 2D — #102 / feat/lineups-portal(Opus サブエージェント)

- [x] `lineups-guardian.ts`: getLineup / hasLineup、`GET /practices/:id/lineup`、Integration(`lineups-portal.int.test.ts`)
- [x] /practices/[id]/lineup(コート SVG・チップ・ベンチ)、練習詳細のボタン出し分け、E2E(`e2e/lineup.spec.ts`。編成の保存は 7b-1 の管理 API に依存)
- [x] メインセッションで検証(7b-1 と合わせて Integration 149 / E2E 63+2)→ PR(`Closes #29` + `Closes #102`)→ CI → merge commit
