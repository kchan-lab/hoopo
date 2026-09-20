import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { adminDeps } from "./admin-deps";
import { childNameParts } from "./child-name";

// 年度更新 API(year-rollover/plan.md)を RLS 配下で検証する。
// 実行内容は「学年+1」だけ。上限の学年(7 = 中学1年生)は据え置きで、誰もアーカイブしない
// (grade-junior-high/plan.md 設計判断2)。
// 対象は「有効な部員(active・非アーカイブ)」だけ。卒団済み・無効化済み・他チームは触らない。
// 取り消しは snapshot からの復元で、猶予は 24 時間・1回(設計判断1・2・3)

const SESSION_SECRET = "9".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});

let teamId: string;
let otherTeamId: string;
let coachHash: string;
let ichinen: string; // 粉浜 一年(1年 → 2年)
let gonen: string; // 粉浜 五年(5年 → 6年)
let rokunen: string; // 粉浜 六年(6年 → 中1)
let chuichi: string; // 粉浜 中一(7年 = 中学1年生。上限なので据え置き)
let archived: string; // 卒団済み(対象外)
let revoked: string; // 無効化済み(対象外)

const adminApi = (team = teamId) =>
  createAdminApi(adminDeps(team, SESSION_SECRET));

interface CoachClient {
  get: (path: string) => Promise<Response>;
  post: (path: string) => Promise<Response>;
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
    post: async (path) =>
      app.request(path, { method: "POST", headers: { Cookie: cookie } }),
  };
}

