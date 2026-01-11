import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Skip ESLint during production builds (Vercel/CI)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds even if there are TypeScript type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
