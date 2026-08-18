// E2E の接続先。ホストから実行する場合は localhost、compose の e2e プロファイルから
// 実行する場合はサービス名(portal / admin)で解決されるため環境変数で差し替える。
export const urls = {
  portal: process.env.PORTAL_URL ?? "http://localhost:8000",
  admin: process.env.ADMIN_URL ?? "http://localhost:8001",
};
