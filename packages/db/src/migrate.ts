import { createInterface } from "node:readline/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolveMigrateTarget } from "./env";

// 使い方:
//   pnpm db:migrate        … ローカル(DATABASE_URL)。ローカル以外への接続は拒否
//   pnpm db:migrate:stg    … stg(STG_DATABASE_URL)。Supavisor(6543)経由・prepare 無効
//   pnpm db:migrate:prod   … prod(PROD_DATABASE_URL。.env.prod のみを読む)。確認プロンプトつき。
//                            リリース手順の中で人間が実行する(docs/DEVELOPMENT.md
//                            「prod マイグレーション適用」)。CI からは実行しない

const target = process.argv[2] ?? "local";
const { url, requiresConfirmation } = resolveMigrateTarget(target, process.env);
const host = new URL(url).hostname;

if (requiresConfirmation) {
  // 破壊的操作は確認を挟む(CLAUDE.md 開発ルール)。非対話環境では入力できず中断される
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `本番 ${host} へマイグレーションを適用します。続行するには "prod" と入力: `,
  );
  rl.close();
  if (answer.trim() !== "prod") {
    console.log("中断しました(何も適用されていません)");
    process.exit(1);
  }
}

console.log(`マイグレーションを適用します: ${host}`);

// Supavisor transaction mode は prepared statement 不可のため常に無効(plan.md 設計判断2b)
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), {
  migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
});
await client.end();

console.log("完了しました");
