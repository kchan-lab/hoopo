# Task: E2E の並列衝突をなくす

Issue: [#175](https://github.com/kchan-lab/hoopo/issues/175) / Plan: [plan.md](plan.md)

- [x] 原因の切り分け(月の衝突 / サーバーの劣化)
- [x] `e2e/unique-month.ts` を追加し、各スペックの `uniqueMonth` を差し替える
- [x] 全体 E2E を3回連続でリトライなし実行 → 全通過
- [x] docs: DEVELOPMENT.md に「ローカルで全体 E2E を回す前に portal / admin を再起動する」を書く
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #175`)
