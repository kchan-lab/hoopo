import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 保護者のチーム名簿 API(team-roster/plan.md 7a)を RLS 配下で検証する

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

async function insertChild(
  team: string,
  name: string,
  grade: number,
  code: string,
  options: {
    archived?: boolean;
    status?: "active" | "revoked";
    nicknameKana?: string | null;
  } = {},
): Promise<void> {
  await owner`
    INSERT INTO children (team_id, name, nickname_kana, grade, gender, invite_code, status, archived)
    VALUES (${team}, ${name}, ${options.nicknameKana === undefined ? "はな" : options.nicknameKana},
            ${grade}, 'female', ${code}, ${options.status ?? "active"}, ${options.archived ?? false})`;
}

type MembersBody = {
  members: {
    id: string;
    name: string;
    nicknameKana: string | null;
    grade: number;
  }[];
};

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

  // 学年降順→名前。同学年は「一郎 < 二郎」で名前順を検証する
  await insertChild(teamId, "粉浜 二郎", 4, "TEAM000002");
  await insertChild(teamId, "粉浜 太郎", 6, "TEAM000001");
  // 呼び名なし(null)の部員も一覧に出る
  await insertChild(teamId, "粉浜 一郎", 4, "TEAM000003", {
    nicknameKana: null,
  });
  // 卒団アーカイブ済み・無効化済みは名簿に出さない
  await insertChild(teamId, "粉浜 卒郎", 6, "TEAM000004", { archived: true });
  await insertChild(teamId, "粉浜 無郎", 5, "TEAM000005", {
    status: "revoked",
  });
  // 他チームの部員(RLS で見えないこと)
  await insertChild(otherTeamId, "他町 花子", 6, "TEAM000006");
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("保護者のチーム名簿 API", () => {
  it("未ログインは 401", async () => {
    expect((await api().request("/team/members")).status).toBe(401);
  });

  it("学年降順→名前で並び、アーカイブ・無効化・他チームは出ない", async () => {
    const g = await guardianClient(api());
    const res = await g("/team/members");
    expect(res.status).toBe(200);
    const body = (await res.json()) as MembersBody;
    expect(body.members.map((m) => [m.name, m.grade])).toEqual([
      ["粉浜 太郎", 6],
      ["粉浜 一郎", 4],
      ["粉浜 二郎", 4],
    ]);
    expect(body.members[0]?.nicknameKana).toBe("はな");
    expect(
      body.members.find((m) => m.name === "粉浜 一郎")?.nicknameKana,
    ).toBeNull();
  });

  it("他チームのセッションでは自チームの部員だけが見える", async () => {
    const g = await guardianClient(api(otherTeamId));
    const body = (await (await g("/team/members")).json()) as MembersBody;
    expect(body.members.map((m) => m.name)).toEqual(["他町 花子"]);
  });
});
