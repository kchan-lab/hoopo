import { announcements, withTeam } from "@hoopo/db";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";

// 保護者側のお知らせロジック(announcements/plan.md 6a-2)。契約は plan.md「6a-2 保護者 API」。
// 保護者に見せるのは「公開済み(published_at が入っていて、かつ今以前)」だけ(設計判断1)。
// 下書き・予約日時が未来のものは一覧にも詳細にも出さない(詳細は 404)

/** 一覧の1件(ホームの .news 行・一覧ページ) */
export interface PublishedAnnouncement {
  id: string;
  title: string;
  /** 公開日時(ISO)。一覧・詳細とも公開済みなので必ず入る */
  publishedAt: string;
}

/** 詳細(本文つき) */
export interface PublishedAnnouncementDetail extends PublishedAnnouncement {
  body: string;
}

/** 一覧の取得件数。ホームは最新5件、一覧ページは全件相当(設計判断3) */
export const ANNOUNCEMENT_LIMIT_MIN = 1;
export const ANNOUNCEMENT_LIMIT_MAX = 50;
export const ANNOUNCEMENT_LIMIT_DEFAULT = 20;
/** ホームに出す件数 */
export const HOME_ANNOUNCEMENT_LIMIT = 5;

/** クエリの limit(1〜50)。不正なら null を返し、呼び出し側で 400 にする */
export function parseAnnouncementLimit(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) &&
    n >= ANNOUNCEMENT_LIMIT_MIN &&
    n <= ANNOUNCEMENT_LIMIT_MAX
    ? n
    : null;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return ANNOUNCEMENT_LIMIT_DEFAULT;
  return Math.min(
    ANNOUNCEMENT_LIMIT_MAX,
    Math.max(ANNOUNCEMENT_LIMIT_MIN, Math.trunc(limit)),
  );
}

/** 公開済みのお知らせを新しい順に。limit は 1〜50 に丸める */
export async function listPublishedAnnouncements(
  teamId: string,
  limit: number = ANNOUNCEMENT_LIMIT_DEFAULT,
): Promise<PublishedAnnouncement[]> {
  const now = new Date();
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({
        id: announcements.id,
        title: announcements.title,
        publishedAt: announcements.publishedAt,
      })
      .from(announcements)
      .where(
        and(
          isNotNull(announcements.publishedAt),
          lte(announcements.publishedAt, now),
        ),
      )
      .orderBy(desc(announcements.publishedAt))
      .limit(clampLimit(limit)),
  );
  // publishedAt は where で絞り込み済み。型の null を落とすためだけの ?? は置かない
  return rows.flatMap((r) =>
    r.publishedAt
      ? [{ id: r.id, title: r.title, publishedAt: r.publishedAt.toISOString() }]
      : [],
  );
}

/** 公開済みのお知らせ1件。下書き・未来公開・他チーム・不在はすべて null */
export async function getPublishedAnnouncement(
  teamId: string,
  announcementId: string,
): Promise<PublishedAnnouncementDetail | null> {
  const now = new Date();
  const [row] = await withTeam(teamId, (tx) =>
    tx
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        publishedAt: announcements.publishedAt,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          isNotNull(announcements.publishedAt),
          lte(announcements.publishedAt, now),
        ),
      )
      .limit(1),
  );
  if (!row?.publishedAt) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt.toISOString(),
  };
}
