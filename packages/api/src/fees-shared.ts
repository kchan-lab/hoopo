// 月謝(fee_record)の定数・型・導出ロジック。DB 非依存(クライアントからも import 可)。
// 現金運用の可視化のみで決済はしない(CLAUDE.md 絶対原則7)。
// 3状態: paid=済 / unpaid=未 / future=未来(年月が Tokyo の今月より後)。「未来」は行を持たず年月から導出する(§7)

export const FEE_STATES = ["paid", "unpaid", "future"] as const;
export type FeeState = (typeof FEE_STATES)[number];

export const FEE_STATE_LABELS: Record<FeeState, string> = {
  paid: "済",
  unpaid: "未",
  future: "–",
};

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface FeeRecordLike {
  status: "paid" | "unpaid";
  receivedAt: string | null;
}

export interface FeeMonth {
  month: number;
  state: FeeState;
  /** 済のときの受領日時(ISO)。未・未来は null */
  receivedAt: string | null;
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 1セルの状態。済の行があれば常に「済」(前払いも済)。行が無い・未の行は、
 * 今月以前なら「未」、来月以降なら「未来」
 */
export function feeState(
  record: FeeRecordLike | null | undefined,
  year: number,
  month: number,
  currentMonth: string,
): FeeState {
  if (record?.status === "paid") return "paid";
  return ym(year, month) > currentMonth ? "future" : "unpaid";
}

/** 1年分(1〜12月)のセルを組み立てる。records は month をキーに引く */
export function buildFeeMonths(
  records: ReadonlyMap<number, FeeRecordLike>,
  year: number,
  currentMonth: string,
): FeeMonth[] {
  return MONTHS.map((month) => {
    const record = records.get(month) ?? null;
    const state = feeState(record, year, month, currentMonth);
    return {
      month,
      state,
      receivedAt: state === "paid" ? (record?.receivedAt ?? null) : null,
    };
  });
}

export const YEAR_MIN = 2020;
export const YEAR_MAX = 2100;

export function parseYear(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

export interface FeeToggleInput {
  childId: string;
  year: number;
  month: number;
  status: "paid" | "unpaid";
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 管理の 済⇄未 トグル入力。未来の月への「未」は無意味だが、済(前払い)は受け付ける */
export function parseFeeToggle(body: unknown): ParseResult<FeeToggleInput> {
  const r =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const childId = typeof r.childId === "string" ? r.childId : "";
  if (!UUID_PATTERN.test(childId)) {
    return { ok: false, error: "部員の指定が不正です" };
  }
  const year = typeof r.year === "number" ? r.year : Number.NaN;
  const month = typeof r.month === "number" ? r.month : Number.NaN;
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
    return { ok: false, error: "年の指定が不正です" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "月の指定が不正です" };
  }
  if (r.status !== "paid" && r.status !== "unpaid") {
    return { ok: false, error: "状態は 済 か 未 を指定してください" };
  }
  return { ok: true, value: { childId, year, month, status: r.status } };
}
