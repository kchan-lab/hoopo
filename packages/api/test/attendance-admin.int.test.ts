import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";

// 管理の出欠管理・欠席者管理 API(attendance/plan.md 4b)を RLS 配下で検証する。
// 保護者側の提出 API は 4a なので、ここでは owner 接続で attendances に直接行を作る

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;
/** 学年降順→名前 の期待順に並ぶ部員 */
let taro: string; // 粉浜 太郎(6年)
let ichiro: string; // 粉浜 一郎(4年)
let jiro: string; // 粉浜 二郎(4年)
let saburo: string; // 粉浜 三郎(3年)= 一度も回答しない
let p1: string; // 2026-09-06
let p2: string; // 2026-09-13
let pOther: string; // 他チームの練習

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
  return (path: string) =>
    app.request(path, { method: "GET", headers: { Cookie: cookie } });
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

async function insertPractice(team: string, heldOn: string): Promise<string> {
  const [row] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${team}, ${heldOn}, '09:00', '12:00', '粉浜小学校 体育館')
    RETURNING id`;
  if (!row) throw new Error(`練習の作成に失敗しました: ${heldOn}`);
  return row.id as string;
}

async function insertAnswer(
  team: string,
  childId: string,
  practiceId: string,
  status: "full" | "partial" | "absent",
  comment: string | null = null,
): Promise<void> {
  await owner`
    INSERT INTO attendances (team_id, child_id, practice_id, status, comment)
    VALUES (${team}, ${childId}, ${practiceId}, ${status}, ${comment})`;
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
  taro = await insertChild(teamId, "粉浜 太郎", 6, "AAAAA0001");
  ichiro = await insertChild(teamId, "粉浜 一郎", 4, "AAAAA0002");
  jiro = await insertChild(teamId, "粉浜 二郎", 4, "AAAAA0003");
  saburo = await insertChild(teamId, "粉浜 三郎", 3, "AAAAA0004");
  // 一覧に出てはいけない部員(卒団アーカイブ / 無効化)
  await insertChild(teamId, "卒団 花子", 6, "AAAAA0005", { archived: true });
  await insertChild(teamId, "無効 花子", 5, "AAAAA0006", { status: "revoked" });

  p1 = await insertPractice(teamId, "2026-09-06");
  p2 = await insertPractice(teamId, "2026-09-13");
  // 別月の練習は列に出ない
  await insertPractice(teamId, "2026-10-04");
  pOther = await insertPractice(otherTeamId, "2026-09-06");

  await insertAnswer(teamId, taro, p1, "full");
  await insertAnswer(teamId, ichiro, p1, "partial", "10:00から参加します");
  await insertAnswer(teamId, jiro, p1, "absent");
  await insertAnswer(teamId, taro, p2, "absent");
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

type MatrixBody = {
  month: string;
  practices: { id: string; heldOn: string }[];
  rows: {
    child: {
      id: string;
      name: string;
      nicknameKana: string | null;
      grade: number;
    };
    cells: Record<string, { status: string; comment: string | null } | null>;
  }[];
};

type AbsenteesBody = {
  practice: { id: string; heldOn: string };
  absent: { child: { id: string; name: string }; comment: string | null }[];
  partial: { child: { id: string; name: string }; comment: string | null }[];
  unanswered: { child: { id: string; name: string }; comment: string | null }[];
};

describe("出欠管理(GET /attendance-matrix)", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request("/attendance-matrix")).status).toBe(401);
  });

  it("月の練習を列に、有効な部員を学年降順→名前で行にし、未回答は null で埋める", async () => {
    const c = await coachClient(adminApi());
    const res = await c("/attendance-matrix?month=2026-09");
    expect(res.status).toBe(200);
    const body = (await res.json()) as MatrixBody;

    expect(body.month).toBe("2026-09");
    expect(body.practices.map((p) => p.heldOn)).toEqual([
      "2026-09-06",
      "2026-09-13",
    ]);
    expect(body.rows.map((r) => [r.child.name, r.child.grade])).toEqual([
      ["粉浜 太郎", 6],
      ["粉浜 一郎", 4],
      ["粉浜 二郎", 4],
      ["粉浜 三郎", 3],
    ]);
    expect(body.rows[0]?.child.nicknameKana).toBe("たろう");

    const cellsOf = (name: string) =>
      body.rows.find((r) => r.child.name === name)?.cells ?? {};
    expect(cellsOf("粉浜 太郎")[p1]).toEqual({ status: "full", comment: null });
    expect(cellsOf("粉浜 太郎")[p2]).toEqual({
      status: "absent",
      comment: null,
    });
    // △ は保護者コメントを同梱する
    expect(cellsOf("粉浜 一郎")[p1]).toEqual({
      status: "partial",
      comment: "10:00から参加します",
    });
    // 未回答は行を持たないので null。列のキーは必ず全部そろう
    expect(cellsOf("粉浜 一郎")[p2]).toBeNull();
    expect(cellsOf("粉浜 二郎")[p1]).toEqual({
      status: "absent",
      comment: null,
    });
    for (const r of body.rows) {
      expect(Object.keys(r.cells).sort()).toEqual([p1, p2].sort());
    }
    // 一度も回答していない部員は全セルが null(画面では行ごと薄く出す)
    expect(Object.values(cellsOf("粉浜 三郎"))).toEqual([null, null]);
  });

  it("練習の無い月は列が空でも部員の行は返る", async () => {
    const c = await coachClient(adminApi());
    const body = (await (
      await c("/attendance-matrix?month=2026-11")
    ).json()) as MatrixBody;
    expect(body.practices).toEqual([]);
    expect(body.rows).toHaveLength(4);
    expect(body.rows[0]?.cells).toEqual({});
  });

  it("month の形式が不正なら 400", async () => {
    const c = await coachClient(adminApi());
    expect((await c("/attendance-matrix?month=2026-9")).status).toBe(400);
  });

  it("他チームのコーチには練習も部員も見えない(RLS)", async () => {
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const body = (await (
      await other("/attendance-matrix?month=2026-09")
    ).json()) as MatrixBody;
    // 他チームの 2026-09-06 の練習だけが列に出て、行(部員)は無い
    expect(body.practices.map((p) => p.id)).toEqual([pOther]);
    expect(body.rows).toEqual([]);
  });
});

describe("欠席者管理(GET /absentees)", () => {
  it("未ログインは 401", async () => {
    expect(
      (await adminApi().request(`/absentees?practiceId=${p1}`)).status,
    ).toBe(401);
  });

  it("不参加 / 途中参加・早退(コメント)/ 未回答 の3グループを学年降順→名前で返す", async () => {
    const c = await coachClient(adminApi());
    const res = await c(`/absentees?practiceId=${p1}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AbsenteesBody;

    expect(body.practice.id).toBe(p1);
    expect(body.practice.heldOn).toBe("2026-09-06");
    // 参加(full)の太郎はどのグループにも出ない
    expect(body.absent.map((e) => e.child.name)).toEqual(["粉浜 二郎"]);
    expect(body.partial.map((e) => [e.child.name, e.comment])).toEqual([
      ["粉浜 一郎", "10:00から参加します"],
    ]);
    expect(body.unanswered.map((e) => e.child.name)).toEqual(["粉浜 三郎"]);
  });

  it("回答が1件だけの練習では、残りの部員がすべて未回答になる", async () => {
    const c = await coachClient(adminApi());
    const body = (await (
      await c(`/absentees?practiceId=${p2}`)
    ).json()) as AbsenteesBody;
    expect(body.absent.map((e) => e.child.name)).toEqual(["粉浜 太郎"]);
    expect(body.partial).toEqual([]);
    expect(body.unanswered.map((e) => e.child.name)).toEqual([
      "粉浜 一郎",
      "粉浜 二郎",
      "粉浜 三郎",
    ]);
  });

  it("practiceId が無い・uuid でない・存在しないときは 404", async () => {
    const c = await coachClient(adminApi());
    expect((await c("/absentees")).status).toBe(404);
    expect((await c("/absentees?practiceId=not-a-uuid")).status).toBe(404);
    expect(
      (await c("/absentees?practiceId=00000000-0000-4000-8000-000000000000"))
        .status,
    ).toBe(404);
  });

  it("他チームの練習は存在を漏らさず 404(RLS)", async () => {
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    expect((await other(`/absentees?practiceId=${p1}`)).status).toBe(404);
    // 逆に自チームの練習は 200(取り違えでないことの確認)
    expect((await other(`/absentees?practiceId=${pOther}`)).status).toBe(200);
  });

  it("アーカイブ済み・無効化された部員は未回答に出ない", async () => {
    const c = await coachClient(adminApi());
    const body = (await (
      await c(`/absentees?practiceId=${p1}`)
    ).json()) as AbsenteesBody;
    const names = [...body.absent, ...body.partial, ...body.unanswered].map(
      (e) => e.child.name,
    );
    expect(names).not.toContain("卒団 花子");
    expect(names).not.toContain("無効 花子");
    expect(body.unanswered.map((e) => e.child.id)).toEqual([saburo]);
  });
});
