import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";

// 管理のお知らせ API(announcements/plan.md 6a-1)を RLS 配下で検証する。
// 公開の意味は published_at の有無(設計判断1): 編集しても公開日時は維持し、
// 下書きに戻すと null、再公開で新しい日時になる

const SESSION_SECRET = "6".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;

const adminApi = (team = teamId) =>
  createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "coach-pass-1" }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${ADMIN_SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("管理者セッション Cookie が発行されていません");
  const cookie = `${ADMIN_SESSION_COOKIE_NAME}=${value}`;
  return (
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  notifyLine: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const draftInput = {
  title: "体育館の変更について",
  body: "9月の練習は粉浜小学校の体育館で行います。",
  notifyLine: false,
  publish: false,
};

const publishedInput = {
  title: "9月の予定表を発行しました",
  body: "参加予定の提出をお願いします。",
  notifyLine: true,
  publish: true,
};

beforeAll(async () => {
  coachHash = await hashPassword("coach-pass-1");
});

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
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash}),
           (${otherTeamId}, 'other@example.com', 'email', ${coachHash})`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("お知らせ管理 API", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request("/announcements")).status).toBe(401);
  });

  it("下書き・公開を作成し、下書きが先頭 → 公開済みを新しい順に並べる", async () => {
    const c = await coachClient(adminApi());
    const first = await c("/announcements", "POST", publishedInput);
    expect(first.status).toBe(201);
    const published = ((await first.json()) as { announcement: Announcement })
      .announcement;
    expect(published.publishedAt).not.toBeNull();
    expect(published.notifyLine).toBe(true);

    const draft = (
      (await (await c("/announcements", "POST", draftInput)).json()) as {
        announcement: Announcement;
      }
    ).announcement;
    expect(draft.publishedAt).toBeNull();

    const { announcements: list } = (await (
      await c("/announcements", "GET")
    ).json()) as { announcements: Announcement[] };
    // 下書きは公開日時を持たないが一覧の先頭に出す(書きかけを見失わせない)
    expect(list.map((a) => a.id)).toEqual([draft.id, published.id]);
    expect(list[0]?.body).toBe(draftInput.body);
  });

  it("公開済みの編集は公開日時を維持し、下書きに戻す → 再公開で新しい日時になる", async () => {
    const c = await coachClient(adminApi());
    const created = (
      (await (await c("/announcements", "POST", publishedInput)).json()) as {
        announcement: Announcement;
      }
    ).announcement;
    const firstPublishedAt = created.publishedAt;
    expect(firstPublishedAt).not.toBeNull();

    // 公開済みのまま本文を編集 → published_at は動かない(並び順が動かない)
    const edited = (
      (await (
        await c(`/announcements/${created.id}`, "PUT", {
          ...publishedInput,
          body: "体育館が変更になりました。",
        })
      ).json()) as { announcement: Announcement }
    ).announcement;
    expect(edited.publishedAt).toBe(firstPublishedAt);
    expect(edited.body).toBe("体育館が変更になりました。");

    // 下書きに戻す
    const unpublished = (
      (await (
        await c(`/announcements/${created.id}`, "PUT", {
          ...publishedInput,
          publish: false,
        })
      ).json()) as { announcement: Announcement }
    ).announcement;
    expect(unpublished.publishedAt).toBeNull();

    // 再公開すると新しい日時になる
    const republished = (
      (await (
        await c(`/announcements/${created.id}`, "PUT", publishedInput)
      ).json()) as { announcement: Announcement }
    ).announcement;
    expect(republished.publishedAt).not.toBeNull();
    expect(
      Date.parse(republished.publishedAt as string),
    ).toBeGreaterThanOrEqual(Date.parse(firstPublishedAt as string));
  });

  it("下書きを公開できる / 削除できる / 不在は 404", async () => {
    const c = await coachClient(adminApi());
    const draft = (
      (await (await c("/announcements", "POST", draftInput)).json()) as {
        announcement: Announcement;
      }
    ).announcement;

    const published = (
      (await (
        await c(`/announcements/${draft.id}`, "PUT", {
          ...draftInput,
          publish: true,
        })
      ).json()) as { announcement: Announcement }
    ).announcement;
    expect(published.publishedAt).not.toBeNull();

    expect((await c(`/announcements/${draft.id}`, "DELETE")).status).toBe(204);
    expect((await c(`/announcements/${draft.id}`, "DELETE")).status).toBe(404);
    expect(
      (await c(`/announcements/${draft.id}`, "PUT", draftInput)).status,
    ).toBe(404);
    // UUID でない id も存在を漏らさず 404
    expect((await c("/announcements/not-a-uuid", "DELETE")).status).toBe(404);
    expect(
      (await c("/announcements/not-a-uuid", "PUT", draftInput)).status,
    ).toBe(404);

    const { announcements: list } = (await (
      await c("/announcements", "GET")
    ).json()) as { announcements: Announcement[] };
    expect(list).toEqual([]);
  });

  it("入力不正は 400", async () => {
    const c = await coachClient(adminApi());
    const empty = await c("/announcements", "POST", {
      ...draftInput,
      title: "   ",
    });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toContain(
      "タイトル",
    );

    const long = await c("/announcements", "POST", {
      ...draftInput,
      body: "あ".repeat(2001),
    });
    expect(long.status).toBe(400);
    expect(
      (await c("/announcements", "POST", { ...draftInput, publish: "yes" }))
        .status,
    ).toBe(400);
  });

  it("他チームのお知らせは見えず、更新・削除もできない(RLS)", async () => {
    const mine = await coachClient(adminApi());
    const created = (
      (await (await mine("/announcements", "POST", publishedInput)).json()) as {
        announcement: Announcement;
      }
    ).announcement;

    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const { announcements: list } = (await (
      await other("/announcements", "GET")
    ).json()) as { announcements: Announcement[] };
    expect(list).toEqual([]);
    expect(
      (await other(`/announcements/${created.id}`, "PUT", publishedInput))
        .status,
    ).toBe(404);
    expect((await other(`/announcements/${created.id}`, "DELETE")).status).toBe(
      404,
    );
    const rows =
      await owner`SELECT count(*)::int AS n FROM announcements WHERE id = ${created.id}`;
    expect(rows[0]?.n).toBe(1);
  });
});
