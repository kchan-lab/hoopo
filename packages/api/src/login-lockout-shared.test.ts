import { describe, expect, it } from "vitest";
import { isLocked, LOCKOUT_MS } from "./login-lockout-shared";

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
