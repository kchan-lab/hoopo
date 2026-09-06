import {
  children,
  withTeam,
  type YearRolloverSnapshot,
  yearRollovers,
} from "@hoopo/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

// 年度更新(year-rollover/plan.md。REQUIREMENTS §5.2・§7)。
// 全部員の学年+1、6年生は卒団アーカイブ(学年は据え置き)。破壊的操作なので実行ログを
// year_rollovers に残し、実行前の学年・アーカイブ状態を snapshot から 24 時間以内に1回だけ戻せる。
// 猶予中に手で直した学年・卒団は取り消しで上書きされる(設計判断1。UI に明記)

/** 取り消し猶予(24時間・1回。設計判断2) */
export const UNDO_GRACE_MS = 24 * 60 * 60 * 1000;

/** 卒団する学年。学年は据え置きで archived=true にする(§7) */
const GRADUATION_GRADE = 6;

export interface YearRolloverLatest {
  id: string;
  executedAt: string;
  undoneAt: string | null;
  /** 取り消せるか(未取り消し かつ executed_at から 24 時間以内) */
  undoable: boolean;
  affected: number;
  archived: number;
}

/** 「今実行したら」の人数 */
export interface YearRolloverPreview {
  total: number;
  willArchive: number;
}

export interface YearRolloverStatus {
  latest: YearRolloverLatest | null;
  preview: YearRolloverPreview;
}

export interface YearRolloverResult {
  id: string;
  executedAt: string;
  affected: number;
  archived: number;
}

export type ExecuteYearRolloverResult =
  | { ok: true; rollover: YearRolloverResult }
  | { ok: false; reason: "no_members" | "pending_undoable" };

export type UndoYearRolloverResult =
  | { ok: true; restored: number }
  | { ok: false; reason: "nothing_to_undo" };

/** 対象は「有効な部員(active・非アーカイブ)」。卒団済み・無効化済みは触らない */
const targetCondition = and(
  eq(children.archived, false),
  eq(children.status, "active"),
);

function isUndoable(executedAt: Date, undoneAt: Date | null, now: Date) {
  return (
    undoneAt === null && executedAt.getTime() + UNDO_GRACE_MS > now.getTime()
  );
}

/** snapshot は実行前の状態なので、卒団した人数 = 実行前に 6 年生だった人数 */
function countArchived(snapshot: YearRolloverSnapshot): number {
  return Object.values(snapshot).filter((s) => s.grade === GRADUATION_GRADE)
    .length;
}

/**
 * 年度更新の状況(§5.2)。
 * latest は最新の実行ログ1件(取り消し済みでも返し、取り消せるかは undoable で判断する)
 */
export async function getYearRolloverStatus(
  teamId: string,
  now: Date = new Date(),
): Promise<YearRolloverStatus> {
  return withTeam(teamId, async (tx) => {
    const [latest] = await tx
      .select({
        id: yearRollovers.id,
        executedAt: yearRollovers.executedAt,
        undoneAt: yearRollovers.undoneAt,
        snapshot: yearRollovers.snapshot,
      })
      .from(yearRollovers)
      .orderBy(desc(yearRollovers.executedAt))
      .limit(1);
    const [counts] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        willArchive: sql<number>`(count(*) filter (where ${children.grade} = ${GRADUATION_GRADE}))::int`,
      })
      .from(children)
      .where(targetCondition);

    return {
      latest: latest
        ? {
            id: latest.id,
            executedAt: latest.executedAt.toISOString(),
            undoneAt: latest.undoneAt?.toISOString() ?? null,
            undoable: isUndoable(latest.executedAt, latest.undoneAt, now),
            affected: Object.keys(latest.snapshot).length,
            archived: countArchived(latest.snapshot),
          }
        : null,
      preview: {
        total: counts?.total ?? 0,
        willArchive: counts?.willArchive ?? 0,
      },
    };
  });
}

/**
 * 年度更新の実行(§5.2)。
 * 猶予内に未取り消しの実行があれば二重実行を防ぐ(設計判断3)。対象 0 人なら実行しない
 */
