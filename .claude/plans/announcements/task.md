# Task: お知らせ(作成→閲覧)(縦切り6a)

Issue: [#25](https://github.com/kchan-lab/hoopo/issues/25) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] REQUIREMENTS §4.2-3・§5.1・§5.2 と DESIGN §2.3 を更新(お知らせ管理・詳細ページ・ナビ)
- [x] `announcements-shared.ts`(入力検証・日付表示)+ Unit(9件)、空モジュールと index の export、API 契約を plan.md に固定
- [x] Sub-issue #86(6a-1)/ #87(6a-2)を起票し親 #25 に紐付け

## 6a-1: 管理のお知らせ管理 — #86 / feat/announcements-admin(Opus サブエージェント)

- [x] `announcements-coach.ts`: list / create / update / delete、管理 API 4ルート
- [x] お知らせ管理画面(一覧+フォーム、公開/下書き、二段階確認の削除)、ナビに「お知らせ」
- [x] Integration(管理 API+RLS)/ E2E(作成→公開→編集→削除)
- [ ] メインセッションで統合・検証 → PR(`Refs #25` + `Closes #86`)→ CI → merge commit

## 6a-2: 保護者のお知らせ一覧・詳細 — #87 / feat/announcements-portal(Opus サブエージェント)

- [x] `announcements-guardian.ts`: listPublished / getPublished、保護者 API 2ルート
- [x] ホームのお知らせ一覧(最新5件+「すべて見る」)、一覧ページ、詳細ページ
- [x] Integration(保護者 API+RLS・下書き 404)/ E2E(管理 API で公開→ホーム→詳細)
- [ ] メインセッションで統合・検証 → PR(`Closes #25` + `Closes #87`)→ CI → merge commit
