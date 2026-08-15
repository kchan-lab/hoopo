import { defineConfig } from "vitest/config";

// Unit テストのみを対象にする(docs/DEVELOPMENT.md テスト戦略)。
// Integration(ローカル Supabase)は Issue #6 でスキーマと同時に追加する。
export default defineConfig({
  test: {
    // テストは各パッケージ隣接の *.test.ts に置く
    include: ["{apps,packages}/**/*.test.ts"],
    // e2e/ は Playwright の担当。Vitest が拾うと二重実行になる
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
  },
});
