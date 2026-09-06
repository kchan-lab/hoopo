import { toBase64Url } from "./encoding";
import { signPayload, verifySignedPayload } from "./session";

// 管理者の LINE ログイン(admin-line-login/plan.md)。
// LIFF ではなく LINE ログイン(Web)の認可コードフローを使う(設計判断1)。
// state / nonce は DB を増やさず、セッションと同じ HMAC 署名の httpOnly Cookie に載せる
// (設計判断2)。Cookie の path を /api/auth/line に絞り、他のルートには載せない

export const LINE_OAUTH_COOKIE_NAME = "hoopo_line_oauth";
export const LINE_OAUTH_COOKIE_PATH = "/api/auth/line";
/** 認可画面での操作時間を見込んだ短い寿命(秒) */
export const LINE_OAUTH_TTL_SECONDS = 600;

export const LINE_AUTHORIZE_URL =
  "https://access.line.me/oauth2/v2.1/authorize";

/** フェイク(AUTH_FAKE=1)で fake_user を省略したときの LINE userId。seed のコーチ連携用 */
export const FAKE_COACH_LINE_USER_ID = `U${"c".repeat(32)}`;

const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

/** login = 未ログインから LINE で入る / link = ログイン済みコーチが自分に LINE を紐づける */
export type LineOAuthMode = "login" | "link";

export interface LineOAuthState {
  /** CSRF 対策のランダム値。callback の query と突き合わせる */
  state: string;
  /** ID トークンのリプレイ対策。verify API に渡して照合してもらう */
  nonce: string;
  mode: LineOAuthMode;
  /** mode=link のときだけ。連携先のコーチ */
  coachId?: string;
  /** 失効日時(UNIX 秒) */
  exp: number;
}

function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function createLineOAuthState(
  mode: LineOAuthMode,
  coachId: string | undefined,
  now: Date = new Date(),
): LineOAuthState {
  return {
    state: randomToken(),
    nonce: randomToken(),
    mode,
    ...(coachId ? { coachId } : {}),
    exp: Math.floor(now.getTime() / 1000) + LINE_OAUTH_TTL_SECONDS,
  };
}

export async function createLineOAuthToken(
  payload: LineOAuthState,
  secretHex: string,
): Promise<string> {
  return signPayload(payload, secretHex);
}

// 署名不一致・期限切れ・形式不正はすべて null(= state 不一致として扱う)
export async function verifyLineOAuthToken(
  token: string,
  secretHex: string,
  options: { now?: Date } = {},
): Promise<LineOAuthState | null> {
  const now = options.now ?? new Date();
  const payload = await verifySignedPayload<LineOAuthState>(token, secretHex);
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    (payload.mode !== "login" && payload.mode !== "link") ||
    (payload.coachId !== undefined && typeof payload.coachId !== "string") ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 <= now.getTime()
  ) {
    return null;
  }
  return payload;
}

// 認可 URL(設計判断1: scope は openid のみ = 表示名・画像を受け取らない。絶対原則4)。
// bot_prompt は付けない(公式アカウント追加の導線にしない)
export function buildAuthorizeUrl(params: {
  channelId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(LINE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: params.channelId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: "openid",
    nonce: params.nonce,
  }).toString();
  return url.toString();
}

// /auth/line/start のリクエスト URL から callback の絶対 URL を作る。
// LINE Developers に登録するコールバック URL と、token 交換時の redirect_uri は同一でなければならない
export function callbackUrlFromStart(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.pathname = url.pathname.replace(/\/start$/, "/callback");
  url.search = "";
  return url.toString();
}

// callback 自身のリクエスト URL から redirect_uri(= 自分の URL からクエリを除いたもの)を作る
export function redirectUriFromCallback(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.search = "";
  return url.toString();
}

// フェイクの短絡先(設計判断5): 認可画面を模した UI は作らず、そのまま callback へ戻す。
// パスは実際のリクエストから導く(/api マウントの有無に依存しないよう相対で返す)
export function fakeCallbackPath(
  requestUrl: string,
  lineUserId: string,
  state: string,
): string {
  const url = new URL(requestUrl);
  url.pathname = url.pathname.replace(/\/start$/, "/callback");
  url.search = new URLSearchParams({
    code: `fake:${lineUserId}`,
    state,
  }).toString();
  return `${url.pathname}${url.search}`;
}

// フェイクで使う LINE userId。形式不正・未指定は既定値に落とす
export function parseFakeUser(raw: string | undefined): string {
  return raw && LINE_USER_ID_PATTERN.test(raw) ? raw : FAKE_COACH_LINE_USER_ID;
}
