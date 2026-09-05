import { isDateString, isMonthString } from "./tokyo-date";

// 練習(practice)の入力検証。DB 非依存(portal / admin のクライアントからも import 可)

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCATION_MAX = 100;
const NOTE_MAX = 500;
const MENU_CONTENT_MAX = 200;
const MENU_MAX = 20;

export interface PracticeMenuInput {
  durationMin: number | null;
  content: string;
}

export interface PracticeInput {
  heldOn: string;
  startTime: string;
  endTime: string;
  location: string | null;
  note: string | null;
  menus: PracticeMenuInput[];
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > max) return undefined;
  return text === "" ? null : text;
}

export function parseMonth(value: unknown): string | null {
  return typeof value === "string" && isMonthString(value) ? value : null;
}

export function parsePracticeInput(body: unknown): ParseResult<PracticeInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const heldOn = typeof r.heldOn === "string" ? r.heldOn : "";
  if (!isDateString(heldOn)) {
    return { ok: false, error: "日付を YYYY-MM-DD 形式で入力してください" };
  }
  const startTime = typeof r.startTime === "string" ? r.startTime : "";
  const endTime = typeof r.endTime === "string" ? r.endTime : "";
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return { ok: false, error: "開始・終了を HH:MM 形式で入力してください" };
  }
  if (startTime >= endTime) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }
  const location = optionalText(r.location, LOCATION_MAX);
  if (location === undefined) {
    return {
      ok: false,
      error: `場所は${LOCATION_MAX}文字以内で入力してください`,
    };
  }
  const note = optionalText(r.note, NOTE_MAX);
  if (note === undefined) {
    return { ok: false, error: `備考は${NOTE_MAX}文字以内で入力してください` };
  }
  const rawMenus = r.menus === undefined ? [] : r.menus;
  if (!Array.isArray(rawMenus) || rawMenus.length > MENU_MAX) {
    return { ok: false, error: `練習メニューは${MENU_MAX}件までです` };
  }
  const menus: PracticeMenuInput[] = [];
  for (const [i, m] of rawMenus.entries()) {
    const mr = asRecord(m);
    const content = typeof mr?.content === "string" ? mr.content.trim() : "";
    if (!content || content.length > MENU_CONTENT_MAX) {
      return {
        ok: false,
        error: `練習メニュー${i + 1}件目の内容を${MENU_CONTENT_MAX}文字以内で入力してください`,
      };
    }
    const raw = mr?.durationMin;
    let durationMin: number | null = null;
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 600) {
        return {
          ok: false,
          error: `練習メニュー${i + 1}件目の所要時間は1〜600分で入力してください`,
        };
      }
      durationMin = n;
    }
    menus.push({ durationMin, content });
  }
  return {
    ok: true,
    value: { heldOn, startTime, endTime, location, note, menus },
  };
}
