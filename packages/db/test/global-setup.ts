import { readFileSync } from "node:fs";
import postgres from "postgres";
import { assertLocalDatabaseUrl, toHostUrl } from "../src/env";
import { ensureLocalAppRole, LOCAL_APP_DATABASE_URL } from "../src/local-role";

// Integration テストの前提を整える(plan.md 設計判断11)。
// - .env をロード(既存の環境変数を上書きしない。CI は workflow の env が正)
// - 接続先がローカルであることを検証(テストがクラウドへ向く事故を防ぐ)
// - アプリ用ログインロール hoopo_app_local を冪等に用意
// - マイグレーション未適用なら明確なメッセージで fail-fast

function loadDotEnv(): void {
  try {
    const content = readFileSync(
      new URL("../../../.env", import.meta.url),
      "utf8",
    );
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (
        match?.[1] &&
        match[2] !== undefined &&
        process.env[match[1]] === undefined
      ) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // .env が無い環境(CI)では workflow の env をそのまま使う
  }
}

export default async function setup(): Promise<void> {
  loadDotEnv();

  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error(
      "DATABASE_URL が設定されていません。Integration テストはローカル DB が前提です(.env または CI の env を確認)",
    );
  }
  process.env.DATABASE_URL = toHostUrl(ownerUrl);
  assertLocalDatabaseUrl(process.env.DATABASE_URL);

  process.env.APP_DATABASE_URL = toHostUrl(
    process.env.APP_DATABASE_URL ?? LOCAL_APP_DATABASE_URL,
  );
  assertLocalDatabaseUrl(process.env.APP_DATABASE_URL);

  const owner = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const [migrated] =
      await owner`SELECT to_regclass('public.teams') IS NOT NULL AS ok`;
    if (!migrated?.ok) {
      throw new Error(
        "スキーマが未適用です。先に `pnpm db:migrate` を実行してください",
      );
    }
    await ensureLocalAppRole(owner);
  } finally {
    await owner.end();
  }
}
