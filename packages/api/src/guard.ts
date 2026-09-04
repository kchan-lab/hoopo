import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import {
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type SessionPayload,
  type SessionRole,
  verifySessionToken,
} from "./session";

// 認証ガード(child-registration/plan.md 設計判断9)。
// Cookie のセッショントークンを検証し、role と teamId が期待どおりのときだけ通す。
// 通過後は c.get("session") で SessionPayload を取り出せる。
// DB 上の guardian / coach 行の存在確認は各ルートの責務(無効化・削除済みの検出)

export type AuthEnv = { Variables: { session: SessionPayload } };

interface GuardDeps {
  sessionSecret: string;
  /** 当面は env の単一チーム。セッションの teamId と一致しないものは拒否する */
  teamId: string;
}

const COOKIE_BY_ROLE: Record<SessionRole, string> = {
  guardian: SESSION_COOKIE_NAME,
  coach: ADMIN_SESSION_COOKIE_NAME,
};

function requireRole(role: SessionRole, deps: GuardDeps) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, COOKIE_BY_ROLE[role]);
    const session = token
      ? await verifySessionToken(token, deps.sessionSecret, {
          expectedRole: role,
        })
      : null;
    if (!session || session.teamId !== deps.teamId) {
      return c.json({ error: "未ログインです" }, 401);
    }
    c.set("session", session);
    await next();
  });
}

export const requireGuardian = (deps: GuardDeps) =>
  requireRole("guardian", deps);
export const requireCoach = (deps: GuardDeps) => requireRole("coach", deps);
