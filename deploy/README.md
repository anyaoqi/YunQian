# YunQian 部署手册（腾讯云轻量应用服务器）

**三条命令上线**：本机打包 → scp 上传 → 服务器执行 `deploy/install.sh`。

- 编排：PostgreSQL 18 + 应用（Next.js 15.2 standalone）+ Caddy 反代（80 端口）
- 访问：`http://<公网IP>`（无域名、无 HTTPS 阶段）
- 最坏规格按 **2 核 2G** 设计：脚本会自动加 2G swap，避免 `next build` 被 OOM Kill
- 目标镜像：腾讯云轻量应用服务器的 **Docker CE 应用镜像**（Ubuntu 22.04，自带 docker + compose 插件）

> ⚠️ **`deploy/` 目录尚未提交到 git，所以不能用 `git clone`。必须按下面第 1 步在本地打 tar 包上传。**

---

## 0. 上线前：控制台放行 80 端口（一次性）

腾讯云轻量控制台 → 选中实例 → **防火墙** → 添加规则：

| 应用类型 | 协议 | 端口 | 来源 |
| :-- | :-- | :-- | :-- |
| HTTP | TCP | **80** | 0.0.0.0/0 |
| SSH | TCP | 22 | 你的公网 IP（建议收窄） |

> 不放行 80，服务在服务器内部是健康的，但浏览器打不开——这是最常见的“部署成功却访问不了”的原因。
> `5432` **不要**放行：数据库只在 compose 内网可达。

---

## 1. 本机打包（Windows Git Bash，项目根目录执行）

```bash
cd /d/Project/Bookmark-Pool

tar --exclude='./node_modules' \
    --exclude='./app/node_modules' \
    --exclude='./app/.next' \
    --exclude='./app/.pgdata' \
    --exclude='./.git' \
    --exclude='./server' \
    --exclude='./web' \
    --exclude='./docs' \
    --exclude='./deploy/.env' \
    --exclude='./deploy/backups' \
    --exclude='*.db' \
    --exclude='*.db-wal' \
    --exclude='*.db-shm' \
    --exclude='*.log' \
    -czf yunqian-deploy.tar.gz .
```

说明：

- 排除 `node_modules` / `.next` / `.pgdata` / `.git` / `server`（旧后端）/ `web`（旧前端）/ `docs` / `*.db`，包体积通常在 1~3MB
- 排除 `deploy/.env`：**本地密钥绝不能上传**
- 必须在仓库根目录打包（Dockerfile 的构建上下文是根目录，需要 `app/`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`）

## 2. 上传到服务器

```bash
scp yunqian-deploy.tar.gz root@<SERVER_IP>:/tmp/
```

> 上传完可以删掉本地包：`rm -f yunqian-deploy.tar.gz`

## 3. 服务器上执行（SSH 登录后粘贴）

```bash
mkdir -p /opt/YunQian && tar -xzf /tmp/yunqian-deploy.tar.gz -C /opt/YunQian && cd /opt/YunQian && ls deploy
```

确认能看到 `docker-compose.yml  Caddyfile  install.sh  backup.sh  .env.example`，然后：

```bash
cd /opt/YunQian && bash deploy/install.sh
```

脚本会依次自动完成（全程 5~15 分钟，取决于机器规格和网络）：

| 步骤 | 内容 |
| :-- | :-- |
| 1 | 校验 root/非 root（非 root 自动 sudo）、检测 docker 与 compose 插件 |
| 2 | 写 `/etc/docker/daemon.json`：腾讯云内网镜像加速 + 日志轮转（**合并**写入，不覆盖你已有配置），重启 docker |
| 3 | 内存 < 3.5G 且无 swap 时创建 2G `/swapfile` 并写入 `/etc/fstab`（**幂等**） |
| 4 | 生成 `deploy/.env`（**已存在则绝不覆盖**）：URL-safe 随机密码、JWT 密钥、admin 初始密码 |
| 5 | 80 端口占用预检（被别的服务占用会明确告警并给处理建议） |
| 6 | `docker compose build`（失败时打印最后 40 行日志与常见原因） |
| 7 | `docker compose up -d` |
| 8 | 轮询 `http://127.0.0.1/api/health` 最长 180 秒，期望 `{"ok":true,"db":"up"}` |
| 9 | 打印访问地址、admin 账号密码、常用运维命令、备份 cron 建议 |

脚本结束时会醒目打印：

```
  访问地址 : http://<公网IP>
  管理员   : admin
  初始密码 : xxxxxxxxxxxxxx     ← 立即记录
```

**脚本可以重复执行**：`.env` 不会被覆盖，swap 不会重复创建，daemon.json 内容无变化时不会重启 docker。

## 4. 验证

```bash
# 服务器内部探活（走 Caddy 80 → app:3000）
curl -fsS http://127.0.0.1/api/health      # 期望 {"ok":true,"db":"up"}

# 容器状态：三个都应是 running / healthy
cd /opt/YunQian/deploy && docker compose ps
```

