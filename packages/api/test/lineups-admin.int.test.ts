import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { adminDeps } from "./admin-deps";

// チーム編成 API(lineups/plan.md 7b-1)を RLS 配下で検証する

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;
let practiceId: string;
let kids: { id: string; name: string }[];
let otherChildId: string;

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

interface LineupBody {
  practice: { id: string; heldOn: string };
  starters: { child: { id: string; name: string }; position: string }[];
  bench: { child: { id: string; name: string } }[];
  members: { id: string; name: string; grade: number }[];
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

  const [p] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${teamId}, '2026-09-06', '09:00', '12:00', '粉浜小学校 体育館')
    RETURNING id`;
  if (!p) throw new Error("練習の作成に失敗しました");
  practiceId = p.id;

  // 部員7人(学年降順→名前の並びを検証できるよう学年をばらす)
  const seeds = [
    { name: "青木 一郎", grade: 6, code: "AAAAAAAAAA" },
    { name: "石田 二郎", grade: 6, code: "BBBBBBBBBB" },
    { name: "上田 三郎", grade: 5, code: "CCCCCCCCCC" },
    { name: "江川 四郎", grade: 4, code: "DDDDDDDDDD" },
    { name: "岡田 五郎", grade: 3, code: "EEEEEEEEEE" },
    { name: "加藤 六郎", grade: 2, code: "FFFFFFFFFF" },
    { name: "木村 七郎", grade: 1, code: "GGGGGGGGGG" },
  ];
  kids = [];
  for (const s of seeds) {
    const [row] = await owner`
      INSERT INTO children (team_id, name, grade, gender, invite_code)
      VALUES (${teamId}, ${s.name}, ${s.grade}, 'male', ${s.code})
      RETURNING id`;
    if (!row) throw new Error("部員の作成に失敗しました");
    kids.push({ id: row.id, name: s.name });
  }
  const [oc] = await owner`
    INSERT INTO children (team_id, name, grade, gender, invite_code)
    VALUES (${otherTeamId}, '東 三郎', 5, 'male', 'ZZZZZZZZZZ')
    RETURNING id`;
  if (!oc) throw new Error("他チームの部員の作成に失敗しました");
  otherChildId = oc.id;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

/** kids の index から childId を引く(順序は seeds の並び) */
const id = (i: number) => kids[i]?.id as string;

const fullInput = () => ({
  starters: [
    { childId: id(0), position: "PG" },
    { childId: id(1), position: "SG" },
    { childId: id(2), position: "SF" },
    { childId: id(3), position: "PF" },
    { childId: id(4), position: "C" },
  ],
  bench: [id(5), id(6)],
});

describe("チーム編成 API", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request(`/lineups/${practiceId}`)).status).toBe(
      401,
    );
    expect(
      (
        await adminApi().request(`/lineups/${practiceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullInput()),
        })
      ).status,
    ).toBe(401);
  });

  it("編成が無い練習は空で返り、部員は学年降順→名前で並ぶ", async () => {
    const c = await coachClient(adminApi());
    const res = await c(`/lineups/${practiceId}`, "GET");
    expect(res.status).toBe(200);
    const body = (await res.json()) as LineupBody;
    expect(body.practice.id).toBe(practiceId);
    expect(body.starters).toEqual([]);
    expect(body.bench).toEqual([]);
    // 同学年内の name 順は DB の照合順(コードポイント順)なので、読みの五十音順ではなく
    // 「石田(U+77F3)」が「青木(U+9752)」より先に来る
    expect(body.members.map((m) => m.name)).toEqual([
      "石田 二郎",
      "青木 一郎",
      "上田 三郎",
      "江川 四郎",
      "岡田 五郎",
      "加藤 六郎",
      "木村 七郎",
    ]);
  });

  it("スターター5人+ベンチ2人を保存し、取り直すと POSITIONS 順で返る", async () => {
    const c = await coachClient(adminApi());
    // 入力はわざと POSITIONS 順から崩す(応答・保存後の並びが入力順に引きずられないこと)
    const input = {
      starters: [
        { childId: id(0), position: "C" },
        { childId: id(1), position: "PG" },
        { childId: id(2), position: "PF" },
        { childId: id(3), position: "SG" },
        { childId: id(4), position: "SF" },
      ],
      bench: [id(6), id(5)],
    };
    const saved = await c(`/lineups/${practiceId}`, "PUT", input);
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as Pick<
      LineupBody,
      "starters" | "bench"
    >;
    // 入力順(C→PG→…)ではなく POSITIONS 順で返る
    expect(savedBody.starters.map((s) => s.position)).toEqual([
      "PG",
      "SG",
      "SF",
      "PF",
      "C",
    ]);

    const body = (await (
      await c(`/lineups/${practiceId}`, "GET")
    ).json()) as LineupBody;
    expect(body.starters.map((s) => [s.position, s.child.name])).toEqual([
      ["PG", "石田 二郎"],
      ["SG", "江川 四郎"],
      ["SF", "岡田 五郎"],
      ["PF", "上田 三郎"],
      ["C", "青木 一郎"],
    ]);
    // 入力順(木村→加藤)ではなく名簿順(学年降順→名前)で返る
    expect(body.bench.map((b) => b.child.name)).toEqual([
      "加藤 六郎",
      "木村 七郎",
    ]);
  });

  it("保存し直すと全置換される(practice_id, child_id の一意制約に触れない)", async () => {
    const c = await coachClient(adminApi());
    expect((await c(`/lineups/${practiceId}`, "PUT", fullInput())).status).toBe(
      200,
    );
    // 同じ部員をポジションだけ入れ替えて再保存(delete → insert なので衝突しない)
    const swapped = {
      starters: [
        { childId: id(1), position: "PG" },
        { childId: id(0), position: "SG" },
        { childId: id(2), position: "SF" },
        { childId: id(3), position: "PF" },
        { childId: id(5), position: "C" },
      ],
      bench: [id(4)],
    };
    expect((await c(`/lineups/${practiceId}`, "PUT", swapped)).status).toBe(
      200,
    );
    const rows =
      await owner`SELECT count(*)::int AS n FROM lineups WHERE practice_id = ${practiceId}`;
    expect(rows[0]?.n).toBe(6);
    const body = (await (
      await c(`/lineups/${practiceId}`, "GET")
    ).json()) as LineupBody;
    expect(body.starters.map((s) => [s.position, s.child.name])).toEqual([
      ["PG", "石田 二郎"],
      ["SG", "青木 一郎"],
      ["SF", "上田 三郎"],
      ["PF", "江川 四郎"],
      ["C", "加藤 六郎"],
    ]);
    expect(body.bench.map((b) => b.child.name)).toEqual(["岡田 五郎"]);

    // 空で保存すると編成が消える(全置換)
    expect(
      (await c(`/lineups/${practiceId}`, "PUT", { starters: [], bench: [] }))
        .status,
    ).toBe(200);
    const empty =
      await owner`SELECT count(*)::int AS n FROM lineups WHERE practice_id = ${practiceId}`;
    expect(empty[0]?.n).toBe(0);
  });

  it("スターターが5人未満でも保存できる(編成途中)", async () => {
    const c = await coachClient(adminApi());
    const res = await c(`/lineups/${practiceId}`, "PUT", {
      starters: [{ childId: id(0), position: "PG" }],
      bench: [],
    });
    expect(res.status).toBe(200);
    const body = (await (
      await c(`/lineups/${practiceId}`, "GET")
    ).json()) as LineupBody;
    expect(body.starters).toHaveLength(1);
    expect(body.starters[0]?.position).toBe("PG");
  });

  it("入力不正は 400(ポジション重複・同じ部員の重複)", async () => {
    const c = await coachClient(adminApi());
    const dupPos = await c(`/lineups/${practiceId}`, "PUT", {
      starters: [
        { childId: id(0), position: "PG" },
        { childId: id(1), position: "PG" },
      ],
      bench: [],
    });
    expect(dupPos.status).toBe(400);
    expect(((await dupPos.json()) as { error: string }).error).toContain(
      "重複",
    );
    const dupChild = await c(`/lineups/${practiceId}`, "PUT", {
      starters: [{ childId: id(0), position: "PG" }],
      bench: [id(0)],
    });
    expect(dupChild.status).toBe(400);
  });

  it("他チームの部員・無効化された部員は 400", async () => {
    const c = await coachClient(adminApi());
    const other = await c(`/lineups/${practiceId}`, "PUT", {
      starters: [{ childId: otherChildId, position: "PG" }],
      bench: [],
    });
    expect(other.status).toBe(400);
    expect(((await other.json()) as { error: string }).error).toBe(
      "対象の部員が見つかりません",
    );

    await owner`UPDATE children SET status = 'revoked' WHERE id = ${id(5)}`;
    const revoked = await c(`/lineups/${practiceId}`, "PUT", {
      starters: [],
      bench: [id(5)],
    });
    expect(revoked.status).toBe(400);
    const rows =
      await owner`SELECT count(*)::int AS n FROM lineups WHERE practice_id = ${practiceId}`;
    expect(rows[0]?.n).toBe(0);
  });

  it("存在しない練習・不正な id は 404", async () => {
    const c = await coachClient(adminApi());
    const unknown = "11111111-1111-4111-8111-111111111111";
    expect((await c(`/lineups/${unknown}`, "GET")).status).toBe(404);
    expect(
      (await c(`/lineups/${unknown}`, "PUT", { starters: [], bench: [] }))
        .status,
    ).toBe(404);
    expect((await c("/lineups/not-a-uuid", "GET")).status).toBe(404);
    expect(
      (await c("/lineups/not-a-uuid", "PUT", { starters: [], bench: [] }))
        .status,
    ).toBe(404);
  });

  it("他チームのコーチからは練習が見えず保存もできない(RLS)", async () => {
    const mine = await coachClient(adminApi());
    expect(
      (await mine(`/lineups/${practiceId}`, "PUT", fullInput())).status,
    ).toBe(200);
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    expect((await other(`/lineups/${practiceId}`, "GET")).status).toBe(404);
    expect(
      (
        await other(`/lineups/${practiceId}`, "PUT", {
          starters: [],
          bench: [],
        })
      ).status,
    ).toBe(404);
    // 他チームの操作で編成が消えていないこと(スターター5人+ベンチ2人)
    const rows =
      await owner`SELECT count(*)::int AS n FROM lineups WHERE practice_id = ${practiceId}`;
    expect(rows[0]?.n).toBe(7);
  });
});
