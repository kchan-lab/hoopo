// 管理者パスワードのハッシュ(admin-login/plan.md 設計判断2)。
// PBKDF2-HMAC-SHA256(Web Crypto)のみ使用 — bcrypt/argon2 の依存追加を避け、
// 将来 Workers 等へ切り出しても動く(CLAUDE.md 技術スタック)。
// 保存形式 `pbkdf2:v1:<iterations>:<salt b64url>:<hash b64url>` はバージョンと
// 反復回数を自己記述し、将来のパラメータ強化・方式移行を可能にする

const PREFIX = "pbkdf2:v1";
// OWASP Password Storage Cheat Sheet の PBKDF2-HMAC-SHA256 推奨値(2023)
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

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

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    // 短すぎるパスワードの設定事故を保存側で止める(ログイン照合には影響しない)
    throw new Error("パスワードは8文字以上にしてください");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}:${ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

// 形式不正・方式不一致は false(=認証失敗)。比較は固定時間
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) return false;
  const iterations = Number.parseInt(parts[2] as string, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  try {
    const salt = fromBase64Url(parts[3] as string);
    const expected = fromBase64Url(parts[4] as string);
    const actual = await derive(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) {
      diff |= (actual[i] as number) ^ (expected[i] as number);
    }
    return diff === 0;
  } catch {
    return false;
  }
}
