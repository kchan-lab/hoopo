import {
  formatMonthLabel,
  getPublishStatus,
  listPracticesByMonth,
  monthOf,
  parseMonth,
  todayInTokyo,
} from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { ScheduleEditor } from "./schedule-editor";

export const dynamic = "force-dynamic";

// 日程管理(REQUIREMENTS §5.2。ワイヤー PC-6 / SP-7)。
// 月単位で練習を行入力し、練習ごとにメニューを登録する。発行(#26)は 6b-1 で有効化、
// LINE 送信と通数カウンター(#27)は 6c まで無効表示

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { month: raw } = await searchParams;
  const month = parseMonth(raw) ?? monthOf(todayInTokyo());
  const [practices, publishStatus] = await Promise.all([
    listPracticesByMonth(session.teamId, month),
    getPublishStatus(session.teamId, month),
  ]);

  return (
    <Shell title="日程管理">
      <main>
        <ScheduleEditor
          month={month}
          monthLabel={formatMonthLabel(month)}
          initialPractices={practices}
          publishStatus={publishStatus}
        />
      </main>
    </Shell>
  );
}
