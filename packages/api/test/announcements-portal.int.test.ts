import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者のお知らせ API(announcements/plan.md 6a-2)を RLS 配下で検証する。
// 見えてよいのは「自分のチームの公開済み」だけ。下書き・他チームは一覧に出ず、詳細も 404

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;

const api = (team = teamId) =>
  createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: "1".repeat(64),
    hmacKey: "2".repeat(64),
    secureCookie: false,
  });

async function guardianClient(app: ReturnType<typeof api>) {
  const res = await app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:U${"d".repeat(32)}` }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("セッション Cookie が発行されていません");
  return (path: string) =>
    app.request(path, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${value}` },
    });
}

async function idOf(title: string): Promise<string> {
  const [row] =
    await owner`SELECT id FROM announcements WHERE title = ${title}`;
  if (!row) throw new Error(`お知らせが見つかりません: ${title}`);
  return row.id as string;
}

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [a] = await owner`INSERT INTO teams (name) VALUES ('SKC') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('他チーム') RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  // 公開2件(新しい順は 予定表 → 駐車場)・下書き1件・公開日時が未来1件・他チームの公開1件
  await owner`INSERT INTO announcements (team_id, title, body, published_at) VALUES
    (${teamId}, '体育館の駐車場について', '路上駐車はしないでください', '2024-07-21T09:00:00+09:00'),
    (${teamId}, '8月の予定表を発行しました', '8月の予定表を発行しました。\n確認してください', '2024-07-28T09:00:00+09:00'),
    (${teamId}, '未来のお知らせ', 'まだ表示されない', '2099-01-01T09:00:00+09:00'),
    (${otherTeamId}, '他チームのお知らせ', '見えてはいけない', '2024-07-29T09:00:00+09:00')`;
  await owner`INSERT INTO announcements (team_id, title, body) VALUES
    (${teamId}, '下書きのお知らせ', 'まだ公開していない')`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

type ListBody = {
  announcements: { id: string; title: string; publishedAt: string }[];
};
type DetailBody = { announcement: { title: string; body: string } };

describe("保護者のお知らせ API", () => {
  it("未ログインは 401、公開済みだけが新しい順に出る", async () => {
    expect((await api().request("/announcements")).status).toBe(401);
    const g = await guardianClient(api());
    const body = (await (await g("/announcements")).json()) as ListBody;
    expect(body.announcements.map((a) => a.title)).toEqual([
      "8月の予定表を発行しました",
      "体育館の駐車場について",
    ]);
    expect(body.announcements[0]?.publishedAt).toBe(
      new Date("2024-07-28T09:00:00+09:00").toISOString(),
    );
  });

  it("limit で件数を絞れ、不正な limit は 400", async () => {
    const g = await guardianClient(api());
    const body = (await (await g("/announcements?limit=1")).json()) as ListBody;
    expect(body.announcements.map((a) => a.title)).toEqual([
      "8月の予定表を発行しました",
    ]);
    expect((await g("/announcements?limit=0")).status).toBe(400);
    expect((await g("/announcements?limit=51")).status).toBe(400);
    expect((await g("/announcements?limit=abc")).status).toBe(400);
  });

  it("詳細は本文を返し、下書き・他チーム・不正な id は 404", async () => {
    const g = await guardianClient(api());
    const id = await idOf("8月の予定表を発行しました");
    const detail = (await (
      await g(`/announcements/${id}`)
    ).json()) as DetailBody;
    expect(detail.announcement.title).toBe("8月の予定表を発行しました");
    expect(detail.announcement.body).toContain("確認してください");

    expect(
      (await g(`/announcements/${await idOf("下書きのお知らせ")}`)).status,
    ).toBe(404);
    expect(
      (await g(`/announcements/${await idOf("未来のお知らせ")}`)).status,
    ).toBe(404);
    expect(
      (await g(`/announcements/${await idOf("他チームのお知らせ")}`)).status,
    ).toBe(404);
    expect((await g("/announcements/not-a-uuid")).status).toBe(404);
  });

  it("他チームの保護者には他チームのお知らせだけが見える", async () => {
    const g = await guardianClient(api(otherTeamId));
    const body = (await (await g("/announcements")).json()) as ListBody;
    expect(body.announcements.map((a) => a.title)).toEqual([
      "他チームのお知らせ",
    ]);
  });
});
