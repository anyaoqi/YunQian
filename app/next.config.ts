import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // node:sqlite 需要在 Node runtime 下运行
  },
};

export default nextConfig;
