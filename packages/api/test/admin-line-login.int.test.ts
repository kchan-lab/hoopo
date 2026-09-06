import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier, lineUserIdLookup } from "@hoopo/line";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAdminApi } from "../src/admin-app";
import { LINE_OAUTH_COOKIE_NAME } from "../src/line-login";
import { hashPassword } from "../src/password";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  createSessionToken,
} from "../src/session";

// 管理者の LINE ログイン(admin-line-login/plan.md)を RLS 配下で検証する。
// リセット方式は admin-auth.int.test.ts と同じ(beforeEach で TRUNCATE+フィクスチャ再作成)。
// フェイク検証器(fake: true)で start → callback を短絡させ、実チャネルなしで導線を通す

const SESSION_SECRET = "4".repeat(64);
const ENCRYPTION_KEY = "5".repeat(64);
const HMAC_KEY = "6".repeat(64);
const COACH_EMAIL = "coach@example.com";
const OTHER_COACH_EMAIL = "coach2@example.com";
const COACH_PASSWORD = "test-coach-password";
const LINE_USER_ID = `U${"a".repeat(32)}`;
const OTHER_LINE_USER_ID = `U${"b".repeat(32)}`;

function ownerClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  return postgres(url, { max: 1, prepare: false });
}

const owner = ownerClient();
let teamId: string;
let coachId: string;
let otherCoachId: string;
let coachHash: string;

// 交換はフェイク経路(code が fake: 始まり)では呼ばれない。呼ばれたら失敗させて検出する
const exchangeCode = vi.fn(async () => ({
  ok: false as const,
  reason: "フェイクでは呼ばれない",
}));

function adminApi(team = teamId) {
  return createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
    encryptionKey: ENCRYPTION_KEY,
    hmacKey: HMAC_KEY,
    lineLogin: {
      channelId: "2000000001",
      channelSecret: "channel-secret",
      verifyIdToken: createFakeIdTokenVerifier(),
      exchangeCode,
      fake: true,
    },
  });
}

type AdminApi = ReturnType<typeof adminApi>;

function cookieOf(res: Response, name: string): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const value = setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1];
  if (!value) throw new Error(`${name} Cookie が発行されていません`);
  return `${name}=${value}`;
}

async function coachSessionCookie(id = coachId): Promise<string> {
  const token = await createSessionToken(
    {
      sub: id,
      role: "coach",
      teamId,
      exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
    },
    SESSION_SECRET,
  );
  return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
}

/** start → (フェイクの短絡) → callback を実ブラウザと同じ順で辿る */
async function startAndCallback(
  app: AdminApi,
  query: string,
  sessionCookie?: string,
): Promise<{ start: Response; callback: Response }> {
  const start = await app.request(
    `/auth/line/start${query}`,
    sessionCookie ? { headers: { cookie: sessionCookie } } : {},
  );
  const location = start.headers.get("location") ?? "";
  const cookies = [cookieOf(start, LINE_OAUTH_COOKIE_NAME), sessionCookie]
    .filter(Boolean)
    .join("; ");
  const callback = await app.request(location, {
    headers: { cookie: cookies },
  });
  return { start, callback };
}

async function linkedRow(id = coachId) {
  const [row] = await owner`
    SELECT line_user_id, line_user_id_lookup FROM coaches WHERE id = ${id}`;
  return row as {
    line_user_id: string | null;
    line_user_id_lookup: string | null;
  };
}

beforeAll(async () => {
  coachHash = await hashPassword(COACH_PASSWORD);
});

