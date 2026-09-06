import { children, feeRecords, withTeam } from "@hoopo/db";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  buildFeeMonths,
  type FeeMonth,
  type FeeRecordLike,
  type FeeToggleInput,
  feeState,
} from "./fees-shared";

// 管理側の月謝ロジック(fees/plan.md 5b)。現金運用の可視化のみで決済はしない(絶対原則7)。
// 「未来」は行を持たず year/month から導出する(§7)ので、ジョブ未実行でもグリッドは成立する

/** グリッドの行に出す部員の最小情報(個人情報は最小保持。氏名・呼び名・学年のみ) */
export interface FeeChild {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
}

export interface FeeGridRow {
  child: FeeChild;
  /** 1〜12月の12セル */
  months: FeeMonth[];
}

export interface FeeGrid {
  year: number;
  /** Tokyo の今月("YYYY-MM")。未来セルの判定に使う */
  currentMonth: string;
  rows: FeeGridRow[];
}

export type FeeToggleResult =
  | { ok: true; month: FeeMonth }
  | { ok: false; reason: "not_found" };

function toRecord(row: {
  status: string;
  receivedAt: Date | null;
}): FeeRecordLike {
  return {
    status: row.status === "paid" ? "paid" : "unpaid",
    receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
  };
}

/**
 * 部員(行)×1〜12月(列)の封筒グリッド(§5.2 月謝管理)。
 * 並び順は出欠管理・部員管理(listMembers)と同じ 学年降順→名前
 */
export async function getFeeGrid(
  teamId: string,
  year: number,
  currentMonth: string,
): Promise<FeeGrid> {
  const rows = await withTeam(teamId, async (tx) => {
    const members = await tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
      })
      .from(children)
      .where(and(eq(children.archived, false), eq(children.status, "active")))
      .orderBy(desc(children.grade), asc(children.name));
    if (members.length === 0) return [];
    // 1年分をまとめて1クエリで引く(RLS 配下なので自チームの行だけが返る)
    const records = await tx
      .select({
        childId: feeRecords.childId,
        month: feeRecords.month,
        status: feeRecords.status,
        receivedAt: feeRecords.receivedAt,
      })
      .from(feeRecords)
      .where(eq(feeRecords.year, year));
    const byChild = new Map<string, Map<number, FeeRecordLike>>();
    for (const r of records) {
      const months = byChild.get(r.childId) ?? new Map<number, FeeRecordLike>();
      months.set(r.month, toRecord(r));
      byChild.set(r.childId, months);
    }
    const empty = new Map<number, FeeRecordLike>();
    return members.map((child) => ({
      child,
      months: buildFeeMonths(
        byChild.get(child.id) ?? empty,
        year,
        currentMonth,
      ),
    }));
  });
  return { year, currentMonth, rows };
}

/**
 * セル1つの 済⇄未(封筒にハンコを押す操作の再現。確認ダイアログは挟まない。plan.md 設計判断3)。
 * unique(child_id, year, month) で upsert し、済は received_at を今に、未は null にする。
 * 未来の月への「済」は前払いとして許可する(設計判断6)。
 * 有効な部員(active・非アーカイブ)でなければ not_found(他チームの部員は RLS で見つからない)
 */
export async function setFeeStatus(
  teamId: string,
  input: FeeToggleInput,
  currentMonth: string,
): Promise<FeeToggleResult> {
  return withTeam(teamId, async (tx): Promise<FeeToggleResult> => {
    const [child] = await tx
      .select({ id: children.id })
      .from(children)
      .where(
        and(
          eq(children.id, input.childId),
          eq(children.archived, false),
          eq(children.status, "active"),
        ),
      )
      .limit(1);
    if (!child) return { ok: false, reason: "not_found" };

    const now = new Date();
    const receivedAt = input.status === "paid" ? now : null;
    const [row] = await tx
      .insert(feeRecords)
      .values({
        teamId,
        childId: input.childId,
        year: input.year,
        month: input.month,
        status: input.status,
        receivedAt,
      })
      .onConflictDoUpdate({
        target: [feeRecords.childId, feeRecords.year, feeRecords.month],
        set: { status: input.status, receivedAt, updatedAt: now },
      })
      .returning({
        status: feeRecords.status,
        receivedAt: feeRecords.receivedAt,
      });
    if (!row) return { ok: false, reason: "not_found" };

    const record = toRecord(row);
    const state = feeState(record, input.year, input.month, currentMonth);
    return {
      ok: true,
      month: {
        month: input.month,
        state,
        receivedAt: state === "paid" ? record.receivedAt : null,
      },
    };
  });
}
