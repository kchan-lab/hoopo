import { describe, expect, it } from "vitest";
import {
  formatInviteCode,
  generateInviteCode,
  INVITE_CODE_LENGTH,
  INVITE_CODE_UNIQUE_CONSTRAINT,
  isInviteCodeCollision,
  isInviteCodeFormat,
  normalizeInviteCode,
  withInviteCodeRetry,
} from "./invite-code";

describe("generateInviteCode", () => {
  it("10文字の Crockford Base32(I/L/O/U を含まない)で生成される", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    }
  });

  it("見間違えやすい文字(I/L/O/U)と小文字を含まない", () => {
    const codes = Array.from({ length: 200 }, () => generateInviteCode()).join(
      "",
    );
    expect(codes).not.toMatch(/[ILOUa-z]/);
  });

  it("十分に分散する(1000件生成して重複しない)", () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(1000);
  });
});

describe("招待コードの表示・入力フォーマット", () => {
  it("生成したコードは10桁の Crockford Base32 で、5-5 区切りで表示される", () => {
    const code = generateInviteCode();
    expect(isInviteCodeFormat(code)).toBe(true);
    expect(formatInviteCode(code)).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(normalizeInviteCode(formatInviteCode(code))).toBe(code);
  });

  it("入力は小文字・ハイフン・空白を吸収して正規化される", () => {
    expect(normalizeInviteCode(" mh7k4-2qd9x ")).toBe("MH7K42QD9X");
    expect(normalizeInviteCode("MH7K 42QD 9X")).toBe("MH7K42QD9X");
  });

  it("桁数不足や文字集合外(I/L/O/U)は不正と判定する", () => {
    expect(isInviteCodeFormat("MH7K42QD9")).toBe(false);
    expect(isInviteCodeFormat("MH7K42QD9I")).toBe(false);
    expect(isInviteCodeFormat("MH7K42QD9O")).toBe(false);
  });
});

describe("withInviteCodeRetry", () => {
  const collision = () =>
    Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: INVITE_CODE_UNIQUE_CONSTRAINT,
    });

  it("一意制約違反のときだけ別コードで再試行する", async () => {
    const seen: string[] = [];
    const result = await withInviteCodeRetry(async (code) => {
      seen.push(code);
      if (seen.length < 3) throw collision();
      return code;
    });
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(result).toBe(seen[2]);
  });

  it("上限回数まで衝突したら失敗する", async () => {
    await expect(
      withInviteCodeRetry(async () => {
        throw collision();
      }, 2),
    ).rejects.toThrow("2 回連続で衝突");
  });

  it("招待コード以外のエラーはそのまま投げる", async () => {
    const other = Object.assign(new Error("other"), {
      code: "23505",
      constraint_name: "children_pkey",
    });
    expect(isInviteCodeCollision(other)).toBe(false);
    await expect(
      withInviteCodeRetry(async () => {
        throw other;
      }),
    ).rejects.toBe(other);
  });
});
