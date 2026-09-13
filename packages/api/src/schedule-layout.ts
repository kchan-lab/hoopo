// 予定表画像のレイアウト定数(DB 非依存)。描画は apps/portal 側の next/og が行うが、
// 「幅・高さ」は行数から決まる純粋な計算なのでここに置いて Unit テストの対象にする。
// REQUIREMENTS §6「1ヶ月を1日1行」= 行数は月の日数

import type { ScheduleRow } from "./schedule-shared";

/** LINE の originalContentUrl に渡す前提の固定幅 */
export const SCHEDULE_IMAGE_WIDTH = 720;
/** チーム名 +「YYYY年M月 練習予定」 */
export const SCHEDULE_HEADER_HEIGHT = 120;
/** 1日1行の基準の高さ */
export const SCHEDULE_ROW_HEIGHT = 44;
/** 同じ日に2件目以降の練習がある場合に1件ごとに足す高さ */
export const SCHEDULE_ENTRY_LINE_HEIGHT = 22;
/** powered by hoopo(§2 二層ブランディング) */
export const SCHEDULE_FOOTER_HEIGHT = 40;

/**
 * 画像の高さ。行数(=月の日数)で決まり、同じ日に複数の練習がある分だけ伸ばす
 * (extraEntryLines は countExtraEntryLines で求める)
 */
export function scheduleImageHeight(
  rowCount: number,
  extraEntryLines = 0,
): number {
  return (
    SCHEDULE_HEADER_HEIGHT +
    rowCount * SCHEDULE_ROW_HEIGHT +
    extraEntryLines * SCHEDULE_ENTRY_LINE_HEIGHT +
    SCHEDULE_FOOTER_HEIGHT
  );
}

/** 2件目以降の練習の合計件数(高さの追加分) */
export function countExtraEntryLines(rows: readonly ScheduleRow[]): number {
  let extra = 0;
  for (const r of rows) extra += Math.max(0, r.entries.length - 1);
  return extra;
}

/** その行の高さ(2件目以降の練習の分だけ伸びる) */
export function scheduleRowHeight(entryCount: number): number {
  return (
    SCHEDULE_ROW_HEIGHT +
    Math.max(0, entryCount - 1) * SCHEDULE_ENTRY_LINE_HEIGHT
  );
}
