import { coaches, withTeam } from "@hoopo/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementsForCoach,
  updateAnnouncement,
} from "./announcements-coach";
import { parseAnnouncementInput } from "./announcements-shared";
import { getAbsentees, getAttendanceMatrix } from "./attendances-coach";
import { getDashboard } from "./dashboard";
import { getFeeGrid, setFeeStatus } from "./fees-coach";
import { parseFeeToggle, parseYear } from "./fees-shared";
import { type AuthEnv, requireCoach } from "./guard";
import {
  listMembers,
  listRegistrations,
  parseRevoke,
  revokeRegistration,
} from "./members";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";
import {
  createPractice,
  deletePractice,
  listPracticesByMonth,
  parseMonth,
  parsePracticeInput,
  updatePractice,
} from "./practices";
import { getPublishStatus, publishSchedule } from "./schedule-publish";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  createSessionToken,
} from "./session";
import { monthOf, todayInTokyo } from "./tokyo-date";
import { isUuid } from "./uuid";

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
  const app = new Hono<AuthEnv>();
  const coach = requireCoach(deps);

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

  // セッション確認(coach 行の存在確認はミドルウェアが行う)
  app.get("/me", coach, (c) => {
    const session = c.get("session");
    return c.json({ coachId: session.sub, teamId: session.teamId });
  });

  // ---- 認定管理・部員管理(child-registration/plan.md 12b。ロジックは members.ts) ----

  // 認定履歴(新着順)。「コーチへ通知」の実体
  app.get("/registrations", coach, async (c) => {
    const session = c.get("session");
    return c.json({ registrations: await listRegistrations(session.teamId) });
  });

  // 無効化(破壊的操作: 確認ダイアログは UI 側。実行ログは updated_at と status で残る)
  app.post("/registrations/revoke", coach, async (c) => {
    const parsed = parseRevoke(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const done = await revokeRegistration(session.teamId, parsed.value);
    return done
      ? c.json({ ok: true })
      : c.json(
          { error: "対象が見つからないか、すでに無効化されています" },
          404,
        );
  });

  // 部員一覧(詳細同梱)
  app.get("/members", coach, async (c) => {
    const session = c.get("session");
    return c.json({ members: await listMembers(session.teamId) });
  });

  // ---- 日程管理(practice-schedule/plan.md 3a。ロジックは practices.ts) ----

  // 月の練習一覧(?month=YYYY-MM。省略時は Tokyo の今月)
  app.get("/practices", coach, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json({
      month,
      practices: await listPracticesByMonth(session.teamId, month),
    });
  });

  app.post("/practices", coach, async (c) => {
    const parsed = parsePracticeInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    return c.json(
      { practice: await createPractice(session.teamId, parsed.value) },
      201,
    );
  });

  app.put("/practices/:id", coach, async (c) => {
    const parsed = parsePracticeInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    if (!isUuid(c.req.param("id")))
      return c.json({ error: "対象が見つかりません" }, 404);
    const practice = await updatePractice(
      session.teamId,
      c.req.param("id"),
      parsed.value,
    );
    return practice
      ? c.json({ practice })
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // 破壊的操作: 確認は UI 側の二段階確認。出欠・メニューも CASCADE で消える(plan.md 設計判断7)
  app.delete("/practices/:id", coach, async (c) => {
    const session = c.get("session");
    if (!isUuid(c.req.param("id")))
      return c.json({ error: "対象が見つかりません" }, 404);
    const done = await deletePractice(session.teamId, c.req.param("id"));
    return done
      ? c.body(null, 204)
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // ---- 予定表の発行(schedule-publish/plan.md 6b-1。ロジックは schedule-publish.ts) ----

  // 月の発行状況(?month=YYYY-MM。省略時は Tokyo の今月)
  app.get("/schedule/status", coach, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json(await getPublishStatus(session.teamId, month));
  });

  // 発行(確認は UI 側の二段階確認)。再発行も同じルートで上書きする(plan.md 設計判断1)。
  // 実行ログは published_at そのもの(設計判断5)。LINE 送信と通数は 6c
  app.post("/schedule/publish", coach, async (c) => {
    const body = await c.req.json().catch(() => null);
    const month = parseMonth(
      body && typeof body.month === "string" ? body.month : null,
    );
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    const session = c.get("session");
    const result = await publishSchedule(session.teamId, month);
    if (!result.ok) return c.json({ error: "この月には練習がありません" }, 400);
    return c.json({
      month: result.month,
      published: result.published,
      publishedAt: result.publishedAt,
    });
  });

  // ---- 出欠管理・欠席者管理(attendance/plan.md 4b。ロジックは attendances-coach.ts) ----

  // 部員×練習日のマトリクス(?month=YYYY-MM。省略時は Tokyo の今月)
  app.get("/attendance-matrix", coach, async (c) => {
    const session = c.get("session");
    const month = parseMonth(c.req.query("month") ?? monthOf(todayInTokyo()));
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    return c.json(await getAttendanceMatrix(session.teamId, month));
  });

  // 練習日ごとの欠席者(不参加 / 途中参加・早退 / 未回答)。
  // 他チームの練習は存在を漏らさず 404(RLS 配下で見つからない)
  app.get("/absentees", coach, async (c) => {
    const session = c.get("session");
    const practiceId = c.req.query("practiceId") ?? "";
    if (!isUuid(practiceId))
      return c.json({ error: "対象が見つかりません" }, 404);
    const result = await getAbsentees(session.teamId, practiceId);
    return result
      ? c.json(result)
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // ---- ダッシュボード(admin-dashboard/plan.md 7c。ロジックは dashboard.ts) ----

  // 提出率・次回参加人数・月謝未提出・未提出の部員を Tokyo の今日基準でまとめて返す
  app.get("/dashboard", coach, async (c) => {
    const session = c.get("session");
    return c.json(await getDashboard(session.teamId, todayInTokyo()));
  });

  // ---- 月謝管理(fees/plan.md 5b。ロジックは fees-coach.ts) ----

  // 部員×1〜12月の封筒グリッド(?year=YYYY。省略時は Tokyo の今年)
  app.get("/fee-grid", coach, async (c) => {
    const session = c.get("session");
    const today = todayInTokyo();
    const year = parseYear(c.req.query("year") ?? today.slice(0, 4));
    if (year === null)
      return c.json({ error: "year は西暦4桁で指定してください" }, 400);
    return c.json(await getFeeGrid(session.teamId, year, monthOf(today)));
  });

  // セル1つの 済⇄未。現金の受領時に押す操作なので確認は挟まない(plan.md 設計判断3)
  app.put("/fee-records", coach, async (c) => {
    const parsed = parseFeeToggle(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const result = await setFeeStatus(
      session.teamId,
      parsed.value,
      monthOf(todayInTokyo()),
    );
    return result.ok
      ? c.json({ month: result.month })
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // ---- お知らせ管理(announcements/plan.md 6a-1。ロジックは announcements-coach.ts) ----

  // 下書きを含む全件(下書きが先頭 → 公開済みを新しい順)
  app.get("/announcements", coach, async (c) => {
    const session = c.get("session");
    return c.json({
      announcements: await listAnnouncementsForCoach(session.teamId),
    });
  });

  app.post("/announcements", coach, async (c) => {
    const parsed = parseAnnouncementInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    return c.json(
      { announcement: await createAnnouncement(session.teamId, parsed.value) },
      201,
    );
  });

  // publish: true で公開(公開済みなら日時は維持)、false で下書きに戻す(plan.md 設計判断1)
  app.put("/announcements/:id", coach, async (c) => {
    const parsed = parseAnnouncementInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    if (!isUuid(c.req.param("id")))
      return c.json({ error: "対象が見つかりません" }, 404);
    const announcement = await updateAnnouncement(
      session.teamId,
      c.req.param("id"),
      parsed.value,
    );
    return announcement
      ? c.json({ announcement })
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // 破壊的操作: 確認は UI 側の二段階確認(CLAUDE.md 開発ルール)
  app.delete("/announcements/:id", coach, async (c) => {
    const session = c.get("session");
    if (!isUuid(c.req.param("id")))
      return c.json({ error: "対象が見つかりません" }, 404);
    const done = await deleteAnnouncement(session.teamId, c.req.param("id"));
    return done
      ? c.body(null, 204)
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  return app;
}
