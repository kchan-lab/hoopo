import { announcements, withTeam } from "@hoopo/db";
import { desc, eq, sql } from "drizzle-orm";
import type { AnnouncementInput } from "./announcements-shared";

// 管理側のお知らせロジック(announcements/plan.md 6a-1)。契約は plan.md「API 契約」。
// 公開の意味は published_at の有無(設計判断1): null = 下書きで保護者には見えない。
// 公開日時は「公開した瞬間」で、編集しても維持する(ホームの並び順が編集で動かない)。
// notify_line は保存するだけで、LINE の実送信と通数の計上は 6c(#27。設計判断2)

export interface Announcement {
  id: string;
  title: string;
  body: string;
  notifyLine: boolean;
  /** null = 下書き(保護者に見せない) */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  title: string;
  body: string;
  notifyLine: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toAnnouncement(r: Row): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    notifyLine: r.notifyLine,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const rowColumns = {
  id: announcements.id,
  title: announcements.title,
  body: announcements.body,
  notifyLine: announcements.notifyLine,
  publishedAt: announcements.publishedAt,
  createdAt: announcements.createdAt,
  updatedAt: announcements.updatedAt,
};

/**
 * 管理の一覧。下書きを含む全件。
 * 下書き(published_at = null)を先頭に作成の新しい順、続いて公開済みを公開日時の新しい順に並べる
 * (書きかけを見失わせない)。NULLS FIRST は Postgres の DESC 既定だが明示しておく
 */
export async function listAnnouncementsForCoach(
  teamId: string,
): Promise<Announcement[]> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select(rowColumns)
      .from(announcements)
      .orderBy(
        sql`${announcements.publishedAt} desc nulls first`,
        desc(announcements.createdAt),
      );
    return rows.map(toAnnouncement);
  });
}

/** publish: true なら公開(published_at = 今)。false なら下書き(null) */
export async function createAnnouncement(
  teamId: string,
  input: AnnouncementInput,
): Promise<Announcement> {
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        teamId,
        title: input.title,
        body: input.body,
        notifyLine: input.notifyLine,
        publishedAt: input.publish ? new Date() : null,
      })
      .returning(rowColumns);
    if (!row) throw new Error("お知らせの作成に失敗しました");
    return toAnnouncement(row);
  });
}

/**
 * 更新。publish: true は未公開なら published_at を今にし、公開済みなら維持する(設計判断1)。
 * publish: false は下書きに戻す(published_at = null。再公開すると新しい日時になる)。
 * 他チーム・不在は null(RLS 配下で行が見つからない)
 */
export async function updateAnnouncement(
  teamId: string,
  id: string,
  input: AnnouncementInput,
): Promise<Announcement | null> {
  return withTeam(teamId, async (tx) => {
    // 公開日時の維持判定は SQL 側で行い、1クエリで更新する
    // (publish: 既存の published_at があれば維持、無ければ now()。下書きに戻すなら null)
    const [row] = await tx
      .update(announcements)
      .set({
        title: input.title,
        body: input.body,
        notifyLine: input.notifyLine,
        publishedAt: input.publish
          ? sql`coalesce(${announcements.publishedAt}, now())`
          : null,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning(rowColumns);
    return row ? toAnnouncement(row) : null;
  });
}

/** 物理削除(下書き・公開のどちらも)。他チーム・不在は false */
export async function deleteAnnouncement(
  teamId: string,
  id: string,
): Promise<boolean> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });
    return rows.length > 0;
  });
}
