import {
  ANNOUNCEMENT_LIMIT_MAX,
  formatShortDate,
  listPublishedAnnouncements,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuardianSession } from "../../lib/session";
import { Icon } from "../icons";
import { TabBar } from "../tab-bar";

export const dynamic = "force-dynamic";

// お知らせの一覧(REQUIREMENTS §4.2-3)。ホームは最新5件なので、ここで公開済みをすべて見る
// (announcements/plan.md 設計判断3)。タブバーには置かず、ホームの「すべて見る」から来る

export default async function AnnouncementsPage() {
  const session = await getGuardianSession();
  if (!session) redirect("/");
  const announcements = await listPublishedAnnouncements(
    session.teamId,
    ANNOUNCEMENT_LIMIT_MAX,
  );

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <Link href="/" className="back" aria-label="ホームへ戻る">
            <Icon name="chevl" />
          </Link>
          お知らせ
        </h1>
      </header>
      <main className="sc-body">
        {announcements.length === 0 ? (
          <p className="help">お知らせはまだありません</p>
        ) : (
          <div className="news">
            {announcements.map((a) => (
              <Link key={a.id} href={`/announcements/${a.id}`} className="row">
                <span className="t">{a.title}</span>
                <time dateTime={a.publishedAt}>
                  {formatShortDate(a.publishedAt)}
                </time>
              </Link>
            ))}
          </div>
        )}
      </main>
      <TabBar active="home" />
    </>
  );
}
