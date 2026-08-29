import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Railway/Docker 生产构建输出 standalone 单文件产物。
  // Windows 本地构建受符号链接权限限制(EPERM symlink)时,可改用:
  //   BUILD_STANDALONE=false pnpm exec next build && pnpm exec next start
  output: process.env.BUILD_STANDALONE === 'false' ? undefined : 'standalone',
  experimental: {
    // node:sqlite 需要在 Node runtime 下运行(仅迁移模块按需动态加载)
  },
};

export default nextConfig;
