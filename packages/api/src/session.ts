// 保護者セッション(REQUIREMENTS.md §3、plan.md 設計判断2)。
// ステートレスな HMAC-SHA256 署名トークンを httpOnly Cookie に載せる。
// DB セッションにしないのは失効管理が現段階で不要なため(無効化要件が出たら移行)。
// アクセストークン・ID トークンはここに含めない(絶対原則4: 永続化しない)

export const SESSION_COOKIE_NAME = "hoopo_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日

const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export interface SessionPayload {
  guardianId: string;
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

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
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

// 署名不一致・期限切れ・形式不正はすべて null(=未ログイン扱い)。呼び出し側で 401 にする
export async function verifySessionToken(
  token: string,
  secretHex: string,
  now: Date = new Date(),
): Promise<SessionPayload | null> {
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
      typeof payload.guardianId !== "string" ||
      typeof payload.teamId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 <= now.getTime()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
