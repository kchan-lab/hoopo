// 招待コードの文字種: Crockford Base32(数字 + 英大文字から I/L/O/U を除いた32文字)。
// 紙・口頭・手入力での伝達を想定し、見間違えやすい文字を含めない(plan.md 設計判断4)
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const INVITE_CODE_LENGTH = 10;

// 32^10 ≒ 1.1e15 通り。総当たりに対する推測困難性は桁数で担保する(§9)。
// 一意性は children.invite_code の UNIQUE 制約が最終防衛線(衝突時は再生成してリトライ)
// Web Crypto のみ使用(Node / ブラウザ / Workers で同じコード。CLAUDE.md 技術スタック)。
// 256 は 32 で割り切れるため byte % 32 に偏りはない
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  let code = "";
  for (const b of bytes) {
    code += ALPHABET[b % ALPHABET.length];
  }
  return code;
}

// ---- 表示・入力(child-registration/plan.md 設計判断6) ----
// 表示は 5-5 のハイフン区切り、入力は大文字化+ハイフン/空白除去で正規化する。
// 文字集合に I/L/O/U が無いため、小文字・ハイフン以外の揺れは受け付けない(不正扱い)

const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isInviteCodeFormat(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export function formatInviteCode(code: string): string {
  const half = INVITE_CODE_LENGTH / 2;
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

// ---- UNIQUE 衝突時の再生成 ----
// children.invite_code の一意制約違反(23505)だけをリトライ対象にし、
// それ以外のエラーはそのまま投げる。試行回数は 32^10 の空間では実質1回で足りるが、
// 無限ループにしないため上限を置く
export const INVITE_CODE_UNIQUE_CONSTRAINT = "children_invite_code_unique";
export const INVITE_CODE_MAX_ATTEMPTS = 5;

export function isInviteCodeCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; constraint_name?: unknown };
  return (
    e.code === "23505" && e.constraint_name === INVITE_CODE_UNIQUE_CONSTRAINT
  );
}

export async function withInviteCodeRetry<T>(
  attempt: (inviteCode: string) => Promise<T>,
  maxAttempts = INVITE_CODE_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt(generateInviteCode());
    } catch (error) {
      if (!isInviteCodeCollision(error)) throw error;
      lastError = error;
    }
  }
  throw new Error(`招待コードの生成が ${maxAttempts} 回連続で衝突しました`, {
    cause: lastError,
  });
}
