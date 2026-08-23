import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// db:migrate:prod の確認プロンプトを実プロセスで検証する(PR #57 レビュー指摘対応)。
// DB には接続しない: 中断側は接続前に終了し、続行側は「確認を通過した」ことを示す出力を
// 検知した時点で子プロセスを打ち切る(接続失敗の仕方・速さに依存しない)

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
// 続行側でも実接続が成立しないよう、到達不能なダミーを指定する
const DUMMY_URL = "postgresql://postgres:postgres@localhost:1/postgres";

async function runProdMigrate(
  input: string | null,
  killAfterOutput?: string,
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
  let markerSeen = () => {};
  const marker = new Promise<void>((resolve) => {
    markerSeen = resolve;
  });
  const onData = (chunk: unknown): void => {
    output += String(chunk);
    if (killAfterOutput && output.includes(killAfterOutput)) {
      markerSeen();
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  if (input === null) {
    child.stdin.end(); // 非対話環境の再現: 入力なしで stdin を閉じる
  } else {
    child.stdin.end(input);
  }
  const closed = once(child, "close") as Promise<[number | null]>;
  if (killAfterOutput) {
    // マーカー検知で打ち切る: 以降の挙動(ダミー接続先へのエラーの出方)には依存しない
    await Promise.race([marker, closed]);
    child.kill("SIGKILL");
    return { code: null, output };
  }
  const [code] = await closed;
  return { code, output };
}

describe("db:migrate:prod の確認プロンプト", () => {
  it('"prod" 以外の入力では何も適用せず中断する(exit 1)', async () => {
    const result = await runProdMigrate("n\n");
    expect(result.code).toBe(1);
    expect(result.output).toContain("中断しました");
  }, 30_000);

  it("非対話環境(stdin が入力なしで閉じる)でも中断する(exit 1)", async () => {
    const result = await runProdMigrate(null);
    expect(result.code).toBe(1);
    expect(result.output).toContain("中断しました");
  }, 30_000);

  it('"prod" 入力で確認を通過し適用処理へ進む', async () => {
    const result = await runProdMigrate(
      "prod\n",
      "マイグレーションを適用します",
    );
    expect(result.output).toContain("マイグレーションを適用します");
    expect(result.output).not.toContain("中断しました");
  }, 30_000);
});
