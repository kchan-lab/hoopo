# Task: 予定表画像の動的生成(発行)(縦切り6b)

Issue: [#26](https://github.com/kchan-lab/hoopo/issues/26) / Plan: [plan.md](plan.md)

## 共通(メインセッション)

- [x] `schedule-shared.ts`(1日1行の組み立て・文字収集)+ Unit(2件)、空モジュールと index の export
- [x] `.env.example` に NEXT_PUBLIC_PORTAL_URL、API 契約を plan.md に固定
- [x] Sub-issue #90(6b-1)/ #91(6b-2)を起票し親 #26 に紐付け

## 6b-1: 発行 API + admin — #90 / feat/schedule-publish-admin(Opus サブエージェント)

- [ ] `schedule-publish.ts`: getPublishStatus / publishSchedule、管理 API 2ルート
- [ ] 日程管理画面: 「予定表を発行する」(二段階確認)、発行済み表示、プレビュー画像リンク。LINE 送信は無効のまま
- [ ] Integration(発行 API+RLS)/ E2E(発行→発行済み表示)
- [ ] メインセッションで統合・検証 → PR(`Refs #26` + `Closes #90`)→ CI → merge commit

## 6b-2: 予定表画像 — #91 / feat/schedule-image(Opus サブエージェント)

- [ ] `schedule-image.ts`: getScheduleImageData
- [ ] `apps/portal/app/api/schedule/[month]/route.ts`: next/og で PNG、フォントのサブセット取得、キャッシュヘッダ
- [ ] Integration(データ取得+RLS)/ E2E(画像取得 200 image/png、不正な month は 404)
- [ ] メインセッションで統合・検証 → PR(`Closes #26` + `Closes #91`)→ CI → merge commit
