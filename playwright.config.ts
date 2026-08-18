import { defineConfig, devices } from "@playwright/test";

// 起動済みの portal / admin に対して実行する。webServer は使わない —
// ローカル開発は Docker で統一する方針(CLAUDE.md)のため、アプリの起動は
// compose(make dev)の担当で、Playwright はそこへ繋ぐだけにする。
//
// 接続先はホストから実行する場合とコンテナ内(compose の e2e プロファイル)で異なるので
// 環境変数で差し替える。既定はホストからの実行。
export default defineConfig({
  testDir: "e2e",
  // 落ちたテストを CI 側で握りつぶさないよう、CI では .only をエラーにする
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  // 主要導線はスマホ・PC の両方で通す(docs/DEVELOPMENT.md テスト戦略)
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 15"] },
    },
  ],
});
