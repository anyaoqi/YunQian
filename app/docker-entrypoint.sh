#!/bin/sh
set -e

# v0.4.0 起数据库为 PostgreSQL:数据保存在托管数据库中,
# 不再依赖容器本地卷。/data 卷(如仍挂载)仅用于首次启动时
# 读取旧版 SQLite 文件做一次性数据迁移,迁移后原文件保留为备份。

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] 错误:缺少 DATABASE_URL 环境变量(PostgreSQL 连接串)。" >&2
  echo "[entrypoint] Railway:为服务添加 PostgreSQL 插件,并引用 \${{Postgres.DATABASE_URL}}。" >&2
  echo "[entrypoint] 本地开发:运行 pnpm db:start 后使用其输出的连接串。" >&2
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "[entrypoint] 错误:缺少 JWT_SECRET 环境变量(至少 32 个字符)。" >&2
  echo "[entrypoint] 生成: node -e \"console.log(require('node:crypto').randomBytes(48).toString('base64url'))\"" >&2
  exit 1
fi

if [ -f "$DB_PATH" ]; then
  echo "[entrypoint] 检测到旧版 SQLite 数据文件 $DB_PATH,将在首次启动时自动迁移到 PostgreSQL。"
fi

# Railway 会自动注入 PORT 环境变量(删除 railway.toml 硬编码 port 后,
# Railway 会自动分配代理端口并注入相同值的 PORT,保证代理与监听一致)
# Next standalone 通过 process.env.PORT / HOSTNAME 读取
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# 启动 Next.js standalone
exec node server.js
