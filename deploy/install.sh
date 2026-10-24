#!/usr/bin/env bash
# =============================================================================
# 云签 YunQian —— 腾讯云轻量应用服务器一键部署脚本
#
# 目标环境：
#   腾讯云轻量应用服务器 + Docker CE 应用镜像（Ubuntu 22.04，自带 docker / compose）
#   最坏规格按 2 核 2G 设计（自动加 2G swap 防止 next build 被 OOM Kill）
#   无域名，通过 http://<公网IP> 访问（80 端口，Caddy 反代 app:3000）
#
# 用法（在服务器上，仓库根目录）：
#   bash deploy/install.sh
#
# 特性：
#   1. 幂等：可重复执行。已有 .env 绝不覆盖；已有 swap 跳过；daemon.json 合并写入
#   2. 自动适配 root / 非 root（非 root 自动加 sudo）
#   3. 自动配置腾讯云内网镜像加速 + 容器日志轮转
#   4. 自动检测内存并创建 swap
#   5. 自动生成 URL-safe 密码与 JWT 密钥，并打印管理员初始密码
#   6. 端口占用预检、构建、启动、健康检查全流程，失败时打印可读原因
#
# 不会做的事（安全边界）：不重装 docker、不删除数据卷、不改数据库内已有密码、
# 不修改 app/ 下任何业务代码。
# =============================================================================
set -euo pipefail

# ----------------------------- 常量 ----------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"

TENCENT_MIRROR="https://mirror.ccs.tencentyun.com"
FALLBACK_MIRROR="https://docker.1ms.run"

SWAP_FILE="/swapfile"
SWAP_SIZE_MB=2048
# 3.5G = 3670016 KB：低于此值视为小内存机型，需要 swap
LOW_MEM_KB=3670016
# 建议的最小可用磁盘（4G）
MIN_DISK_KB=4194304

HEALTH_URL="http://127.0.0.1/api/health"
HEALTH_TIMEOUT=180
HEALTH_INTERVAL=5

# ----------------------------- 输出风格 ------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
  C_BOLD=$'\033[1m'
else
  C_RESET=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
  C_CYAN=""
  C_BOLD=""
fi

