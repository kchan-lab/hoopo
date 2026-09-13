# Task: 管理者ログインの試行回数制限

Issue: [#65](https://github.com/kchan-lab/hoopo/issues/65) / Plan: [plan.md](plan.md)

- [x] REQUIREMENTS §3・§7、スキーマ・マイグレーション 0008(failed_login_count / locked_until)
- [x] `login-lockout-shared.ts`(定数・状態遷移)+ Unit、`POST /auth/login` の判定・更新、Integration
- [x] メインセッションで検証(Integration 190 / E2E ログイン 7)→ PR(`Closes #65`)→ CI → merge commit
