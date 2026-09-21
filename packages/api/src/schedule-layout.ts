// 予定表画像のレイアウト定数(DB 非依存)。描画は apps/portal 側の next/og が行うが、
// 「幅・高さ・カラム分割」は rows から決まる純粋な計算なのでここに置いて Unit テストの対象にする。
// REQUIREMENTS §6「1ヶ月を1日1行」= 行数は月の日数。それを2カラムに折り返す(#204)

import type { ScheduleRow } from "./schedule-shared";

/**
 * LINE の originalContentUrl に渡す前提の固定幅。
 * LINE の画像メッセージに画素数の上限はなく、制約はファイルサイズだけ
 * (originalContentUrl 10MB / previewImageUrl 1MB。同一 URL を両方に渡すので 1MB 以内)。
 * 2カラムにすると1カラムの実効幅が半分になるため、長い場所名が入るよう 720 から広げた
 */
export const SCHEDULE_IMAGE_WIDTH = 1152;
/** 左=月の前半 / 右=後半 */
export const SCHEDULE_COLUMN_COUNT = 2;
/** チーム名 +「YYYY年M月 練習予定」 */
export const SCHEDULE_HEADER_HEIGHT = 140;
/** 1日1行の基準の高さ */
export const SCHEDULE_ROW_HEIGHT = 64;
/** 同じ日に2件目以降の練習がある場合に1件ごとに足す高さ(= 1件あたりの行の高さ) */
export const SCHEDULE_ENTRY_LINE_HEIGHT = 34;
/** powered by hoopo(§2 二層ブランディング) */
export const SCHEDULE_FOOTER_HEIGHT = 52;

// 文字サイズ。REQUIREMENTS §6「LINE のトーク上の縮小表示とカメラロール保存の両方で読める大きさ」。
// 行の高さと釣り合う必要があるので定数をここにまとめ、描画側(schedule-image.tsx)から参照する
export const SCHEDULE_FONT_TEAM = 38;
export const SCHEDULE_FONT_MONTH = 27;
export const SCHEDULE_FONT_DAY = 32;
export const SCHEDULE_FONT_WEEKDAY = 23;
export const SCHEDULE_FONT_ENTRY = 24;
export const SCHEDULE_FONT_FOOTER = 18;

/** その行の高さ(2件目以降の練習の分だけ伸びる) */
export function scheduleRowHeight(entryCount: number): number {
  return (
    SCHEDULE_ROW_HEIGHT +
    Math.max(0, entryCount - 1) * SCHEDULE_ENTRY_LINE_HEIGHT
  );
}

/**
 * 月の行を2カラムに割る。前半 `ceil(日数/2)` 行を左、残りを右に置く。
 * 固定の「1〜15日 / 16日〜月末」だと31日の月で右が16行になり左右が不均衡になるため、
 * ceil で左右の行数差を常に最大1行に収める(plan.md 設計判断2)
 */
export function splitScheduleColumns(
  rows: readonly ScheduleRow[],
): [ScheduleRow[], ScheduleRow[]] {
  const left = Math.ceil(rows.length / SCHEDULE_COLUMN_COUNT);
  return [rows.slice(0, left), rows.slice(left)];
}

/** 1カラム分の高さ(各行の高さの合計) */
export function scheduleColumnHeight(rows: readonly ScheduleRow[]): number {
  let h = 0;
  for (const r of rows) h += scheduleRowHeight(r.entries.length);
  return h;
}

/**
 * 画像の高さ。同じ日に複数コマあると行が伸びて左右の高さが揃わないため、
 * 分割 → 各カラムの高さ → max の順で決める(plan.md 設計判断4)
 */
export function scheduleImageHeight(rows: readonly ScheduleRow[]): number {
  const [left, right] = splitScheduleColumns(rows);
  return (
    SCHEDULE_HEADER_HEIGHT +
    Math.max(scheduleColumnHeight(left), scheduleColumnHeight(right)) +
    SCHEDULE_FOOTER_HEIGHT
  );
}
