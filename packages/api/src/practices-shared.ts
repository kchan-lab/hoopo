import { isDateString, isMonthString, monthOf } from "./tokyo-date";

// 練習(practice)の入力検証。DB 非依存(portal / admin のクライアントからも import 可)

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCATION_MAX = 100;
const NOTE_MAX = 500;
const MENU_CONTENT_MAX = 200;
const MENU_MAX = 20;
/** まとめ登録の 1 回の上限。1 か月ぶん(plan.md 設計判断3) */
export const BULK_MAX = 31;

export interface PracticeMenuInput {
  durationMin: number | null;
  content: string;
}

/** 1 コマと まとめ登録で共通の入力(日付以外)。検証を 1 か所にまとめる */
interface PracticeCommonInput {
  startTime: string;
  endTime: string;
  location: string | null;
  note: string | null;
}

export interface PracticeInput extends PracticeCommonInput {
  heldOn: string;
  menus: PracticeMenuInput[];
}

/**
 * カレンダーからのまとめ登録(plan.md 設計判断3)。
 * メニューは含めない(練習ごとに違うので後から行編集で足す。設計判断5)
 */
export interface BulkPracticeInput extends PracticeCommonInput {
  /** 同じ月の "YYYY-MM-DD"。重複を除いて昇順、1〜BULK_MAX 件 */
  dates: string[];
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

function parseCommon(
  r: Record<string, unknown>,
): ParseResult<PracticeCommonInput> {
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
  return { ok: true, value: { startTime, endTime, location, note } };
}

export function parsePracticeInput(body: unknown): ParseResult<PracticeInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const heldOn = typeof r.heldOn === "string" ? r.heldOn : "";
  if (!isDateString(heldOn)) {
    return { ok: false, error: "日付を YYYY-MM-DD 形式で入力してください" };
  }
  const common = parseCommon(r);
  if (!common.ok) return common;
  const { startTime, endTime, location, note } = common.value;
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

/**
 * カレンダーからのまとめ登録の入力検証(plan.md 設計判断3)。
 * 同じ日を 2 回選んでも 1 件として扱い、昇順に整えてから返す。
 * 月をまたぐ指定は禁止する(登録後に開く月一覧と食い違わないようにするため)
 */
export function parseBulkPracticeInput(
  body: unknown,
): ParseResult<BulkPracticeInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const raw = r.dates;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "日付を1日以上選んでください" };
  }
  // 重複除去は Set で行う(配列の includes だと件数の二乗に比例して重くなる)。
  // 上限は「重複を除いたあとの日数」で見る — 同じ日を 2 回選んでも 1 日として扱う仕様のため
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const d of raw) {
    if (typeof d !== "string" || !isDateString(d)) {
      return { ok: false, error: "日付を YYYY-MM-DD 形式で入力してください" };
    }
    if (!seen.has(d)) {
      seen.add(d);
      dates.push(d);
    }
  }
  if (dates.length > BULK_MAX) {
    return { ok: false, error: `一度に登録できるのは${BULK_MAX}日までです` };
  }
  const month = monthOf(dates[0] as string);
  if (dates.some((d) => monthOf(d) !== month)) {
    return { ok: false, error: "同じ月の日付だけをまとめて登録できます" };
  }
  const common = parseCommon(r);
  if (!common.ok) return common;
  return { ok: true, value: { dates: dates.sort(), ...common.value } };
}
