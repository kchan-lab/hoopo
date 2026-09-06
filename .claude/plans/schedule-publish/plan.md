# Plan: 予定表画像の動的生成(発行)(縦切り6b)

Issue: [#26](https://github.com/kchan-lab/hoopo/issues/26)(親: [#16](https://github.com/kchan-lab/hoopo/issues/16))
Sub-issue: [#90](https://github.com/kchan-lab/hoopo/issues/90)(6b-1: 発行 API + admin)/ [#91](https://github.com/kchan-lab/hoopo/issues/91)(6b-2: 予定表画像エンドポイント)
設計の正: docs/REQUIREMENTS.md §5.2(日程管理)・§6(予定表画像)・§2(二層ブランディング)・§7(practices.published_at) / CLAUDE.md 技術スタック(画像は動的生成)・開発ルール(破壊的操作は確認+実行ログ)
視覚の正: §6「1ヶ月を1日1行、練習日に時間+学校名。現行アプリ『縦型カレンダー』の体裁を踏襲」。細部は §10 未決(スクリーンショット待ち)なので、まず素直な縦型で作り、共有され次第合わせる

## 目的

コーチが月の練習を「発行」して確定し、その月の予定表画像を DB から動的に生成する。LINE への送信と通数は 6c(#27)。
画像は固定パス(`/api/schedule/YYYY-MM.png`)で公開し、LINE の originalContentUrl と CDN キャッシュに使える形にする。

## 方針

```
[コーチ(admin)] 日程管理: 「予定表を発行する」(二段階確認)→ POST /schedule/publish { month }
                → その月の practices.published_at = now()。発行済みなら「再発行」。画面に「発行済み 9/6 10:00」と
                  プレビュー(portal の画像 URL)を表示。「LINE へ送信」は 6c まで無効
[画像(portal)] GET /api/schedule/YYYY-MM.png(認証なし・チームは env の TEAM_ID)
                → next/og(satori)で PNG を生成。ヘッダー=チーム名+「YYYY年M月 練習予定」、本文=1日1行(日付・曜日・時間・場所)、
                  フッター=powered by hoopo。Cache-Control: public, s-maxage=600, stale-while-revalidate=86400
```

### API 契約(6b-1 と 6b-2 が並列で実装するため先に固定する)

共通: `packages/api/src/schedule-shared.ts`(実装済み)— `buildScheduleRows(month, practices)`(月の全日を1行ずつ)、
`collectScheduleText(rows, extra)`(フォントのサブセット取得用)。

**6b-1 管理 API**(`packages/api/src/admin-app.ts`。ロジックは `schedule-publish.ts`)
- `GET /schedule/status?month=YYYY-MM` → `{ month, total, published, publishedAt: string | null }`
  total=月の練習数、published=published_at ありの数、publishedAt=最新の published_at
- `POST /schedule/publish` body `{ month }` → `{ month, published: number, publishedAt }`。月に練習が無ければ 400。
  全件の published_at を now() に更新(再発行も同じ)
- 関数: `getPublishStatus(teamId, month)`, `publishSchedule(teamId, month)`

**6b-2 画像**(`apps/portal/app/api/schedule/[month]/route.ts`。データは `packages/api/src/schedule-image.ts`)
- `getScheduleImageData(teamId, month)` → `{ month, monthLabel, teamName, rows: ScheduleRow[], hasPractices }`
  teamName は teams.name(withTeam で取得)。発行前でも生成できる(発行=確定の記録であり、画像の可否ではない)
- ルート: `[month]` は `YYYY-MM.png` のみ受け付け(それ以外 404)。`ImageResponse`(next/og)、幅 720px、
  行数に応じた高さ。フォントは Google Fonts の Noto Sans JP を `text=` 付きでサブセット取得し、
  モジュール内でキャッシュ。取得失敗時はフォント無しで描画(英数字のみ正しく出る)ではなく 503 を返して原因を明示

### 設計判断

1. **発行は「確定の記録」で、画像生成とは独立**: published_at を付けるだけで、画像は毎回 DB から生成する
   (CLAUDE.md 技術スタック「予定表は DB から動的生成」)。再発行は同じ操作で上書き
2. **画像エンドポイントは認証なし**: LINE が originalContentUrl を取得しに来るため。載せる情報は
   日付・時間・場所(学校名)のみで個人情報を含まない(備考は載せない。§6)。チームは env の TEAM_ID で決める
3. **next/og(Next 同梱)を使い、依存を増やさない**: satori / @vercel/og の追加は不要。日本語フォントは
   Google Fonts のサブセット(`css2?family=Noto+Sans+JP&text=...` → TTF)を実行時に取得してキャッシュする。
   リポジトリにフォントを同梱しない(サイズ)。Vercel の関数からの外向き fetch は無料枠内
4. **キャッシュは短め(s-maxage=600)+ stale-while-revalidate**: 固定パスのまま再発行を数分で反映させる。
   管理画面のプレビューは `?v=<publishedAt>` でキャッシュを避ける
5. **実行ログは published_at で表す**: 発行は破壊的操作ではない(取り消しは再入力で可能)。監査ログ用テーブルは
   LINE 送信(6c)で通数計上と合わせて設計する
6. **admin から portal の画像へは `NEXT_PUBLIC_PORTAL_URL` でリンク**: ホストが分かれているため env で結ぶ
7. **実行体制**: 共通モジュール・契約はメインセッション、6b-1 / 6b-2 を Opus サブエージェントに並列委譲。
   DB を使う検証と PR はメインが直列

## スコープ外

- LINE 送信・通数カウンター・送信ログ(6c #27)
- 画像デザインの細部(§10。スクリーンショット共有後に調整)

## 完了条件

- 発行で月の practices に published_at が付き、管理画面に発行済み表示とプレビューが出る
- `/api/schedule/YYYY-MM.png` が PNG を返す(練習が無い月も空の予定表として返す)
- Unit(行組み立て)/ Integration(発行 API+RLS)/ E2E(発行→画像取得 200 / image/png)がグリーン
