// 予定表画像のデータ組み立て(DB 非依存)。REQUIREMENTS §6:
// 「1ヶ月を1日1行で並べ、練習日に時間+学校名。備考は画像に載せない」

import {
  daysInMonth,
  formatTimeShort,
  toDateString,
  WEEKDAY_SHORT,
  weekdayOf,
} from "./tokyo-date";

export interface SchedulePracticeLike {
  heldOn: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

export interface ScheduleRowEntry {
  /** "9:00–12:00" */
  time: string;
  location: string;
}

export interface ScheduleRow {
  date: string;
  day: number;
  /** 0=日 … 6=土 */
  weekday: number;
  weekdayLabel: string;
  entries: ScheduleRowEntry[];
}

export const NO_LOCATION_LABEL = "場所未定";

/** 月の全日を1行ずつ。練習がある日は entries に時間+場所(開始時刻順) */
export function buildScheduleRows(
  month: string,
  practices: readonly SchedulePracticeLike[],
): ScheduleRow[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const byDate = new Map<string, ScheduleRowEntry[]>();
  const sorted = [...practices].sort((a, b) =>
    a.heldOn === b.heldOn
      ? a.startTime.localeCompare(b.startTime)
      : a.heldOn.localeCompare(b.heldOn),
  );
  for (const p of sorted) {
    const list = byDate.get(p.heldOn) ?? [];
    list.push({
      time: `${formatTimeShort(p.startTime)}–${formatTimeShort(p.endTime)}`,
      location: p.location ?? NO_LOCATION_LABEL,
    });
    byDate.set(p.heldOn, list);
  }
  const rows: ScheduleRow[] = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = toDateString(y, m, d);
    const weekday = weekdayOf(date);
    rows.push({
      date,
      day: d,
      weekday,
      weekdayLabel: WEEKDAY_SHORT[weekday] as string,
      entries: byDate.get(date) ?? [],
    });
  }
  return rows;
}

/** 画像に載せる文字をすべて集める(Google Fonts のサブセット取得用) */
export function collectScheduleText(
  rows: readonly ScheduleRow[],
  extra: readonly string[] = [],
): string {
  const chars = new Set<string>();
  for (const s of extra) for (const c of s) chars.add(c);
  for (const r of rows) {
    for (const c of `${r.day}${r.weekdayLabel}`) chars.add(c);
    for (const e of r.entries)
      for (const c of `${e.time}${e.location}`) chars.add(c);
  }
  return [...chars].join("");
}
