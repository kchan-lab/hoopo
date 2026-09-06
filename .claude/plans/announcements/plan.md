# Plan: お知らせ(作成→閲覧)(縦切り6a)

Issue: [#25](https://github.com/kchan-lab/hoopo/issues/25)(親: [#16](https://github.com/kchan-lab/hoopo/issues/16))
Sub-issue: [#86](https://github.com/kchan-lab/hoopo/issues/86)(6a-1: admin 管理)/ [#87](https://github.com/kchan-lab/hoopo/issues/87)(6a-2: portal 一覧・詳細)
設計の正: docs/REQUIREMENTS.md §4.2-3(ホームのお知らせ一覧)/ §5.2(お知らせ管理)/ §6(notify_line)/ §7(announcements) / docs/DESIGN_GUIDELINES.md §1.3(ホームの .news 行)・§2.3
視覚の正: docs/wireframes/wireframes-v6.html(portal スライド4 ホームの「お知らせ」news 行)。admin 側のワイヤーは無いので既存の管理画面の部品(acard / afld / abtn / 二段階確認)で組む

## 目的

コーチがお知らせを下書き・公開・編集・削除でき、保護者のホームに公開済みが新しい順で並び、タップで本文を読める
ところまで貫通させる。スキーマは #6 の announcements(title / body / notify_line / published_at)をそのまま使い、
新規マイグレーションはなし。LINE への実送信は 6c(#27)。

## 方針

```
[コーチ(admin)] お知らせ管理 /announcements : 一覧(公開/下書きの表示、新しい順)+ 作成・編集フォーム
                (タイトル / 本文 / LINEへ通知する / 「下書き保存」「公開する」)、削除は二段階確認
[保護者(portal)] ホームの「お知らせ」: 公開済みを新しい順に最大5件(タイトル+日付)→ /announcements/[id] で本文
                 一覧ページ /announcements(公開済みすべて)
```

### API 契約(6a-1 と 6a-2 が並列で実装するため先に固定する)

共通: `packages/api/src/announcements-shared.ts`(実装済み)— `parseAnnouncementInput`(title ≤100 / body ≤2000 /
notifyLine / publish)、`formatShortDate`。

**6a-2 保護者 API**(`packages/api/src/app.ts`。ロジックは `announcements-guardian.ts`)
- `GET /announcements?limit=` → `{ announcements: [{ id, title, publishedAt }] }`。公開済み(published_at ≤ now)を
  published_at 降順。limit は 1〜50、省略時 20
- `GET /announcements/:id` → `{ announcement: { id, title, body, publishedAt } }`。下書き・他チームは 404
- 関数: `listPublishedAnnouncements(teamId, limit)`, `getPublishedAnnouncement(teamId, id)`

**6a-1 管理 API**(`packages/api/src/admin-app.ts`。ロジックは `announcements-coach.ts`)
- `GET /announcements` → `{ announcements: [{ id, title, body, notifyLine, publishedAt, createdAt, updatedAt }] }`
  下書きを含み、published_at 降順(null=下書きは先頭)→ created_at 降順
- `POST /announcements` body: `AnnouncementInput` → 201 `{ announcement }`。`publish: true` なら published_at = now()
- `PUT /announcements/:id` body: `AnnouncementInput` → `{ announcement }`。`publish: true` で未公開なら published_at = now()
  (公開済みは維持)、`publish: false` で下書きに戻す(published_at = null)
- `DELETE /announcements/:id` → 204。他チーム・不在は 404
- 関数: `listAnnouncementsForCoach(teamId)`, `createAnnouncement(teamId, input)`, `updateAnnouncement(teamId, id, input)`,
  `deleteAnnouncement(teamId, id)`

### 設計判断

1. **公開の意味は published_at の有無**: 下書き(null)は保護者に見えない。公開日時は「公開した瞬間」で、
   編集しても維持する(並び順が動かない)。下書きに戻すと null にして再公開で新しい日時になる
2. **notify_line は保存するだけ**: 実送信と通数の計上は 6c。管理画面には「公開時に LINE へ通知(6c で有効化)」と
   明記し、フラグだけ残す。通数原則(絶対原則3)に関わる送信は 6c で設計する
3. **ホームは最新5件、全件は一覧ページ**: ホームの情報量を抑える(ワイヤーは2行)。一覧ページは
   タブバーには置かず、ホームの「すべて見る」から遷移する
4. **本文はプレーンテキスト(改行のみ反映)**: Markdown やリンクの自動化は入れない。XSS 面でも安全
5. **管理ナビに「お知らせ」を追加**(REQUIREMENTS §5.1 / DESIGN §2.3 を先に更新済み): サイドバーの末尾、アイコンは note
6. **実行体制**: 共通モジュールと API 契約はメインセッション、6a-1 / 6a-2 は Opus のサブエージェントに
   worktree 分離で並列委譲。DB を使う検証と PR はメインが直列で行う

## スコープ外

- LINE 送信・通数カウンター(6c #27)、予定表画像(6b #26)
- 添付画像・Markdown

## 完了条件

- 管理で作成・公開したお知らせが保護者のホームと詳細に出て、下書きは見えない
- Unit(入力検証)/ Integration(両 API+RLS)/ E2E(管理で公開→保護者で表示→詳細)がグリーン
