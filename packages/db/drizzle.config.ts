import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  // Supabase 既定ロール(anon / authenticated 等)を drizzle-kit が
  // 「スキーマに無いロール」として DROP しないための必須指定(plan.md 設計判断1)
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