beforeEach(async () => {
  exchangeCode.mockClear();
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
  const [other] = await owner`
    INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, ${OTHER_COACH_EMAIL}, 'email', ${coachHash}) RETURNING id`;
  if (!coach || !other) throw new Error("コーチの作成に失敗しました");
  coachId = coach.id;
  otherCoachId = other.id;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("GET /auth/line/start", () => {
  it("state Cookie を発行し、フェイクでは callback へ短絡する", async () => {
    const res = await adminApi().request("/auth/line/start");
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${LINE_OAUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    // 他のルートに載せないよう path を絞る(plan.md 設計判断2)
    expect(setCookie).toContain("Path=/api/auth/line");
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/line/callback?");
    expect(location).toContain(`code=fake%3AU${"c".repeat(32)}`);
  });

  it("mode=link は未ログインだと 401", async () => {
    const res = await adminApi().request("/auth/line/start?mode=link");
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/line/callback(mode=login)", () => {
  it("連携済みコーチなら管理セッションが発行されてトップへ戻る", async () => {
    const lookup = await lineUserIdLookup(LINE_USER_ID, HMAC_KEY);
    await owner`
      UPDATE coaches SET line_user_id = 'enc:v1:x:y', line_user_id_lookup = ${lookup}
      WHERE id = ${coachId}`;

    const { callback } = await startAndCallback(
      adminApi(),
      `?fake_user=${LINE_USER_ID}`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");
    const setCookie = callback.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    // フェイク経路では token API を叩かない
    expect(exchangeCode).not.toHaveBeenCalled();

    const me = await adminApi().request("/me", {
      headers: { cookie: cookieOf(callback, ADMIN_SESSION_COOKIE_NAME) },
    });
    expect(await me.json()).toEqual({ coachId, teamId });
  });

  it("未連携の LINE アカウントは line_unlinked でログイン画面へ戻る", async () => {
    const { callback } = await startAndCallback(
      adminApi(),
      `?fake_user=${LINE_USER_ID}`,
    );
    expect(callback.headers.get("location")).toBe("/login?error=line_unlinked");
    expect(callback.headers.get("set-cookie") ?? "").not.toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
  });

  it("state が一致しない(Cookie なし・値違い)は line_state", async () => {
    const app = adminApi();
    const noCookie = await app.request(
      "/auth/line/callback?code=fake:x&state=s",
    );
    expect(noCookie.headers.get("location")).toBe("/login?error=line_state");

    const start = await app.request("/auth/line/start");
    const tampered = await app.request(
      "/auth/line/callback?code=fake:x&state=wrong",
      { headers: { cookie: cookieOf(start, LINE_OAUTH_COOKIE_NAME) } },
    );
    expect(tampered.headers.get("location")).toBe("/login?error=line_state");
  });

  it("別チームの API からは連携済みコーチが見えない(RLS 越境不可)", async () => {
    const lookup = await lineUserIdLookup(LINE_USER_ID, HMAC_KEY);
    await owner`
      UPDATE coaches SET line_user_id = 'enc:v1:x:y', line_user_id_lookup = ${lookup}
      WHERE id = ${coachId}`;
    const [otherTeam] =
      await owner`INSERT INTO teams (name) VALUES ('別チーム') RETURNING id`;

    const { callback } = await startAndCallback(
      adminApi(otherTeam?.id),
      `?fake_user=${LINE_USER_ID}`,
    );
    expect(callback.headers.get("location")).toBe("/login?error=line_unlinked");
  });
});

describe("GET /auth/line/callback(mode=link)", () => {
  it("暗号文と lookup だけを保存し、アカウント画面へ戻る", async () => {
    const { callback } = await startAndCallback(
      adminApi(),
      `?mode=link&fake_user=${LINE_USER_ID}`,
      await coachSessionCookie(),
    );
    expect(callback.headers.get("location")).toBe("/account?linked=1");

    const row = await linkedRow();
    // 平文の LINE userId は保存しない(絶対原則4、CHECK 制約も通る)
    expect(row.line_user_id).not.toBe(LINE_USER_ID);
    expect(row.line_user_id?.startsWith("enc:v1:")).toBe(true);
    expect(row.line_user_id_lookup).toBe(
      await lineUserIdLookup(LINE_USER_ID, HMAC_KEY),
    );

    // 連携後はその LINE でログインできる
    const { callback: login } = await startAndCallback(
      adminApi(),
      `?fake_user=${LINE_USER_ID}`,
    );
    expect(login.headers.get("location")).toBe("/");
  });

  it("別のコーチが連携済みの LINE は line_taken", async () => {
    await startAndCallback(
      adminApi(),
      `?mode=link&fake_user=${LINE_USER_ID}`,
      await coachSessionCookie(),
    );
    const { callback } = await startAndCallback(
      adminApi(),
      `?mode=link&fake_user=${LINE_USER_ID}`,
      await coachSessionCookie(otherCoachId),
    );
    expect(callback.headers.get("location")).toBe("/account?error=line_taken");
    expect((await linkedRow(otherCoachId)).line_user_id).toBeNull();
  });

  it("連携中にセッションが切れていればログイン画面へ", async () => {
    const app = adminApi();
    const start = await app.request("/auth/line/start?mode=link", {
      headers: { cookie: await coachSessionCookie() },
    });
    // 管理セッション Cookie を付けずに戻ってきた場合
    const callback = await app.request(start.headers.get("location") ?? "", {
      headers: { cookie: cookieOf(start, LINE_OAUTH_COOKIE_NAME) },
    });
    expect(callback.headers.get("location")).toBe("/login");
    expect((await linkedRow()).line_user_id).toBeNull();
  });
});

describe("DELETE /auth/line/link", () => {
  it("連携を解除すると両列が NULL に戻る", async () => {
    const session = await coachSessionCookie();
    await startAndCallback(
      adminApi(),
      `?mode=link&fake_user=${LINE_USER_ID}`,
      session,
    );
    const res = await adminApi().request("/auth/line/link", {
      method: "DELETE",
      headers: { cookie: session },
    });
    expect(res.status).toBe(204);
    expect(await linkedRow()).toEqual({
      line_user_id: null,
      line_user_id_lookup: null,
    });
    // 解除後は同じ LINE でログインできない
    const { callback } = await startAndCallback(
      adminApi(),
      `?fake_user=${LINE_USER_ID}`,
    );
    expect(callback.headers.get("location")).toBe("/login?error=line_unlinked");
  });

  it("パスワード未設定のコーチは解除できない(締め出し防止の 409)", async () => {
    const lookup = await lineUserIdLookup(OTHER_LINE_USER_ID, HMAC_KEY);
    const [lineOnly] = await owner`
      INSERT INTO coaches (team_id, email, auth_type, password_hash, line_user_id, line_user_id_lookup)
      VALUES (${teamId}, 'line-only@example.com', 'line', NULL, 'enc:v1:x:y', ${lookup})
      RETURNING id`;
    if (!lineOnly) throw new Error("コーチの作成に失敗しました");
    const res = await adminApi().request("/auth/line/link", {
      method: "DELETE",
      headers: { cookie: await coachSessionCookie(lineOnly.id) },
    });
    expect(res.status).toBe(409);
    expect((await linkedRow(lineOnly.id)).line_user_id_lookup).toBe(lookup);
  });

  it("未ログインは 401", async () => {
    const res = await adminApi().request("/auth/line/link", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});
