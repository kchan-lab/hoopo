# Task: LINE グループ送信+通数カウンター(縦切り6c)

Issue: [#27](https://github.com/kchan-lab/hoopo/issues/27) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] REQUIREMENTS §5.2・§6・§7 更新、`line_messages`(マイグレーション 0007、RLS・GRANT・FORCE)
- [x] `line-shared.ts`(通数計算・本文)+ Unit、`packages/line/messaging.ts`(クライアント型+フェイク)、stub と export
- [x] Sub-issue #107(6c-1)/ #108(6c-2)を起票し親 #27 に紐付け

## 6c-1: 送信 API+管理 UI+通数メーター — #107 / feat/line-send-admin(Opus サブエージェント)

- [x] `line-send.ts`: usage / messages / sendSchedule / sendAnnouncement、管理 API 4 ルート、Integration
- [x] 日程管理・お知らせ管理の「LINE へ送信」(二段階確認・送信ログ)、ダッシュボードのメーター、E2E
- [x] メインセッションで検証(Integration 182 / E2E 72)→ PR(`Closes #27` + `Closes #107`)→ CI → merge commit

## 6c-2: Webhook・送信クライアント — #108 / feat/line-send-webhook(Opus サブエージェント)

- [x] `packages/line`: webhook.ts(署名検証・イベント解析)、messaging-http.ts(push・参加人数)、Unit
- [x] portal `POST /line/webhook` + `line-group.ts`(join/leave で teams.line_group_id)、Integration
- [x] メインセッションで検証(Integration 173)→ PR(`Refs #27` + `Closes #108`)→ CI → merge commit
