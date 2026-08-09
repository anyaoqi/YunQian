#!/bin/sh
set -e

# 确保数据目录存在且可写
mkdir -p /data
touch /data/.writable-test 2>/dev/null && rm -f /data/.writable-test

# 启动 Next.js standalone 服务
# Railway 会自动注入 PORT 环境变量，不能固定死
exec node server.js
