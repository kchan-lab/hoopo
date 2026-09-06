import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者の参加予定 API(attendance/plan.md 4a)を RLS 配下で検証する。
// 接続・リセット方式は practices-portal.int.test.ts と同じ

const SESSION_SECRET = "8".repeat(64);
const USER_A = `U${"a".repeat(32)}`;
const USER_B = `U${"b".repeat(32)}`;

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let practiceA: string;
let practiceB: string;
let otherPractice: string;

function api(team = teamId) {
  return createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: "1".repeat(64),
    hmacKey: "2".repeat(64),
    secureCookie: false,
  });
}

async function loginAs(app: ReturnType<typeof api>, userId: string) {
  const res = await app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:${userId}` }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("セッション Cookie が発行されていません");
  return `${SESSION_COOKIE_NAME}=${value}`;
}

function json(app: ReturnType<typeof api>, cookie: string) {
  return (path: string, method: "GET" | "POST" | "PUT", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const registration = {
  children: [
    { name: "粉浜 太郎", nicknameKana: "たろう", grade: 4, gender: "male" },
    { name: "粉浜 花子", nicknameKana: null, grade: 2, gender: "female" },
  ],
  relation: "father",
  weekdays: [0, 6],
  startTime: "09:00",
  endTime: "12:00",
  coachNote: null,
};

interface Sheet {
  month: string;
  children: { id: string; name: string }[];
  practices: { id: string; heldOn: string }[];
  answers: Record<
    string,
    Record<string, { status: string; comment: string | null }>
  >;
}

async function registerTwoChildren(call: ReturnType<typeof json>) {
  const res = await call("/children", "POST", registration);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { children: { id: string }[] };
  const [first, second] = body.children;
  if (!first || !second) throw new Error("登録に失敗しました");
  return [first.id, second.id] as const;
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
  await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location) VALUES
      (${teamId}, '2099-05-02', '09:00', '12:00', '粉浜小'),
      (${teamId}, '2099-05-09', '13:00', '17:00', '北粉浜小')`;
  const rows = await owner`
    SELECT id FROM practices WHERE team_id = ${teamId} ORDER BY held_on`;
  practiceA = rows[0]?.id as string;
  practiceB = rows[1]?.id as string;
  // 月外(集計・シートに出ない)と他チーム(RLS で見えない)の練習
  await owner`INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${teamId}, '2099-06-06', '09:00', '12:00')`;
  const [other] =
    await owner`INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${otherTeamId}, '2099-05-02', '09:00', '12:00') RETURNING id`;
  otherPractice = other?.id as string;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("提出シート(GET /attendance)", () => {
  it("未ログインは 401", async () => {
    expect((await api().request("/attendance?month=2099-05")).status).toBe(401);
  });

  it("自分の子2人と月内の練習が返り、未回答はキーを持たない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro, hanako] = await registerTwoChildren(call);

    const sheet = (await (
      await call("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(sheet.month).toBe("2099-05");
    expect(sheet.children.map((c) => c.name)).toEqual([
      "粉浜 太郎",
      "粉浜 花子",
    ]);
    expect(sheet.practices.map((p) => p.heldOn)).toEqual([
      "2099-05-02",
      "2099-05-09",
    ]);
    expect(sheet.answers[taro]).toEqual({});
    expect(sheet.answers[hanako]).toEqual({});

    // 不正な month は 400
    expect((await call("/attendance?month=2099-13", "GET")).status).toBe(400);
  });
});

describe("一括保存(PUT /attendance)", () => {
  it("upsert・上書き・null での削除ができ、コメントは partial のときだけ残る", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);

    const first = await call("/attendance", "PUT", {
      childId: taro,
      answers: [
        { practiceId: practiceA, status: "full", comment: "無視される" },
        { practiceId: practiceB, status: "partial", comment: "11:00ごろ早退" },
      ],
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { saved: number }).saved).toBe(2);

    const sheet = (await (
      await call("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(sheet.answers[taro]?.[practiceA]).toEqual({
      status: "full",
      comment: null,
    });
    expect(sheet.answers[taro]?.[practiceB]).toEqual({
      status: "partial",
      comment: "11:00ごろ早退",
    });

    // 再提出: A を不参加に上書き、B は未回答に戻す(行を削除)
    const again = await call("/attendance", "PUT", {
      childId: taro,
      answers: [
        { practiceId: practiceA, status: "absent", comment: null },
        { practiceId: practiceB, status: null, comment: null },
      ],
    });
    expect(again.status).toBe(200);
    const after = (await (
      await call("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(after.answers[taro]).toEqual({
      [practiceA]: { status: "absent", comment: null },
    });

    const rows = await owner`
      SELECT status, comment FROM attendances WHERE child_id = ${taro}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("absent");
    expect(rows[0]?.comment).toBeNull();
  });

  it("兄弟の回答は混ざらない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro, hanako] = await registerTwoChildren(call);
    await call("/attendance", "PUT", {
      childId: taro,
      answers: [{ practiceId: practiceA, status: "full", comment: null }],
    });
    await call("/attendance", "PUT", {
      childId: hanako,
      answers: [{ practiceId: practiceA, status: "absent", comment: null }],
    });
    const sheet = (await (
      await call("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(sheet.answers[taro]?.[practiceA]?.status).toBe("full");
    expect(sheet.answers[hanako]?.[practiceA]?.status).toBe("absent");
  });

  it("入力不正は 400、自分の子でない childId は 404", async () => {
    const app = api();
    const a = json(app, await loginAs(app, USER_A));
    const b = json(app, await loginAs(app, USER_B));
    const [taro] = await registerTwoChildren(a);

    expect(
      (await a("/attendance", "PUT", { childId: taro, answers: [] })).status,
    ).toBe(400);
    expect(
      (
        await a("/attendance", "PUT", {
          childId: taro,
          answers: [{ practiceId: practiceA, status: "maybe", comment: null }],
        })
      ).status,
    ).toBe(400);

    // 連携していない保護者からは「存在しない」と同じ扱い(404)
    const res = await b("/attendance", "PUT", {
      childId: taro,
      answers: [{ practiceId: practiceA, status: "full", comment: null }],
    });
    expect(res.status).toBe(404);
    const count =
      await owner`SELECT count(*)::int AS n FROM attendances WHERE child_id = ${taro}`;
    expect(count[0]?.n).toBe(0);
  });

  it("他チームの練習 ID は 400 で、1件も保存されない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);
    const res = await call("/attendance", "PUT", {
      childId: taro,
      answers: [
        { practiceId: practiceA, status: "full", comment: null },
        { practiceId: otherPractice, status: "full", comment: null },
      ],
    });
    expect(res.status).toBe(400);
    const count =
      await owner`SELECT count(*)::int AS n FROM attendances WHERE child_id = ${taro}`;
    expect(count[0]?.n).toBe(0);
  });
});

describe("未提出の件数(GET /attendance/summary)", () => {
  it("月内の練習 × 自分の子で数え、回答した分だけ減る", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);

    const before = (await (
      await call("/attendance/summary?month=2099-05", "GET")
    ).json()) as { unanswered: number; total: number };
    // 練習2 × 子ども2(6月の練習は含まない)
    expect(before).toEqual({ unanswered: 4, total: 4 });

    await call("/attendance", "PUT", {
      childId: taro,
      answers: [
        { practiceId: practiceA, status: "full", comment: null },
        { practiceId: practiceB, status: "absent", comment: null },
      ],
    });
    const after = (await (
      await call("/attendance/summary?month=2099-05", "GET")
    ).json()) as { unanswered: number; total: number };
    expect(after).toEqual({ unanswered: 2, total: 4 });

    // 練習が無い月は 0 件(アラートを出さない)
    const empty = (await (
      await call("/attendance/summary?month=2099-07", "GET")
    ).json()) as { unanswered: number; total: number };
    expect(empty).toEqual({ unanswered: 0, total: 0 });
  });

  it("子ども未連携の保護者は 0 件で、シートも空", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_B));
    const summary = (await (
      await call("/attendance/summary?month=2099-05", "GET")
    ).json()) as { unanswered: number; total: number };
    expect(summary).toEqual({ unanswered: 0, total: 0 });
    const sheet = (await (
      await call("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(sheet.children).toEqual([]);
    expect(sheet.answers).toEqual({});
    // 練習(チーム公開情報)は見える
    expect(sheet.practices).toHaveLength(2);
  });
});

describe("RLS", () => {
  it("他チームの保護者には練習も回答も見えない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);
    await call("/attendance", "PUT", {
      childId: taro,
      answers: [{ practiceId: practiceA, status: "full", comment: null }],
    });

    const other = api(otherTeamId);
    const o = json(other, await loginAs(other, USER_B));
    const sheet = (await (
      await o("/attendance?month=2099-05", "GET")
    ).json()) as Sheet;
    expect(sheet.children).toEqual([]);
    // 他チームに見えるのは自チームの練習だけ
    expect(sheet.practices).toHaveLength(1);
    expect(sheet.practices[0]?.id).toBe(otherPractice);

    const count =
      await owner`SELECT count(*)::int AS n FROM attendances WHERE team_id = ${teamId}`;
    expect(count[0]?.n).toBe(1);
  });
});
