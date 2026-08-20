import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 保留 Next.js 服务端路由，由 EdgeOne Pages 运行 API。
  // output: 'export',

  // 不强制尾斜杠，避免 API 路径匹配错误。
  // trailingSlash: true,

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