export async function executeYearRollover(
  teamId: string,
  now: Date = new Date(),
): Promise<ExecuteYearRolloverResult> {
  return withTeam(teamId, async (tx): Promise<ExecuteYearRolloverResult> => {
    const [latest] = await tx
      .select({
        executedAt: yearRollovers.executedAt,
        undoneAt: yearRollovers.undoneAt,
      })
      .from(yearRollovers)
      .orderBy(desc(yearRollovers.executedAt))
      .limit(1);
    if (latest && isUndoable(latest.executedAt, latest.undoneAt, now)) {
      return { ok: false, reason: "pending_undoable" };
    }

    const targets = await tx
      .select({
        id: children.id,
        grade: children.grade,
        archived: children.archived,
      })
      .from(children)
      .where(targetCondition);
    if (targets.length === 0) return { ok: false, reason: "no_members" };

    // 実行前の状態を丸ごと残す。取り消しはここからの復元だけで完結させる(設計判断1)
    const snapshot: YearRolloverSnapshot = {};
    for (const t of targets) {
      snapshot[t.id] = { grade: t.grade, archived: t.archived };
    }
    const graduating = targets
      .filter((t) => t.grade === GRADUATION_GRADE)
      .map((t) => t.id);
    const promoting = targets
      .filter((t) => t.grade !== GRADUATION_GRADE)
      .map((t) => t.id);

    // 6年生: 学年は据え置きで卒団アーカイブ(§7)
    if (graduating.length > 0) {
      await tx
        .update(children)
        .set({ archived: true, archivedAt: now, updatedAt: now })
        .where(inArray(children.id, graduating));
    }
    // それ以外: 学年+1
    if (promoting.length > 0) {
      await tx
        .update(children)
        .set({
          grade: sql<number>`${children.grade} + 1`,
          updatedAt: now,
        })
        .where(inArray(children.id, promoting));
    }

    const [row] = await tx
      .insert(yearRollovers)
      .values({ teamId, executedAt: now, snapshot })
      .returning({
        id: yearRollovers.id,
        executedAt: yearRollovers.executedAt,
      });
    if (!row) throw new Error("年度更新の実行ログを保存できませんでした");

    return {
      ok: true,
      rollover: {
        id: row.id,
        executedAt: row.executedAt.toISOString(),
        affected: targets.length,
        archived: graduating.length,
      },
    };
  });
}

/**
 * 年度更新の取り消し(§5.2)。
 * snapshot にある部員だけを実行前の学年・アーカイブ状態に戻す。
 * 更新後に登録・編集された部員は snapshot に無いので触らない(設計判断1)
 */
export async function undoYearRollover(
  teamId: string,
  now: Date = new Date(),
): Promise<UndoYearRolloverResult> {
  return withTeam(teamId, async (tx): Promise<UndoYearRolloverResult> => {
    const [latest] = await tx
      .select({
        id: yearRollovers.id,
        executedAt: yearRollovers.executedAt,
        undoneAt: yearRollovers.undoneAt,
        snapshot: yearRollovers.snapshot,
      })
      .from(yearRollovers)
      .orderBy(desc(yearRollovers.executedAt))
      .limit(1);
    if (!latest || !isUndoable(latest.executedAt, latest.undoneAt, now)) {
      return { ok: false, reason: "nothing_to_undo" };
    }

    // 同じ(学年, アーカイブ状態)ごとにまとめて戻す(1件ずつの UPDATE を避ける)
    const groups = new Map<string, { grade: number; ids: string[] }>();
    for (const [childId, before] of Object.entries(latest.snapshot)) {
      const key = `${before.grade}:${before.archived}`;
      const group = groups.get(key);
      if (group) group.ids.push(childId);
      else groups.set(key, { grade: before.grade, ids: [childId] });
    }

    let restored = 0;
    for (const [key, group] of groups) {
      const wasArchived = key.endsWith(":true");
      const rows = await tx
        .update(children)
        .set({
          grade: group.grade,
          archived: wasArchived,
          // 卒団を取り消すときは archived_at も消す(実行前は未設定だったため)
          ...(wasArchived ? {} : { archivedAt: null }),
          updatedAt: now,
        })
        .where(inArray(children.id, group.ids))
        .returning({ id: children.id });
      restored += rows.length;
    }

    await tx
      .update(yearRollovers)
      .set({ undoneAt: now })
      .where(eq(yearRollovers.id, latest.id));

    return { ok: true, restored };
  });
}
