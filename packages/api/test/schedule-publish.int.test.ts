import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";

// 予定表の発行 API(schedule-publish/plan.md 6b-1)を RLS 配下で検証する

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;

const MONTH = "2026-09";

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
  return (path: string, method: "GET" | "POST", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const practice = (heldOn: string) => ({
  heldOn,
  startTime: "09:00",
  endTime: "12:00",
  location: "粉浜小学校 体育館",
  note: null,
  menus: [],
});

type CoachClient = Awaited<ReturnType<typeof coachClient>>;

async function addPractice(c: CoachClient, heldOn: string) {
  const res = await c("/practices", "POST", practice(heldOn));
  expect(res.status).toBe(201);
}

const status = async (c: CoachClient, month = MONTH) =>
  (await (await c(`/schedule/status?month=${month}`, "GET")).json()) as {
    month: string;
    total: number;
    published: number;
    publishedAt: string | null;
  };

const publishedCount = async (team: string) => {
  const rows =
    await owner`SELECT count(*)::int AS n FROM practices WHERE team_id = ${team} AND published_at IS NOT NULL`;
  return rows[0]?.n as number;
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

describe("予定表の発行 API", () => {
  it("未ログインは 401", async () => {
    const app = adminApi();
    expect((await app.request("/schedule/status")).status).toBe(401);
    expect(
      (
        await app.request("/schedule/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: MONTH }),
        })
      ).status,
    ).toBe(401);
  });

  it("発行前後の状況 → 再発行で publishedAt が進む", async () => {
    const c = await coachClient(adminApi());
    await addPractice(c, `${MONTH}-06`);
    await addPractice(c, `${MONTH}-13`);
    // 別月の練習は数に入らない
    await addPractice(c, "2026-10-04");

    const before = await status(c);
    expect(before).toEqual({
      month: MONTH,
      total: 2,
      published: 0,
      publishedAt: null,
    });

    const res = await c("/schedule/publish", "POST", { month: MONTH });
    expect(res.status).toBe(200);
    const published = (await res.json()) as {
      month: string;
      published: number;
      publishedAt: string;
    };
    expect(published.month).toBe(MONTH);
    expect(published.published).toBe(2);

    const after = await status(c);
    expect(after.total).toBe(2);
    expect(after.published).toBe(2);
    expect(after.publishedAt).toBe(published.publishedAt);
    // 10月は発行されていない
    expect(await status(c, "2026-10")).toEqual({
      month: "2026-10",
      total: 1,
      published: 0,
      publishedAt: null,
    });

    // 発行後に足した練習は未発行のまま(total > published)
    await addPractice(c, `${MONTH}-20`);
    const partial = await status(c);
    expect(partial.total).toBe(3);
    expect(partial.published).toBe(2);

    // 再発行は同じ操作で全件を上書きし、publishedAt が進む
    const again = (await (
      await c("/schedule/publish", "POST", { month: MONTH })
    ).json()) as { published: number; publishedAt: string };
    expect(again.published).toBe(3);
    expect(new Date(again.publishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(published.publishedAt).getTime(),
    );
    const republished = await status(c);
    expect(republished.published).toBe(3);
    expect(republished.publishedAt).toBe(again.publishedAt);
  });

  it("練習が無い月は 400、month の形式不正も 400", async () => {
    const c = await coachClient(adminApi());
    const empty = await c("/schedule/publish", "POST", { month: MONTH });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe(
      "この月には練習がありません",
    );

    expect(
      (await c("/schedule/publish", "POST", { month: "2026-9" })).status,
    ).toBe(400);
    expect((await c("/schedule/publish", "POST", {})).status).toBe(400);
    expect((await c("/schedule/status?month=2026-13", "GET")).status).toBe(400);
  });

  it("他チームのコーチは発行できない(RLS)", async () => {
    const mine = await coachClient(adminApi());
    await addPractice(mine, `${MONTH}-06`);

    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    // 他チームの練習は見えないので、同じ月でも「練習がありません」になる
    expect(await status(other)).toEqual({
      month: MONTH,
      total: 0,
      published: 0,
      publishedAt: null,
    });
    const res = await other("/schedule/publish", "POST", { month: MONTH });
    expect(res.status).toBe(400);
    // A チームの練習は未発行のまま
    expect(await publishedCount(teamId)).toBe(0);
    expect((await status(mine)).publishedAt).toBeNull();

    expect(
      (await mine("/schedule/publish", "POST", { month: MONTH })).status,
    ).toBe(200);
    expect(await publishedCount(teamId)).toBe(1);
    expect(await publishedCount(otherTeamId)).toBe(0);
  });
});
