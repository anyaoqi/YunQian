# 09 腾讯云轻量应用服务器部署（Docker Compose）

> **以 `deploy/` 目录与 `deploy/README.md` 为准，本文为背景说明。**
> 实际部署请执行 `bash deploy/install.sh`（一键幂等脚本）。本文前置端口、镜像版本、卷名称等细节
> 与 `deploy/` 编排存在差异，差异之处一律以 `deploy/` 为准：
> - 数据库版本：**PostgreSQL 18**（与本地开发 embedded-postgres 18.1.0-beta 对齐，不跨大版本）
> - PG18 数据卷挂载目标为 `/var/lib/postgresql`（不是 `/var/lib/postgresql/data`）
> - 对外端口：**80**（Caddy 反代 app:3000），不再是 `IP:3000`
> - 环境变量文件：`deploy/.env`（由 `deploy/install.sh` 自动生成）

> 适用场景：**个人自用**、单机部署、一天几个人访问。不追求高可用，追求"配一次长期跑"。

## 1. 方案说明

单台轻量服务器上跑两个容器：

```
公网 IP:3000  ──▶  app (Next.js standalone, node:22-slim)
                        │  compose 内网 db:5432
                        ▼
                     db (postgres:18-alpine, 数据在命名卷 yunqian-pgdata)
```

- 只有 app 的 3000 端口映射到宿主机，**数据库不对外暴露**（即使安全组误开 5432 也连不上）
- 数据全部落在 Docker 命名卷 `yunqian-pgdata`，不依赖容器生命周期
- 表结构在启动时于 advisory lock 保护下幂等创建/升级，`git pull` 后重建镜像即完成升级
- 配置文件：根目录 `docker-compose.yml` + `.env`（由 `.env.example` 复制）

## 2. 购买与初始化

| 项 | 建议 |
| :-- | :-- |
| 规格 | **推荐 4 核 4G**（¥109/年 首单特惠那一档）——`next build` 是 CPU 密集型，4 核构建约 2~3 分钟；2 核 4G 可用但构建慢一倍；**2 核 2G 必须配 swap**（§2.4），否则容易 OOM |
| 带宽 | 3M 峰值带宽对单人使用完全够（首屏资源约 200~400KB）；5M/6M 更宽裕；10M 以上自用属浪费 |
| 磁盘 | ≥ 40G（镜像 + 构建缓存约 3~5G） |
| 镜像 | 优先选「**Docker CE**」应用镜像（开箱有 docker + compose），否则选 Ubuntu 22.04 LTS 按 §2.2 装 |
| 地域 | 自己所在城市最近的地域即可；境内服务器用 IP 访问无需备案 |

### 2.1 防火墙（轻量控制台 → 防火墙）

放行：`22`(SSH)、`3000`(应用)。
**不要**放行 `5432`。若后面要上域名 + HTTPS，再放行 `80`、`443`。

