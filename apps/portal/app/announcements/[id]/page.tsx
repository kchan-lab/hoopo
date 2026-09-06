import { formatShortDate, getPublishedAnnouncement, isUuid } from "@hoopo/api";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGuardianSession } from "../../../lib/session";
import { Icon } from "../../icons";
import { TabBar } from "../../tab-bar";

export const dynamic = "force-dynamic";

// お知らせの詳細(REQUIREMENTS §4.2-3)。本文はプレーンテキストで、改行だけ反映する
// (announcements/plan.md 設計判断4)。下書き・他チームは存在を漏らさず 404

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getGuardianSession();
  if (!session) redirect("/");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const announcement = await getPublishedAnnouncement(session.teamId, id);
  if (!announcement) notFound();

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <Link
            href="/announcements"
            className="back"
            aria-label="お知らせ一覧へ戻る"
          >
            <Icon name="chevl" />
          </Link>
          お知らせ
        </h1>
      </header>
      <main className="sc-body">
        <article className="card article">
          <div className="kicker">
            <time dateTime={announcement.publishedAt}>
              {formatShortDate(announcement.publishedAt)}
            </time>
          </div>
          <h2 className="ttl">{announcement.title}</h2>
          <p className="body">{announcement.body}</p>
        </article>
      </main>
      <TabBar active="home" />
    </>
  );
}
