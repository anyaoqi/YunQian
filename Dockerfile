FROM node:22-slim AS base

# --- 构建阶段 ---
FROM base AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@latest --activate

# 先复制 workspace 根文件，利用 Docker 缓存
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY app/ ./app/

# 构建 standalone 产物
RUN pnpm --filter @yunqian/app run build

# --- 运行阶段 ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/yunqian.db

# 复制 standalone 产物
COPY --from=builder /repo/app/.next/standalone/app/ ./
# 复制 standalone trace 出的运行时依赖（包含 next 等，位于 standalone 根而非 app 子目录下）
COPY --from=builder /repo/app/.next/standalone/node_modules/ ./node_modules/
# 复制静态资源（CSS/JS）
COPY --from=builder /repo/app/.next/static/ ./.next/static/
# 复制 public 资源（logo 等）
COPY --from=builder /repo/app/public/ ./public/
# 复制启动脚本
COPY --from=builder /repo/app/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 创建数据目录
RUN mkdir -p /data && chmod 777 /data

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
