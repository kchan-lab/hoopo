import { attendances, children, withTeam } from "@hoopo/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AttendanceStatus } from "./attendances-shared";
import { getPractice, listPracticesByMonth, type Practice } from "./practices";

// 管理側の出欠マトリクス・欠席者ロジック(attendance/plan.md 4b)。
// 未回答は attendances に行を持たない(設計判断1)。マトリクスの「−」も欠席者管理の「未回答」も
// 「有効な部員」と「回答のある部員」の差集合として導出する

/** 一覧に出す部員の最小情報(個人情報は最小保持。氏名・呼び名・学年のみ) */
export interface AttendanceChild {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
}

/** 回答のあるセル。comment は partial のときだけ入る(DB の CHECK と同じ規則) */
export interface AttendanceCell {
  status: AttendanceStatus;
  comment: string | null;
}

export interface AttendanceMatrixRow {
  child: AttendanceChild;
  /** 列(練習)の id をキーに持つ。未回答は null。月内の全練習のキーを必ず含む */
  cells: Record<string, AttendanceCell | null>;
}

export interface AttendanceMatrix {
  month: string;
  practices: Practice[];
  rows: AttendanceMatrixRow[];
}

export interface AbsenteeEntry {
  child: AttendanceChild;
  comment: string | null;
}

export interface Absentees {
  practice: Practice;
  /** 同じトランザクションで数えた有効な部員数(参加 = memberTotal − absent − partial − unanswered) */
  memberTotal: number;
  absent: AbsenteeEntry[];
  partial: AbsenteeEntry[];
  unanswered: AbsenteeEntry[];
}

const childColumns = {
  id: children.id,
  name: children.name,
  nicknameKana: children.nicknameKana,
  grade: children.grade,
};

/**
 * 有効な部員(active・非アーカイブ)を学年降順→名前で返す。
 * 並び順は部員管理(listMembers)と同一にして、画面をまたいでも行の順序が変わらないようにする
 */
function selectActiveChildren(
  tx: Parameters<Parameters<typeof withTeam>[1]>[0],
): Promise<AttendanceChild[]> {
  return tx
    .select(childColumns)
    .from(children)
    .where(and(eq(children.archived, false), eq(children.status, "active")))
    .orderBy(desc(children.grade), asc(children.name));
}

/** 部員(行)×練習日(列)のマトリクス(§5.2 出欠管理) */
export async function getAttendanceMatrix(
  teamId: string,
  month: string,
): Promise<AttendanceMatrix> {
  // 列は日程管理・保護者側と同じ listPracticesByMonth を再利用する(日付→開始時刻順)
  const practices = await listPracticesByMonth(teamId, month);
  const rows = await withTeam(teamId, async (tx) => {
    const members = await selectActiveChildren(tx);
    if (members.length === 0) return [];
    const answers =
      practices.length === 0
        ? []
        : await tx
            .select({
              childId: attendances.childId,
              practiceId: attendances.practiceId,
              status: attendances.status,
              comment: attendances.comment,
            })
            .from(attendances)
            .where(
              inArray(
                attendances.practiceId,
                practices.map((p) => p.id),
              ),
            );
    // 子ども id → 練習 id → セル
    const byChild = new Map<string, Map<string, AttendanceCell>>();
    for (const a of answers) {
      const cells = byChild.get(a.childId) ?? new Map<string, AttendanceCell>();
      cells.set(a.practiceId, {
        status: a.status as AttendanceStatus,
        comment: a.comment,
      });
      byChild.set(a.childId, cells);
    }
    return members.map((child) => {
      const found = byChild.get(child.id);
      const cells: Record<string, AttendanceCell | null> = {};
      // 未回答の列も null で必ず埋める(画面側が practices を回すだけで「−」を出せる)
      for (const p of practices) cells[p.id] = found?.get(p.id) ?? null;
      return { child, cells };
    });
  });
  return { month, practices, rows };
}

/**
 * 練習日ごとの欠席者一覧(§5.2 欠席者管理)。
 * 参加(full)は返さない。未回答は「有効な部員 − 回答のある部員」。
 * 練習が無い/他チームのものなら null(存在を漏らさない)
 */
export async function getAbsentees(
  teamId: string,
  practiceId: string,
): Promise<Absentees | null> {
  const practice = await getPractice(teamId, practiceId);
  if (!practice) return null;
  return withTeam(teamId, async (tx) => {
    const members = await selectActiveChildren(tx);
    const answers = await tx
      .select({
        childId: attendances.childId,
        status: attendances.status,
        comment: attendances.comment,
      })
      .from(attendances)
      .where(eq(attendances.practiceId, practice.id));
    const byChild = new Map(answers.map((a) => [a.childId, a]));
    const absent: AbsenteeEntry[] = [];
    const partial: AbsenteeEntry[] = [];
    const unanswered: AbsenteeEntry[] = [];
    // members の順(学年降順→名前)で振り分けるので、3グループとも同じ規則で並ぶ
    for (const child of members) {
      const answer = byChild.get(child.id);
      if (!answer) {
        unanswered.push({ child, comment: null });
        continue;
      }
      // 参加(full)は欠席者管理には出さない。comment は partial のみ(DB の CHECK)
      if (answer.status === "absent") absent.push({ child, comment: null });
      else if (answer.status === "partial")
        partial.push({ child, comment: answer.comment });
    }
    return {
      practice,
      memberTotal: members.length,
      absent,
      partial,
      unanswered,
    };
  });
}
