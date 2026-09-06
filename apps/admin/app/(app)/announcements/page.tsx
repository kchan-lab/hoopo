import { listAnnouncementsForCoach } from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { AnnouncementsEditor } from "./announcements-editor";

export const dynamic = "force-dynamic";

// お知らせ管理(REQUIREMENTS §5.2 / announcements/plan.md 6a-1)。
// 下書き保存と公開を分け、公開したものだけが保護者のホームに新しい順で出る。
// LINE 通知の実送信は 6c(#27)なのでフラグの保存だけを行う

export default async function AnnouncementsPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const announcements = await listAnnouncementsForCoach(session.teamId);

  return (
    <Shell title="お知らせ">
      <main>
        <AnnouncementsEditor initialAnnouncements={announcements} />
      </main>
    </Shell>
  );
}