info()  { printf '%s[INFO]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s[WARN]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
error() { printf '%s[ERROR]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
step()  { printf '\n%s%s==> %s%s\n' "$C_CYAN" "$C_BOLD" "$*" "$C_RESET"; }

# 脚本退出时若构建日志临时文件还在则清理
TMP_FILES=()
cleanup() {
  local f
  for f in "${TMP_FILES[@]:-}"; do
    [ -n "$f" ] && rm -f "$f" 2>/dev/null || true
  done
}
trap cleanup EXIT

# ===========================================================================
# 0. 基本环境
# ===========================================================================
step "0/9 检查运行环境"

if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
  error "需要 bash 4.0 及以上版本（当前 ${BASH_VERSION:-unknown}）。"
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  error "未找到 $COMPOSE_FILE"
  error "请确认脚本位于仓库的 deploy/ 目录下，并在仓库根目录执行：bash deploy/install.sh"
  exit 1
fi

if [ ! -f "${SCRIPT_DIR}/Caddyfile" ]; then
  error "未找到 ${SCRIPT_DIR}/Caddyfile（Caddy 反代配置）"
  exit 1
fi

# 以脚本所在目录为工作目录：docker compose 会自动读取同目录的 .env 与 docker-compose.yml
cd "$SCRIPT_DIR"
info "工作目录：$SCRIPT_DIR"

# root / 非 root 自适应
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  info "当前为 root 用户"
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    info "当前非 root 用户（$(id -un)），特权操作将自动使用 sudo"
  else
    error "当前既不是 root 也没有 sudo，无法执行安装。请用 root 登录后重试。"
    exit 1
  fi
fi

as_root() {
  if [ -n "$SUDO" ]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

# ===========================================================================
# 1. Docker 与 compose 插件检测
# ===========================================================================
step "1/9 检测 Docker"

if ! command -v docker >/dev/null 2>&1; then
  error "未检测到 docker 命令。"
  error "本脚本面向腾讯云轻量应用服务器的「Docker CE」应用镜像（应自带 docker 与 compose 插件）。"
  error "请在控制台确认镜像类型：轻量应用服务器 → 实例详情 → 镜像信息，应为 Docker CE / 含 Docker 的应用镜像。"
  error "若你用的是纯 Ubuntu 22.04 系统镜像，请先按 docs/09-deploy-tencent-lightweight.md 第 2.2 节安装 docker，再运行本脚本。"
  error "为避免破坏现有环境，本脚本不会自动安装 docker。"
  exit 1
fi

DOCKER_NEEDS_SUDO=0
if docker info >/dev/null 2>&1; then
  DOCKER_NEEDS_SUDO=0
elif [ -n "$SUDO" ] && "$SUDO" docker info >/dev/null 2>&1; then
  DOCKER_NEEDS_SUDO=1
else
  error "docker 命令存在，但守护进程不可用（docker info 执行失败）。"
  error "请手动排查后重试：systemctl status docker  /  journalctl -u docker --no-pager -n 50"
  exit 1
fi

# 统一入口：dk = docker，dc = docker compose
dk() {
  if [ "$DOCKER_NEEDS_SUDO" -eq 1 ]; then
    "$SUDO" docker "$@"
  else
    docker "$@"
  fi
}
dc() { dk compose "$@"; }

info "docker 版本：$(dk version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"

if ! dc version >/dev/null 2>&1; then
  warn "未检测到 docker compose 插件，尝试通过 apt 安装 docker-compose-plugin ..."
  if ! command -v apt-get >/dev/null 2>&1; then
    error "当前系统没有 apt-get，无法自动安装 compose 插件。请手动安装 docker-compose-plugin 后重试。"
    exit 1
  fi
  compose_installed=0
  if as_root apt-get install -y docker-compose-plugin >/dev/null 2>&1; then
    compose_installed=1
  else
    as_root apt-get update -qq >/dev/null 2>&1 || true
    if as_root apt-get install -y docker-compose-plugin >/dev/null 2>&1; then
      compose_installed=1
    elif as_root apt-get install -y docker-compose-v2 >/dev/null 2>&1; then
      compose_installed=1
    fi
  fi
  if [ "$compose_installed" -ne 1 ] || ! dc version >/dev/null 2>&1; then
    error "安装 docker compose 插件失败。"
    error "请手动执行：apt-get update && apt-get install -y docker-compose-plugin"
    error "若 apt 源不可用，可改用：systemctl status docker 确认 docker 正常后，卸载当前镜像重装 Docker CE 应用镜像。"
    exit 1
  fi
  info "docker compose 插件安装完成"
fi
info "compose 版本：$(dc version --short 2>/dev/null || dc version 2>/dev/null | head -n1)"

# ===========================================================================
# 2. 镜像加速 + 日志轮转（合并写入 daemon.json）
# ===========================================================================
step "2/9 配置镜像加速与容器日志轮转"

DAEMON_JSON="/etc/docker/daemon.json"

merge_daemon_json() {
  local src="$1"
  local dst="$2"
  python3 - "$src" "$dst" "$TENCENT_MIRROR" "$FALLBACK_MIRROR" <<'PY'
import json
import sys

src, dst, mirror_a, mirror_b = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

raw = ""
try:
    with open(src, "r", encoding="utf-8") as fh:
        raw = fh.read()
except FileNotFoundError:
    raw = ""

cfg = {}
if raw.strip():
    try:
        cfg = json.loads(raw)
        if not isinstance(cfg, dict):
            raise ValueError("daemon.json 顶层必须是 JSON 对象")
    except Exception:
        # 原文件不是合法 JSON：备份后重建，避免直接覆盖用户配置
        try:
            with open(src + ".bak", "w", encoding="utf-8") as fh:
                fh.write(raw)
        except OSError:
            pass
        sys.stderr.write("[WARN] 原 daemon.json 不是合法 JSON，已备份为 daemon.json.bak 并重建\n")
        cfg = {}

# registry-mirrors：保留用户已有条目，追加腾讯云内网源与备用源，腾讯云置顶
mirrors = []
for item in cfg.get("registry-mirrors") or []:
    if isinstance(item, str) and item not in mirrors:
        mirrors.append(item)
for item in (mirror_a, mirror_b):
    if item not in mirrors:
        mirrors.append(item)
if mirror_a in mirrors:
    mirrors.remove(mirror_a)
    mirrors.insert(0, mirror_a)
cfg["registry-mirrors"] = mirrors

# 日志轮转：只在缺失时补默认值，不覆盖用户已有设置
cfg.setdefault("log-driver", "json-file")
opts = cfg.get("log-opts")
if not isinstance(opts, dict):
    opts = {}
opts.setdefault("max-size", "10m")
opts.setdefault("max-file", "3")
cfg["log-opts"] = opts

with open(dst, "w", encoding="utf-8") as fh:
    json.dump(cfg, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
}

configure_daemon_json() {
  local tmp_old tmp_new
  tmp_old="$(mktemp)"
  tmp_new="$(mktemp)"
  TMP_FILES+=("$tmp_old" "$tmp_new")

  if as_root test -f "$DAEMON_JSON"; then
    as_root cat "$DAEMON_JSON" > "$tmp_old" 2>/dev/null || : > "$tmp_old"
  else
    : > "$tmp_old"
  fi

  if command -v python3 >/dev/null 2>&1; then
    if ! merge_daemon_json "$tmp_old" "$tmp_new"; then
      warn "合并 daemon.json 失败（python3 执行异常），跳过镜像加速配置。"
      warn "请手动编辑 $DAEMON_JSON 添加 registry-mirrors 后执行：systemctl restart docker"
      return 0
    fi
  elif command -v jq >/dev/null 2>&1; then
    # 兜底：无 python3 时用 jq 合并（用户已有配置不覆盖，只补缺失项）
    if jq -e . "$tmp_old" >/dev/null 2>&1; then
      jq --arg a "$TENCENT_MIRROR" --arg b "$FALLBACK_MIRROR" '
        . as $c
        | ($c["registry-mirrors"] // []) as $old
        | ($c["log-opts"] // {}) as $lo
        | {
            "registry-mirrors": (([$a] + $old + [$b])
              | reduce .[] as $m ([]; if index($m) then . else . + [$m] end)),
            "log-driver": ($c["log-driver"] // "json-file"),
            "log-opts": ($lo + {
              "max-size": ($lo["max-size"] // "10m"),
              "max-file": ($lo["max-file"] // "3")
            })
          }
      ' "$tmp_old" > "$tmp_new"
    else
      jq -n --arg a "$TENCENT_MIRROR" --arg b "$FALLBACK_MIRROR" '{
        "registry-mirrors": [$a, $b],
        "log-driver": "json-file",
        "log-opts": {"max-size": "10m", "max-file": "3"}
      }' > "$tmp_new"
    fi
  else
    warn "未找到 python3 / jq，无法安全合并 $DAEMON_JSON。"
    warn "请手动编辑该文件，加入：{\"registry-mirrors\": [\"$TENCENT_MIRROR\", \"$FALLBACK_MIRROR\"]}"
    return 0
  fi

  # 内容无变化则跳过重启 docker（避免无谓地中断正在运行的容器）
  if as_root test -f "$DAEMON_JSON" && as_root cmp -s "$tmp_old" "$tmp_new"; then
    info "$DAEMON_JSON 已包含所需配置，跳过写入与 docker 重启"
    return 0
  fi

  as_root mkdir -p /etc/docker
  as_root install -m 0644 "$tmp_new" "$DAEMON_JSON"
  info "已写入 $DAEMON_JSON："
  (as_root cat "$DAEMON_JSON" 2>/dev/null || true) | sed 's/^/    /' || true

  info "重启 docker 使配置生效 ..."
  if ! as_root systemctl restart docker; then
    warn "systemctl restart docker 失败，尝试 service 命令 ..."
    as_root service docker restart || {
      error "重启 docker 失败，请手动执行 systemctl restart docker 排查。"
      exit 1
    }
  fi

  local i
  for i in $(seq 1 60); do
    if dk info >/dev/null 2>&1; then
      info "docker 已就绪"
      return 0
    fi
    sleep 1
  done
  error "docker 重启后 60 秒内未就绪，请手动排查：systemctl status docker"
  error "若 daemon.json 写错，可删除该文件后重试：rm -f $DAEMON_JSON && systemctl restart docker"
  exit 1
}

configure_daemon_json

# ===========================================================================
# 3. swap 自适应（2G 机型跑 next build 的关键）
# ===========================================================================
step "3/9 检查内存与 swap"

ensure_fstab_swap() {
  if as_root grep -qE "^[[:space:]]*${SWAP_FILE}[[:space:]]" /etc/fstab 2>/dev/null; then
    info "/etc/fstab 已包含 $SWAP_FILE 条目，无需重复写入"
  else
    printf '%s none swap sw 0 0\n' "$SWAP_FILE" | as_root tee -a /etc/fstab >/dev/null
    info "已把 $SWAP_FILE 写入 /etc/fstab（重启后自动挂载）"
  fi
}

setup_swap() {
  local mem_kb swap_kb mem_h swap_h
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  swap_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
  mem_h="$(awk -v kb="$mem_kb" 'BEGIN {printf "%.1fG", kb/1048576}')"
  swap_h="$(awk -v kb="$swap_kb" 'BEGIN {printf "%.1fG", kb/1048576}')"
  info "内存总量：${mem_h}，当前 swap：${swap_h}"

  if [ "$mem_kb" -ge "$LOW_MEM_KB" ]; then
    info "内存 ≥ 3.5G，无需 swap，跳过"
    return 0
  fi

  if [ "$swap_kb" -gt 0 ]; then
    info "已存在可用 swap，跳过创建"
    ensure_fstab_swap
    return 0
  fi

  if as_root test -f "$SWAP_FILE"; then
    warn "$SWAP_FILE 已存在但未启用，尝试直接启用"
    as_root chmod 600 "$SWAP_FILE"
    if ! as_root swapon "$SWAP_FILE"; then
      warn "启用 $SWAP_FILE 失败，跳过 swap 配置（构建可能因内存不足失败，可稍后手动处理）"
      return 0
    fi
  else
    info "内存偏小（${mem_h} < 3.5G）且无 swap，创建 ${SWAP_SIZE_MB}MB swap 文件 ..."
    if ! as_root fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null; then
      warn "fallocate 不可用（文件系统不支持），改用 dd 写入，较慢请耐心等待 ..."
      if ! as_root dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=progress; then
        warn "创建 $SWAP_FILE 失败，跳过 swap 配置"
        as_root rm -f "$SWAP_FILE" 2>/dev/null || true
        return 0
      fi
    fi
    as_root chmod 600 "$SWAP_FILE"
    if ! as_root mkswap "$SWAP_FILE" >/dev/null; then
      warn "mkswap 失败，跳过 swap 配置"
      return 0
    fi
    if ! as_root swapon "$SWAP_FILE"; then
      warn "swapon 失败，跳过 swap 配置"
      return 0
    fi
  fi

  ensure_fstab_swap
  info "swap 配置完成，当前内存状态："
  free -h | sed 's/^/    /'
}

setup_swap

# 磁盘空间预检
avail_kb="$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$avail_kb" ] && [ "$avail_kb" -lt "$MIN_DISK_KB" ]; then
  warn "可用磁盘不足 4G（当前 $(awk -v kb="$avail_kb" 'BEGIN {printf "%.1fG", kb/1048576}')）。"
  warn "镜像 + 构建缓存约需 3~5G，空间不足会导致构建失败。可先清理：docker system prune -af"
else
  info "可用磁盘：$(awk -v kb="$avail_kb" 'BEGIN {printf "%.1fG", kb/1048576}')"
fi

# ===========================================================================
# 4. 生成 .env（幂等：已存在则绝不覆盖）
# ===========================================================================
step "4/9 准备环境变量文件"

# 生成 URL-safe 随机串：只含 [A-Za-z0-9]，避免破坏 DATABASE_URL 的解析
rand_alnum() {
  local n="${1:-20}"
  head -c 4096 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-"$n"
}

gen_jwt_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | LC_ALL=C tr '+/' '-_' | tr -d '=\n'
  elif command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
  else
    # 兜底：sha256sum（64 位十六进制，仍满足 ≥32 字符）
    printf '%s-%s-%s' "$(date +%s%N)" "$(rand_alnum 32)" "$$" | sha256sum | cut -d' ' -f1
  fi
}

# 校验已有 .env 的密码是否 URL-safe（用户可能手工改过）
validate_env_password() {
  local pw
  pw="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [ -z "$pw" ]; then
    warn ".env 中未找到 POSTGRES_PASSWORD，应用将无法启动。请补上后重试。"
    return 0
  fi
  case "$pw" in
    *[!A-Za-z0-9]*)
      warn "现有 .env 的 POSTGRES_PASSWORD 含非字母数字字符，可能破坏 DATABASE_URL 解析（应用连不上库）。"
      warn "建议改成 20 位字母数字随机串；若数据库卷已用旧密码初始化，改密码需同时删除卷（会清空数据）。"
      ;;
    *)
      info "POSTGRES_PASSWORD 为 URL-safe 字符，校验通过"
      ;;
  esac
}

ENV_GENERATED=0
ADMIN_PASSWORD_SHOWN=""

if [ -f "$ENV_FILE" ]; then
  info "检测到已有 $ENV_FILE，跳过生成（不会覆盖你的现有配置）"
  validate_env_password
  existing_admin_pw="$(grep -E '^INITIAL_ADMIN_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  if [ -n "$existing_admin_pw" ]; then
    ADMIN_PASSWORD_SHOWN="$existing_admin_pw"
  fi
  if ! grep -qE '^JWT_SECRET=.+' "$ENV_FILE" 2>/dev/null; then
    warn ".env 中 JWT_SECRET 为空，应用启动会 fail-fast 退出。请填入：openssl rand -base64 48"
  fi
else
  if [ -f "$ENV_EXAMPLE" ]; then
    info "未找到 $ENV_FILE，基于 .env.example 生成新配置"
  else
    info "未找到 $ENV_FILE 与 .env.example，直接生成新配置"
  fi

  PG_PASSWORD="$(rand_alnum 20)"
  JWT_SECRET_VALUE="$(gen_jwt_secret)"
  ADMIN_PASSWORD_VALUE="$(rand_alnum 14)"

  if [ "${#PG_PASSWORD}" -lt 20 ] || [ "${#JWT_SECRET_VALUE}" -lt 32 ] || [ "${#ADMIN_PASSWORD_VALUE}" -lt 14 ]; then
    error "随机值生成长度异常（PG=${#PG_PASSWORD} JWT=${#JWT_SECRET_VALUE} ADMIN=${#ADMIN_PASSWORD_VALUE}），请检查 /dev/urandom 与 openssl。"
    exit 1
  fi

  umask 077
  cat > "$ENV_FILE" <<EOF
# 由 deploy/install.sh 于 $(date '+%Y-%m-%d %H:%M:%S') 自动生成
# 该文件含明文密码，权限 600，且已被 deploy/.gitignore 忽略，切勿提交到 git。
# 变量集合与 deploy/.env.example 保持一致。

# ---------- 数据库（PostgreSQL 18，容器内部网络，不对外暴露） ----------
# 仅含字母数字，保证 postgres://yunqian:<pw>@db:5432/yunqian 可被正确解析
POSTGRES_PASSWORD=${PG_PASSWORD}

# ---------- 应用密钥 ----------
# JWT 签名密钥（≥32 字符），泄露等同于账号被接管，勿外传
JWT_SECRET=${JWT_SECRET_VALUE}

# ---------- 管理员 ----------
# admin 账号初始密码，仅在数据库首次初始化时生效；首次登录后请立即修改
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}

# ---------- 注册开关 ----------
# 个人自用保持 false，阻止陌生人注册
ALLOW_REGISTRATION=false
EOF
  chmod 600 "$ENV_FILE" 2>/dev/null || as_root chmod 600 "$ENV_FILE"
  ENV_GENERATED=1
  ADMIN_PASSWORD_SHOWN="$ADMIN_PASSWORD_VALUE"
  info "已生成 $ENV_FILE（权限 600）"
fi

if [ -f "$ENV_FILE" ]; then
  perms="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
  if [ "$perms" != "600" ]; then
    warn ".env 权限为 $perms，正在修正为 600（该文件含明文密码）"
    chmod 600 "$ENV_FILE" 2>/dev/null || as_root chmod 600 "$ENV_FILE" || true
  fi
fi

# ===========================================================================
# 5. 端口预检
# ===========================================================================
step "5/9 预检 80 端口占用情况"

port_80_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn 'sport = :80' 2>/dev/null | grep -q . && return 0
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]80$' && return 0
    return 1
  fi
  # 兜底：直接尝试 docker 端口映射查询
  [ -n "$(dk ps --filter 'publish=80' --format '{{.Names}}' 2>/dev/null)" ] && return 0
  return 1
}

if port_80_listening; then
  port_owner="$(dk ps --filter 'publish=80' --format '{{.Names}}' 2>/dev/null | tr '\n' ' ' || true)"
  if printf '%s' "$port_owner" | grep -q 'yunqian-caddy'; then
    info "80 端口由本项目 Caddy 容器占用（yunqian-caddy），属正常情况，继续"
  else
    warn "80 端口已被其它进程占用，Caddy 将无法启动（会报 bind: address already in use）。"
    if [ -n "$port_owner" ]; then
      warn "占用端口的容器：$port_owner"
    fi
    if command -v ss >/dev/null 2>&1; then
      warn "占用详情（ss -lntp）："
      as_root ss -lntp 2>/dev/null | grep -E ':80\s' | sed 's/^/    /' || true
    fi
    warn "处理建议："
    warn "  1) 若是旧的 Nginx/Apache：systemctl stop nginx（或 apache2）并 systemctl disable 之"
    warn "  2) 若是其它容器：docker ps 找到后 docker stop <容器名>，或改用其占用端口"
    warn "  3) 若是上次部署残留的 yunqian-caddy：docker rm -f yunqian-caddy 后重跑本脚本"
    if [ -t 0 ]; then
      printf '%s[WARN]%s 是否仍要继续部署（80 端口不通则只能通过容器内网访问）？[y/N] ' "$C_YELLOW" "$C_RESET"
      read -r answer
      case "$answer" in
        y|Y|yes|YES) warn "已选择继续，后续健康检查可能失败" ;;
        *) error "已中止部署，请先释放 80 端口后重试。"; exit 1 ;;
      esac
    else
      error "非交互模式下不自动继续，请先释放 80 端口后重试。"
      exit 1
    fi
  fi
