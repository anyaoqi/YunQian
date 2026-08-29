# 07 开发与部署指南

## 1. 环境要求

- Node.js **≥ 22.5**(推荐 24 LTS)
- pnpm ≥ 10
- PostgreSQL ≥ 13 —— 本地开发无需安装:项目内置 embedded-postgres(`pnpm db:start` 自动下载并启动)

## 2. 首次启动(本地开发)

```bash
git clone https://github.com/anyaoqi/YunQian.git
cd YunQian
pnpm install

pnpm db:start        # 终端 1:启动本地 PostgreSQL,连接串自动写入 app/.env.local
pnpm dev             # 终端 2:启动 Next.js 开发服务器
```

打开 <http://127.0.0.1:3000>。首次启动自动建表并初始化管理员 `admin`(开发环境密码 `admin123`)。

**旧版 SQLite 数据迁移**:把 `yunqian.db` 放到 `app/data/` 下再首次启动,存量用户/书签/分类/标签会自动迁入 PostgreSQL(原文件保留为备份,不会删除)。

## 3. 脚本一览(在仓库根目录执行)

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器 (3000) |
| `pnpm db:start` | 启动本地开发 PostgreSQL(端口 5433,数据在 `app/.pgdata/`) |
| `pnpm db:reset` | 删除本地开发数据库 |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm clean` | 清理构建产物 |

## 4. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串,如 `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | ✅(生产) | JWT 签名密钥,≥ 32 字符。生产缺失会拒绝启动。生成:`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `INITIAL_ADMIN_PASSWORD` | – | 首次初始化 admin 的密码(≥ 8 位)。生产未配置时自动生成随机密码,仅在启动日志打印一次 |
| `ALLOW_REGISTRATION` | – | `false` 关闭公开注册 |
| `DB_PATH` | – | 旧 SQLite 文件路径,仅用于自动迁移(默认 `/data/yunqian.db`,本地为 `app/data/yunqian.db`) |
| `DISABLE_FETCH_TITLE` | – | `1` 关闭服务端抓取标题 |
| `PORT` | – | 监听端口,默认 3000 |

## 5. Railway 生产部署(当前方案)

项目通过根目录 `Dockerfile` + `railway.toml` 部署在 Railway,健康检查 `/api/health`(含数据库探活)。

**首次部署 / 从 SQLite 版本升级的步骤:**

1. **添加 PostgreSQL 数据库**:Railway 项目页 → `New` → `Database` → `PostgreSQL`(与应用服务同区域)。
2. **给应用服务配置环境变量**(Variables 标签):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`(引用插件变量)
   - `JWT_SECRET` = 随机生成(见上表)
   - `INITIAL_ADMIN_PASSWORD` = 自定义(可选,不配则随机生成)
3. **保留旧数据卷**:如果旧 SQLite 版本挂载了 Volume(`/data`),**先不要删**——首次启动会自动把 `/data/yunqian.db` 的存量数据迁入 PostgreSQL,日志出现 `迁移完成` 后即可安全删除该 Volume。
4. 部署完成后确认 Deployments 日志无报错,`/api/health` 返回 `{"ok":true,"db":"up"}`。

**回滚**:Railway 支持一键回退到任意历史部署;数据库层面,PostgreSQL 插件自带自动备份。

**扩容与备份**:PostgreSQL 插件在插件页可直接配置自动备份(Backup 功能)。应用服务在数据库外置后可安全多副本(限流器目前是进程内的,多副本前需改为 Redis 共享存储)。

## 6. 数据库说明

- Schema 由 `app/lib/server/db/schema.ts` 定义,启动时在 advisory lock 保护下幂等执行(多实例安全)。
- `users.username/email` 为 CITEXT(大小写不敏感),对应旧版 SQLite 的 `COLLATE NOCASE`。
- SQLite → PostgreSQL 一次性迁移逻辑在 `app/lib/server/db/migrate.ts`,触发条件:PG 的 users 表为空 且 存在旧 SQLite 文件。
- 手动备份(JSON 导出,含分类/标签/书签):登录后 `GET /api/export`。

## 7. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 启动报 `[startup] ...必须配置 JWT_SECRET` | 生产环境缺环境变量,按第 4 节配置 |
| 启动报 `[db] 缺少 DATABASE_URL` | 未配置数据库连接串,或 Railway 未引用 `${{Postgres.DATABASE_URL}}` |
| `pnpm db:start` 端口冲突 | `PG_PORT=5434 pnpm db:start` 换端口,并把 `.env.local` 中连接串同步修改 |
| 登录报 429 `RATE_LIMITED` / `ACCOUNT_LOCKED` | 登录限流触发:每 IP 每分钟 10 次;同账号连续失败 5 次锁定 15 分钟 |
| 迁移日志 `SQLite 数据迁移失败` | 旧文件损坏或版本过旧;查看日志中具体错误,必要时先修旧库再重启 |
| 中文乱码 | 确保请求头带 `charset=utf-8`;导入文件应为 UTF-8 |
