import { coaches, guardians, withTeam } from "@hoopo/db";
import { eq } from "drizzle-orm";
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
// Cookie のセッショントークンを検証し、role と teamId が期待どおりで、かつ DB 上に
// guardian / coach 行がまだ存在するときだけ通す(セッションはステートレスなので、
// 削除・無効化の検出はこの存在確認が担う。全ルートで同じ規則にする)。
// 通過後は c.get("session") で SessionPayload を取り出せる

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

async function principalExists(session: SessionPayload): Promise<boolean> {
  return withTeam(session.teamId, async (tx) => {
    const row =
      session.role === "guardian"
        ? await tx.query.guardians.findFirst({
            where: eq(guardians.id, session.sub),
            columns: { id: true },
          })
        : await tx.query.coaches.findFirst({
            where: eq(coaches.id, session.sub),
            columns: { id: true },
          });
    return row !== undefined;
  });
}

function requireRole(role: SessionRole, deps: GuardDeps) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, COOKIE_BY_ROLE[role]);
    const session = token
      ? await verifySessionToken(token, deps.sessionSecret, {
          expectedRole: role,
        })
      : null;
    if (
      !session ||
      session.teamId !== deps.teamId ||
      !(await principalExists(session))
    ) {
      return c.json({ error: "未ログインです" }, 401);
    }
    c.set("session", session);
    await next();
  });
}

export const requireGuardian = (deps: GuardDeps) =>
  requireRole("guardian", deps);
export const requireCoach = (deps: GuardDeps) => requireRole("coach", deps);