浏览器打开 `http://<SERVER_IP>`，用 `admin` + 脚本打印的初始密码登录，**登录后立即在页面左下角用户菜单改密码**。

首次把本地数据搬过来的两种方式：

1. 浏览器书签 → 导出 `bookmarks.html` → 页面里「导入」
2. 本地开发环境 `GET /api/export` 得到 JSON → 服务器导入

## 5. 每日自动备份（强烈建议）

```bash
mkdir -p /opt/YunQian/deploy/backups
crontab -e
```

加入一行（每天 03:20 备份，**自动保留最近 7 份**）：

```cron
20 3 * * * /opt/YunQian/deploy/backup.sh >> /opt/YunQian/deploy/backups/cron.log 2>&1
```

手动备份 / 恢复：

```bash
cd /opt/YunQian/deploy
bash backup.sh                       # 生成 backups/yunqian-<时间戳>.sql.gz

# 恢复（会覆盖现有数据，谨慎）
gunzip -c backups/yunqian-<时间戳>.sql.gz | docker compose exec -T db psql -U yunqian -d yunqian
```

> 再稳一点：定期把 `backups/` 同步到腾讯云 COS，或用轻量服务器的快照功能。

## 6. 日常运维

```bash
cd /opt/YunQian/deploy

docker compose ps                     # 状态
docker compose logs -f --tail=100 app # 应用日志（Ctrl+C 退出）
docker compose restart app            # 只重启应用
docker compose down                   # 停止（数据保留在卷 pgdata 里）
docker compose up -d                  # 再启动
```

更新版本：本地重新打包上传（第 1、2 步），服务器上解包覆盖后：

```bash
cd /opt/YunQian && tar -xzf /tmp/yunqian-deploy.tar.gz -C . && cd deploy && docker compose build && docker compose up -d
```

数据库表结构由应用启动时幂等创建/升级（advisory lock 保护），不需要手工跑迁移脚本，现有数据不受影响。

## 7. 常见问题

| 现象 | 原因 / 处理 |
| :-- | :-- |
| 浏览器打不开 `http://<IP>` | 控制台防火墙没放行 80；或 `docker compose ps` 里 caddy 不是 running |
| db 容器反复重启，日志有 `in 18+, these Docker images are configured to store database data...` | 卷挂载路径不对：PostgreSQL 18 必须挂 `/var/lib/postgresql`（本仓库已修正）。确认 `deploy/docker-compose.yml` 是最新版 |
| `docker compose up` 卡在 `Pulling` | 镜像加速没生效：`cat /etc/docker/daemon.json` 确认有 `mirror.ccs.tencentyun.com`，再 `systemctl restart docker` |
| 构建中途 `Killed` / `exit 137` | 内存不足：确认 `free -h` 里有 swap；仍失败就升到 2 核 4G |
| `/api/health` 返回 `{"ok":false,"db":"down"}` | 看 `docker compose logs db`；常见是数据卷已用旧密码初始化 —— 改回旧密码，或确认无数据后 `docker compose down -v` 重来（**会清空数据**） |
| 日志报缺少 `JWT_SECRET` / `DATABASE_URL` | `deploy/.env` 不完整（JWT 需 ≥32 字符），补上后 `docker compose up -d`（重建才生效，`restart` 不够） |
| 登录返回 429 | 登录限流（每 IP 每分钟 10 次，同账号失败 5 次锁 15 分钟），等一会儿 |
| 登录成功但又回到登录页 | 旧版本镜像在生产环境给 cookie 加了 `Secure` 标志，纯 HTTP 部署下浏览器会直接丢弃该 cookie。已修复（按请求是否为 HTTPS 决定是否加 `Secure`），拉最新代码 `docker compose up -d --build` 重建即可 |
| 导入大书签文件报 413 | Caddy 已放宽到 50MB；若仍失败，把文件拆成几份导入 |
| 想彻底重置 | `docker compose down -v` 删除数据卷，**数据不可恢复**，先备份 |

## 8. 绑定域名（ICP 备案通过后）

1. 域名 DNS 添加 A 记录指向服务器公网 IP
2. 编辑 `deploy/Caddyfile`：注释掉 `:80 { ... }` 整段，启用文件底部的 `your-domain.com { ... }` 段并替换域名
3. `docker compose restart caddy`（Caddy 自动申请并续期 HTTPS 证书）
4. 控制台防火墙放行 443

## 9. 为什么用 PostgreSQL 18

本地开发是 embedded-postgres 18.1.0-beta，生产同为 PG18，导数据/迁移不跨大版本。`docs/09-deploy-tencent-lightweight.md` 里的版本描述已同步为 18；根目录 `docker-compose.yml` 是 Railway 等其它场景的旧编排（PG16），与本目录编排不要混用。
