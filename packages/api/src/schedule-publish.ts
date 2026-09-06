// 発行(月の練習の確定)ロジック(6b-1)。契約は .claude/plans/schedule-publish/plan.md
// 発行は「確定の記録」であって画像生成とは独立(設計判断1)。published_at を付けるだけで、
// 予定表画像は毎回 DB から動的生成する。再発行は同じ操作で上書きする

import { practices, withTeam } from "@hoopo/db";
import { and, count, gte, lte, max } from "drizzle-orm";
import { monthRange } from "./tokyo-date";

export interface PublishStatus {
  month: string;
  /** その月の練習数 */
  total: number;
  /** そのうち published_at がある数 */
  published: number;
  /** 最新の published_at(ISO)。未発行なら null */
  publishedAt: string | null;
}

export type PublishResult =
  | { ok: true; month: string; published: number; publishedAt: string }
  | { ok: false; reason: "no_practices" };

/** 月の発行状況。発行後に練習を足した場合は total > published になる */
export async function getPublishStatus(
  teamId: string,
  month: string,
): Promise<PublishStatus> {
  const { from, to } = monthRange(month);
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .select({
        total: count(),
        // count(列) は NULL を数えないので、そのまま「発行済みの数」になる
        published: count(practices.publishedAt),
        publishedAt: max(practices.publishedAt),
      })
      .from(practices)
      .where(and(gte(practices.heldOn, from), lte(practices.heldOn, to)));
    return {
      month,
      total: row?.total ?? 0,
      published: row?.published ?? 0,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
    };
  });
}

/** 月の練習をすべて発行済みにする(再発行も同じ操作)。練習が無ければ no_practices */
export async function publishSchedule(
  teamId: string,
  month: string,
): Promise<PublishResult> {
  const { from, to } = monthRange(month);
  return withTeam(teamId, async (tx) => {
    // 発行時刻は1回の操作で1つ。全行が同じ published_at になり、画像のキャッシュ回避キーにも使える
    const now = new Date();
    const rows = await tx
      .update(practices)
      .set({ publishedAt: now, updatedAt: now })
      .where(and(gte(practices.heldOn, from), lte(practices.heldOn, to)))
      .returning({ id: practices.id });
    if (rows.length === 0) return { ok: false, reason: "no_practices" };
    return {
      ok: true,
      month,
      published: rows.length,
      publishedAt: now.toISOString(),
    };
  });
}
