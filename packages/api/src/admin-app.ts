import { coaches, withTeam } from "@hoopo/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session";

// 管理者(コーチ)認証 API(admin-login/plan.md)。
// 保護者 API(app.ts)とはアプリ・Cookie・role を分離する(絶対原則6)。
// LINE ログインは別 Issue(1b はメール+パスワードのみ。plan.md 設計判断1)

export interface AdminApiDeps {
  /** 当面は env の単一チーム。コーチ検索もこのチームの RLS 配下で行う */
  teamId: string;
  sessionSecret: string;
  secureCookie: boolean;
}

// 資格情報の誤りは email 不明/パスワード不一致を区別せず同一応答(plan.md 設計判断9)
const LOGIN_FAILED = "メールアドレスまたはパスワードが違います";

export function createAdminApi(deps: AdminApiDeps) {
  const app = new Hono();

  app.post("/auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = body && typeof body.email === "string" ? body.email : "";
    const password =
      body && typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return c.json({ error: "メールアドレスとパスワードが必要です" }, 400);
    }

    // 大文字・前後空白はメールクライアントの自動補完で混入しがちなので正規化して照合する
    // (登録側も小文字で保存する運用。seed・stg 作成手順も同様)
    const normalizedEmail = email.trim().toLowerCase();
    const coach = await withTeam(deps.teamId, (tx) =>
      tx.query.coaches.findFirst({
        where: and(
          eq(coaches.email, normalizedEmail),
          eq(coaches.authType, "email"),
        ),
        columns: { id: true, passwordHash: true },
      }),
    );
    // コーチ不在でも必ずハッシュ照合を1回行い、応答時間で email の存在を推測させない
    // (ダミーは本物と同じ反復回数。password.ts の DUMMY_PASSWORD_HASH)
    const stored = coach?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const ok = await verifyPassword(password, stored);
    if (!coach?.passwordHash || !ok) {
      return c.json({ error: LOGIN_FAILED }, 401);
    }

    const token = await createSessionToken(
      {
        sub: coach.id,
        role: "coach",
        teamId: deps.teamId,
        exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
      },
      deps.sessionSecret,
    );
    setCookie(c, ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: deps.secureCookie,
      sameSite: "Lax",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return c.json({ coachId: coach.id });
  });

  // 共有 PC を想定し明示的なログアウトを用意する(保護者側にはない管理専用の導線)
  app.post("/auth/logout", (c) => {
    deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/me", async (c) => {
    const token = getCookie(c, ADMIN_SESSION_COOKIE_NAME);
    const session = token
      ? await verifySessionToken(token, deps.sessionSecret, {
          expectedRole: "coach",
        })
      : null;
    if (!session || session.teamId !== deps.teamId) {
      return c.json({ error: "未ログインです" }, 401);
    }
    const coach = await withTeam(session.teamId, (tx) =>
      tx.query.coaches.findFirst({
        where: eq(coaches.id, session.sub),
        columns: { id: true },
      }),
    );
    if (!coach) {
      return c.json({ error: "未ログインです" }, 401);
    }
    return c.json({ coachId: coach.id, teamId: session.teamId });
  });

  return app;
}
