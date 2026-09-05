// 日付・曜日は Asia/Tokyo 固定で扱う(CLAUDE.md 開発ルール)。
// 保持・入出力は "YYYY-MM-DD" / "HH:MM" の文字列にして、サーバー・ブラウザの
// タイムゾーンに依存しない。「今日」の決定だけ Intl で Tokyo に固定する(plan.md 設計判断1)

export const TOKYO_TZ = "Asia/Tokyo";
export const WEEKDAY_SHORT = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function isDateString(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function isMonthString(value: string): boolean {
  const m = MONTH_PATTERN.exec(value);
  if (!m) return false;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 0=日 … 6=土(practices.weekday の生成列と同一規約) */
export function weekdayOf(date: string): number {
  const m = DATE_PATTERN.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  ).getUTCDay();
}

export function weekdayLabel(date: string): string {
  return WEEKDAY_SHORT[weekdayOf(date)] as string;
}

/** Tokyo の今日を "YYYY-MM-DD" で返す */
export function todayInTokyo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthRange(month: string): { from: string; to: string } {
  const m = MONTH_PATTERN.exec(month);
  if (!m) throw new Error(`年月の形式が不正です: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return {
    from: toDateString(y, mo, 1),
    to: toDateString(y, mo, daysInMonth(y, mo)),
  };
}

export function addMonths(month: string, delta: number): string {
  const m = MONTH_PATTERN.exec(month);
  if (!m) throw new Error(`年月の形式が不正です: ${month}`);
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return `${y}-${pad(mo)}`;
}

export function formatMonthLabel(month: string): string {
  const m = MONTH_PATTERN.exec(month);
  if (!m) throw new Error(`年月の形式が不正です: ${month}`);
  return `${Number(m[1])}年${Number(m[2])}月`;
}

/** "9/6 (日)" 形式 */
export function formatDateLabel(date: string): string {
  const m = DATE_PATTERN.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  return `${Number(m[2])}/${Number(m[3])} (${weekdayLabel(date)})`;
}

/** DB の time("HH:MM:SS") → "HH:MM"。表示用の "9:00" は formatTimeShort */
export function toHHMM(time: string): string {
  return time.slice(0, 5);
}

export function formatTimeShort(time: string): string {
  const [h, mm] = time.split(":");
  return `${Number(h)}:${mm}`;
}

export interface CalendarCell {
  date: string;
  day: number;
  /** その月の日か(false は前後の月の埋め草) */
  inMonth: boolean;
}

/** 日曜始まりの格子。その月に必要な週数だけ返す(plan.md 設計判断6) */
export function monthGrid(month: string): CalendarCell[][] {
  const { from } = monthRange(month);
  const m = MONTH_PATTERN.exec(month) as RegExpExecArray;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const lead = weekdayOf(from);
  const days = daysInMonth(y, mo);
  const cells: CalendarCell[] = [];
  // 前月の埋め草
  const prev = addMonths(month, -1);
  const [py, pm] = prev.split("-").map(Number) as [number, number];
  const prevDays = daysInMonth(py, pm);
  for (let i = lead - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ date: toDateString(py, pm, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= days; d++) {
    cells.push({ date: toDateString(y, mo, d), day: d, inMonth: true });
  }
  const next = addMonths(month, 1);
  const [ny, nm] = next.split("-").map(Number) as [number, number];
  let d = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: toDateString(ny, nm, d), day: d, inMonth: false });
    d++;
  }
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
