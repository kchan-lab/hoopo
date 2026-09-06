// 予定表画像のデータ取得(6b-2)。契約は .claude/plans/schedule-publish/plan.md
// 発行前でも生成できる(発行=確定の記録であり、画像の可否ではない。設計判断1)。
// 描画そのものは apps/portal の next/og(satori)が行い、ここは DB からデータを組み立てるだけ

import { teams, withTeam } from "@hoopo/db";
import { listPracticesByMonth } from "./practices";
import { buildScheduleRows, type ScheduleRow } from "./schedule-shared";
import { formatMonthLabel } from "./tokyo-date";

export * from "./schedule-layout";

/** チーム名が取れないときの表記(§2 二層ブランディング。主役はチームだが空欄にはしない) */
export const FALLBACK_TEAM_NAME = "hoopo";

export interface ScheduleImageData {
  month: string;
  /** "2026年9月" */
  monthLabel: string;
  teamName: string;
  rows: ScheduleRow[];
  hasPractices: boolean;
}

/** 画像1枚分のデータ。teamName は teams.name(RLS 配下なので自チームの1行だけ見える) */
export async function getScheduleImageData(
  teamId: string,
  month: string,
): Promise<ScheduleImageData> {
  const practices = await listPracticesByMonth(teamId, month);
  const teamName = await withTeam(teamId, async (tx) => {
    const [row] = await tx.select({ name: teams.name }).from(teams);
    return row?.name ?? FALLBACK_TEAM_NAME;
  });
  return {
    month,
    monthLabel: formatMonthLabel(month),
    teamName,
    rows: buildScheduleRows(month, practices),
    hasPractices: practices.length > 0,
  };
}
