import { defineConfig } from "vitest/config";

// Integration テスト(pnpm test:int)。ローカル DB(supabase start / CI の postgres コンテナ)前提。
// - 実行前にマイグレーション適用が必要: pnpm db:migrate(未適用は global-setup が fail-fast)
// - 同一 DB を共有するため直列実行(fileParallelism: false)。
//   リセットは各テストの beforeEach(TRUNCATE + フィクスチャ再作成)が行う
export default defineConfig({
  test: {
    include: ["packages/db/test/**/*.int.test.ts"],
    exclude: ["**/node_modules/**"],
    globalSetup: ["./packages/db/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
