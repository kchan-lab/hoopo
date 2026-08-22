import { defineConfig } from "vitest/config";

// Unit テストのみを対象にする(docs/DEVELOPMENT.md テスト戦略)。
// Integration は *.int.test.ts の命名で分離し、vitest.int.config.ts(pnpm test:int)が実行する
export default defineConfig({
  test: {
    // テストは各パッケージ隣接の *.test.ts に置く
    include: ["{apps,packages}/**/*.test.ts"],
    // e2e/ は Playwright、*.int.test.ts はローカル DB 前提の Integration。
    // どちらも Unit の vitest が拾うと二重実行・DB なし環境での失敗になる
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "e2e/**",
      "**/*.int.test.ts",
    ],
  },
});
