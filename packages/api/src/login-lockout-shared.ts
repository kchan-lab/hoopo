// 管理者ログインの試行回数制限(login-lockout/plan.md。REQUIREMENTS §3・§7)の純ロジック。
// DB・Hono に依存しないので Unit テスト(docs/DEVELOPMENT.md テスト戦略)で状態遷移だけを固定できる。
// DB を触る手続き(coaches の SELECT / UPDATE)は admin-app.ts の POST /auth/login 側に置く。
// Redis 等のミドルウェアは足さず coaches の 2 列だけで抑止する(CLAUDE.md 絶対原則1)

/** 連続失敗の上限。これに達したらロックする(plan.md 方針3) */
export const MAX_FAILED_LOGINS = 5;

/** ロック時間(15分) */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** coaches.failed_login_count / locked_until の対になる状態 */
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

/**
 * 1回の照合結果から次の状態を決める(plan.md 方針2-4)。
 * - ロック中: 何も変えない。攻撃者がロックを永続化できないようにする(設計判断1)
 * - 成功: 0 / NULL にリセット
 * - 失敗: +1。MAX_FAILED_LOGINS に達したら `now + LOCKOUT_MS` までロックし、
 *   カウンタは 0 に戻す(ロック明けはまた 5 回から)
 */
export function nextLockoutState(
  current: LockoutState,
  ok: boolean,
  now: Date,
): LockoutState {
  if (isLocked(current.lockedUntil, now)) return { ...current };
  if (ok) return { failedLoginCount: 0, lockedUntil: null };
  const failedLoginCount = current.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_MS),
    };
  }
  // 期限切れの locked_until はそのまま持ち越す(isLocked が false なので判定に影響しない)
  return { failedLoginCount, lockedUntil: current.lockedUntil };
}
