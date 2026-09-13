import { describe, expect, it } from "vitest";
import {
  decryptLineUserId,
  encryptLineUserId,
  lineUserIdLookup,
} from "./crypto";

const ENC_KEY = "a".repeat(64);
const HMAC_KEY = "b".repeat(64);
const USER_ID = `U${"0123456789abcdef".repeat(2)}`;

describe("encryptLineUserId / decryptLineUserId", () => {
  it("暗号化して復号すると元の userId に戻る", async () => {
    const encrypted = await encryptLineUserId(USER_ID, ENC_KEY);
    expect(await decryptLineUserId(encrypted, ENC_KEY)).toBe(USER_ID);
  });

  it("暗号文は enc:v1: 形式で、平文拒否 CHECK(^U[0-9a-f]{32}$)に一致しない", async () => {
    const encrypted = await encryptLineUserId(USER_ID, ENC_KEY);
    expect(encrypted).toMatch(/^enc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toMatch(/^U[0-9a-f]{32}$/);
  });

  it("同じ userId でも IV により毎回異なる暗号文になる", async () => {
    const a = await encryptLineUserId(USER_ID, ENC_KEY);
    const b = await encryptLineUserId(USER_ID, ENC_KEY);
    expect(a).not.toBe(b);
  });

  it("異なる鍵では復号できない", async () => {
    const encrypted = await encryptLineUserId(USER_ID, ENC_KEY);
    await expect(
      decryptLineUserId(encrypted, "c".repeat(64)),
    ).rejects.toThrow();
  });

  it("鍵が 64 桁 hex でなければ拒否する", async () => {
    await expect(encryptLineUserId(USER_ID, "short")).rejects.toThrow(
      /64 桁の hex/,
    );
  });

  it("形式不正の暗号文は拒否する", async () => {
    await expect(decryptLineUserId("garbage", ENC_KEY)).rejects.toThrow(
      /形式が不正/,
    );
  });
});

describe("lineUserIdLookup", () => {
  it("決定的で、64 桁 hex を返す", async () => {
    const a = await lineUserIdLookup(USER_ID, HMAC_KEY);
    const b = await lineUserIdLookup(USER_ID, HMAC_KEY);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("userId・鍵のどちらが違っても異なる値になる", async () => {
    const base = await lineUserIdLookup(USER_ID, HMAC_KEY);
    expect(await lineUserIdLookup(`U${"f".repeat(32)}`, HMAC_KEY)).not.toBe(
      base,
    );
    expect(await lineUserIdLookup(USER_ID, "d".repeat(64))).not.toBe(base);
  });
});
