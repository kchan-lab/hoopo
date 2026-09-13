import {
  formatMonthLabel,
  getLineUsage,
  getPublishStatus,
  listLineMessages,
  listPracticePresets,
  listPracticesByMonth,
  monthOf,
  parseMonth,
  todayInTokyo,
} from "@hoopo/api";
import { redirect } from "next/navigation";
import { lineClient } from "../../../lib/line";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { ScheduleEditor } from "./schedule-editor";

export const dynamic = "force-dynamic";

// 日程管理(REQUIREMENTS §5.2。ワイヤー PC-6 / SP-7)。
// 月単位で練習を行入力し、練習ごとにメニューを登録する。発行(#26)は 6b-1、
// LINE 送信と通数カウンター(#27)は 6c-1 で有効化した。
// 送信ログは「n 回目の送信」の判定にも使うので少し多めに読む(表示は最新5件)

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { month: raw } = await searchParams;
  const today = todayInTokyo();
  const month = parseMonth(raw) ?? monthOf(today);
  const [practices, publishStatus, lineUsage, lineMessages, presets] =
    await Promise.all([
      listPracticesByMonth(session.teamId, month),
      getPublishStatus(session.teamId, month),
      getLineUsage(session.teamId, lineClient()),
      listLineMessages(session.teamId, 20),
      // まとめ登録の時間帯プリセット(過去の実績から集計。schedule-bulk-entry/plan.md 設計判断2)
      listPracticePresets(session.teamId),
    ]);

  return (
    <Shell title="日程管理">
      <main>
        <ScheduleEditor
          month={month}
          monthLabel={formatMonthLabel(month)}
          today={today}
          initialPractices={practices}
          publishStatus={publishStatus}
          lineUsage={lineUsage}
          lineMessages={lineMessages}
          presets={presets}
        />
      </main>
    </Shell>
  );
}