async function insertChild(
  team: string,
  name: string,
  grade: number,
  code: string,
  options: { archived?: boolean; status?: "active" | "revoked" } = {},
): Promise<string> {
  const parts = childNameParts(name);
  const [row] = await owner`
    INSERT INTO children (team_id, family_name, given_name, family_name_kana, given_name_kana,
                          grade, gender, invite_code, status, archived)
    VALUES (${team}, ${parts.familyName}, ${parts.givenName},
            ${parts.familyNameKana}, ${parts.givenNameKana},
            ${grade}, 'male', ${code},
            ${options.status ?? "active"}, ${options.archived ?? false})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
}

interface ChildRow {
  grade: number;
  archived: boolean;
  archived_at: Date | null;
  status: string;
}

async function childRow(id: string): Promise<ChildRow> {
  const rows = await owner<ChildRow[]>`
    SELECT grade, archived, archived_at, status FROM children WHERE id = ${id}`;
  const row = rows[0];
  if (!row) throw new Error("部員が見つかりません");
  return row;
}

interface RolloverRow {
  id: string;
  executed_at: Date;
  undone_at: Date | null;
  snapshot: Record<string, { grade: number; archived: boolean }>;
}

async function rolloverRows(): Promise<RolloverRow[]> {
  return owner<RolloverRow[]>`
    SELECT id, executed_at, undone_at, snapshot FROM year_rollovers
    ORDER BY executed_at`;
}

interface StatusBody {
  latest: {
    id: string;
    executedAt: string;
    undoneAt: string | null;
    undoable: boolean;
    undoDeadline: string | null;
    affected: number;
    staying: number;
  } | null;
  preview: { total: number; willStay: number };
}

beforeAll(async () => {
  coachHash = await hashPassword("coach-pass-1");
});

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups,
      year_rollovers
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

  ichinen = await insertChild(teamId, "粉浜 一年", 1, "YYYYY0001");
  gonen = await insertChild(teamId, "粉浜 五年", 5, "YYYYY0002");
  rokunen = await insertChild(teamId, "粉浜 六年", 6, "YYYYY0003");
  chuichi = await insertChild(teamId, "粉浜 中一", 7, "YYYYY0006");
  archived = await insertChild(teamId, "卒団 花子", 6, "YYYYY0004", {
    archived: true,
  });
  revoked = await insertChild(teamId, "無効 花子", 5, "YYYYY0005", {
    status: "revoked",
  });
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

/** 猶予切れを作る(executed_at を 25 時間前に巻き戻す) */
async function ageRollover(hours: number): Promise<void> {
  await owner`
    UPDATE year_rollovers
    SET executed_at = now() - ${`${hours} hours`}::interval`;
}

describe("年度更新(GET/POST /members/year-rollover)", () => {
  it("未ログインでは状況も実行も取り消しもできない", async () => {
    const app = adminApi();
    expect((await app.request("/members/year-rollover")).status).toBe(401);
    expect(
      (await app.request("/members/year-rollover", { method: "POST" })).status,
    ).toBe(401);
    expect(
      (await app.request("/members/year-rollover/undo", { method: "POST" }))
        .status,
    ).toBe(401);
  });

  it("実行前は latest が null で、対象人数と据え置き人数を返す", async () => {
    const coach = await coachClient(adminApi());
    const body = (await (
      await coach.get("/members/year-rollover")
    ).json()) as StatusBody;
    expect(body.latest).toBeNull();
    // 卒団済み・無効化済みは対象外。据え置きは中学1年生の1人
    expect(body.preview).toEqual({ total: 4, willStay: 1 });
  });

  it("実行すると学年+1・中学1年生は据え置き、誰もアーカイブされず、snapshot が残る", async () => {
    const coach = await coachClient(adminApi());
    const res = await coach.post("/members/year-rollover");
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      rollover: {
        id: string;
        executedAt: string;
        affected: number;
        staying: number;
      };
    };
    expect(body.rollover.affected).toBe(4);
    expect(body.rollover.staying).toBe(1);

    expect(await childRow(ichinen)).toMatchObject({
      grade: 2,
      archived: false,
      archived_at: null,
    });
    expect(await childRow(gonen)).toMatchObject({
      grade: 6,
      archived: false,
      archived_at: null,
    });
    // 6年生は中学1年生に上がる。卒団させない(grade-junior-high/plan.md 設計判断2)
    expect(await childRow(rokunen)).toMatchObject({
      grade: 7,
      archived: false,
      archived_at: null,
    });
    // 中学1年生は上限なので据え置き。ここでもアーカイブしない
    expect(await childRow(chuichi)).toMatchObject({
      grade: 7,
      archived: false,
      archived_at: null,
    });
    // 卒団済み・無効化済みは触らない
    expect(await childRow(archived)).toMatchObject({
      grade: 6,
      archived: true,
      archived_at: null,
    });
    expect(await childRow(revoked)).toMatchObject({
      grade: 5,
      archived: false,
      status: "revoked",
    });

    const [log, ...rest] = await rolloverRows();
    expect(rest).toEqual([]);
    expect(log?.undone_at).toBeNull();
    expect(log?.snapshot).toEqual({
      [ichinen]: { grade: 1, archived: false },
      [gonen]: { grade: 5, archived: false },
      [rokunen]: { grade: 6, archived: false },
      [chuichi]: { grade: 7, archived: false },
    });

    // 実行後の状況: 猶予中は取り消せる。誰も卒団しないので対象人数は減らない
    const status = (await (
      await coach.get("/members/year-rollover")
    ).json()) as StatusBody;
    expect(status.latest).toMatchObject({
      undoneAt: null,
      undoable: true,
      affected: 4,
      staying: 1,
    });
    // 取り消せる間は期限(実行時刻 + 24時間)を返す。UI はこれをそのまま表示する
    const executedAt = new Date(status.latest?.executedAt ?? "").getTime();
    expect(
      new Date(status.latest?.undoDeadline ?? "").getTime() - executedAt,
    ).toBe(24 * 60 * 60 * 1000);
    // 実行後は 6年生 → 中学1年生 が増えるので、次に据え置きになるのは2人
    expect(status.preview).toEqual({ total: 4, willStay: 2 });
  });

  it("猶予中の二重実行は 409(取り消し猶予中の年度更新があります)", async () => {
    const coach = await coachClient(adminApi());
    expect((await coach.post("/members/year-rollover")).status).toBe(201);
    const res = await coach.post("/members/year-rollover");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      "取り消し猶予中の年度更新があります",
    );
    // 二重に学年が上がっていないこと
    expect((await childRow(ichinen)).grade).toBe(2);
    expect(await rolloverRows()).toHaveLength(1);
  });

  it("取り消すと学年が実行前に戻り、二度目の取り消しは 409", async () => {
    const coach = await coachClient(adminApi());
    await coach.post("/members/year-rollover");

    const res = await coach.post("/members/year-rollover/undo");
    expect(res.status).toBe(200);
    expect((await res.json()) as { restored: number }).toEqual({
      restored: 4,
      missing: 0,
    });

    expect((await childRow(ichinen)).grade).toBe(1);
    expect((await childRow(gonen)).grade).toBe(5);
    const restored = await childRow(rokunen);
    expect(restored.grade).toBe(6);
    expect(restored.archived).toBe(false);
    expect(restored.archived_at).toBeNull();
    // 据え置きだった中学1年生も snapshot どおりに戻る(学年は変わらない)
    expect((await childRow(chuichi)).grade).toBe(7);

    const [log] = await rolloverRows();
    expect(log?.undone_at).not.toBeNull();

    const again = await coach.post("/members/year-rollover/undo");
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe(
      "取り消せる年度更新がありません",
    );

    // 取り消し後は再実行できる(設計判断3)
    expect((await coach.post("/members/year-rollover")).status).toBe(201);
    expect((await childRow(ichinen)).grade).toBe(2);
  });

  it("猶予(24時間)を過ぎると取り消せず、代わりに再実行できる", async () => {
    const coach = await coachClient(adminApi());
    await coach.post("/members/year-rollover");
    await ageRollover(25);

    const status = (await (
      await coach.get("/members/year-rollover")
    ).json()) as StatusBody;
    expect(status.latest).toMatchObject({
      undoneAt: null,
      undoable: false,
      // 取り消せないときは期限も返さない
      undoDeadline: null,
    });

    expect((await coach.post("/members/year-rollover/undo")).status).toBe(409);
    // 学年は戻らない
    expect((await childRow(ichinen)).grade).toBe(2);

    expect((await coach.post("/members/year-rollover")).status).toBe(201);
    expect((await childRow(ichinen)).grade).toBe(3);
    expect(await rolloverRows()).toHaveLength(2);
  });

  it("他チームのコーチからは対象が 0 人に見え、実行しても A チームは変わらない(RLS)", async () => {
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const status = (await (
      await other.get("/members/year-rollover")
    ).json()) as StatusBody;
    expect(status.latest).toBeNull();
    expect(status.preview).toEqual({ total: 0, willStay: 0 });

    const res = await other.post("/members/year-rollover");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "対象の部員がいません",
    );

    expect((await childRow(ichinen)).grade).toBe(1);
    expect((await childRow(gonen)).grade).toBe(5);
    expect((await childRow(rokunen)).grade).toBe(6);
    expect((await childRow(chuichi)).grade).toBe(7);
    expect(await rolloverRows()).toEqual([]);
  });
});
