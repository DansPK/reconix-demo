import type { NextConfig } from "next";
// Lab target: ignore type/lint errors so the demo always boots.
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
