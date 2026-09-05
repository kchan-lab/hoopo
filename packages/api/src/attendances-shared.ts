// 参加予定(attendance)の定数・型・入力検証。DB 非依存(クライアントからも import 可)。
// 3値+未回答: full=参加(全時間) / partial=途中参加・早退 / absent=不参加 / null=未回答(行なし)。
// コメントは partial のときだけ保持する(DB の CHECK 制約と同じ規則)

export const ATTENDANCE_STATUSES = ["full", "partial", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** 未回答は行を持たない(null) */
export type AttendanceAnswer = AttendanceStatus | null;

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  full: "参加(全時間)",
  partial: "途中参加・早退",
  absent: "不参加",
};
export const UNANSWERED_LABEL = "未回答";

/** 管理画面のマトリクス記号(REQUIREMENTS §5.2) */
export const ATTENDANCE_MARKS: Record<AttendanceStatus | "none", string> = {
  full: "○",
  partial: "△",
  absent: "×",
  none: "−",
};

/** カレンダーのタップで巡回する順(DESIGN §1.3): 参加 → 途中 → 不参加 → 未回答 */
export function nextAnswer(current: AttendanceAnswer): AttendanceAnswer {
  switch (current) {
    case null:
      return "full";
    case "full":
      return "partial";
    case "partial":
      return "absent";
    case "absent":
      return null;
  }
}

export const COMMENT_MAX = 200;

export interface AttendanceAnswerInput {
  practiceId: string;
  status: AttendanceAnswer;
  /** partial のときだけ有効。それ以外は捨てる */
  comment: string | null;
}

export interface SubmitAttendanceInput {
  childId: string;
  answers: AttendanceAnswerInput[];
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseSubmitAttendance(
  body: unknown,
): ParseResult<SubmitAttendanceInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const childId = typeof r.childId === "string" ? r.childId : "";
  if (!UUID_PATTERN.test(childId)) {
    return { ok: false, error: "お子さんの指定が不正です" };
  }
  if (!Array.isArray(r.answers) || r.answers.length === 0) {
    return { ok: false, error: "回答を1件以上含めてください" };
  }
  if (r.answers.length > 100) {
    return { ok: false, error: "一度に送れる回答は100件までです" };
  }
  const answers: AttendanceAnswerInput[] = [];
  const seen = new Set<string>();
  for (const [i, a] of r.answers.entries()) {
    const ar = asRecord(a);
    const practiceId = typeof ar?.practiceId === "string" ? ar.practiceId : "";
    if (!UUID_PATTERN.test(practiceId) || seen.has(practiceId)) {
      return { ok: false, error: `${i + 1}件目の練習の指定が不正です` };
    }
    seen.add(practiceId);
    const status = ar?.status ?? null;
    if (
      status !== null &&
      !ATTENDANCE_STATUSES.includes(status as AttendanceStatus)
    ) {
      return { ok: false, error: `${i + 1}件目の回答が不正です` };
    }
    let comment: string | null = null;
    if (status === "partial") {
      const raw = ar?.comment;
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== "string" || raw.length > COMMENT_MAX) {
          return {
            ok: false,
            error: `コメントは${COMMENT_MAX}文字以内で入力してください`,
          };
        }
        comment = raw.trim() === "" ? null : raw.trim();
      }
    }
    answers.push({ practiceId, status: status as AttendanceAnswer, comment });
  }
  return { ok: true, value: { childId, answers } };
}
