import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { fullName } from "../src/registration-shared";
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
    lineChannelSecret: null,
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

// name / kana はどちらも「姓 名」形式で渡し、ここで分割して 4 列に入れる
// (child-name-split/plan.md 設計判断1・2)。並びは kana で決まる
async function insertChild(
  team: string,
  name: string,
  kana: string,
  grade: number,
  code: string,
  options: {
    archived?: boolean;
    status?: "active" | "revoked";
    nicknameKana?: string | null;
  } = {},
): Promise<void> {
  const [familyName, givenName] = name.split(" ");
  const [familyNameKana, givenNameKana] = kana.split(" ");
  await owner`
    INSERT INTO children (team_id, family_name, given_name, family_name_kana, given_name_kana,
                          nickname_kana, grade, gender, invite_code, status, archived)
    VALUES (${team}, ${familyName ?? ""}, ${givenName ?? ""},
            ${familyNameKana ?? ""}, ${givenNameKana ?? ""},
            ${options.nicknameKana === undefined ? "はな" : options.nicknameKana},
            ${grade}, 'female', ${code}, ${options.status ?? "active"}, ${options.archived ?? false})`;
}

type MembersBody = {
  members: {
    id: string;
    familyName: string;
    givenName: string;
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

  // 学年降順→よみ。同学年は「いちろう < じろう」で五十音順を検証する
  await insertChild(teamId, "粉浜 二郎", "こはま じろう", 4, "TEAM000002");
  await insertChild(teamId, "粉浜 太郎", "こはま たろう", 6, "TEAM000001");
  // 呼び名なし(null)の部員も一覧に出る
  await insertChild(teamId, "粉浜 一郎", "こはま いちろう", 4, "TEAM000003", {
    nicknameKana: null,
  });
  // 卒団アーカイブ済み・無効化済みは名簿に出さない
  await insertChild(teamId, "粉浜 卒郎", "こはま そつろう", 6, "TEAM000004", {
    archived: true,
  });
  await insertChild(teamId, "粉浜 無郎", "こはま むろう", 5, "TEAM000005", {
    status: "revoked",
  });
  // 他チームの部員(RLS で見えないこと)
  await insertChild(otherTeamId, "他町 花子", "たまち はなこ", 6, "TEAM000006");
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("保護者のチーム名簿 API", () => {
  it("未ログインは 401", async () => {
    expect((await api().request("/team/members")).status).toBe(401);
  });

  it("学年降順→よみで並び、アーカイブ・無効化・他チームは出ない", async () => {
    const g = await guardianClient(api());
    const res = await g("/team/members");
    expect(res.status).toBe(200);
    const body = (await res.json()) as MembersBody;
    expect(body.members.map((m) => [fullName(m), m.grade])).toEqual([
      ["粉浜 太郎", 6],
      ["粉浜 一郎", 4],
      ["粉浜 二郎", 4],
    ]);
    expect(body.members[0]?.nicknameKana).toBe("はな");
    expect(
      body.members.find((m) => fullName(m) === "粉浜 一郎")?.nicknameKana,
    ).toBeNull();
  });

  it("他チームのセッションでは自チームの部員だけが見える", async () => {
    const g = await guardianClient(api(otherTeamId));
    const body = (await (await g("/team/members")).json()) as MembersBody;
    expect(body.members.map((m) => fullName(m))).toEqual(["他町 花子"]);
  });
});
