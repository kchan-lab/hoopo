import { feeRecords, withTeam } from "@hoopo/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  buildFeeMonths,
  type FeeMonth,
  type FeeRecordLike,
} from "./fees-shared";
import { type ChildSummary, listChildrenForGuardian } from "./registration";

// 保護者側の月謝ロジック(fees/plan.md 5a)。契約は plan.md「5a 保護者 API」。
// 対象は「active な連携で見えるお子さん」だけ(listChildrenForGuardian が唯一の基準)。
// 行が無い月も 済/未/未来 を導出するため、月次生成ジョブが未実行でも画面が成立する(設計判断1)

export interface FeeSheetRow {
  child: ChildSummary;
  /** 1〜12月の12セル */
  months: FeeMonth[];
}

export interface FeeSheet {
  year: number;
  /** Tokyo の今月("YYYY-MM")。未来の導出基準 */
  currentMonth: string;
  children: FeeSheetRow[];
}

/** 月謝確認画面の初期表示(お子さんごとの封筒グリッド) */
export async function getFeeSheet(
  teamId: string,
  guardianId: string,
  year: number,
  currentMonth: string,
): Promise<FeeSheet> {
  const children = await listChildrenForGuardian(teamId, guardianId);
  if (children.length === 0) return { year, currentMonth, children: [] };

  const childIds = children.map((c) => c.id);
  // お子さん分をまとめて1クエリで引き、childId → month → 行 に畳む
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({
        childId: feeRecords.childId,
        month: feeRecords.month,
        status: feeRecords.status,
        receivedAt: feeRecords.receivedAt,
      })
      .from(feeRecords)
      .where(
        and(inArray(feeRecords.childId, childIds), eq(feeRecords.year, year)),
      ),
  );
  const byChild = new Map<string, Map<number, FeeRecordLike>>();
  for (const id of childIds) byChild.set(id, new Map());
  for (const r of rows) {
    byChild.get(r.childId)?.set(r.month, {
      status: r.status as FeeRecordLike["status"],
      receivedAt: r.receivedAt?.toISOString() ?? null,
    });
  }

  return {
    year,
    currentMonth,
    children: children.map((child) => ({
      child,
      months: buildFeeMonths(
        byChild.get(child.id) ?? new Map(),
        year,
        currentMonth,
      ),
    })),
  };
}
