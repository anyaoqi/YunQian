#!/bin/sh
set -e

# 确保数据目录存在且可写
mkdir -p /data
touch /data/.writable-test 2>/dev/null && rm -f /data/.writable-test

# Railway 会自动注入 PORT 环境变量（删除 railway.toml 硬编码 port 后，
# Railway 会自动分配代理端口并注入相同值的 PORT，保证代理与监听一致）
# Next standalone 通过 process.env.PORT / HOSTNAME 读取
export PORT="${PORT:-3000}"
export HOSTNAME="0.0.0.0"

# 启动 Next.js standalone
exec node server.js
