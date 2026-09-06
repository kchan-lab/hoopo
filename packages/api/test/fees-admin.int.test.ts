import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { todayInTokyo } from "../src/tokyo-date";

// 管理の月謝管理 API(fees/plan.md 5b)を RLS 配下で検証する。
// 「未来」は Tokyo の今月から導出されるため、テストの年月は実行日から組み立てる:
// - 今年の1月は必ず今月以前(済/未の検証に使う)
// - 来年はすべて未来(未来セル・前払いの検証に使う)

const SESSION_SECRET = "8".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});

const TODAY = todayInTokyo();
const YEAR = Number(TODAY.slice(0, 4));
const NEXT_YEAR = YEAR + 1;

let teamId: string;
let otherTeamId: string;
let coachHash: string;
/** 学年降順→名前 の期待順に並ぶ部員 */
let taro: string; // 粉浜 太郎(6年)
let ichiro: string; // 粉浜 一郎(4年)
let jiro: string; // 粉浜 二郎(4年)
let archived: string; // 卒団アーカイブ(グリッドにもトグルにも出ない)
let revoked: string; // 無効化(同上)
let otherChild: string; // 他チームの部員

const adminApi = (team = teamId) =>
  createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });

interface CoachClient {
  get: (path: string) => Promise<Response>;
  put: (path: string, body: unknown) => Promise<Response>;
}

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
): Promise<CoachClient> {
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
  return {
    get: async (path) =>
      app.request(path, { method: "GET", headers: { Cookie: cookie } }),
    put: async (path, body) =>
      app.request(path, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

async function insertChild(
  team: string,
  name: string,
  grade: number,
  code: string,
  options: { archived?: boolean; status?: "active" | "revoked" } = {},
): Promise<string> {
  const [row] = await owner`
    INSERT INTO children (team_id, name, nickname_kana, grade, gender, invite_code, status, archived)
    VALUES (${team}, ${name}, ${"たろう"}, ${grade}, 'male', ${code},
            ${options.status ?? "active"}, ${options.archived ?? false})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
}

async function insertFee(
  team: string,
  childId: string,
  year: number,
  month: number,
  status: "paid" | "unpaid",
): Promise<void> {
  await owner`
    INSERT INTO fee_records (team_id, child_id, year, month, status, received_at)
    VALUES (${team}, ${childId}, ${year}, ${month}, ${status},
            ${status === "paid" ? new Date() : null})`;
}

async function feeRow(
  childId: string,
  year: number,
  month: number,
): Promise<{ status: string; received_at: Date | null } | undefined> {
  const rows = await owner<{ status: string; received_at: Date | null }[]>`
    SELECT status, received_at FROM fee_records
    WHERE child_id = ${childId} AND year = ${year} AND month = ${month}`;
  return rows[0];
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

  // 部員: 学年降順→名前。同学年は「一郎 < 二郎」で名前順を検証する
  taro = await insertChild(teamId, "粉浜 太郎", 6, "BBBBB0001");
  ichiro = await insertChild(teamId, "粉浜 一郎", 4, "BBBBB0002");
  jiro = await insertChild(teamId, "粉浜 二郎", 4, "BBBBB0003");
  archived = await insertChild(teamId, "卒団 花子", 6, "BBBBB0004", {
    archived: true,
  });
  revoked = await insertChild(teamId, "無効 花子", 5, "BBBBB0005", {
    status: "revoked",
  });
  otherChild = await insertChild(otherTeamId, "他チーム 花子", 5, "BBBBB0006");

  // 太郎は1月が済、一郎は1月の行が「未」、二郎は行なし(= 未に導出される)
  await insertFee(teamId, taro, YEAR, 1, "paid");
  await insertFee(teamId, ichiro, YEAR, 1, "unpaid");
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

interface GridBody {
  year: number;
  currentMonth: string;
  rows: {
    child: {
      id: string;
      name: string;
      nicknameKana: string | null;
      grade: number;
    };
    months: { month: number; state: string; receivedAt: string | null }[];
  }[];
}

interface ToggleBody {
  month: { month: number; state: string; receivedAt: string | null };
}

const monthsOf = (body: GridBody, name: string) =>
  body.rows.find((r) => r.child.name === name)?.months ?? [];

describe("月謝グリッド(GET /fee-grid)", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request("/fee-grid")).status).toBe(401);
  });

  it("有効な部員を学年降順→名前で行にし、1〜12月のセルを返す", async () => {
    const c = await coachClient(adminApi());
    const res = await c.get(`/fee-grid?year=${YEAR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GridBody;

    expect(body.year).toBe(YEAR);
    expect(body.currentMonth).toBe(TODAY.slice(0, 7));
    expect(body.rows.map((r) => [r.child.name, r.child.grade])).toEqual([
      ["粉浜 太郎", 6],
      ["粉浜 一郎", 4],
      ["粉浜 二郎", 4],
    ]);
    expect(body.rows[0]?.child.nicknameKana).toBe("たろう");
    // 卒団アーカイブ・無効化された部員は出ない
    const names = body.rows.map((r) => r.child.name);
    expect(names).not.toContain("卒団 花子");
    expect(names).not.toContain("無効 花子");
    expect(body.rows.map((r) => r.child.id)).not.toContain(archived);
    expect(body.rows.map((r) => r.child.id)).not.toContain(revoked);

    for (const row of body.rows) {
      expect(row.months.map((m) => m.month)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
    }
    // 今年の1月は必ず今月以前。済の行=済、未の行=未、行なしも未に導出される
    expect(monthsOf(body, "粉浜 太郎")[0]?.state).toBe("paid");
    expect(monthsOf(body, "粉浜 太郎")[0]?.receivedAt).not.toBeNull();
    expect(monthsOf(body, "粉浜 一郎")[0]).toEqual({
      month: 1,
      state: "unpaid",
      receivedAt: null,
    });
    expect(monthsOf(body, "粉浜 二郎")[0]).toEqual({
      month: 1,
      state: "unpaid",
      receivedAt: null,
    });
  });

  it("来年は行が無いので12ヶ月すべて未来になる", async () => {
    const c = await coachClient(adminApi());
    const body = (await (
      await c.get(`/fee-grid?year=${NEXT_YEAR}`)
    ).json()) as GridBody;
    expect(body.year).toBe(NEXT_YEAR);
    for (const row of body.rows) {
      expect(row.months.map((m) => m.state)).toEqual(Array(12).fill("future"));
    }
  });

  it("year 省略時は Tokyo の今年", async () => {
    const c = await coachClient(adminApi());
    const body = (await (await c.get("/fee-grid")).json()) as GridBody;
    expect(body.year).toBe(YEAR);
  });

  it("year の形式・範囲が不正なら 400", async () => {
    const c = await coachClient(adminApi());
    expect((await c.get("/fee-grid?year=abc")).status).toBe(400);
    expect((await c.get("/fee-grid?year=1999")).status).toBe(400);
    expect((await c.get("/fee-grid?year=2101")).status).toBe(400);
    expect((await c.get("/fee-grid?year=2026.5")).status).toBe(400);
  });

  it("他チームのコーチには自チームの部員しか見えない(RLS)", async () => {
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const body = (await (
      await other.get(`/fee-grid?year=${YEAR}`)
    ).json()) as GridBody;
    expect(body.rows.map((r) => r.child.id)).toEqual([otherChild]);
    // 自チームの済(太郎の1月)は漏れない
    expect(body.rows[0]?.months[0]?.state).toBe("unpaid");
  });
});

describe("月謝の 済⇄未(PUT /fee-records)", () => {
  const toggle = (
    childId: string,
    month: number,
    status: string,
    year = YEAR,
  ) => ({ childId, year, month, status }) as const;

  it("未ログインは 401", async () => {
    const res = await adminApi().request("/fee-records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toggle(taro, 1, "paid")),
    });
    expect(res.status).toBe(401);
  });

  it("済にすると received_at が入り、未に戻すと消える", async () => {
    const c = await coachClient(adminApi());
    // 行が「未」で存在するセルを済にする(upsert の update 側)
    const paid = await c.put("/fee-records", toggle(ichiro, 1, "paid"));
    expect(paid.status).toBe(200);
    expect((await paid.json()) as ToggleBody).toMatchObject({
      month: { month: 1, state: "paid" },
    });
    const afterPaid = await feeRow(ichiro, YEAR, 1);
    expect(afterPaid?.status).toBe("paid");
    expect(afterPaid?.received_at).not.toBeNull();

    const unpaid = await c.put("/fee-records", toggle(ichiro, 1, "unpaid"));
    expect(unpaid.status).toBe(200);
    expect((await unpaid.json()) as ToggleBody).toEqual({
      month: { month: 1, state: "unpaid", receivedAt: null },
    });
    const afterUnpaid = await feeRow(ichiro, YEAR, 1);
    expect(afterUnpaid?.status).toBe("unpaid");
    expect(afterUnpaid?.received_at).toBeNull();
  });

  it("行の無いセルは新規に作られ、グリッドにも反映される", async () => {
    const c = await coachClient(adminApi());
    expect(await feeRow(jiro, YEAR, 1)).toBeUndefined();
    const res = await c.put("/fee-records", toggle(jiro, 1, "paid"));
    expect(res.status).toBe(200);
    expect((await feeRow(jiro, YEAR, 1))?.status).toBe("paid");

    const body = (await (
      await c.get(`/fee-grid?year=${YEAR}`)
    ).json()) as GridBody;
    expect(monthsOf(body, "粉浜 二郎")[0]?.state).toBe("paid");
  });

  it("未来の月でも前払いの済は記録でき、状態は済になる(設計判断6)", async () => {
    const c = await coachClient(adminApi());
    const res = await c.put(
      "/fee-records",
      toggle(taro, 12, "paid", NEXT_YEAR),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ToggleBody;
    expect(body.month.state).toBe("paid");
    expect(body.month.receivedAt).not.toBeNull();

    const grid = (await (
      await c.get(`/fee-grid?year=${NEXT_YEAR}`)
    ).json()) as GridBody;
    expect(monthsOf(grid, "粉浜 太郎")[11]?.state).toBe("paid");

    // 未来の「未」は表示上の未来と同じ(行は作られるが state は future)
    const back = await c.put(
      "/fee-records",
      toggle(taro, 12, "unpaid", NEXT_YEAR),
    );
    expect(((await back.json()) as ToggleBody).month.state).toBe("future");
    expect((await feeRow(taro, NEXT_YEAR, 12))?.received_at).toBeNull();
  });

  it("存在しない・他チーム・無効な部員は 404", async () => {
    const c = await coachClient(adminApi());
    const cases = [
      "00000000-0000-4000-8000-000000000000",
      otherChild,
      archived,
      revoked,
    ];
    for (const childId of cases) {
      const res = await c.put("/fee-records", toggle(childId, 1, "paid"));
      expect(res.status, childId).toBe(404);
    }
    // 他チームの部員に行が作られていないこと
    expect(await feeRow(otherChild, YEAR, 1)).toBeUndefined();
  });

  it("他チームのコーチは自チームの部員しか操作できない(RLS)", async () => {
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    expect(
      (await other.put("/fee-records", toggle(taro, 1, "unpaid"))).status,
    ).toBe(404);
    // 太郎の1月は済のまま
    expect((await feeRow(taro, YEAR, 1))?.status).toBe("paid");
    // 逆に自チームの部員は 200(取り違えでないことの確認)
    expect(
      (await other.put("/fee-records", toggle(otherChild, 1, "paid"))).status,
    ).toBe(200);
  });

  it("入力が不正なら 400", async () => {
    const c = await coachClient(adminApi());
    const bad: unknown[] = [
      null,
      {},
      { childId: "not-a-uuid", year: YEAR, month: 1, status: "paid" },
      { childId: taro, year: 1999, month: 1, status: "paid" },
      { childId: taro, year: YEAR, month: 0, status: "paid" },
      { childId: taro, year: YEAR, month: 13, status: "paid" },
      { childId: taro, year: YEAR, month: 1, status: "done" },
      { childId: taro, year: String(YEAR), month: 1, status: "paid" },
    ];
    for (const body of bad) {
      expect((await c.put("/fee-records", body)).status).toBe(400);
    }
  });
});
