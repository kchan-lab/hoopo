import { children, type TeamTx, withTeam, yearRollovers } from "@hoopo/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildRestoreGroups,
  buildSnapshot,
  countGraduating,
  GRADUATION_GRADE,
  isUndoable,
  partitionMembers,
  type RolloverSnapshot,
  undoDeadline,
} from "./year-rollover-shared";

// 年度更新(year-rollover/plan.md。REQUIREMENTS §5.2・§7)。
// 全部員の学年+1、6年生は卒団アーカイブ(学年は据え置き)。破壊的操作なので実行ログを
// year_rollovers に残し、実行前の学年・アーカイブ状態を snapshot から 24 時間以内に1回だけ戻せる。
// 猶予中に手で直した学年・卒団は取り消しで上書きされる(設計判断1。UI に明記)。
// 純ロジック(振り分け・snapshot・猶予判定)は year-rollover-shared.ts
// (UNDO_GRACE_MS などの定数もそちら。@hoopo/api / @hoopo/api/year-rollover-shared から import する)

export interface YearRolloverLatest {
  id: string;
  executedAt: string;
  undoneAt: string | null;
  /** 取り消せるか(未取り消し かつ executed_at から 24 時間以内) */
  undoable: boolean;
  /** 取り消せる期限(ISO)。取り消せないときは null */
  undoDeadline: string | null;
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

/**
 * チーム単位で年度更新を直列化する。
 * PostgreSQL の既定は READ COMMITTED なので、コーチが2つのタブから同時に押すと
 * 両方が「猶予中の実行なし」を読んでしまい、二重に学年が上がりうる(TOCTOU)。
 * トランザクション終了で自動解放される advisory lock を最初に取り、
 * 同じチームの実行・取り消しを待たせる(他チームは別のキーなので影響しない)
 */
async function lockTeam(tx: TeamTx, teamId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${teamId}))`);
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

    let latestStatus: YearRolloverLatest | null = null;
    if (latest) {
      const undoable = isUndoable(latest.executedAt, latest.undoneAt, now);
      latestStatus = {
        id: latest.id,
        executedAt: latest.executedAt.toISOString(),
        undoneAt: latest.undoneAt?.toISOString() ?? null,
        undoable,
        // 期限は UI の文言(「取り消せるのは M/D HH:mm まで」)に使う。
        // クライアントで猶予を再計算しないようサーバーで確定させる
        undoDeadline: undoable
          ? undoDeadline(latest.executedAt).toISOString()
          : null,
        affected: Object.keys(latest.snapshot).length,
        archived: countGraduating(latest.snapshot),
      };
    }

    return {
      latest: latestStatus,
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
    // 最新の実行ログを読む前にチームを直列化する(同時押しによる二重実行を防ぐ)
    await lockTeam(tx, teamId);

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
    const snapshot: RolloverSnapshot = buildSnapshot(targets);
    const { promoting, graduating } = partitionMembers(targets);

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
    // 実行と同じロック。二重取り消し・実行との競合を待たせる
    await lockTeam(tx, teamId);

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

    // 同じ学年ごとにまとめて戻す(1件ずつの UPDATE を避ける)。
    // 実行の対象は archived=false の部員だけなので snapshot の archived は常に false。
    // よって復元は archived=false / archived_at=null で固定でよい(卒団を取り消すと
    // archived_at も実行前どおり未設定に戻る)
    let restored = 0;
    for (const group of buildRestoreGroups(latest.snapshot)) {
      const rows = await tx
        .update(children)
        .set({
          grade: group.grade,
          archived: false,
          archivedAt: null,
          updatedAt: now,
        })
        .where(inArray(children.id, group.childIds))
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
