import { describe, expect, it } from "vitest";
import { isValidTeamId, withTeam } from "./client";

describe("withTeam の入力検証", () => {
  it("uuid 形式でない teamId は DB 接続前に拒否される", async () => {
    // APP_DATABASE_URL 未設定のテスト環境でも「uuid 検証が接続より先」なら
    // このエラーメッセージになる(接続を試みると別のエラーになる)
    await expect(withTeam("not-a-uuid", async () => 1)).rejects.toThrow(
      "teamId が uuid 形式ではありません",
    );
    await expect(
      withTeam("'; drop table children; --", async () => 1),
    ).rejects.toThrow("teamId が uuid 形式ではありません");
  });

  it("isValidTeamId は uuid のみ許可する", () => {
    expect(isValidTeamId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isValidTeamId("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
    expect(isValidTeamId("")).toBe(false);
    expect(isValidTeamId("123e4567e89b12d3a456426614174000")).toBe(false);
    expect(isValidTeamId("not-a-uuid")).toBe(false);
  });
});
