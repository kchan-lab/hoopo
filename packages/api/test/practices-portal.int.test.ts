import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者の日程参照 API(practice-schedule/plan.md 3b)を RLS 配下で検証する

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
    body: JSON.stringify({ idToken: `fake:U${"c".repeat(32)}` }),
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
  const [p1] =
    await owner`INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${teamId}, '2099-01-11', '09:00', '12:00', '粉浜小') RETURNING id`;
  await owner`INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${teamId}, '2099-01-04', '13:00', '17:00'), (${otherTeamId}, '2099-01-04', '09:00', '12:00')`;
  await owner`INSERT INTO practice_menus (team_id, practice_id, duration_min, content, sort)
    VALUES (${teamId}, ${p1?.id}, 15, 'アップ', 1), (${teamId}, ${p1?.id}, NULL, 'ゲーム', 0)`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("保護者の日程 API", () => {
  it("未ログインは 401、子ども未連携でも一覧は見える", async () => {
    expect((await api().request("/practices?month=2099-01")).status).toBe(401);
    const g = await guardianClient(api());
    const body = (await (await g("/practices?month=2099-01")).json()) as {
      practices: {
        heldOn: string;
        weekday: number;
        menus: { content: string }[];
      }[];
    };
    expect(body.practices.map((p) => [p.heldOn, p.weekday])).toEqual([
      ["2099-01-04", 0],
      ["2099-01-11", 0],
    ]);
    // メニューは sort 順
    expect(body.practices[1]?.menus.map((m) => m.content)).toEqual([
      "ゲーム",
      "アップ",
    ]);
  });

  it("次回の練習と詳細、他チームの練習は 404", async () => {
    const g = await guardianClient(api());
    const next = (await (await g("/practices/next")).json()) as {
      practice: { heldOn: string };
    };
    expect(next.practice.heldOn).toBe("2099-01-04");
    const id = (
      await owner`SELECT id FROM practices WHERE location = '粉浜小'`
    )[0]?.id;
    const detail = (await (await g(`/practices/${id}`)).json()) as {
      practice: { location: string };
    };
    expect(detail.practice.location).toBe("粉浜小");
    const otherId = (
      await owner`SELECT id FROM practices WHERE team_id = ${otherTeamId}`
    )[0]?.id;
    expect((await g(`/practices/${otherId}`)).status).toBe(404);
    expect((await g("/practices/not-a-uuid")).status).toBe(404);
  });
});
