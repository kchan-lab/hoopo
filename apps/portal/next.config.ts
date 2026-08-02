import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hoopo/api", "@hoopo/db", "@hoopo/line", "@hoopo/ui"],
};

export default nextConfig;
