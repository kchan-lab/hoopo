import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertLocalDatabaseUrl, requireEnv, toHostUrl } from "./env";

// 使い方:
//   pnpm db:migrate        … ローカル(DATABASE_URL)。ローカル以外への接続は拒否
//   pnpm db:migrate:stg    … stg(STG_DATABASE_URL)。Supavisor(6543)経由・prepare 無効
// prod への適用は初回リリース PR のタイミングで行う(plan.md 設計判断15)

const target = process.argv[2] ?? "local";

let url: string;
if (target === "local") {
  url = toHostUrl(requireEnv("DATABASE_URL"));
  assertLocalDatabaseUrl(url);
} else if (target === "stg") {
  url = requireEnv("STG_DATABASE_URL");
} else {
  throw new Error(`不明なターゲット: ${target}(local | stg)`);
}

console.log(`マイグレーションを適用します: ${new URL(url).hostname}`);

// Supavisor transaction mode は prepared statement 不可のため常に無効(plan.md 設計判断2b)
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), {
  migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
});
await client.end();

console.log("完了しました");
