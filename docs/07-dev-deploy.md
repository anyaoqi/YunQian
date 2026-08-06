# 07 开发与部署指南

## 1. 环境要求

- Node.js **≥ 22.5**（依赖内置 `node:sqlite`，Node 24+ 该模块已稳定）
- npm ≥ 10
- 无需 C++ 编译工具链，无需 Docker，无需外部数据库

检查：
```bash
node -v
npm -v
```

## 2. 首次启动

```bash
cd D:\Project\bookmark
npm install          # 根目录安装，workspaces 会一并装 server 与 web
npm run dev          # 同时启动后端(3001) 与前端(5173)
```

打开 <http://localhost:5173>。数据库文件在首次启动时自动创建于 `server/data/linknest.db`。

## 3. 脚本一览

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 并行启动后端 (tsx watch) 与前端 (vite) |
| `npm run dev:server` / `dev:web` | 单独启动某一端 |
| `npm run build` | 编译后端到 `server/dist`，构建前端到 `web/dist` |
| `npm start` | 生产模式：跑编译后的后端，并托管 `web/dist` 静态资源（单端口 3001） |
| `npm run typecheck` | 前后端 TypeScript 检查 |
| `npm run clean` | 删除构建产物 |

## 4. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 后端端口 |
| `HOST` | `127.0.0.1` | 监听地址。**改成 `0.0.0.0` 等于把无认证的数据库暴露给同网段** |
| `DB_PATH` | `server/data/linknest.db` | 数据库文件路径 |
| `WEB_DIST` | `web/dist` | 生产模式静态资源目录 |
| `DISABLE_FETCH_TITLE` | 未设置 | 设为 `1` 关闭服务端抓取标题（消除 SSRF 面） |

Windows PowerShell 临时设置：
```powershell
$env:PORT=4000; npm run dev:server
```

## 5. 目录与数据

```
server/data/linknest.db        # 主数据库
server/data/linknest.db-wal    # WAL 日志（正常现象）
server/data/linknest.db-shm    # 共享内存索引
```

三个文件都已在 `.gitignore` 中排除。

## 6. 备份与恢复

**逻辑备份（推荐，跨版本安全）**
```bash
curl -o linknest-backup.json http://127.0.0.1:3001/api/export
```

**物理备份（热备，无需停机）**
```bash
sqlite3 server/data/linknest.db "VACUUM INTO 'D:/backup/linknest-20260726.db'"
```
没装 sqlite3 CLI 时，停掉服务后直接复制 `.db`、`.db-wal`、`.db-shm` 三个文件。

**恢复**：替换 db 文件重启；或新建库后把导出的 JSON 里的 bookmarks 通过 `POST /api/bookmarks` 回灌（V2 将提供 JSON 导入端点）。

建议：把定期导出的 JSON 放进一个 Git 仓库，天然获得版本历史与异地备份。

## 7. 生产部署（单机）

```bash
npm ci
npm run build
npm start            # 访问 http://127.0.0.1:3001
```

用 PM2 常驻：
```bash
npm i -g pm2
pm2 start server/dist/index.js --name linknest --cwd D:\Project\bookmark
pm2 save
```

Windows 开机自启可用「任务计划程序」调用 `pm2 resurrect`，或用 `nssm` 注册为服务。

### Nginx 反向代理（V3 之后再考虑公网）
```nginx
server {
  listen 443 ssl;
  server_name links.example.com;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```
> **前置条件**：V1/V2 没有登录功能。公网暴露前必须先做 V3 的用户体系，或至少加 Nginx `auth_basic` + IP 白名单。

### Docker（V3 规划）
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
VOLUME /app/server/data
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
```

## 8. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `Cannot find module 'node:sqlite'` | Node 版本 < 22.5，升级 Node |
| 启动打印 `ExperimentalWarning: SQLite is an experimental feature` | Node 22/23 正常提示，可忽略；或加 `--no-warnings=ExperimentalWarning` |
| 端口被占用 `EADDRINUSE` | 改 `PORT`，或 `netstat -ano \| findstr :3001` 找进程结束掉 |
| 前端请求 404 | 确认后端已启动；`web/vite.config.ts` 的 `/api` 代理指向 3001 |
| 导入后集合为空 | 确认导出的是"书签 HTML 文件"而非 JSON；Chrome：书签管理器 → 右上角 ⋮ → 导出书签 |
| `SQLITE_BUSY` | 多进程同时写同一 db；确保只跑一个后端实例 |
| 中文乱码 | 确保请求头带 `charset=utf-8`；导入时文件应为 UTF-8 |

## 9. 浏览器书签导出路径速查

| 浏览器 | 操作 |
| --- | --- |
| Chrome | `chrome://bookmarks` → ⋮ → 导出书签 |
| Edge | `edge://favorites` → ⋯ → 导出收藏夹 |
| Firefox | 书签管理器 (Ctrl+Shift+O) → 导入和备份 → 导出书签为 HTML |
| Safari | 文件 → 导出 → 书签 |