### 2.2 安装 Docker（应用镜像已带则跳过）

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu \
$(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### 2.3 拉镜像加速（境内必做）

腾讯云轻量可以用内网镜像源，拉 `node:22-slim`、`postgres:18-alpine` 会快很多：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
```

### 2.4 2G 内存务必加 swap（4G 及以上可跳过）

2 核 2G 机型跑 `next build`（峰值吃 1.5~2.5G）极可能被 OOM Kill，加了 swap 才能稳过：

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # 确认 Swap 有值
```

## 3. 把代码放到服务器

**方式 A：服务器直接 clone**（有 GitHub 访问条件时最省事）

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt && git clone https://github.com/anyaoqi/YunQian.git
cd YunQian && git checkout main
```

**方式 B：本地打包上传**（服务器访问 GitHub 慢时）。在本地项目根目录（Git Bash）：

```bash
tar --exclude=node_modules --exclude=.next --exclude=.pgdata \
    --exclude=.git --exclude=server -czf yunqian.tar.gz .
scp yunqian.tar.gz ubuntu@<服务器公网IP>:/tmp/
```

服务器上：

```bash
sudo mkdir -p /opt/YunQian && sudo chown $USER:$USER /opt/YunQian
tar -xzf /tmp/yunqian.tar.gz -C /opt/YunQian
```

> 注意：`app/.env.local` 里是本地开发库连接串，**不要**带到服务器，构建上下文已通过 `.dockerignore` 排除它。

## 4. 配置环境变量

```bash
cd /opt/YunQian
cp .env.example .env
# 生成密码与密钥
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
node -e "console.log('JWT_SECRET='+require('node:crypto').randomBytes(48).toString('base64url'))" \
  || openssl rand -base64 48
nano .env
```

`.env` 里至少要改三项：`POSTGRES_PASSWORD`、`JWT_SECRET`（≥32 字符）、`INITIAL_ADMIN_PASSWORD`（≥8 位，不填则随机生成并打印在日志）。

自用建议同时设 `ALLOW_REGISTRATION=false`，避免暴露注册入口。

## 5. 构建并启动

```bash
cd /opt/YunQian
sudo docker compose up -d --build        # 首次约 5~10 分钟（含拉基础镜像 + next build）
sudo docker compose ps                   # 两个容器都应为 running / healthy
sudo docker compose logs -f app          # Ctrl+C 退出日志跟踪
```

启动成功的标志（日志里）：

```
▲ Next.js 15.2.0
✓ Ready in xxx ms
```

若 `INITIAL_ADMIN_PASSWORD` 没配，去日志里捞一次性密码：

```bash
sudo docker compose logs app | grep "admin 初始密码"
```

## 6. 验证

```bash
curl http://127.0.0.1:3000/api/health
# 期望：{"ok":true,"db":"up"}   返回 503 说明数据库没连上，看 db 容器日志
```

浏览器打开 `http://<服务器公网IP>:3000`，用 `admin` + 你的初始密码登录，进去后立即在左下角用户菜单改密码。

从本地开发环境搬数据：登录后 `GET /api/export` 的 JSON 备份，或直接把本地浏览器书签 HTML 导入。

## 7. 日常运维

```bash
cd /opt/YunQian
sudo docker compose restart app          # 只重启应用
sudo docker compose down                 # 停止（数据不丢，在 yunqian-pgdata 卷里）
sudo docker compose up -d                # 再启动
sudo docker compose logs --tail=200 app  # 看最近日志
```

### 7.1 数据库备份（强烈建议）

```bash
mkdir -p ~/yunqian-backup
cat > ~/backup.sh <<'EOF'
#!/bin/bash
set -e
cd /opt/YunQian
mkdir -p ~/yunqian-backup
docker compose exec -T db pg_dump -U yunqian -d yunqian \
  | gzip > ~/yunqian-backup/yunqian-$(date +%F).sql.gz
# 只保留最近 14 天
find ~/yunqian-backup -name 'yunqian-*.sql.gz' -mtime +14 -delete
EOF
chmod +x ~/backup.sh
(crontab -l 2>/dev/null; echo "30 3 * * * /home/ubuntu/backup.sh") | crontab -
```

恢复：

```bash
gunzip -c ~/yunqian-backup/yunqian-2026-10-24.sql.gz \
  | sudo docker compose exec -T db psql -U yunqian -d yunqian
```

> 再稳一点：定期把 `~/yunqian-backup` 同步到腾讯云 COS（`coscmd` 或轻量自带的快照功能）。

### 7.2 升级到新版本

```bash
cd /opt/YunQian
git pull
sudo docker compose up -d --build
```

数据库 schema 的变更是启动时幂等执行的（advisory lock 保护），不需要手工跑迁移脚本；现有数据不受影响。

## 8. 可选：域名 + HTTPS

- **境内服务器 + 域名**：80/443 必须完成 **ICP 备案**，否则会被拦截。自用不折腾的话，长期用 `IP:3000` 完全够。
- **已备案**：装 Nginx 反代，`APP_BIND` 改成 `127.0.0.1`（.env 里），容器只监听本地，再由 Nginx 对外：

```nginx
server {
  listen 443 ssl http2;
  server_name bookmark.example.com;

  ssl_certificate     /etc/nginx/ssl/fullchain.pem;
  ssl_certificate_key /etc/nginx/ssl/privkey.pem;

  client_max_body_size 20m;   # 导入 bookmarks.html 时可能较大

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

改完 `.env` 需 `sudo docker compose up -d` 重建容器（环境变量在容器创建时注入，`restart` 不生效）。

## 9. 常见问题

| 现象 | 原因 / 处理 |
| :-- | :-- |
| `docker compose up` 卡在 `Pulling` | 没配镜像加速，按 §2.3 配好后 `docker system prune -f` 重试 |
| 构建中途 `Killed` / `exit 137` | 内存不够，加 swap（§2.4）或升到 2 核 4G |
| 浏览器打不开 IP:3000 | 轻量控制台防火墙没放行 3000；或容器非 running（`docker compose ps`） |
| `/api/health` 返回 `{"ok":false,"db":"down"}` | 看 `docker compose logs db`；常见是 `.env` 改了 `POSTGRES_PASSWORD` 但旧数据卷已用旧密码初始化 —— 要么改回旧密码，要么 `docker volume rm yunqian-pgdata` 重来（**会清空数据**） |
| 日志报 `[entrypoint] 错误:缺少 JWT_SECRET` | `.env` 没配或长度 <32 |
| 登录返回 429 / 账号锁定 | 登录限流：每 IP 每分钟 10 次，同账号失败 5 次锁 15 分钟。自用输错几次会触发，等一会儿即可 |
| 改了 `.env` 不生效 | 用 `docker compose up -d`（重建），不要只 `restart` |
| 想彻底重置 | `docker compose down -v` 会删除数据卷，**数据不可恢复**，确认已备份 |

## 10. 与 Railway 方案的关系

根目录 `railway.toml`、`Dockerfile` 保持原样即可，两套方案共用同一个镜像构建：Railway 直接用 Dockerfile，本方案用 `docker-compose.yml` 在外层补了 PostgreSQL 与网络编排。切换平台不需要改业务代码。

生产环境变量校验逻辑在 `app/instrumentation.ts`（缺 `JWT_SECRET`/`DATABASE_URL` 直接 fail-fast），容器启动脚本 `app/docker-entrypoint.sh` 会先做一次同样的检查，所以配置错会在 `docker compose up` 阶段立刻暴露，而不是等到访问页面时白屏。
