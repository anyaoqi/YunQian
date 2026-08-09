#!/bin/sh
set -e

# 确保数据目录存在且可写
mkdir -p /data
touch /data/.writable-test 2>/dev/null && rm -f /data/.writable-test

# Railway 会自动注入 PORT 环境变量，HOSTNAME 必须为 0.0.0.0
export HOSTNAME=0.0.0.0

# 启动 Next.js standalone 服务
exec node server.js
