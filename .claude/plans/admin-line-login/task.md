# Task: 管理者の LINE ログイン

Issue: [#61](https://github.com/kchan-lab/hoopo/issues/61) / Plan: [plan.md](plan.md)

- [x] REQUIREMENTS §3・§7、.env.example、スキーマ・マイグレーション 0006(line_user_id / lookup・CHECK・一意)
- [x] `packages/line`: `exchangeAuthorizationCode`、verifier の nonce 対応、Unit
- [x] `packages/api`: `line-login.ts`(authorize URL・OAuth Cookie)、`coach-account.ts`、admin-app の start / callback / link 解除、Integration
- [x] `apps/admin`: /login のボタン有効化+エラー文言、/account(連携状態・連携・解除)、nav、route.ts の deps、E2E
- [x] メインセッションで検証(Integration 148 / E2E 64)→ PR(`Closes #61`)→ CI → merge commit
