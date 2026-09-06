# Task: 年度更新(学年+1・卒団アーカイブ)

Issue: [#83](https://github.com/kchan-lab/hoopo/issues/83) / Plan: [plan.md](plan.md)

- [x] REQUIREMENTS §5.2・§7 に year_rollovers を明記、スキーマ・マイグレーション 0005(RLS・GRANT・FORCE)
- [x] `year-rollover.ts`: status / execute / undo、管理 API 3ルート、Integration
- [x] 部員管理: 「年度更新を実行」を有効化(二段階確認・対象人数)、実行ログと「取り消す」、E2E
- [x] メインセッションで検証(Integration 130 / E2E 60+rollover)→ PR → CI → merge commit
