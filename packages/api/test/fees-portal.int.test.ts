import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import type { FeeState } from "../src/fees-shared";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者の月謝 API(fees/plan.md 5a)を RLS 配下で検証する。
// 接続・リセット方式は attendance-portal.int.test.ts と同じ。
// 「未来」は Tokyo の今月から導出されるため、期待値もテスト側で同じ規則から組み立てる

const SESSION_SECRET = "8".repeat(64);
const USER_A = `U${"a".repeat(32)}`;
const USER_B = `U${"b".repeat(32)}`;

/** Asia/Tokyo の今日("YYYY-MM-DD")。日付は東京固定(CLAUDE.md 開発ルール) */
function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const TODAY = todayInTokyo();
const CURRENT_MONTH = TODAY.slice(0, 7);
const THIS_YEAR = Number(TODAY.slice(0, 4));
const FAR_YEAR = 2099;

/** fees-shared と同じ規則(済は常に済、行なし・未は今月以前なら未) */
function expectedState(year: number, month: number, paid: boolean): FeeState {
  if (paid) return "paid";
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  return ym > CURRENT_MONTH ? "future" : "unpaid";
}

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;

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
  return (
    path: string,
    method: "GET" | "POST" | "PUT" = "GET",
    body?: unknown,
  ) =>
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
  year: number;
  currentMonth: string;
  children: {
    child: { id: string; name: string; grade: number };
    months: { month: number; state: FeeState; receivedAt: string | null }[];
  }[];
}

async function registerTwoChildren(call: ReturnType<typeof json>) {
  const res = await call("/children", "POST", registration);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { children: { id: string }[] };
  const [first, second] = body.children;
  if (!first || !second) throw new Error("登録に失敗しました");
  return [first.id, second.id] as const;
}

/** 済/未の行を owner で直接作る(管理 API は 5b。ここでは保護者の読みだけを見る) */
async function putRecord(
  childId: string,
  year: number,
  month: number,
  status: "paid" | "unpaid",
  team = teamId,
) {
  await owner`
    INSERT INTO fee_records (team_id, child_id, year, month, status, received_at)
    VALUES (${team}, ${childId}, ${year}, ${month}, ${status},
      ${status === "paid" ? new Date() : null})`;
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
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("月謝シート(GET /fees)", () => {
  it("未ログインは 401", async () => {
    expect((await api().request("/fees")).status).toBe(401);
  });

  it("年の指定が不正なら 400", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    expect((await call("/fees?year=2019")).status).toBe(400);
    expect((await call("/fees?year=abc")).status).toBe(400);
    expect((await call("/fees?year=2101")).status).toBe(400);
  });

  it("お子さんごとに12か月分が返り、済・未・未来が導出される", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro, hanako] = await registerTwoChildren(call);
    // 太郎だけ 8月=済 / 9月=未 の行を持つ(他の月は行なし)
    await putRecord(taro, THIS_YEAR, 8, "paid");
    await putRecord(taro, THIS_YEAR, 9, "unpaid");

    const res = await call("/fees");
    expect(res.status).toBe(200);
    const sheet = (await res.json()) as Sheet;
    expect(sheet.year).toBe(THIS_YEAR);
    expect(sheet.currentMonth).toBe(CURRENT_MONTH);
    expect(sheet.children.map((r) => r.child.name)).toEqual([
      "粉浜 太郎",
      "粉浜 花子",
    ]);

    const taroRow = sheet.children[0];
    const hanakoRow = sheet.children[1];
    expect(taroRow?.child.id).toBe(taro);
    expect(hanakoRow?.child.id).toBe(hanako);
    expect(taroRow?.months.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // 8月は前払いでも常に済。それ以外は今月以前なら未、来月以降は未来
    expect(taroRow?.months.map((m) => m.state)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
        expectedState(THIS_YEAR, m, m === 8),
      ),
    );
    // 行を1つも持たない花子も同じ規則で導出される
    expect(hanakoRow?.months.map((m) => m.state)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
        expectedState(THIS_YEAR, m, false),
      ),
    );
    // 受領日時は済のセルだけ入る
    expect(taroRow?.months[7]?.receivedAt).toEqual(expect.any(String));
    expect(taroRow?.months.filter((m) => m.receivedAt !== null)).toHaveLength(
      1,
    );
  });

  it("連携していない部員は含まれない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    await registerTwoChildren(call);
    const [outsider] = await owner`
      INSERT INTO children (team_id, name, grade, gender, invite_code)
      VALUES (${teamId}, '別家庭 次郎', 5, 'male', 'ZZZZZZ') RETURNING id`;
    const outsiderId = outsider?.id as string;
    await putRecord(outsiderId, THIS_YEAR, 1, "paid");

    const sheet = (await (await call("/fees")).json()) as Sheet;
    expect(sheet.children).toHaveLength(2);
    expect(sheet.children.some((r) => r.child.id === outsiderId)).toBe(false);
  });

  it("先の年は済の月だけ済で、残りはすべて未来", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);
    await putRecord(taro, FAR_YEAR, 4, "paid");
    // 未来の月の「未」は表示上も未来のまま(設計判断6)
    await putRecord(taro, FAR_YEAR, 5, "unpaid");

    const sheet = (await (
      await call(`/fees?year=${FAR_YEAR}`)
    ).json()) as Sheet;
    expect(sheet.year).toBe(FAR_YEAR);
    const taroRow = sheet.children[0];
    expect(taroRow?.months.map((m) => m.state)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
        m === 4 ? "paid" : "future",
      ),
    );
  });

  it("子ども未連携の保護者は空のシート", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_B));
    const sheet = (await (await call("/fees")).json()) as Sheet;
    expect(sheet.children).toEqual([]);
    expect(sheet.year).toBe(THIS_YEAR);
  });
});

describe("RLS", () => {
  it("他チームの保護者には自チームの月謝しか見えない", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const [taro] = await registerTwoChildren(call);
    await putRecord(taro, THIS_YEAR, 1, "paid");

    // 他チームの保護者に、同名で登録した自チームの子どもを持たせる
    const other = api(otherTeamId);
    const o = json(other, await loginAs(other, USER_B));
    const [otherChild] = await registerTwoChildren(o);
    const otherSheet = (await (await o("/fees")).json()) as Sheet;
    expect(otherSheet.children).toHaveLength(2);
    expect(otherSheet.children[0]?.child.id).toBe(otherChild);
    expect(otherSheet.children.some((r) => r.child.id === taro)).toBe(false);
    // 済にした行は他チーム側の1月には反映されない
    expect(otherSheet.children[0]?.months[0]?.state).toBe(
      expectedState(THIS_YEAR, 1, false),
    );

    const count = await owner`
      SELECT count(*)::int AS n FROM fee_records WHERE team_id = ${teamId}`;
    expect(count[0]?.n).toBe(1);
  });
});
