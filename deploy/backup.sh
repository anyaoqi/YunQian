#!/usr/bin/env bash
# 备份 YunQian 数据库到 deploy/backups/，自动保留最近 7 份。
#
# 手动执行：bash backup.sh
# 自动执行：按 deploy/README.md 第 5 节配置 crontab，例如
#   20 3 * * * /opt/YunQian/deploy/backup.sh >> /opt/YunQian/deploy/backups/cron.log 2>&1
#
# 说明：
#   - 先 cd 到脚本所在目录，保证能找到 docker-compose.yml 与 .env
#   - 非 root 且不在 docker 组时自动使用 sudo
#   - 备份文件为 gzip 压缩的 SQL，命名 yunqian-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] 未找到 docker 命令，无法备份。" >&2
  exit 1
fi

# docker 守护进程可能需要 sudo（非 root 且未加入 docker 组）
SUDO=""
if ! docker info >/dev/null 2>&1; then
  if [ -n "${SUDO_USER:-}" ] || [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    fi
  fi
fi

dc() {
  if [ -n "$SUDO" ]; then
    "$SUDO" docker compose "$@"
  else
    docker compose "$@"
  fi
}

if ! dc ps --status running --services 2>/dev/null | grep -qx "db"; then
  echo "[ERROR] db 容器未在运行，跳过本次备份。请先 docker compose up -d 并确认 docker compose ps 中 db 为 running/healthy。" >&2
  exit 1
fi

mkdir -p backups
timestamp=$(date +%Y%m%d-%H%M%S)
outfile="backups/yunqian-${timestamp}.sql.gz"

dc exec -T db pg_dump -U yunqian -d yunqian | gzip > "$outfile"

# 只保留最近 7 份
ls -1t backups/yunqian-*.sql.gz | tail -n +8 | xargs -r rm -f

echo "备份完成: $outfile（当前保留最近 7 份）"
