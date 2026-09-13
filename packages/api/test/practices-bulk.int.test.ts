import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { addDays, todayInTokyo } from "../src/tokyo-date";
import { adminDeps } from "./admin-deps";

// カレンダーからのまとめ登録とプリセット(schedule-bulk-entry/plan.md 設計判断2・3)を
// RLS 配下で検証する。1 トランザクションであること・他チームに漏れないことが要点

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;

const adminApi = (team = teamId) =>
  createAdminApi(adminDeps(team, SESSION_SECRET));

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

const bulk = {
  dates: ["2026-09-13", "2026-09-06", "2026-09-20"],
  startTime: "09:00",
  endTime: "12:00",
  location: "粉浜小学校 体育館",
  note: "水筒持参",
};

async function practiceCount(team: string): Promise<number> {
  const rows =
    await owner`SELECT count(*)::int AS n FROM practices WHERE team_id = ${team}`;
  return rows[0]?.n ?? 0;
}

/** プリセット集計用の実績。RLS を通さない owner 接続で直接入れる */
async function seedPractice(
  team: string,
  heldOn: string,
  startTime: string,
  endTime: string,
  location: string | null,
): Promise<void> {
  await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${team}, ${heldOn}, ${startTime}, ${endTime}, ${location})`;
}

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

describe("まとめ登録 API", () => {
  it("未ログインは 401", async () => {
    const res = await adminApi().request("/practices/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bulk),
    });
    expect(res.status).toBe(401);
  });

  it("選んだ日をまとめて作り、月一覧に日付昇順で出る(メニューは空)", async () => {
    const c = await coachClient(adminApi());
    const res = await c("/practices/bulk", "POST", bulk);
    expect(res.status).toBe(201);
    const { practices } = (await res.json()) as {
      practices: {
        heldOn: string;
        weekday: number;
        startTime: string;
        endTime: string;
        location: string | null;
        note: string | null;
        menus: unknown[];
      }[];
    };
    expect(practices.map((p) => p.heldOn)).toEqual([
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
    ]);
    expect(practices.every((p) => p.weekday === 0)).toBe(true); // すべて日曜
    expect(practices[0]?.startTime).toBe("09:00");
    expect(practices[0]?.endTime).toBe("12:00");
    expect(practices[0]?.location).toBe("粉浜小学校 体育館");
    expect(practices[0]?.note).toBe("水筒持参");
    expect(practices.every((p) => p.menus.length === 0)).toBe(true);

    const list = (await (
      await c("/practices?month=2026-09", "GET")
    ).json()) as { practices: { heldOn: string }[] };
    expect(list.practices.map((p) => p.heldOn)).toEqual([
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
    ]);
    expect(await practiceCount(teamId)).toBe(3);
  });

  it("同じ日を重ねて選んでも 1 件になる", async () => {
    const c = await coachClient(adminApi());
    const res = await c("/practices/bulk", "POST", {
      ...bulk,
      dates: ["2026-09-06", "2026-09-06", "2026-09-13"],
    });
    expect(res.status).toBe(201);
    expect(await practiceCount(teamId)).toBe(2);
  });

  it("入力が不正なら 400 で 1 件も作らない(月またぎ・件数・時刻)", async () => {
    const c = await coachClient(adminApi());
    const cases: [unknown, string][] = [
      [{ ...bulk, dates: ["2026-09-30", "2026-10-01"] }, "同じ月"],
      [{ ...bulk, dates: [] }, "1日以上"],
      [{ ...bulk, dates: ["2026-09-06", "2026-9-13"] }, "YYYY-MM-DD"],
      [{ ...bulk, endTime: "08:00" }, "後に"],
    ];
    for (const [body, expected] of cases) {
      const res = await c("/practices/bulk", "POST", body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain(
        expected,
      );
      expect(await practiceCount(teamId)).toBe(0);
    }
  });

  it("他チームにはまとめ登録した練習が見えない(RLS)", async () => {
    const mine = await coachClient(adminApi());
    expect((await mine("/practices/bulk", "POST", bulk)).status).toBe(201);
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const list = (await (
      await other("/practices?month=2026-09", "GET")
    ).json()) as { practices: unknown[] };
    expect(list.practices).toEqual([]);
    expect(await practiceCount(otherTeamId)).toBe(0);
  });
});

describe("プリセット API", () => {
  const today = todayInTokyo();
  const d = (back: number) => addDays(today, -back);

  it("実績が無ければ空配列", async () => {
    const c = await coachClient(adminApi());
    const res = await c("/practices/presets", "GET");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { presets: unknown[] }).presets).toEqual([]);
  });

  it("直近 6 か月の実績を件数順に最大 5 件返す(同数は直近優先、6 か月より前は除外)", async () => {
    // 件数 3 / 2 / 1×4(= 6 グループ)。最も古い 1 件グループが 5 件の上限で落ちる
    for (const back of [7, 14, 21])
      await seedPractice(teamId, d(back), "09:00", "12:00", "粉浜小学校");
    for (const back of [8, 15])
      await seedPractice(teamId, d(back), "13:00", "15:00", "北粉浜小学校");
    await seedPractice(teamId, d(3), "10:00", "11:30", null);
    await seedPractice(teamId, d(30), "15:00", "17:00", "A体育館");
    await seedPractice(teamId, d(40), "16:00", "18:00", "B体育館");
    await seedPractice(teamId, d(50), "17:00", "19:00", "C体育館");
    // 6 か月より前(件数は最多だが窓の外なので出てはいけない)
    for (let i = 0; i < 10; i++)
      await seedPractice(teamId, d(400 + i), "07:00", "08:00", "旧体育館");

    const c = await coachClient(adminApi());
    const { presets } = (await (
      await c("/practices/presets", "GET")
    ).json()) as {
      presets: {
        startTime: string;
        endTime: string;
        location: string | null;
        count: number;
      }[];
    };
    expect(presets).toHaveLength(5);
    expect(presets[0]).toEqual({
      startTime: "09:00",
      endTime: "12:00",
      location: "粉浜小学校",
      count: 3,
    });
    expect(presets[1]).toEqual({
      startTime: "13:00",
      endTime: "15:00",
      location: "北粉浜小学校",
      count: 2,
    });
    // 同数(1 件)は直近に使ったものから。場所なしもグループとして返る
    expect(presets.slice(2).map((p) => p.location)).toEqual([
      null,
      "A体育館",
      "B体育館",
    ]);
    expect(presets.map((p) => p.location)).not.toContain("旧体育館");
  });

  it("他チームの実績はプリセットに混ざらない(RLS)", async () => {
    await seedPractice(otherTeamId, d(7), "09:00", "12:00", "他チーム体育館");
    await seedPractice(teamId, d(7), "13:00", "15:00", "粉浜小学校");
    const c = await coachClient(adminApi());
    const { presets } = (await (
      await c("/practices/presets", "GET")
    ).json()) as {
      presets: {
        startTime: string;
        endTime: string;
        location: string | null;
        count: number;
      }[];
    };
    expect(presets).toEqual([
      {
        startTime: "13:00",
        endTime: "15:00",
        location: "粉浜小学校",
        count: 1,
      },
    ]);
  });
});
