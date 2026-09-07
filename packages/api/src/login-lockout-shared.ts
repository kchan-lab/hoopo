// 管理者ログインの試行回数制限(login-lockout/plan.md。REQUIREMENTS §3・§7)の純ロジック。
// DB・Hono に依存しないので Unit テスト(docs/DEVELOPMENT.md テスト戦略)で状態遷移だけを固定できる。
// DB を触る手続き(coaches の SELECT / UPDATE)は admin-app.ts の POST /auth/login 側に置く。
// Redis 等のミドルウェアは足さず coaches の 2 列だけで抑止する(CLAUDE.md 絶対原則1)

/** 連続失敗の上限。これに達したらロックする(plan.md 方針3) */
export const MAX_FAILED_LOGINS = 5;

/** ロック時間(15分) */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** coaches.failed_login_count / locked_until の対になる状態 */
/** coaches の失敗回数・ロック解除時刻(更新は admin-app.ts の UPDATE 1 文が正) */
export interface LockoutState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/**
 * ロック中か(`locked_until > now`)。
 * 未ロック(NULL)と期限ちょうど・経過後は false = 試行できる
 */
export function isLocked(
  lockedUntil: Date | string | null,
  now: Date,
): boolean {
  if (lockedUntil === null) return false;
  const until =
    lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  const time = until.getTime();
  // 壊れた値(パース不能)はロックとみなさない。締め出しを作らない側に倒す
  if (Number.isNaN(time)) return false;
  return time > now.getTime();
}
