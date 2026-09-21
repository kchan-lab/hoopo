# Task: 予定表画像を1画面に収まるレイアウトにする

Issue: [#204](https://github.com/kchan-lab/hoopo/issues/204) / Plan: [plan.md](plan.md)

## 前提の確認

- [x] LINE の画像メッセージのサイズ上限を確認する(幅 1024 に広げてよいか。設計判断3)
      → **画素数の上限は無い。**制約はファイルサイズのみ(originalContentUrl 10MB / previewImageUrl 1MB)。
        `line-shared.ts` は同じ URL を両方に渡すので実質 1MB 以内。実測は最大 143KB で余裕があり、
        幅は 1024 ではなく **1152** を採用した(1カラム 576px で長い場所名が収まる)

## ドキュメント(実装より先)

- [x] `docs/REQUIREMENTS.md` §6 の体裁の記述を2カラムに合わせて更新する
- [x] `docs/REQUIREMENTS.md` §10 の「予定表画像の細部デザイン(現行スクリーンショットの共有待ち)」を整理する

## 実装

- [x] `packages/api/src/schedule-layout.ts`: カラム分割関数を追加する(`ceil(日数/2)` で前半・後半)
- [x] `packages/api/src/schedule-layout.ts`: 高さ計算を「rows を受け取り左右の max を返す」形に作り直す
- [x] `packages/api/src/schedule-layout.ts`: `SCHEDULE_IMAGE_WIDTH` を確認結果に応じて更新する
- [x] 文字サイズを引き上げる(日付・曜日・時間・場所・ヘッダー)。行高さ `SCHEDULE_ROW_HEIGHT` も合わせて調整する
- [x] `apps/portal/app/api/schedule/[month]/schedule-image.tsx`: 2カラム描画にする(satori は flexbox のみ)
- [x] `apps/portal/app/api/schedule/[month]/route.ts`: 新しい幅・高さの受け渡しに合わせる

## 検証

- [x] Unit: カラム分割(28/29/30/31日)、高さ計算、複数コマで伸びる挙動
- [x] Integration: `packages/api/test/schedule-image.int.test.ts` の更新
- [x] E2E: `e2e/schedule-image.spec.ts` で PNG が返ること(必要なら寸法も)
- [x] ローカルで実画像を生成し、31日の月・複数コマの月・練習ゼロの月を目視で確認する
- [x] 文字サイズと縦横比の兼ね合いを実画像で詰める(定数を1回で当てにいかない)
- [x] `pnpm lint` / `pnpm typecheck` が green

## 仕上げ

- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #204`)

## 実装中に足した対応(plan.md に無かったもの)

- [x] 想定より長い場所名(例「大阪市立住吉総合スポーツセンター体育館」)で行が崩れる問題を直す。
      日付・曜日に `flexShrink: 0`、本文側に `flexBasis: 0 / minWidth: 0 / overflow: hidden` を入れ、
      場所名は `textOverflow: ellipsis` で1行に収める(折り返すと高さの計算とずれる)
- [x] 省略記号「…」をフォントのサブセット(`STATIC_TEXT`)に足す(無いと豆腐になる)

## 統合時の検証(メインセッションが実施)

ローカル DB を `supabase stop --no-backup` で作り直し、マイグレーション + シードを入れ直した状態で実施。

- Unit `pnpm test`: 297 passed
- Integration `pnpm test:int`: 246 passed。唯一の失敗 `packages/db/test/catalog.int.test.ts` は
  本ブランチの変更を `git stash` しても再現する既存問題(#206 として起票済み)
- E2E `pnpm test:e2e`: 124 passed / 4 skipped、失敗ゼロ(desktop + mobile)
- `pnpm typecheck` / `pnpm lint`: green

### 実画像での確認(実測)

| ケース | 寸法 | 縦横比 |
|---|---|---|
| 30日・練習あり(2026-09) | 1152 × 1152 | 1:1.000 |
| 31日・練習あり(2026-10) | 1152 × 1216 | 1:1.056 |
| 練習ゼロ(2026-11) | 1152 × 1152 | 1:1.000 |
| 長い場所名 + 1日2コマ(2026-11) | 1152 × 1186 | 1:1.030 |

- 「喜連西小学校(練習試合)」(本番の実データ)は省略されず1行に収まる
- 「大阪市立住吉第二中学校 第一体育館」は「第…」で省略。PNG をデコードして画素で測り、
  右余白が設計値どおり 16px であることを確認した
- 1日2コマの日は行が伸び、左右カラムの高いほうが画像の高さになっている
