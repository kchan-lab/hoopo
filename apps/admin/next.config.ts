import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hoopo/api", "@hoopo/db", "@hoopo/line", "@hoopo/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
