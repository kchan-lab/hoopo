import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// db:migrate:prod の確認プロンプトを実プロセスで検証する(PR #57 レビュー指摘対応)。
// DB には接続しない: 中断側は接続前に終了し、続行側はダミー接続先への失敗で止まるため、
// 「確認を通過したかどうか」だけを出力メッセージで判定する

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
// 接続しない前提のダミー(port 1 は即 ECONNREFUSED になる)
const DUMMY_URL = "postgresql://postgres:postgres@localhost:1/postgres";

async function runProdMigrate(
  input: string | null,
): Promise<{ code: number | null; output: string }> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "migrate.ts", "prod"],
    {
      cwd: scriptDir,
      env: { ...process.env, PROD_DATABASE_URL: DUMMY_URL },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  if (input === null) {
    child.stdin.end(); // 非対話環境の再現: 入力なしで stdin を閉じる
  } else {
    child.stdin.end(input);
  }
  const [code] = (await once(child, "close")) as [number | null];
  return { code, output };
}

describe("db:migrate:prod の確認プロンプト", () => {
  it('"prod" 以外の入力では何も適用せず中断する', async () => {
    const result = await runProdMigrate("n\n");
    expect(result.code).toBe(1);
    expect(result.output).toContain("中断しました");
  }, 30_000);

  it("非対話環境(stdin が入力なしで閉じる)でも中断する", async () => {
    const result = await runProdMigrate(null);
    expect(result.code).toBe(1);
    expect(result.output).toContain("中断しました");
  }, 30_000);

  it('"prod" 入力で確認を通過し適用処理へ進む', async () => {
    const result = await runProdMigrate("prod\n");
    // 確認は通過する(その先のダミー接続先への失敗はこのテストの対象外)
    expect(result.output).toContain("マイグレーションを適用します");
    expect(result.output).not.toContain("中断しました");
  }, 30_000);
});
