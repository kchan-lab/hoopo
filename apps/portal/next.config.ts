import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E(compose の playwright コンテナ)はサービス名 portal でアクセスするため、
  // dev サーバーのクロスオリジン遮断を許可する(本番ビルドには影響しない)
  allowedDevOrigins: ["portal"],
  transpilePackages: ["@hoopo/api", "@hoopo/db", "@hoopo/line", "@hoopo/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
