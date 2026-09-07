# Task: 出欠リマインド(手動+定期ジョブ)とバックアップジョブ

Issue: [#20](https://github.com/kchan-lab/hoopo/issues/20) / Plan: [plan.md](plan.md)

- [ ] `line-shared.ts` の本文、`line-send.ts` の sendAttendanceReminderToLine / runAttendanceReminderJob、`jobs-app.ts`、admin API、Integration
- [ ] 欠席者管理の「リマインドを送る」(二段階確認)、E2E
- [ ] `.github/workflows/attendance-reminder.yml` / `backup.yml`、`.env.example` の CRON_SECRET、docs/DEVELOPMENT.md の運用ジョブ節
- [ ] メインセッションで検証 → PR(`Closes #20`)→ CI → merge commit
