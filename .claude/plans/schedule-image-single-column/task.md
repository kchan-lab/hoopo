# Task: 予定表画像を縦1列に戻し、スマホ1画面に1か月が収まる縦長にする

Issue: [#215](https://github.com/kchan-lab/hoopo/issues/215) / Plan: [plan.md](plan.md)

## ドキュメント(実装より先)

- [x] `docs/REQUIREMENTS.md` §6 のレイアウト記述を縦1列・1:2.0 以内に更新する

## 実装

- [x] `packages/api/src/schedule-layout.ts`: 幅 1080・固定行・文字サイズ定数、2カラム関数の削除
- [x] `apps/portal/app/api/schedule/[month]/schedule-image.tsx`: 縦1列描画、複数コマは行内に縦に積む

## 検証

- [x] Unit: 高さ計算(28/30/31日)、複数コマでも高さが変わらない、31日で 1:2.0 以内
- [x] Integration: `packages/api/test/schedule-image.int.test.ts` の更新
- [x] E2E: `e2e/schedule-image.spec.ts` の寸法の期待値
- [x] 実画像を生成し、iPhone 16 相当(幅 393)に縮めて目視(31日・複数コマ・練習ゼロ・長い場所名)
- [x] `pnpm lint` / `pnpm typecheck` が green

## 仕上げ

- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #215`)

## 検証結果(実測)

| ケース | 寸法 | 縦横比 |
|---|---|---|
| 31日・練習ゼロ(2026-10) | 1080 × 2106 | 1:1.95 |
| 30日(2026-09) | 1080 × 2044 | 1:1.89 |
| 31日・1日2コマ/3コマ/長い場所名(2099-12) | 1080 × 2106 | 1:1.95(133KB) |

iPhone 16(幅 393pt)換算の文字サイズ: 日付 約16pt / 時間・場所 約13pt / 2コマの日 約9pt / 3コマの日 約6pt。
3コマの日は拡大しないと読みにくい(行を伸ばさない設計判断3とのトレードオフ。頻度が低いので許容)。
長い場所名「大阪市立住吉総合スポーツセンター体育館」は「…体…」の形で末尾が省略され、行は崩れない。

- Unit `pnpm test`: 301 passed
- Integration `pnpm test:int`: 246 passed。失敗1件は既存の #206(catalog.int.test.ts)
- E2E `pnpm test:e2e`: 123 passed / 4 skipped / 1 flaky(admin-attendance のモバイルのドロワー、再試行で通過。本変更と無関係)