else
  info "80 端口空闲，可用于 Caddy"
fi

# 443 仅作提示：当前无域名、未启用 HTTPS，占用也不影响本次部署
if command -v ss >/dev/null 2>&1; then
  if ss -H -ltn 'sport = :443' 2>/dev/null | grep -q .; then
    port_443_owner="$(dk ps --filter 'publish=443' --format '{{.Names}}' 2>/dev/null | tr '\n' ' ' || true)"
    if ! printf '%s' "$port_443_owner" | grep -q 'yunqian-caddy'; then
      warn "443 端口已被其它进程占用（当前未启用 HTTPS，不影响本次部署；将来上域名时需要释放）"
      if [ -n "$port_443_owner" ]; then
        warn "占用端口的容器：$port_443_owner"
      fi
    fi
  fi
fi

# ===========================================================================
# 6. 构建镜像
# ===========================================================================
step "6/9 构建应用镜像（首次约 5–10 分钟，2 核 2G 机型会更久，请耐心等待）"
info "构建内容包括：拉取 node:22-slim / postgres:18-alpine / caddy:2-alpine + pnpm install + next build"
info "期间内存占用较高，已通过 swap 兜底，请勿中断脚本。开始时间：$(date '+%H:%M:%S')"

BUILD_LOG="$(mktemp)"
TMP_FILES+=("$BUILD_LOG")

