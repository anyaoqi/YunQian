FROM node:22-slim AS base

# --- 构建阶段 ---
FROM base AS builder
WORKDIR /repo

# 国内服务器构建默认走 npmmirror（与 .npmrc 一致，避免 corepack 下载 pnpm 卡住）。
# 海外构建可覆盖：docker build --build-arg COREPACK_NPM_REGISTRY=https://registry.npmjs.org
ARG COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=$COREPACK_NPM_REGISTRY
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY .npmrc pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json

RUN pnpm install --frozen-lockfile

# 复制源码并构建 standalone 产物
COPY app/ ./app/
RUN pnpm --filter @yunqian/app run build

# --- 运行阶段 ---
FROM base AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
# 注意：不在这里硬写 PORT，让 Railway 在部署时注入的 PORT 生效
ENV DB_PATH=/data/yunqian.db

# Next.js standalone 保持完整投影结构（node_modules 与 app/server.js 相对）
COPY --from=builder /repo/app/.next/standalone/ /

WORKDIR /app

COPY --from=builder /repo/app/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /data && chmod 777 /data

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
