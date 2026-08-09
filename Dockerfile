FROM node:22-slim AS base

# --- 构建阶段 ---
FROM base AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@latest --activate

# 先复制 workspace 根文件，利用 Docker 缓存（.npmrc 含国内镜像，加速构建）
COPY .npmrc pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY app/package.json ./app/package.json

RUN pnpm install --frozen-lockfile

# 复制源码并构建 standalone 产物
# app 下的 build 脚本会在 next build 后，把 .next/static 与 public 同步到 standalone/app/ 内部
COPY app/ ./app/
RUN pnpm --filter @yunqian/app run build

# --- 运行阶段 ---
FROM base AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/yunqian.db

# Next.js standalone 在 pnpm workspace 下的投影结构：
#   standalone/
#     node_modules/next ...     （require('next') 从这里解析）
#     app/server.js             （工作区 app 包的启动入口）
#     app/.next/static/         （由 app/package.json 的 build 脚本提前 cp 进来）
#     app/public/               （同上）
# 因此把 standalone 整棵树投影到容器根，保持相对结构不变即可
COPY --from=builder /repo/app/.next/standalone/ /

WORKDIR /app

COPY --from=builder /repo/app/docker-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /data && chmod 777 /data

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
