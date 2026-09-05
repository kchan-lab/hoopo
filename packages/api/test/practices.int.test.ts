import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";

// 日程管理 API(practice-schedule/plan.md 3a)を RLS 配下で検証する

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

const input = {
  heldOn: "2026-09-06",
  startTime: "09:00",
  endTime: "12:00",
  location: "粉浜小学校 体育館",
  note: "水筒持参",
  menus: [
    { durationMin: 15, content: "アップ" },
    { durationMin: null, content: "ゲーム形式" },
  ],
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

describe("日程管理 API", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request("/practices")).status).toBe(401);
  });

  it("作成 → 月一覧(曜日は生成列)→ 更新(メニュー全置換)→ 削除", async () => {
    const c = await coachClient(adminApi());
    const created = await c("/practices", "POST", input);
    expect(created.status).toBe(201);
    const { practice } = (await created.json()) as {
      practice: {
        id: string;
        weekday: number;
        startTime: string;
        menus: { content: string; sort: number }[];
      };
    };
    expect(practice.weekday).toBe(0); // 2026-09-06 は日曜
    expect(practice.startTime).toBe("09:00");
    expect(practice.menus.map((m) => [m.content, m.sort])).toEqual([
      ["アップ", 0],
      ["ゲーム形式", 1],
    ]);

    // 別月の練習は一覧に出ない
    await c("/practices", "POST", { ...input, heldOn: "2026-10-04" });
    const list = (await (
      await c("/practices?month=2026-09", "GET")
    ).json()) as {
      month: string;
      practices: { heldOn: string }[];
    };
    expect(list.month).toBe("2026-09");
    expect(list.practices.map((p) => p.heldOn)).toEqual(["2026-09-06"]);
    expect((await c("/practices?month=2026-9", "GET")).status).toBe(400);

    const updated = await c(`/practices/${practice.id}`, "PUT", {
      ...input,
      startTime: "13:00",
      endTime: "17:00",
      menus: [{ durationMin: 45, content: "シュート" }],
    });
    expect(updated.status).toBe(200);
    const after = (await updated.json()) as {
      practice: { startTime: string; menus: { content: string }[] };
    };
    expect(after.practice.startTime).toBe("13:00");
    expect(after.practice.menus.map((m) => m.content)).toEqual(["シュート"]);
    const menuRows =
      await owner`SELECT count(*)::int AS n FROM practice_menus WHERE practice_id = ${practice.id}`;
    expect(menuRows[0]?.n).toBe(1);

    expect((await c(`/practices/${practice.id}`, "DELETE")).status).toBe(204);
    expect((await c(`/practices/${practice.id}`, "DELETE")).status).toBe(404);
    // CASCADE で当該練習のメニューだけ消える(10月の練習のメニューは残る)
    const rest =
      await owner`SELECT count(*)::int AS n FROM practice_menus WHERE practice_id = ${practice.id}`;
    expect(rest[0]?.n).toBe(0);
  });

  it("入力不正は 400", async () => {
    const c = await coachClient(adminApi());
    const res = await c("/practices", "POST", { ...input, endTime: "08:00" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("後に");
  });

  it("他チームの練習は見えず、更新・削除もできない(RLS)", async () => {
    const mine = await coachClient(adminApi());
    const { practice } = (await (
      await mine("/practices", "POST", input)
    ).json()) as { practice: { id: string } };
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const list = (await (
      await other("/practices?month=2026-09", "GET")
    ).json()) as { practices: unknown[] };
    expect(list.practices).toEqual([]);
    expect(
      (await other(`/practices/${practice.id}`, "PUT", input)).status,
    ).toBe(404);
    expect((await other(`/practices/${practice.id}`, "DELETE")).status).toBe(
      404,
    );
    const rows =
      await owner`SELECT count(*)::int AS n FROM practices WHERE id = ${practice.id}`;
    expect(rows[0]?.n).toBe(1);
  });
});