if dc build 2>&1 | tee "$BUILD_LOG"; then
  info "镜像构建完成，耗时至 $(date '+%H:%M:%S')"
else
  error "镜像构建失败。以下为最后 40 行日志："
  tail -n 40 "$BUILD_LOG" >&2 || true
  echo "" >&2
  error "常见原因与处理："
  error "  · exit 137 / Killed：内存不足 —— 确认 swap 已启用（free -h），或升级到 2 核 4G"
  error "  · 拉取基础镜像超时：镜像加速未生效 —— 检查 /etc/docker/daemon.json 后 systemctl restart docker"
  error "  · pnpm install 失败：网络问题 —— 重跑本脚本即可（已下载的层会复用）"
  error "  · COPY 路径报错：源码不完整 —— 确认上传的是整个仓库根目录（含 app/、pnpm-lock.yaml、.npmrc）"
  exit 1
fi

# ===========================================================================
# 7. 启动容器
# ===========================================================================
step "7/9 启动容器（db → app → caddy）"

if ! dc up -d --remove-orphans; then
  error "docker compose up 失败。"
  dc ps >&2 || true
  dc logs --tail=40 app >&2 || true
  exit 1
fi

info "容器已启动，当前状态："
dc ps | sed 's/^/    /'

# ===========================================================================
# 8. 等待健康检查通过
# ===========================================================================
step "8/9 等待应用健康（最长 ${HEALTH_TIMEOUT} 秒）"

