import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier, decryptLineUserId } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/session";

// 認証 API を RLS 配下(hoopo_app ロール)で検証する。
// DB 接続とリセット方式は packages/db の Integration テストと同じ
// (.claude/plans/db-schema-rls-seed/plan.md 設計判断11: フィクスチャはテストが自前で作る)

const ENC_KEY = "1".repeat(64);
const HMAC_KEY = "2".repeat(64);
const SESSION_SECRET = "3".repeat(64);
const USER_ID = `U${"0123456789abcdef".repeat(2)}`;

function ownerClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  return postgres(url, { max: 1, prepare: false });
}

const owner = ownerClient();
let teamId: string;

function api() {
  return createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId,
    sessionSecret: SESSION_SECRET,
    encryptionKey: ENC_KEY,
    hmacKey: HMAC_KEY,
    secureCookie: false,
  });
}

async function login(app: ReturnType<typeof api>, userId = USER_ID) {
  return app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:${userId}` }),
  });
}

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const value = setCookie.match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("セッション Cookie が発行されていません");
  return `${SESSION_COOKIE_NAME}=${value}`;
}

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
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("POST /auth/line", () => {
  it("初回ログインで guardian を作成し、httpOnly セッション Cookie を発行する", async () => {
    const res = await login(api());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ isNew: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    // 保存されるのは暗号文+lookup のみ。復号すると元の userId に戻る(平文は保存されない)
    const [row] = await owner`
      SELECT line_user_id, line_user_id_lookup FROM guardians`;
    expect(row?.line_user_id).toMatch(/^enc:v1:/);
    expect(row?.line_user_id_lookup).toMatch(/^[0-9a-f]{64}$/);
    expect(await decryptLineUserId(row?.line_user_id, ENC_KEY)).toBe(USER_ID);
  });

  it("2回目のログインは同じ guardian を返す(冪等)", async () => {
    const app = api();
    const first = (await (await login(app)).json()) as { guardianId: string };
    const res = await login(app);
    expect(await res.json()).toEqual({
      guardianId: first.guardianId,
      isNew: false,
    });
    const [countRow] =
      await owner`SELECT count(*)::int AS count FROM guardians`;
    expect(countRow?.count).toBe(1);
  });

  it("不正なトークンは 401 で guardian を作らない", async () => {
    const app = api();
    for (const idToken of ["fake:invalid", USER_ID, ""]) {
      const res = await app.request("/auth/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      expect([400, 401]).toContain(res.status);
    }
    const [countRow] =
      await owner`SELECT count(*)::int AS count FROM guardians`;
    expect(countRow?.count).toBe(0);
  });
});

describe("GET /me", () => {
  it("ログイン後のセッションで guardian を返す", async () => {
    const app = api();
    const loginRes = await login(app);
    const { guardianId } = (await loginRes.json()) as { guardianId: string };
    const res = await app.request("/me", {
      headers: { cookie: sessionCookie(loginRes) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ guardianId, teamId });
  });

  it("Cookie なし・改ざんトークンは 401", async () => {
    const app = api();
    expect((await app.request("/me")).status).toBe(401);
    expect(
      (
        await app.request("/me", {
          headers: { cookie: `${SESSION_COOKIE_NAME}=v1.forged.sig` },
        })
      ).status,
    ).toBe(401);
  });

  it("別チームのセッションでは guardian を解決できない(RLS 越境不可)", async () => {
    const app = api();
    const loginRes = await login(app);
    // 同じ Cookie のまま、API を別チームとして構成し直す(将来のマルチテナント誤設定を想定)
    const [other] =
      await owner`INSERT INTO teams (name) VALUES ('別チーム') RETURNING id`;
    teamId = other?.id;
    const res = await api().request("/me", {
      headers: { cookie: sessionCookie(loginRes) },
    });
    expect(res.status).toBe(401);
  });
});
