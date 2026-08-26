import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { createApi } from "../src/app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/session";

// 管理者認証 API を RLS 配下で検証する(admin-login/plan.md)。
// リセット方式は auth.int.test.ts と同じ(beforeEach で TRUNCATE+フィクスチャ再作成)

const SESSION_SECRET = "4".repeat(64);
const COACH_EMAIL = "coach@example.com";
const COACH_PASSWORD = "test-coach-password";

function ownerClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  return postgres(url, { max: 1, prepare: false });
}

const owner = ownerClient();
let teamId: string;
let coachId: string;
// PBKDF2 60万回は1回100ms級のため、ハッシュはスイートで1度だけ生成して使い回す
let coachHash: string;

function adminApi(team = teamId) {
  return createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });
}

async function login(
  app: ReturnType<typeof adminApi>,
  email = COACH_EMAIL,
  password = COACH_PASSWORD,
) {
  return app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function cookieOf(res: Response, name: string): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const value = setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1];
  if (!value) throw new Error(`${name} Cookie が発行されていません`);
  return `${name}=${value}`;
}

beforeAll(async () => {
  coachHash = await hashPassword(COACH_PASSWORD);
});

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [team] =
    await owner`INSERT INTO teams (name) VALUES ('テストチーム') RETURNING id`;
  if (!team) throw new Error("チームの作成に失敗しました");
  teamId = team.id;
  const [coach] = await owner`
    INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, ${COACH_EMAIL}, 'email', ${coachHash}) RETURNING id`;
  if (!coach) throw new Error("コーチの作成に失敗しました");
  coachId = coach.id;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("POST /auth/login", () => {
  it("正しい資格情報でログインでき、httpOnly の管理セッション Cookie が発行される", async () => {
    const res = await login(adminApi());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ coachId });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("誤ったパスワード・未知のメールは同一メッセージの 401", async () => {
    const app = adminApi();
    const wrongPass = await login(app, COACH_EMAIL, "wrong-password");
    const unknownEmail = await login(app, "nobody@example.com");
    expect(wrongPass.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPass.json()).toEqual(await unknownEmail.json());
  });

  it("別チームとして構成された API からはログインできない(RLS 越境不可)", async () => {
    const [other] =
      await owner`INSERT INTO teams (name) VALUES ('別チーム') RETURNING id`;
    const res = await login(adminApi(other?.id));
    expect(res.status).toBe(401);
  });

  it("email / password 欠落は 400", async () => {
    const res = await adminApi().request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: COACH_EMAIL }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /me(管理)と role 分離", () => {
  it("ログイン後のセッションでコーチを返す", async () => {
    const app = adminApi();
    const loginRes = await login(app);
    const res = await app.request("/me", {
      headers: { cookie: cookieOf(loginRes, ADMIN_SESSION_COOKIE_NAME) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ coachId, teamId });
  });

  it("保護者セッションの Cookie 値では管理 /me に入れない(別世界の分離)", async () => {
    // 保護者としてログインして正規の guardian セッションを得る
    const portal = createApi({
      verifyIdToken: createFakeIdTokenVerifier(),
      teamId,
      sessionSecret: SESSION_SECRET,
      encryptionKey: "5".repeat(64),
      hmacKey: "6".repeat(64),
      secureCookie: false,
    });
    const guardianLogin = await portal.request("/auth/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: `fake:U${"2".repeat(32)}` }),
    });
    const guardianToken = cookieOf(guardianLogin, SESSION_COOKIE_NAME).split(
      "=",
    )[1] as string;
    // 管理 Cookie 名に guardian トークンを差しても role 検証で拒否される
    const res = await adminApi().request("/me", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${guardianToken}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("ログアウトで Cookie が失効指示され、以後 /me は 401", async () => {
    const app = adminApi();
    await login(app);
    const res = await app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=;`);
    expect((await app.request("/me")).status).toBe(401);
  });
});
