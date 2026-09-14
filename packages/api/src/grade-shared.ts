// 生年月日からの学年判定と身長の検証(child-birthdate-height/plan.md 設計判断4)。
// DB・Hono に依存しない純関数なので、portal のクライアント(入力中の学年表示)と
// サーバー(保存する学年の正)の両方から使える。基準日は Asia/Tokyo の「今日」

import type { ParseResult } from "./registration-shared";
import { isDateString, todayInTokyo } from "./tokyo-date";

/** 身長(cm)の許容範囲。DB 側も children_height_cm_check で同じ範囲を持つ */
export const HEIGHT_MIN = 80;
export const HEIGHT_MAX = 220;

/** 小学校の学年 */
export const GRADE_MIN = 1;
export const GRADE_MAX = 6;

/** Asia/Tokyo の「今日」(学年判定の基準日)。実体は tokyo-date.ts と同じ */
export { todayInTokyo as todayTokyo } from "./tokyo-date";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] | null {
  const m = DATE_PATTERN.exec(date);
  if (!m || !isDateString(date)) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * 年度(4月1日開始)。2026-03-31 は 2025 年度、2026-04-01 は 2026 年度。
 * 不正な日付は null
 */
export function schoolYearOf(date: string): number | null {
  const p = parts(date);
  if (!p) return null;
  const [y, month] = p;
  return month >= 4 ? y : y - 1;
}

/**
 * 学齢の年度(4月2日〜翌4月1日生まれが同学年)。年度の開始(4/1)と学齢の境(4/2)が
 * 1日ずれるのが日本の小学校の規則なので、schoolYearOf とは別に持つ
 */
function birthSchoolYearOf(birthDate: string): number | null {
  const p = parts(birthDate);
  if (!p) return null;
  const [y, month, day] = p;
  const beforeBoundary = month < 4 || (month === 4 && day <= 1);
  return beforeBoundary ? y - 1 : y;
}

/**
 * 生年月日から学年(1..6)を求める。基準日 today(Asia/Tokyo の "YYYY-MM-DD")の年度で判定し、
 * 入学前・卒業後(1..6 の外)と不正な日付は null を返す。
 * 例: today=2026-09-13 のとき 2019-04-02 生まれ → 1年、2019-04-01 生まれ → 2年
 */
export function gradeFromBirthDate(
  birthDate: string,
  today: string,
): number | null {
  const birthYear = birthSchoolYearOf(birthDate);
  const schoolYear = schoolYearOf(today);
  if (birthYear === null || schoolYear === null) return null;
  const grade = schoolYear - birthYear - 6;
  return grade >= GRADE_MIN && grade <= GRADE_MAX ? grade : null;
}

/**
 * 指定の学年になる生年月日("YYYY-MM-DD")。gradeFromBirthDate の逆算で、
 * シード・テストのフィクスチャが「今日」に依存せず学年を固定するために使う
 */
export function birthDateForGrade(
  grade: number,
  today: string = todayInTokyo(),
): string {
  const schoolYear = schoolYearOf(today) ?? 0;
  // 4/2〜翌4/1 の範囲の真ん中あたり(6/1)を選び、境界の判定に影響されないようにする
  return `${schoolYear - grade - 6}-06-01`;
}

// ---- 入力の検証(エラー文言は sentence case 相当の平易な日本語。CLAUDE.md 開発ルール) ----

/**
 * 生年月日。形式だけでなく「小学生かどうか」も基準日 today で判定する
 * (学年は保存時に算出するので、ここで弾けないと 1..6 に入らない学年を保存しうる)
 */
export function parseBirthDate(
  value: unknown,
  today: string = todayInTokyo(),
): ParseResult<string> {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !isDateString(text)) {
    return { ok: false, error: "生年月日を入力してください" };
  }
  if (gradeFromBirthDate(text, today) === null) {
    return { ok: false, error: "小学生の生年月日を入力してください" };
  }
  return { ok: true, value: text };
}

const HEIGHT_ERROR = `身長を ${HEIGHT_MIN}〜${HEIGHT_MAX} の整数(cm)で入力してください`;

/** 身長(cm)。number でも数字文字列でも受け取る(input[type=number] の値が文字列で届くため) */
export function parseHeightCm(value: unknown): ParseResult<number> {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(n) || n < HEIGHT_MIN || n > HEIGHT_MAX) {
    return { ok: false, error: HEIGHT_ERROR };
  }
  return { ok: true, value: n };
}
