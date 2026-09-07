import { describe, expect, it } from "vitest";
import {
  isLocked,
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  nextLockoutState,
} from "./login-lockout-shared";

// 試行回数制限の純ロジック(docs/DEVELOPMENT.md テスト戦略の Unit 対象)。
// DB を通したロック・解除は packages/api/test/admin-login-lockout.int.test.ts

const NOW = new Date("2026-09-07T12:00:00.000Z");

describe("isLocked", () => {
  it("未ロック(NULL)は false", () => {
    expect(isLocked(null, NOW)).toBe(false);
  });

  it("locked_until が未来ならロック中", () => {
    expect(isLocked(new Date(NOW.getTime() + 1000), NOW)).toBe(true);
  });

  it("ちょうど期限・経過後はロックが明けている", () => {
    expect(isLocked(NOW, NOW)).toBe(false);
    expect(isLocked(new Date(NOW.getTime() - 1), NOW)).toBe(false);
  });

  it("ISO 文字列でも Date と同じ判定になる(DB ドライバの差を吸収)", () => {
    const until = new Date(NOW.getTime() + LOCKOUT_MS);
    expect(isLocked(until.toISOString(), NOW)).toBe(true);
    expect(isLocked("2026-09-07T11:00:00.000Z", NOW)).toBe(false);
  });

  it("パース不能な値はロック扱いにしない(締め出しを作らない)", () => {
    expect(isLocked("not-a-date", NOW)).toBe(false);
  });
});

describe("nextLockoutState", () => {
  it("成功はカウンタもロックもリセットする", () => {
    expect(
      nextLockoutState({ failedLoginCount: 3, lockedUntil: null }, true, NOW),
    ).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it("期限切れのロックは成功で NULL に戻る", () => {
    expect(
      nextLockoutState(
        {
          failedLoginCount: 0,
          lockedUntil: new Date(NOW.getTime() - LOCKOUT_MS),
        },
        true,
        NOW,
      ),
    ).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it("失敗は上限手前まで +1 するだけ(ロックしない)", () => {
    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      state = nextLockoutState(state, false, NOW);
      expect(state).toEqual({ failedLoginCount: i, lockedUntil: null });
    }
  });

  it("上限に達した失敗で now+15分までロックし、カウンタは 0 に戻る(plan.md 方針3)", () => {
    const state = nextLockoutState(
      { failedLoginCount: MAX_FAILED_LOGINS - 1, lockedUntil: null },
      false,
      NOW,
    );
    expect(state.failedLoginCount).toBe(0);
    expect(state.lockedUntil?.getTime()).toBe(NOW.getTime() + LOCKOUT_MS);
    expect(LOCKOUT_MS).toBe(15 * 60 * 1000);
  });

  it("ロック中は失敗でも状態を変えない(ロックを延長させない。設計判断1)", () => {
    const lockedUntil = new Date(NOW.getTime() + LOCKOUT_MS);
    expect(
      nextLockoutState({ failedLoginCount: 0, lockedUntil }, false, NOW),
    ).toEqual({ failedLoginCount: 0, lockedUntil });
  });

  it("ロック中は成功でもリセットしない(ロック明けまで入れない)", () => {
    const lockedUntil = new Date(NOW.getTime() + LOCKOUT_MS);
    expect(
      nextLockoutState({ failedLoginCount: 0, lockedUntil }, true, NOW),
    ).toEqual({ failedLoginCount: 0, lockedUntil });
  });

  it("ロックが明けた後は 5 回からやり直せる", () => {
    const expired = new Date(NOW.getTime() - 1);
    let state: { failedLoginCount: number; lockedUntil: Date | null } = {
      failedLoginCount: 0,
      lockedUntil: expired,
    };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      state = nextLockoutState(state, false, NOW);
      expect(state.failedLoginCount).toBe(i);
      expect(isLocked(state.lockedUntil, NOW)).toBe(false);
    }
    state = nextLockoutState(state, false, NOW);
    expect(state.failedLoginCount).toBe(0);
    expect(state.lockedUntil?.getTime()).toBe(NOW.getTime() + LOCKOUT_MS);
  });

  it("入力の current を書き換えない(呼び出し側の値は保持される)", () => {
    const current = { failedLoginCount: 2, lockedUntil: null };
    nextLockoutState(current, false, NOW);
    expect(current).toEqual({ failedLoginCount: 2, lockedUntil: null });
  });
});