http_probe() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 "$HEALTH_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O - --timeout=5 "$HEALTH_URL"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1/api/health", timeout=5).read().decode())'
  else
    return 1
  fi
}

health_ok=0
health_body=""
elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  if health_body="$(http_probe 2>/dev/null)"; then
    case "$health_body" in
      *'"ok":true'*'"db":"up"'*|*'"db":"up"'*'"ok":true'*)
        health_ok=1
        break
        ;;
    esac
  fi
  printf '.'
  sleep "$HEALTH_INTERVAL"
  elapsed=$((elapsed + HEALTH_INTERVAL))
done
printf '\n'

if [ "$health_ok" -eq 1 ]; then
  info "健康检查通过：$health_body"
else
  error "健康检查在 ${HEALTH_TIMEOUT} 秒内未通过（最后响应：${health_body:-无响应}）"
  echo "" >&2
  error "---- docker compose ps ----"
  dc ps >&2 || true
  echo "" >&2
  error "---- 应用日志（最后 60 行）----"
  dc logs --tail=60 app >&2 || true
  echo "" >&2
  error "---- 数据库日志（最后 40 行）----"
  dc logs --tail=40 db >&2 || true
  echo "" >&2
  error "排查提示："
  error "  · 若 db 日志出现 'in 18+, these Docker images are configured to store database data ...'"
  error "    说明卷挂载路径不对 —— 本仓库 deploy/docker-compose.yml 已修正为 /var/lib/postgresql，请确认文件是最新版"
  error "  · 若 app 日志报缺少 DATABASE_URL / JWT_SECRET：检查 $ENV_FILE 是否完整"
  error "  · 若 db 报密码认证失败：数据卷可能已用旧密码初始化 —— 恢复旧密码，或确认无数据后 docker compose down -v 重建（会清空数据）"
  exit 1
