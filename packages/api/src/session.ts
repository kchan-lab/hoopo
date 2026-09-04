import { fromBase64Url, toBase64Url } from "./encoding";
// セッション(REQUIREMENTS.md §3、liff-login/plan.md 設計判断2、admin-login/plan.md 設計判断5)。
// ステートレスな HMAC-SHA256 署名トークンを httpOnly Cookie に載せる。
// 保護者(guardian)と管理者(coach)で Cookie 名・有効期限を分離し、
// ペイロードの role で相互流用を拒否する(絶対原則6: 保護者UIと管理UIは別世界)。
// アクセストークン・ID トークンはここに含めない(絶対原則4: 永続化しない)

export const SESSION_COOKIE_NAME = "hoopo_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 保護者: 30日
export const ADMIN_SESSION_COOKIE_NAME = "hoopo_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 管理者: 7日(共有PCを想定して短め)

const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const ROLES = ["guardian", "coach"] as const;

export type SessionRole = (typeof ROLES)[number];

export interface SessionPayload {
  /** guardian.id または coach.id */
  sub: string;
  role: SessionRole;
  teamId: string;
  /** 失効日時(UNIX 秒) */
  exp: number;
}

async function importHmacKey(secretHex: string): Promise<CryptoKey> {
  if (!KEY_HEX_PATTERN.test(secretHex)) {
    throw new Error(
      "SESSION_SECRET は 64 桁の hex(32 バイト)で指定してください",
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(secretHex.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  payload: SessionPayload,
  secretHex: string,
): Promise<string> {
  const key = await importHmacKey(secretHex);
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `v1.${body}.${toBase64Url(new Uint8Array(sig))}`;
}

// 署名不一致・期限切れ・形式不正・role 不一致はすべて null(=未ログイン扱い)。
// expectedRole を渡すと、別世界のセッション(保護者⇔管理者)を確実に拒否する
export async function verifySessionToken(
  token: string,
  secretHex: string,
  options: { expectedRole?: SessionRole; now?: Date } = {},
): Promise<SessionPayload | null> {
  const now = options.now ?? new Date();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, body, sig] = parts as [string, string, string];
  try {
    const key = await importHmacKey(secretHex);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    ) as SessionPayload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.teamId !== "string" ||
      !ROLES.includes(payload.role) ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 <= now.getTime()
    ) {
      return null;
    }
    if (options.expectedRole && payload.role !== options.expectedRole) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
