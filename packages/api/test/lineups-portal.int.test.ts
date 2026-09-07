import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者の出場メンバー API(lineups/plan.md 7b-2)を RLS 配下で検証する。
// 編成の投入は owner 接続の SQL で行う(保存 API は 7b-1 の管理側)

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
/** 編成のある練習 */
let practiceId: string;
/** 編成の無い練習 */
let emptyPracticeId: string;
/** 他チームの練習 */
let otherPracticeId: string;

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
    body: JSON.stringify({ idToken: `fake:U${"d".repeat(32)}` }),
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

async function createChild(
  name: string,
  grade: number,
  code: string,
): Promise<string> {
  const [row] = await owner`
    INSERT INTO children (team_id, name, nickname_kana, grade, gender, invite_code)
    VALUES (${teamId}, ${name}, ${"たろう"}, ${grade}, 'male', ${code})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
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
    await owner`INSERT INTO practices (team_id, held_on, start_time, end_time, location, note)
    VALUES (${teamId}, '2099-02-07', '09:00', '12:00', '粉浜小', '練習試合') RETURNING id`;
  const [p2] =
    await owner`INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${teamId}, '2099-02-14', '13:00', '17:00') RETURNING id`;
  const [p3] =
    await owner`INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${otherTeamId}, '2099-02-07', '09:00', '12:00') RETURNING id`;
  if (!p1 || !p2 || !p3) throw new Error("練習の作成に失敗しました");
  practiceId = p1.id;
  emptyPracticeId = p2.id;
  otherPracticeId = p3.id;

  // スターターは学年順とポジション順がずれるように作る(並びが POSITIONS 順であることの確認)
  const pg = await createChild("山田 太郎", 4, "LINEUP0001");
  const sg = await createChild("田中 蓮", 6, "LINEUP0002");
  // ベンチは学年降順→名前(鈴木6年 → 佐藤4年)
  const bench1 = await createChild("佐藤 花子", 4, "LINEUP0003");
  const bench2 = await createChild("鈴木 一郎", 6, "LINEUP0004");
  await owner`
    INSERT INTO lineups (team_id, practice_id, child_id, role, position) VALUES
      (${teamId}, ${practiceId}, ${pg}, 'starter', 'PG'),
      (${teamId}, ${practiceId}, ${sg}, 'starter', 'SG'),
      (${teamId}, ${practiceId}, ${bench1}, 'bench', NULL),
      (${teamId}, ${practiceId}, ${bench2}, 'bench', NULL)`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

interface LineupBody {
  practice: { id: string; heldOn: string; location: string | null };
  starters: {
    child: { name: string; nicknameKana: string | null; grade: number };
    position: string;
  }[];
  bench: { child: { name: string; grade: number } }[];
}

describe("保護者の出場メンバー API", () => {
  it("未ログインは 401", async () => {
    expect(
      (await api().request(`/practices/${practiceId}/lineup`)).status,
    ).toBe(401);
  });

  it("スターターは POSITIONS 順、ベンチは学年降順→名前で返す", async () => {
    const g = await guardianClient(api());
    const res = await g(`/practices/${practiceId}/lineup`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LineupBody;
    expect(body.practice.id).toBe(practiceId);
    expect(body.practice.location).toBe("粉浜小");
    expect(body.starters.map((s) => [s.position, s.child.name])).toEqual([
      ["PG", "山田 太郎"],
      ["SG", "田中 蓮"],
    ]);
    // 未登録のポジション(SF/PF/C)は要素を持たない
    expect(body.starters).toHaveLength(2);
    expect(body.starters[0]?.child.grade).toBe(4);
    expect(body.starters[0]?.child.nicknameKana).toBe("たろう");
    expect(body.bench.map((b) => b.child.name)).toEqual([
      "鈴木 一郎",
      "佐藤 花子",
    ]);
  });

  it("編成が無い練習は 200 で空配列", async () => {
    const g = await guardianClient(api());
    const res = await g(`/practices/${emptyPracticeId}/lineup`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as LineupBody;
    expect(body.practice.heldOn).toBe("2099-02-14");
    expect(body.starters).toEqual([]);
    expect(body.bench).toEqual([]);
  });

  it("存在しない練習・他チームの練習・不正な id は 404", async () => {
    const g = await guardianClient(api());
    expect(
      (await g("/practices/00000000-0000-4000-8000-000000000000/lineup"))
        .status,
    ).toBe(404);
    expect((await g(`/practices/${otherPracticeId}/lineup`)).status).toBe(404);
    expect((await g("/practices/not-a-uuid/lineup")).status).toBe(404);
  });
});
