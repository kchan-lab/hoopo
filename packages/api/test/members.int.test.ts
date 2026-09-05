import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { createApi } from "../src/app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/session";

// 認定管理・部員管理 API(child-registration/plan.md 12b)。
// 保護者 API で登録・連携したデータを、コーチ側で一覧・無効化できることを RLS 配下で検証する

const SESSION_SECRET = "5".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;

const guardianApi = (team = teamId) =>
  createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: "1".repeat(64),
    hmacKey: "2".repeat(64),
    secureCookie: false,
  });
const adminApi = (team = teamId) =>
  createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });

function cookieOf(res: Response, name: string): string {
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${name}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error(`${name} Cookie が発行されていません`);
  return `${name}=${value}`;
}

async function guardianClient(
  app: ReturnType<typeof guardianApi>,
  userId: string,
) {
  const res = await app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:U${userId.repeat(32)}` }),
  });
  const cookie = cookieOf(res, SESSION_COOKIE_NAME);
  return (path: string, method: "GET" | "POST", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "coach-pass-1" }),
  });
  const cookie = cookieOf(res, ADMIN_SESSION_COOKIE_NAME);
  return (path: string, method: "GET" | "POST", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const registration = (name: string, grade: number) => ({
  children: [{ name, grade, gender: "male" }],
  relation: "father",
  weekdays: [6],
  startTime: "09:00",
  endTime: "12:00",
  coachNote: "備考あり",
});

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
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash})`;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${otherTeamId}, 'other@example.com', 'email', ${coachHash})`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("認定管理(GET /registrations, POST /registrations/revoke)", () => {
  it("保護者セッションでは管理 API を呼べない", async () => {
    const g = await guardianClient(guardianApi(), "a");
    // 保護者 Cookie 名は別なので、管理 API から見ると未ログイン
    const res = await adminApi().request("/registrations", {
      headers: { Cookie: (await g("/me", "GET")).headers.get("cookie") ?? "" },
    });
    expect(res.status).toBe(401);
  });

  it("新規登録と家族連携が新着順に並び、経由元が種別で分かる", async () => {
    const gApp = guardianApi();
    const a = await guardianClient(gApp, "a");
    const b = await guardianClient(gApp, "b");
    const created = (await (
      await a("/children", "POST", registration("粉浜 太郎", 4))
    ).json()) as {
      children: { id: string; inviteCode: string }[];
    };
    const code = created.children[0]?.inviteCode ?? "";
    await b("/family-links", "POST", { code, relation: "mother" });

    const coach = await coachClient(adminApi());
    const body = (await (await coach("/registrations", "GET")).json()) as {
      registrations: {
        kind: string;
        childName: string;
        relation: string;
        status: string;
      }[];
    };
    expect(
      body.registrations.map((r) => [
        r.kind,
        r.childName,
        r.relation,
        r.status,
      ]),
    ).toEqual([
      ["link", "粉浜 太郎", "mother", "active"],
      ["child", "粉浜 太郎", "father", "active"],
    ]);
  });

  it("家族連携を無効化すると、その保護者からは子が見えなくなり、登録者からは見える", async () => {
    const gApp = guardianApi();
    const a = await guardianClient(gApp, "a");
    const b = await guardianClient(gApp, "b");
    const created = (await (
      await a("/children", "POST", registration("粉浜 太郎", 4))
    ).json()) as {
      children: { id: string; inviteCode: string }[];
    };
    const child = created.children[0];
    if (!child) throw new Error("登録に失敗");
    await b("/family-links", "POST", {
      code: child.inviteCode,
      relation: "mother",
    });

    const coach = await coachClient(adminApi());
    const list = (await (await coach("/registrations", "GET")).json()) as {
      registrations: { kind: string; guardianId: string; childId: string }[];
    };
    const link = list.registrations.find((r) => r.kind === "link");
    const res = await coach("/registrations/revoke", "POST", {
      kind: "link",
      childId: link?.childId,
      guardianId: link?.guardianId,
    });
    expect(res.status).toBe(200);

    expect(
      ((await (await b("/children", "GET")).json()) as { children: unknown[] })
        .children,
    ).toEqual([]);
    expect(
      ((await (await a("/children", "GET")).json()) as { children: unknown[] })
        .children,
    ).toHaveLength(1);
    // 二重の無効化は 404
    expect(
      (
        await coach("/registrations/revoke", "POST", {
          kind: "link",
          childId: link?.childId,
          guardianId: link?.guardianId,
        })
      ).status,
    ).toBe(404);
    // 履歴には revoked として残る
    const after = (await (await coach("/registrations", "GET")).json()) as {
      registrations: { kind: string; status: string }[];
    };
    expect(after.registrations.find((r) => r.kind === "link")?.status).toBe(
      "revoked",
    );
  });

  it("新規登録を無効化すると、登録した保護者からも見えなくなり部員一覧からも消える", async () => {
    const gApp = guardianApi();
    const a = await guardianClient(gApp, "a");
    const created = (await (
      await a("/children", "POST", registration("粉浜 太郎", 4))
    ).json()) as {
      children: { id: string }[];
    };
    const coach = await coachClient(adminApi());
    expect(
      (
        await coach("/registrations/revoke", "POST", {
          kind: "child",
          childId: created.children[0]?.id,
        })
      ).status,
    ).toBe(200);
    expect(
      ((await (await a("/children", "GET")).json()) as { children: unknown[] })
        .children,
    ).toEqual([]);
    const members = (await (await coach("/members", "GET")).json()) as {
      members: unknown[];
    };
    expect(members.members).toEqual([]);
  });

  it("他チームのコーチからは見えず、無効化もできない(RLS)", async () => {
    const a = await guardianClient(guardianApi(), "a");
    const created = (await (
      await a("/children", "POST", registration("粉浜 太郎", 4))
    ).json()) as {
      children: { id: string }[];
    };
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const list = (await (await other("/registrations", "GET")).json()) as {
      registrations: unknown[];
    };
    expect(list.registrations).toEqual([]);
    expect(
      (
        await other("/registrations/revoke", "POST", {
          kind: "child",
          childId: created.children[0]?.id,
        })
      ).status,
    ).toBe(404);
    const rows =
      await owner`SELECT status FROM children WHERE id = ${created.children[0]?.id ?? ""}`;
    expect(rows[0]?.status).toBe("active");
  });
});

describe("部員管理(GET /members)", () => {
  it("学年降順で並び、保護者数・伝達事項・曜日/時間・招待コードを返す", async () => {
    const gApp = guardianApi();
    const a = await guardianClient(gApp, "a");
    const b = await guardianClient(gApp, "b");
    await a("/children", "POST", registration("北粉浜 次郎", 2));
    const created = (await (
      await a("/children", "POST", registration("粉浜 太郎", 6))
    ).json()) as {
      children: { inviteCode: string }[];
    };
    const code = created.children[0]?.inviteCode ?? "";
    await b("/family-links", "POST", { code, relation: "mother" });

    const coach = await coachClient(adminApi());
    const body = (await (await coach("/members", "GET")).json()) as {
      members: {
        name: string;
        grade: number;
        guardianCount: number;
        coachNote: string;
        inviteCode: string;
        availabilities: {
          weekday: number;
          startTime: string;
          endTime: string;
        }[];
      }[];
    };
    expect(body.members.map((m) => [m.name, m.grade, m.guardianCount])).toEqual(
      [
        ["粉浜 太郎", 6, 2],
        ["北粉浜 次郎", 2, 1],
      ],
    );
    expect(body.members[0]?.coachNote).toBe("備考あり");
    expect(body.members[0]?.inviteCode).toBe(
      `${code.slice(0, 5)}-${code.slice(5)}`,
    );
    expect(body.members[0]?.availabilities).toEqual([
      { weekday: 6, startTime: "09:00", endTime: "12:00" },
    ]);
  });
});