fi

# ===========================================================================
# 9. 收尾输出
# ===========================================================================
step "9/9 部署完成"

get_public_ip() {
  local ip=""
  if command -v curl >/dev/null 2>&1; then
    ip="$(curl -fsS --max-time 4 https://ifconfig.me 2>/dev/null || true)"
    [ -z "$ip" ] && ip="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  elif command -v wget >/dev/null 2>&1; then
    ip="$(wget -q -O - --timeout=4 https://ifconfig.me 2>/dev/null || true)"
  fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 addr show scope global 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"
  fi
  printf '%s' "$ip"
}

PUBLIC_IP="$(get_public_ip)"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="<你的服务器公网IP>"
  warn "未能自动获取公网 IP，请在腾讯云控制台实例列表查看后替换上面占位符"
else
  case "$PUBLIC_IP" in
    10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|127.*)
      warn "探测到的是内网地址 $PUBLIC_IP，请以腾讯云控制台显示的公网 IP 为准"
      ;;
  esac
fi

printf '\n%s%s' "$C_CYAN" "$C_BOLD"
printf '============================================================\n'
printf ' 云签 YunQian 部署完成\n'
printf '============================================================\n'
printf '%s' "$C_RESET"

printf '  访问地址 : %shttp://%s%s\n' "$C_BOLD" "$PUBLIC_IP" "$C_RESET"
printf '  管理员   : %sadmin%s\n' "$C_BOLD" "$C_RESET"
if [ -n "$ADMIN_PASSWORD_SHOWN" ]; then
  printf '  初始密码 : %s%s%s\n' "$C_BOLD" "$ADMIN_PASSWORD_SHOWN" "$C_RESET"
  if [ "$ENV_GENERATED" -eq 1 ]; then
    printf '             %s（本次新生成，请立即记录；.env 中也保存了一份）%s\n' "$C_YELLOW" "$C_RESET"
  else
    printf '             %s（来自已有 .env；若数据库已初始化过，实际密码可能是首次部署时的那一个）%s\n' "$C_YELLOW" "$C_RESET"
  fi
