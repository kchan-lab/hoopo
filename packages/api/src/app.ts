import { guardians, withTeam } from "@hoopo/db";
import {
  encryptLineUserId,
  type IdTokenVerifier,
  lineUserIdLookup,
} from "@hoopo/line";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import {
  getAttendanceSheet,
  getUnansweredSummary,
  submitAttendance,
} from "./attendances-guardian";
import { parseSubmitAttendance } from "./attendances-shared";
import { getFeeSheet } from "./fees-guardian";
import { parseYear } from "./fees-shared";
import { type AuthEnv, requireGuardian } from "./guard";
import {
  getNextPractice,
  getPractice,
  listPracticesByMonth,
  parseMonth,
} from "./practices";
import {
  getFamily,
  linkChildByInviteCode,
  listChildrenForGuardian,
  parseLink,
  parseRegistration,
  registerChildren,
} from "./registration";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./session";
import { monthOf, todayInTokyo } from "./tokyo-date";
import { isUuid } from "./uuid";

// 依存はすべて注入する(plan.md 設計判断1・6)。env の読み取りはアプリ側
// (apps/portal の Route Handler)の責務にし、この層は Web 標準 API のみで完結させる
export interface ApiDeps {
  verifyIdToken: IdTokenVerifier;
  /** 当面は env の単一チーム(plan.md 設計判断4) */
  teamId: string;
  sessionSecret: string;
  encryptionKey: string;
  hmacKey: string;
  /** ローカル(http)では false。Vercel 上は true */
  secureCookie: boolean;
}

