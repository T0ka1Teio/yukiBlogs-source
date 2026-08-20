import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generate a self-contained Node.js server for the desktop launcher.
  output: 'standalone',

  // Remote image sources are user-configurable, so optimization stays disabled.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
