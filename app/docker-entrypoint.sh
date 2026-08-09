#!/bin/sh
set -e

# 确保数据目录存在且可写
mkdir -p /data
touch /data/.writable-test 2>/dev/null && rm -f /data/.writable-test

# Railway 会自动注入 PORT 环境变量
# Next.js standalone 优先读取命令行参数，其次读取环境变量
# 这里双保险：同时通过命令行参数传递，并在环境变量里也设好
NODE_PORT="${PORT:-3000}"
export PORT="${NODE_PORT}"
export HOSTNAME="0.0.0.0"

# 启动 Next.js standalone 服务
exec node server.js -p "${NODE_PORT}" -H 0.0.0.0
