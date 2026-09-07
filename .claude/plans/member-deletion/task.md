# Task: 卒団後のデータ削除フロー(#21 後半)

Issue: [#21](https://github.com/kchan-lab/hoopo/issues/21) / Plan: [plan.md](plan.md)

- [x] REQUIREMENTS §5.2・§7、`audit_logs`(マイグレーション 0009、RLS・GRANT・FORCE)
- [ ] `members.ts`: listArchivedMembers / deleteArchivedMember(cascade・孤立 guardian の削除・audit_logs)/ listAuditLogs、管理 API 3 ルート、Integration
- [ ] 部員管理: 「卒団した部員」一覧+「データを削除」(二段階確認)+「実行ログ」、E2E
- [ ] メインセッションで検証 → PR(`Closes #21`)→ CI → merge commit