export function createApi(deps: ApiDeps) {
  const app = new Hono<AuthEnv>();
  const guardian = requireGuardian(deps);

  // LIFF の ID トークンを検証し、guardian を find-or-create してセッションを張る
  app.post("/auth/line", async (c) => {
    const body = await c.req.json().catch(() => null);
    const idToken =
      body && typeof body.idToken === "string" ? body.idToken : "";
    if (!idToken) {
      return c.json({ error: "idToken が必要です" }, 400);
    }
    const verified = await deps.verifyIdToken(idToken);
    if (!verified.ok) {
      return c.json({ error: "ログインに失敗しました" }, 401);
    }

    const lookup = await lineUserIdLookup(verified.lineUserId, deps.hmacKey);
    // 暗号化は withTeam の外で済ませる(トランザクション内で DB 以外の処理をしない)
    const encrypted = await encryptLineUserId(
      verified.lineUserId,
      deps.encryptionKey,
    );
    const guardian = await withTeam(deps.teamId, async (tx) => {
      const existing = await tx.query.guardians.findFirst({
        where: eq(guardians.lineUserIdLookup, lookup),
        columns: { id: true },
      });
      if (existing) return { id: existing.id, isNew: false };
      // 初回ログインで作成(plan.md 設計判断3)。子ども連携(#12)までは何も閲覧できない。
      // タップ連打等の同時リクエストで両方が「未検出」と判定しうるため、
      // 一意制約(team_id, lookup)との衝突は握りつぶして既存行を引き直す
      const [created] = await tx
        .insert(guardians)
        .values({
          teamId: deps.teamId,
          lineUserId: encrypted,
          lineUserIdLookup: lookup,
        })
        .onConflictDoNothing({
          target: [guardians.teamId, guardians.lineUserIdLookup],
        })
        .returning({ id: guardians.id });
      if (created) return { id: created.id, isNew: true };
      const raced = await tx.query.guardians.findFirst({
        where: eq(guardians.lineUserIdLookup, lookup),
        columns: { id: true },
      });
      if (!raced) throw new Error("guardian の作成に失敗しました");
      return { id: raced.id, isNew: false };
    });

    const token = await createSessionToken(
      {
        sub: guardian.id,
        role: "guardian",
        teamId: deps.teamId,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      },
      deps.sessionSecret,
    );
    setCookie(c, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: deps.secureCookie,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.json({ guardianId: guardian.id, isNew: guardian.isNew });
  });

  // セッション確認(guardian 行の存在確認はミドルウェアが行う)
  app.get("/me", guardian, (c) => {
    const session = c.get("session");
    return c.json({ guardianId: session.sub, teamId: session.teamId });
  });

  // ---- 子ども登録・家族連携(child-registration/plan.md。ロジックは registration.ts) ----

  // 自分の子一覧(active な連携のみ)。0件なら portal は分岐画面(新規登録 / 招待コード)を出す
  app.get("/children", guardian, async (c) => {
    const session = c.get("session");
    const list = await listChildrenForGuardian(session.teamId, session.sub);
    return c.json({ children: list });
  });

  // 新規登録(①子ども情報×兄弟 + ②参加情報・続柄)。自動認定で即時有効
  app.post("/children", guardian, async (c) => {
    const parsed = parseRegistration(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const created = await registerChildren(
      session.teamId,
      session.sub,
      parsed.value,
    );
    return c.json({ children: created }, 201);
  });

  // 招待コードで既存の子どもと連携(第二保護者)
  app.post("/family-links", guardian, async (c) => {
    const parsed = parseLink(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const result = await linkChildByInviteCode(
      session.teamId,
      session.sub,
      parsed.value,
    );
    if (!result.ok) {
      return result.reason === "revoked"
        ? c.json({ error: "この招待コードは無効化されています" }, 403)
        : c.json({ error: "招待コードが見つかりません" }, 404);
    }
    return c.json(
      { child: result.child, alreadyLinked: result.alreadyLinked },
      result.alreadyLinked ? 200 : 201,
    );
  });

  // 家族の設定(§4.2-9): 招待コードと連携済み保護者
  app.get("/family", guardian, async (c) => {
    const session = c.get("session");
    return c.json({ children: await getFamily(session.teamId, session.sub) });
  });

  // ---- 日程(practice-schedule/plan.md 3b)。チーム公開情報なので子ども未連携でも閲覧可 ----

  app.get("/practices", guardian, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json({
      month,
      practices: await listPracticesByMonth(session.teamId, month),
    });
  });

  // 次回の練習(ホーム)。/:id より先に定義する
  app.get("/practices/next", guardian, async (c) => {
    const session = c.get("session");
    return c.json({
      practice: await getNextPractice(session.teamId, todayInTokyo()),
    });
  });

  app.get("/practices/:id", guardian, async (c) => {
    const session = c.get("session");
    if (!isUuid(c.req.param("id")))
      return c.json({ error: "練習が見つかりません" }, 404);
    const practice = await getPractice(session.teamId, c.req.param("id"));
    return practice
      ? c.json({ practice })
      : c.json({ error: "練習が見つかりません" }, 404);
  });

  // ---- 参加予定の提出(attendance/plan.md 4a。ロジックは attendances-guardian.ts) ----

  // 提出画面の初期表示。お子さん・月内の練習・回答済みの内容をまとめて返す
  app.get("/attendance", guardian, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json(await getAttendanceSheet(session.teamId, session.sub, month));
  });

  // ホームの未提出アラート用。パラメータ付きルートを足すときは必ずこれより後に定義する
  app.get("/attendance/summary", guardian, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json(
      await getUnansweredSummary(session.teamId, session.sub, month),
    );
  });

  // お子さん単位の一括保存(設計判断2)。status=null は未回答に戻す
  app.put("/attendance", guardian, async (c) => {
    const parsed = parseSubmitAttendance(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const result = await submitAttendance(
      session.teamId,
      session.sub,
      parsed.value,
    );
    if (!result.ok) {
      // 自分の子でない childId は存在を漏らさず 404 にする
      return result.reason === "not_found"
        ? c.json({ error: "お子さんが見つかりません" }, 404)
        : c.json({ error: "練習が見つかりません" }, 400);
    }
    return c.json({ saved: result.saved });
  });

  // ---- 月謝の確認(fees/plan.md 5a。ロジックは fees-guardian.ts) ----

  // 封筒グリッド(お子さん × 1〜12月)。年は暦年で、省略時は Tokyo の今年(設計判断2)
  app.get("/fees", guardian, async (c) => {
    const today = todayInTokyo();
    const year = parseYear(c.req.query("year") ?? today.slice(0, 4));
    if (year === null)
      return c.json({ error: "year は 2020〜2100 で指定してください" }, 400);
    const session = c.get("session");
    return c.json(
      await getFeeSheet(session.teamId, session.sub, year, monthOf(today)),
    );
  });

  return app;
}