else
  printf '  初始密码 : %s未在 .env 中设置，见首次启动日志：docker compose logs app | grep 初始密码%s\n' "$C_YELLOW" "$C_RESET"
fi
printf '  数据目录 : Docker 卷 pgdata（不随容器删除而丢失）\n'
printf '  配置文件 : %s\n' "$ENV_FILE"
printf '\n'

printf '%s[重要]%s 首次访问前请确认腾讯云轻量控制台 → 防火墙已放行 %s80%s 端口（TCP）。\n' "$C_YELLOW" "$C_RESET" "$C_BOLD" "$C_RESET"
printf '%s[提示]%s 无域名阶段使用 HTTP 明文访问；登录后请立即在页面左下角用户菜单修改 admin 密码。\n' "$C_CYAN" "$C_RESET"
printf '\n'

printf '%s常用运维命令（均在本目录 %s 下执行）：%s\n' "$C_BOLD" "$SCRIPT_DIR" "$C_RESET"
printf '  查看状态 : cd %s && docker compose ps\n' "$SCRIPT_DIR"
printf '  查看日志 : cd %s && docker compose logs -f --tail=100 app\n' "$SCRIPT_DIR"
printf '  重启应用 : cd %s && docker compose restart app\n' "$SCRIPT_DIR"
printf '  停止服务 : cd %s && docker compose down          # 数据保留在卷里\n' "$SCRIPT_DIR"
printf '  更新部署 : 重新上传代码后执行 cd %s && docker compose build && docker compose up -d\n' "$SCRIPT_DIR"
printf '  手动备份 : cd %s && bash backup.sh\n' "$SCRIPT_DIR"
printf '  备份恢复 : cd %s && gunzip -c backups/<文件>.sql.gz | docker compose exec -T db psql -U yunqian -d yunqian\n' "$SCRIPT_DIR"
printf '\n'

printf '%s建议：配置每日自动备份（保留最近 7 份）%s\n' "$C_BOLD" "$C_RESET"
printf '  crontab -e   # 加入下面一行（每天 03:20 备份；路径按当前部署目录自动填好）\n'
printf '  20 3 * * * %s/backup.sh >> %s/backups/cron.log 2>&1\n' "$SCRIPT_DIR" "$SCRIPT_DIR"
printf '  （先执行 mkdir -p %s/backups 确保日志目录存在）\n' "$SCRIPT_DIR"
printf '\n'
