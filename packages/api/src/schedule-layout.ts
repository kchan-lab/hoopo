// 予定表画像のレイアウト定数(DB 非依存)。描画は apps/portal 側の next/og が行うが、
// 「幅・高さ・文字サイズ」は rows から決まる純粋な計算なのでここに置いて Unit テストの対象にする。
// REQUIREMENTS §6「1ヶ月を1日1行」= 行数は月の日数。縦1列のまま、スマホの全画面表示で
// 1か月が拡大せずに収まる縦横比(31日の月でも 1:2.0 以内)にする(#215。#204 の2カラムを見直し)

import type { ScheduleRow } from "./schedule-shared";

/**
 * LINE の originalContentUrl に渡す前提の固定幅。
 * 見え方を決めるのは縦横比なので、幅は解像度の問題。iPhone の物理解像度(幅 1179px)に近い値にして
 * 全画面表示でにじまないようにする。LINE の画像メッセージに画素数の上限はなく、制約はファイルサイズだけ
 * (originalContentUrl 10MB / previewImageUrl 1MB。同一 URL を両方に渡すので 1MB 以内)
 */
export const SCHEDULE_IMAGE_WIDTH = 1080;
/**
 * 縦横比(高さ / 幅)の上限。iPhone 16 の画面は 393×852pt(1:2.17)で、LINE の全画面表示では
 * 上下にバーが重なるため 1:2.0 以内なら拡大せずに全体が見える(plan.md 設計判断1)
 */
export const SCHEDULE_MAX_ASPECT = 2.0;
/** チーム名 +「YYYY年M月 練習予定」。行に高さを譲るため薄くする */
export const SCHEDULE_HEADER_HEIGHT = 140;
/**
 * 1日1行の高さ。同じ日に複数コマあっても伸ばさない(伸ばすと 1:2.0 を保証できない。plan.md 設計判断3)。
 * 31日の月で 140 + 31 × 62 + 44 = 2106(1:1.95)
 */
export const SCHEDULE_ROW_HEIGHT = 62;
/** powered by hoopo(§2 二層ブランディング) */
export const SCHEDULE_FOOTER_HEIGHT = 44;

// 文字サイズ。REQUIREMENTS §6「縦横比に収まる範囲で余りは文字サイズに回す」。
// 行の高さと釣り合う必要があるので定数をここにまとめ、描画側(schedule-image.tsx)から参照する
export const SCHEDULE_FONT_TEAM = 46;
export const SCHEDULE_FONT_MONTH = 34;
export const SCHEDULE_FONT_DAY = 44;
export const SCHEDULE_FONT_WEEKDAY = 31;
export const SCHEDULE_FONT_ENTRY = 36;
export const SCHEDULE_FONT_FOOTER = 22;

/** 1件の行の高さに対する文字の比率(複数コマで行を割るときに使う) */
const ENTRY_FONT_RATIO = 0.82;

/**
 * 1件あたりの高さ。複数コマの日は固定の行の高さを件数で割って縦に積む
 * (0件の日も行の高さは同じ)
 */
export function scheduleEntryLineHeight(entryCount: number): number {
  return SCHEDULE_ROW_HEIGHT / Math.max(1, entryCount);
}

/** 1件あたりの文字サイズ。1件なら基準のまま、複数コマの日だけ割った高さに収まるよう小さくする */
export function scheduleEntryFontSize(entryCount: number): number {
  return Math.min(
    SCHEDULE_FONT_ENTRY,
    Math.floor(scheduleEntryLineHeight(entryCount) * ENTRY_FONT_RATIO),
  );
}

/** 画像の高さ。行の高さは固定なので日数だけで決まる */
export function scheduleImageHeight(rows: readonly ScheduleRow[]): number {
  return (
    SCHEDULE_HEADER_HEIGHT +
    rows.length * SCHEDULE_ROW_HEIGHT +
    SCHEDULE_FOOTER_HEIGHT
  );
}
