import { coaches, withTeam } from "@hoopo/db";
import {
  type AuthorizationCodeExchanger,
  encryptLineUserId,
  type IdTokenVerifier,
  type LineMessagingClient,
  lineUserIdLookup,
} from "@hoopo/line";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
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
import { type AuthEnv, readSession, requireCoach } from "./guard";
import {
  buildAuthorizeUrl,
  callbackUrlFromStart,
  createLineOAuthState,
  createLineOAuthToken,
  fakeCallbackPath,
  LINE_OAUTH_COOKIE_NAME,
  LINE_OAUTH_COOKIE_PATH,
  LINE_OAUTH_TTL_SECONDS,
  type LineOAuthMode,
  parseFakeUser,
  redirectUriFromCallback,
  verifyLineOAuthToken,
} from "./line-login";
import {
  getLineUsage,
  type LineSendDeps,
  type LineSendFailureReason,
  listLineMessages,
  sendAnnouncementToLine,
  sendAttendanceReminderToLine,
  sendScheduleToLine,
} from "./line-send";
import { getLineupForCoach, saveLineup } from "./lineups-coach";
import { parseLineupInput } from "./lineups-shared";
import {
  isLocked,
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
} from "./login-lockout-shared";
import {
  deleteArchivedMember,
  listArchivedMembers,
  listAuditLogs,
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
import {
  executeYearRollover,
  getYearRolloverStatus,
  undoYearRollover,
} from "./year-rollover";

// 管理者(コーチ)認証 API(admin-login/plan.md、admin-line-login/plan.md)。
// 保護者 API(app.ts)とはアプリ・Cookie・role を分離する(絶対原則6)。
// 主経路は LINE ログイン、メール+パスワードは予備(admin-login/plan.md 設計判断10)

export interface AdminLineLoginDeps {
  /** LINE ログインチャネルの Channel ID / secret(LIFF のチャネルとは別) */
  channelId: string;
  channelSecret: string;
  verifyIdToken: IdTokenVerifier;
  exchangeCode: AuthorizationCodeExchanger;
  /** AUTH_FAKE=1。認可画面へ飛ばさず callback へ短絡する(admin-line-login/plan.md 設計判断5) */
  fake: boolean;
}

export interface AdminApiDeps {
  /** 当面は env の単一チーム。コーチ検索もこのチームの RLS 配下で行う */
  teamId: string;
  sessionSecret: string;
  secureCookie: boolean;
  encryptionKey: string;
  hmacKey: string;
  lineLogin: AdminLineLoginDeps;
  /** LINE グループ送信(line-send/plan.md 6c-1)。LINE_FAKE=1 ならフェイク */
  line: { client: LineMessagingClient };
  /** 予定表画像を載せる保護者アプリの URL(NEXT_PUBLIC_PORTAL_URL) */
  portalUrl: string;
  /** LINE のメッセージから開く入口。LIFF_ID があれば https://liff.line.me/<id> */
  liffUrl: string;
}

// 送信失敗の理由 → HTTP ステータス(契約は line-send/plan.md「API 契約」)。
// 未発行・送れないお知らせは操作の前提が整っていない 400、連携なし・枠不足は
// 状態の衝突なので 409、LINE 側で失敗したものは 502
const LINE_SEND_STATUS: Record<LineSendFailureReason, 400 | 404 | 409 | 502> = {
  not_published: 400,
  not_sendable: 400,
  not_found: 404,
  past_practice: 400,
  no_target: 400,
  no_group: 409,
  quota: 409,
  member_count: 502,
  push_failed: 502,
};

// LINE 連携の一意制約違反(別のコーチが同じ LINE を連携済み)だけを取り出す。
// ドライバの例外は ORM に包まれることがあるので cause を数段たどる
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
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
        columns: {
          id: true,
          passwordHash: true,
          failedLoginCount: true,
          lockedUntil: true,
        },
      }),
    );
    // コーチ不在でも必ずハッシュ照合を1回行い、応答時間で email の存在を推測させない
    // (ダミーは本物と同じ反復回数。password.ts の DUMMY_PASSWORD_HASH)
    const stored = coach?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const ok = await verifyPassword(password, stored);
    const now = new Date();

    // ロック中(login-lockout/plan.md 方針2): 照合は済ませたうえで結果によらず 401。
    // カウンタも locked_until も触らない = 攻撃者がロックを延長できない(設計判断1)
    if (coach && isLocked(coach.lockedUntil, now)) {
      return c.json({ error: LOGIN_FAILED }, 401);
    }

    if (coach && ok) {
      // 成功はカウンタとロックをリセット
      await withTeam(deps.teamId, (tx) =>
        tx
          .update(coaches)
          .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: now })
          .where(eq(coaches.id, coach.id)),
      );
    } else if (coach) {
      // 失敗は DB 側で原子的に +1 し、上限に達した時点で 15 分ロック(カウンタは 0 へ)。
      // SELECT した値を JS で +1 して書き戻すと並列リクエストで lost update が起き、
      // 並列度を上げるほどロックがかからなくなる(レビュー指摘)ため、1 文の UPDATE で行う。
      // WHERE でロック中の行を除外し、ここでもロックを延長しない(設計判断1)
      const nowIso = now.toISOString();
      await withTeam(deps.teamId, (tx) =>
        tx.execute(sql`
          update coaches set
            failed_login_count = case
              when failed_login_count + 1 >= ${MAX_FAILED_LOGINS} then 0
              else failed_login_count + 1
            end,
            locked_until = case
              when failed_login_count + 1 >= ${MAX_FAILED_LOGINS}
                then ${nowIso}::timestamptz + make_interval(secs => ${LOCKOUT_MS / 1000})
              else locked_until
            end,
            updated_at = ${nowIso}::timestamptz
          where id = ${coach.id}
            and (locked_until is null or locked_until <= ${nowIso}::timestamptz)
        `),
      );
    }

    // ロックの有無で status も文言も変えない(admin-login/plan.md 設計判断9・本 plan 設計判断2)
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

  // ---- LINE ログイン(admin-line-login/plan.md。ロジックは line-login.ts) ----

  // 認可の開始。state / nonce を署名 Cookie に置いて LINE の認可画面へ送る。
  // mode=link はログイン済みコーチが自分の行に LINE を紐づける導線(設計判断3)
  app.get("/auth/line/start", async (c) => {
    const mode: LineOAuthMode =
      c.req.query("mode") === "link" ? "link" : "login";
    let coachId: string | undefined;
    if (mode === "link") {
      const session = await readSession(c, "coach", deps);
      // 画面遷移(フルページ遷移の <a>)で呼ばれるので、生 JSON ではなくログイン画面へ返す
      if (!session) return c.redirect("/login");
      coachId = session.sub;
    }

    const oauth = createLineOAuthState(mode, coachId);
    setCookie(
      c,
      LINE_OAUTH_COOKIE_NAME,
      await createLineOAuthToken(oauth, deps.sessionSecret),
      {
        httpOnly: true,
        secure: deps.secureCookie,
        sameSite: "Lax",
        // LINE からの戻りはトップレベル GET なので Lax でも送られる(設計判断2)
        path: LINE_OAUTH_COOKIE_PATH,
        maxAge: LINE_OAUTH_TTL_SECONDS,
      },
    );

    if (deps.lineLogin.fake) {
      // 認可画面の代替 UI は作らず、そのまま callback へ短絡する(設計判断5)
      const lineUserId = parseFakeUser(c.req.query("fake_user"));
      return c.redirect(fakeCallbackPath(c.req.url, lineUserId, oauth.state));
    }
    return c.redirect(
      buildAuthorizeUrl({
        channelId: deps.lineLogin.channelId,
        redirectUri: callbackUrlFromStart(c.req.url),
        state: oauth.state,
        nonce: oauth.nonce,
      }),
    );
  });

  // 認可の戻り。state 照合 → code を id_token に交換 → 検証 → ログイン or 連携。
  // 画面遷移(302)で終わるため、失敗は例外なく ?error= を付けた画面に返す
  app.get("/auth/line/callback", async (c) => {
    const cookie = getCookie(c, LINE_OAUTH_COOKIE_NAME);
    // 使い捨て。成否にかかわらず落とす(リプレイ防止)
    deleteCookie(c, LINE_OAUTH_COOKIE_NAME, { path: LINE_OAUTH_COOKIE_PATH });
    const oauth = cookie
      ? await verifyLineOAuthToken(cookie, deps.sessionSecret)
      : null;
    const fail = (code: string) =>
      c.redirect(
        oauth?.mode === "link"
          ? `/account?error=${code}`
          : `/login?error=${code}`,
      );

    const state = c.req.query("state");
    if (!oauth || !state || state !== oauth.state) return fail("line_state");
    const error = c.req.query("error");
    if (error)
      return fail(error === "access_denied" ? "line_denied" : "line_failed");

    const code = c.req.query("code") ?? "";
    if (!code) return fail("line_failed");
    let idToken: string;
    if (deps.lineLogin.fake && code.startsWith("fake:")) {
      idToken = code;
    } else {
      const exchanged = await deps.lineLogin.exchangeCode({
        code,
        // authorize に送ったものと同一である必要があるため、callback 自身の URL から作る
        redirectUri: redirectUriFromCallback(c.req.url),
        channelId: deps.lineLogin.channelId,
        channelSecret: deps.lineLogin.channelSecret,
      });
      if (!exchanged.ok) return fail("line_failed");
      idToken = exchanged.idToken;
    }
    const verified = await deps.lineLogin.verifyIdToken(idToken, {
      nonce: oauth.nonce,
    });
    if (!verified.ok) return fail("line_failed");

    const lookup = await lineUserIdLookup(verified.lineUserId, deps.hmacKey);

    if (oauth.mode === "login") {
      const found = await withTeam(deps.teamId, (tx) =>
        tx.query.coaches.findFirst({
          where: eq(coaches.lineUserIdLookup, lookup),
          columns: { id: true },
        }),
      );
      // 招待コード等で自己申告の管理者を作らない(設計判断3)。未連携は連携導線へ案内する
      if (!found) return c.redirect("/login?error=line_unlinked");
      const token = await createSessionToken(
        {
          sub: found.id,
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
      return c.redirect("/");
    }

    // mode=link: 認可の往復中にセッションが切れていないか改めて確認する
    const session = await readSession(c, "coach", deps);
    if (!session || !oauth.coachId || session.sub !== oauth.coachId) {
      return c.redirect("/login");
    }
    // 暗号化は withTeam の外で済ませる(トランザクション内で DB 以外の処理をしない)
    const encrypted = await encryptLineUserId(
      verified.lineUserId,
      deps.encryptionKey,
    );
    try {
      const updated = await withTeam(deps.teamId, (tx) =>
        tx
          .update(coaches)
          .set({
            lineUserId: encrypted,
            lineUserIdLookup: lookup,
            updatedAt: new Date(),
          })
          .where(eq(coaches.id, session.sub))
          .returning({ id: coaches.id }),
      );
      if (updated.length === 0) return c.redirect("/login");
    } catch (e) {
      // (team_id, line_user_id_lookup) の一意制約 = 別のコーチが同じ LINE を連携済み
      if (isUniqueViolation(e)) return c.redirect("/account?error=line_taken");
      throw e;
    }
    return c.redirect("/account?linked=1");
  });

  // 連携の解除。パスワード未設定(LINE だけで入れる)コーチは締め出しになるので拒む(設計判断6)
  app.delete("/auth/line/link", coach, async (c) => {
    const session = c.get("session");
    const row = await withTeam(session.teamId, (tx) =>
      tx.query.coaches.findFirst({
        where: eq(coaches.id, session.sub),
        columns: { passwordHash: true },
      }),
    );
    if (!row) return c.json({ error: "対象が見つかりません" }, 404);
    if (!row.passwordHash) {
      return c.json(
        { error: "パスワードが未設定のため、LINE 連携は解除できません" },
        409,
      );
    }
    await withTeam(session.teamId, (tx) =>
      tx
        .update(coaches)
        .set({
          lineUserId: null,
          lineUserIdLookup: null,
          updatedAt: new Date(),
        })
        .where(eq(coaches.id, session.sub)),
    );
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

  // ---- 年度更新(year-rollover/plan.md。ロジックは year-rollover.ts) ----
  // 注: `/members/:id` のようなパラメータ付きルートを足すときは必ずこの下に置くこと
  // (Hono は登録順に照合するため、先に置くと year-rollover が :id に食われる)

  // 実行状況(最新の実行ログ+「今実行したら」の人数)
  app.get("/members/year-rollover", coach, async (c) => {
    const session = c.get("session");
    return c.json(await getYearRolloverStatus(session.teamId, new Date()));
  });

  // 破壊的操作: 確認は UI 側の二段階確認。実行ログは year_rollovers に残る(CLAUDE.md 開発ルール)
  app.post("/members/year-rollover", coach, async (c) => {
    const session = c.get("session");
    const result = await executeYearRollover(session.teamId, new Date());
    if (!result.ok) {
      return result.reason === "no_members"
        ? c.json({ error: "対象の部員がいません" }, 400)
        : c.json({ error: "取り消し猶予中の年度更新があります" }, 409);
    }
    return c.json({ rollover: result.rollover }, 201);
  });

  // 取り消し(猶予 24 時間・1回。設計判断2)。猶予切れ・取り消し済みは 409
  app.post("/members/year-rollover/undo", coach, async (c) => {
    const session = c.get("session");
    const result = await undoYearRollover(session.teamId, new Date());
    return result.ok
      ? c.json({ restored: result.restored, missing: result.missing })
      : c.json({ error: "取り消せる年度更新がありません" }, 409);
  });

  // ---- 卒団後のデータ削除(member-deletion/plan.md。ロジックは members.ts) ----
  // 注: `/members/:childId` はパラメータ付きなので、必ず上の固定パス群より後に置くこと

  // 卒団した部員(アーカイブ済み)の一覧。削除の対象になる部員だけ
  app.get("/members/archived", coach, async (c) => {
    const session = c.get("session");
    return c.json({ members: await listArchivedMembers(session.teamId) });
  });

  // 破壊的操作: 確認は UI 側の二段階確認。実行ログは audit_logs に残る(CLAUDE.md 開発ルール)。
  // 削除できるのは卒団済みだけ(設計判断1)。関連行は FK CASCADE、孤立した保護者も消える(判断2)
  app.delete("/members/:childId", coach, async (c) => {
    const session = c.get("session");
    const childId = c.req.param("childId");
    if (!isUuid(childId)) return c.json({ error: "対象が見つかりません" }, 404);
    const result = await deleteArchivedMember(
      session.teamId,
      childId,
      session.sub,
    );
    if (result.ok) return c.body(null, 204);
    return result.reason === "not_archived"
      ? c.json(
          {
            error:
              "在籍中の部員は削除できません(先に年度更新で卒団させてください)",
          },
          409,
        )
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // 破壊的操作の実行ログ(新しい順)。件数は 1〜50 に丸める
  app.get("/audit-logs", coach, async (c) => {
    const session = c.get("session");
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json({ logs: await listAuditLogs(session.teamId, limit) });
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

  // ---- チーム編成(lineups/plan.md 7b-1。ロジックは lineups-coach.ts) ----

  // 練習1コマの編成(スターター・ベンチ・選べる部員)。他チームの練習は存在を漏らさず 404
  app.get("/lineups/:practiceId", coach, async (c) => {
    const session = c.get("session");
    const practiceId = c.req.param("practiceId");
    if (!isUuid(practiceId))
      return c.json({ error: "対象が見つかりません" }, 404);
    const lineup = await getLineupForCoach(session.teamId, practiceId);
    return lineup
      ? c.json(lineup)
      : c.json({ error: "対象が見つかりません" }, 404);
  });

  // 全置換(plan.md 設計判断2)。スターターが5人未満でも保存できる(編成途中)
  app.put("/lineups/:practiceId", coach, async (c) => {
    const parsed = parseLineupInput(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const session = c.get("session");
    const practiceId = c.req.param("practiceId");
    if (!isUuid(practiceId))
      return c.json({ error: "対象が見つかりません" }, 404);
    const result = await saveLineup(session.teamId, practiceId, parsed.value);
    if (result.ok)
      return c.json({ starters: result.starters, bench: result.bench });
    return result.reason === "invalid_member"
      ? c.json({ error: "対象の部員が見つかりません" }, 400)
      : c.json({ error: "対象が見つかりません" }, 404);
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

  // ---- LINE グループ送信・通数(line-send/plan.md 6c-1。ロジックは line-send.ts) ----

  const sendDeps: LineSendDeps = {
    client: deps.line.client,
    portalUrl: deps.portalUrl,
    liffUrl: deps.liffUrl,
  };

  // 通数メーター(n/200)+ グループ連携の状態。memberCount は確認ダイアログの「n 人 × 1 通」用
  app.get("/line/usage", coach, async (c) => {
    const session = c.get("session");
    return c.json(await getLineUsage(session.teamId, deps.line.client));
  });

  // 送信ログ(新しい順)。破壊的操作の実行ログ(CLAUDE.md 開発ルール)
  app.get("/line/messages", coach, async (c) => {
    const session = c.get("session");
    const raw = Number(c.req.query("limit") ?? 10);
    const limit = Number.isFinite(raw) ? raw : 10;
    return c.json({ messages: await listLineMessages(session.teamId, limit) });
  });

  // 予定表の送信。確認は UI 側の二段階確認。発行済みの月だけ送れる(plan.md「API 契約」)。
  // 同じ月への再送は許可する(再発行後の送り直し)
  app.post("/line/send/schedule", coach, async (c) => {
    const body = await c.req.json().catch(() => null);
    const month = parseMonth(
      body && typeof body.month === "string" ? body.month : null,
    );
    if (!month)
      return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
    const session = c.get("session");
    const result = await sendScheduleToLine(session.teamId, month, sendDeps);
    return result.ok
      ? c.json({ message: result.message, usage: result.usage }, 201)
      : c.json({ error: result.error }, LINE_SEND_STATUS[result.reason]);
  });

  // お知らせの送信。公開済み かつ 通知あり のものだけ
  app.post("/line/send/announcement", coach, async (c) => {
    const body = await c.req.json().catch(() => null);
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!isUuid(id)) return c.json({ error: "対象が見つかりません" }, 404);
    const session = c.get("session");
    const result = await sendAnnouncementToLine(session.teamId, id, sendDeps);
    return result.ok
      ? c.json({ message: result.message, usage: result.usage }, 201)
      : c.json({ error: result.error }, LINE_SEND_STATUS[result.reason]);
  });

  // 出欠リマインドの手動送信(#20。attendance-reminder/plan.md「API 契約」)。
  // 未来の練習で未回答が 1 人以上のときだけ送る。定期ジョブは createJobsApi 側
  app.post("/line/send/reminder", coach, async (c) => {
    const body = await c.req.json().catch(() => null);
    const practiceId =
      body && typeof body.practiceId === "string" ? body.practiceId : "";
    if (!isUuid(practiceId))
      return c.json({ error: "対象が見つかりません" }, 404);
    const session = c.get("session");
    const result = await sendAttendanceReminderToLine(
      session.teamId,
      practiceId,
      sendDeps,
    );
    return result.ok
      ? c.json({ message: result.message, usage: result.usage }, 201)
      : c.json({ error: result.error }, LINE_SEND_STATUS[result.reason]);
  });

  return app;
}
