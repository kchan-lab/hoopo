import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

// PBKDF2 60万回は1回あたり百ms級のため、ケースは絞って往復を検証する

describe("hashPassword / verifyPassword", () => {
  it("ハッシュ化して正しいパスワードで照合できる(誤りは拒否)", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).toMatch(/^pbkdf2:v1:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("同じパスワードでもソルトにより毎回異なるハッシュになる", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("保存形式が自己記述のため、反復回数の異なる過去のハッシュも照合できる", async () => {
    // 反復回数 1000 で作った旧形式相当のハッシュを手元生成せず、format の反復数を信じる実装を検証
    const legacy = await (async () => {
      const salt = new Uint8Array(16).fill(7);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("legacy-pass"),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: 1000 },
        key,
        256,
      );
      const b64 = (u: Uint8Array) =>
        btoa(String.fromCharCode(...u))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replace(/=+$/, "");
      return `pbkdf2:v1:1000:${b64(salt)}:${b64(new Uint8Array(bits))}`;
    })();
    expect(await verifyPassword("legacy-pass", legacy)).toBe(true);
    expect(await verifyPassword("other", legacy)).toBe(false);
  });

  it("形式不正・方式不一致は false(例外にしない)", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:whatever")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2:v1:abc:AAAA:AAAA")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2:v1:1:!!:!!")).toBe(false);
  });

  it("8文字未満のパスワードは保存側で拒否する", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/8文字以上/);
  });
});
