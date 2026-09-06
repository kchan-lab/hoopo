import { attendances, practices, withTeam } from "@hoopo/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  AttendanceStatus,
  SubmitAttendanceInput,
} from "./attendances-shared";
import { listPracticesByMonth, type Practice } from "./practices";
import { type ChildSummary, listChildrenForGuardian } from "./registration";
import { monthRange } from "./tokyo-date";

// 保護者側の参加予定ロジック(attendance/plan.md 4a)。API 契約は plan.md「4a 保護者 API」。
// 対象は「active な連携で見えるお子さん」だけ(listChildrenForGuardian が唯一の基準)。
// 未回答は行を持たない(設計判断1)ので、answers にキーが無い = 未回答

export interface AttendanceEntry {
  status: AttendanceStatus;
  /** partial のときだけ入る(DB の CHECK と同じ規則) */
  comment: string | null;
}

/** childId → practiceId → 回答。未回答はキーを持たない */
export type AttendanceAnswers = Record<string, Record<string, AttendanceEntry>>;

export interface AttendanceSheet {
  month: string;
  children: ChildSummary[];
  practices: Practice[];
  answers: AttendanceAnswers;
}

/** 提出画面の初期表示(お子さん・月内の練習・回答済みの内容) */
export async function getAttendanceSheet(
  teamId: string,
  guardianId: string,
  month: string,
): Promise<AttendanceSheet> {
  const children = await listChildrenForGuardian(teamId, guardianId);
  const list = await listPracticesByMonth(teamId, month);
  const answers: AttendanceAnswers = {};
  for (const child of children) answers[child.id] = {};
  if (children.length === 0 || list.length === 0) {
    return { month, children, practices: list, answers };
  }
  const childIds = children.map((c) => c.id);
  const practiceIds = list.map((p) => p.id);
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({
        childId: attendances.childId,
        practiceId: attendances.practiceId,
        status: attendances.status,
        comment: attendances.comment,
      })
      .from(attendances)
      .where(
        and(
          inArray(attendances.childId, childIds),
          inArray(attendances.practiceId, practiceIds),
        ),
      ),
  );
  for (const r of rows) {
    const forChild = answers[r.childId];
    if (!forChild) continue;
    forChild[r.practiceId] = {
      status: r.status as AttendanceStatus,
      comment: r.comment,
    };
  }
  return { month, children, practices: list, answers };
}

export type SubmitAttendanceResult =
  | { ok: true; saved: number }
  /** 自分の active な連携ではない childId(存在を漏らさないため 404 にする) */
  | { ok: false; reason: "not_found" }
  /** チームに無い practiceId(他チームの練習は RLS で見えない) */
  | { ok: false; reason: "invalid_practice" };

/**
 * お子さん単位の一括保存(設計判断2)。status=null は行を削除し、それ以外は
 * unique(practice_id, child_id) で upsert する。comment は partial のときだけ残す
 */
export async function submitAttendance(
  teamId: string,
  guardianId: string,
  input: SubmitAttendanceInput,
): Promise<SubmitAttendanceResult> {
  const mine = await listChildrenForGuardian(teamId, guardianId);
  if (!mine.some((c) => c.id === input.childId)) {
    return { ok: false, reason: "not_found" };
  }
  // practiceId は parseSubmitAttendance が重複排除済み(件数の比較で存在確認できる)
  const practiceIds = input.answers.map((a) => a.practiceId);
  return withTeam(teamId, async (tx) => {
    const found = await tx
      .select({ id: practices.id })
      .from(practices)
      .where(inArray(practices.id, practiceIds));
    if (found.length !== practiceIds.length) {
      return { ok: false, reason: "invalid_practice" };
    }
    const now = new Date();
    const removed = input.answers
      .filter((a) => a.status === null)
      .map((a) => a.practiceId);
    if (removed.length > 0) {
      await tx
        .delete(attendances)
        .where(
          and(
            eq(attendances.childId, input.childId),
            inArray(attendances.practiceId, removed),
          ),
        );
    }
    const upserted = input.answers.filter((a) => a.status !== null);
    if (upserted.length > 0) {
      await tx
        .insert(attendances)
        .values(
          upserted.map((a) => ({
            teamId,
            childId: input.childId,
            practiceId: a.practiceId,
            status: a.status as AttendanceStatus,
            comment: a.status === "partial" ? a.comment : null,
            submittedAt: now,
          })),
        )
        // 再提出は同じ行を上書きし、提出時刻も更新する(§4.2-6「提出後も変更可」)
        .onConflictDoUpdate({
          target: [attendances.practiceId, attendances.childId],
          set: {
            status: sql`excluded.status`,
            comment: sql`excluded.comment`,
            submittedAt: now,
            updatedAt: now,
          },
        });
    }
    // 削除も含めて「受け付けた回答の件数」を返す
    return { ok: true, saved: input.answers.length };
  });
}

export interface UnansweredSummary {
  unanswered: number;
  /** 月内の練習 × 自分のお子さんの件数 */
  total: number;
}

/** ホームの未提出アラート用の件数(月内の練習 × 自分のお子さん) */
export async function getUnansweredSummary(
  teamId: string,
  guardianId: string,
  month: string,
): Promise<UnansweredSummary> {
  const mine = await listChildrenForGuardian(teamId, guardianId);
  if (mine.length === 0) return { unanswered: 0, total: 0 };
  const { from, to } = monthRange(month);
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select({ id: practices.id })
      .from(practices)
      .where(and(gte(practices.heldOn, from), lte(practices.heldOn, to)));
    const total = rows.length * mine.length;
    if (total === 0) return { unanswered: 0, total: 0 };
    const answered = await tx
      .select({ id: attendances.id })
      .from(attendances)
      .where(
        and(
          inArray(
            attendances.childId,
            mine.map((c) => c.id),
          ),
          inArray(
            attendances.practiceId,
            rows.map((p) => p.id),
          ),
        ),
      );
    return { unanswered: total - answered.length, total };
  });
}
