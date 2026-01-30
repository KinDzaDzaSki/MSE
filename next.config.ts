import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allow production builds even if there are TypeScript type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
