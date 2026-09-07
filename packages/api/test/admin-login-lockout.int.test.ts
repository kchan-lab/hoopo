import { closeAppDb } from "@hoopo/db";
import { lineUserIdLookup } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { LINE_OAUTH_COOKIE_NAME } from "../src/line-login";
import { LOCKOUT_MS, MAX_FAILED_LOGINS } from "../src/login-lockout-shared";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { adminDeps } from "./admin-deps";

// 管理者ログインの試行回数制限(login-lockout/plan.md)を RLS 配下で検証する。
// リセット方式は admin-auth.int.test.ts と同じ(beforeEach で TRUNCATE+フィクスチャ再作成)。
// 失敗応答の status / 文言はロックの有無で変わらないこと(設計判断2)も併せて固定する

const SESSION_SECRET = "4".repeat(64);
const HMAC_KEY = "6".repeat(64);
const COACH_EMAIL = "coach@example.com";
const COACH_PASSWORD = "test-coach-password";
const WRONG_PASSWORD = "wrong-password";
const LINE_USER_ID = `U${"a".repeat(32)}`;

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
  return createAdminApi(adminDeps(team, SESSION_SECRET));
}

type AdminApi = ReturnType<typeof adminApi>;

async function login(
  app: AdminApi,
  email = COACH_EMAIL,
  password = COACH_PASSWORD,
) {
  return app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

/** 誤ったパスワードで n 回失敗させ、最後の応答を返す */
async function failLogin(app: AdminApi, times: number): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < times; i++) {
    last = await login(app, COACH_EMAIL, WRONG_PASSWORD);
  }
  if (!last) throw new Error("失敗回数は 1 以上にしてください");
  return last;
}

async function lockoutRow(id = coachId) {
  const [row] = await owner`
    SELECT failed_login_count, locked_until FROM coaches WHERE id = ${id}`;
  return row as { failed_login_count: number; locked_until: Date | null };
}

function cookieOf(res: Response, name: string): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const value = setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1];
  if (!value) throw new Error(`${name} Cookie が発行されていません`);
  return `${name}=${value}`;
}

/** LINE ログイン(フェイク)の start → callback。admin-line-login.int.test.ts と同じ辿り方 */
async function lineLogin(app: AdminApi): Promise<Response> {
  const start = await app.request(`/auth/line/start?fake_user=${LINE_USER_ID}`);
  return app.request(start.headers.get("location") ?? "", {
    headers: { cookie: cookieOf(start, LINE_OAUTH_COOKIE_NAME) },
  });
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

describe("POST /auth/login の試行回数制限", () => {
  it("5回連続で失敗すると 15 分ロックされ、カウンタは 0 に戻る", async () => {
    const app = adminApi();
    const before = Date.now();
    const res = await failLogin(app, MAX_FAILED_LOGINS);
    const after = Date.now();
    expect(res.status).toBe(401);

    const row = await lockoutRow();
    expect(row.failed_login_count).toBe(0);
    const until = row.locked_until?.getTime() ?? 0;
    // ロック明けは「失敗した時刻 + 15分」。実行時間ぶんの幅で挟んで確認する
    expect(until).toBeGreaterThanOrEqual(before + LOCKOUT_MS);
    expect(until).toBeLessThanOrEqual(after + LOCKOUT_MS);
  });

  it("ロック中は正しいパスワードでも同じ 401 で、行は書き換わらない", async () => {
    const app = adminApi();
    const failed = await failLogin(app, MAX_FAILED_LOGINS);
    const locked = await lockoutRow();

    const res = await login(app);
    expect(res.status).toBe(401);
    // 文言・Cookie ともロックの有無で変わらない(設計判断2)
    expect(await res.json()).toEqual(await failed.json());
    expect(res.headers.get("set-cookie") ?? "").not.toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    // ロック中の試行はカウンタも期限も動かさない(設計判断1)
    expect(await lockoutRow()).toEqual(locked);
  });

  it("ロック中に失敗してもロックは延長されない", async () => {
    const app = adminApi();
    await failLogin(app, MAX_FAILED_LOGINS);
    const locked = await lockoutRow();
    await failLogin(app, 2);
    expect(await lockoutRow()).toEqual(locked);
  });

  it("ロックが明けていれば正しいパスワードで入れ、両列がリセットされる", async () => {
    const app = adminApi();
    await failLogin(app, MAX_FAILED_LOGINS);
    // 15 分の経過を待たずに済ませるため、期限を過去に倒す
    await owner`
      UPDATE coaches SET locked_until = now() - interval '1 minute' WHERE id = ${coachId}`;

    const res = await login(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    expect(await lockoutRow()).toEqual({
      failed_login_count: 0,
      locked_until: null,
    });
  });

  it("上限未満の失敗はロックせず、成功でカウンタが 0 に戻る", async () => {
    const app = adminApi();
    await failLogin(app, 3);
    expect(await lockoutRow()).toEqual({
      failed_login_count: 3,
      locked_until: null,
    });

    const res = await login(app);
    expect(res.status).toBe(200);
    expect(await lockoutRow()).toEqual({
      failed_login_count: 0,
      locked_until: null,
    });
  });

  it("未知のメールは 401 のまま(記録する行がなくても落ちない)", async () => {
    const app = adminApi();
    const res = await login(app, "nobody@example.com", WRONG_PASSWORD);
    expect(res.status).toBe(401);
    // 実在するコーチのカウンタは巻き添えにならない
    expect(await lockoutRow()).toEqual({
      failed_login_count: 0,
      locked_until: null,
    });
  });

  it("ロック中でも LINE ログインは通る(設計判断3。予備経路が生きる)", async () => {
    const lookup = await lineUserIdLookup(LINE_USER_ID, HMAC_KEY);
    await owner`
      UPDATE coaches SET line_user_id = 'enc:v1:x:y', line_user_id_lookup = ${lookup}
      WHERE id = ${coachId}`;
    const app = adminApi();
    await failLogin(app, MAX_FAILED_LOGINS);
    const locked = await lockoutRow();
    expect(locked.locked_until).not.toBeNull();

    const callback = await lineLogin(app);
    expect(callback.headers.get("location")).toBe("/");
    expect(callback.headers.get("set-cookie") ?? "").toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    // LINE 経路はパスワードのロックを解除も延長もしない
    expect(await lockoutRow()).toEqual(locked);
  });
});
