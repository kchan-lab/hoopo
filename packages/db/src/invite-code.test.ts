import { describe, expect, it } from "vitest";
import { generateInviteCode, INVITE_CODE_LENGTH } from "./invite-code";

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
