import {
  getLineUsage,
  listAnnouncementsForCoach,
  listLineMessages,
} from "@hoopo/api";
import { redirect } from "next/navigation";
import { lineClient } from "../../../lib/line";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { AnnouncementsEditor } from "./announcements-editor";

export const dynamic = "force-dynamic";

// お知らせ管理(REQUIREMENTS §5.2 / announcements/plan.md 6a-1)。
// 下書き保存と公開を分け、公開したものだけが保護者のホームに新しい順で出る。
// LINE へは「通知あり かつ 公開済み」の行から明示的に送る(line-send/plan.md 6c-1)。
// 送信ログは各行の「送信済み」表示に使うので、一覧の行数を見込んで多めに読む

export default async function AnnouncementsPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const [announcements, lineUsage, lineMessages] = await Promise.all([
    listAnnouncementsForCoach(session.teamId),
    getLineUsage(session.teamId, lineClient()),
    listLineMessages(session.teamId, 50),
  ]);

  return (
    <Shell title="お知らせ">
      <main>
        <AnnouncementsEditor
          initialAnnouncements={announcements}
          lineUsage={lineUsage}
          lineMessages={lineMessages}
        />
      </main>
    </Shell>
  );
}
