# 云签（YunQian）

<p align="center">
  <img src="app/public/logo.png" width="96" height="96" alt="YunQian Logo" />
</p>

<p align="center">
  <strong>跨浏览器的云书签汇集与链接导航系统</strong><br />
  将分散在不同浏览器、不同设备的网址汇聚一处，告别书签孤岛，实现「找得到、看得懂、用得上」。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A522.5-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/UI-React%2019-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Framework-Next.js%2015-000000?logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/Auth-JWT%20%2B%20Cookie-FF6B6B" alt="JWT Auth" />
  <img src="https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## ✨ 核心特性

### 👥 多用户体系与严格数据隔离 (v0.3.0)
- **自主注册与登录**：支持用户名、邮箱通用登录，支持配置开启/关闭开放注册。
- **无状态安全鉴权**：基于 HS256 JWT 与 `HttpOnly; SameSite=Lax` Cookie，杜绝 XSS 凭证窃取。
- **细粒度数据隔离**：所有书签、分类层级、标签及统计数据均绑定用户维度，严格拦截跨用户越权（IDOR）。
- **默认管理员与平滑迁移**：首次启动自动就绪管理员账号 `admin`，存量单用户数据无缝归属。
- **账户与安全设置**：支持个人昵称/邮箱设置，支持旧密码校验、实时强度与一致性检查、密码明密文快速切换。

### 🌌 “星航图”视觉设计语言
- **双模主题**：白昼工程坐标纸（浅色）与深空夜景（深色）主题，首帧防闪烁。
- **星等磁贴**：高频站点按访问量呈星等渐次点亮，2 秒直达常用网站。
- **全键盘与全局命令面板**：按下 <kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> 唤出全局检索，瞬间直达任意书签、分类或系统操作。
- **丰富视图切换**：支持主页星图、层级列表与卡片网格三种视图模式。

### 📁 灵活组织与批量管理
- **无限层级分类树**：自由嵌套子分类，支持拖拽排序与快捷右键管理。
- **多彩标签系统**：自动关联色彩，支持标签重命名、跨标签合并与一键孤立标签清理。
- **批量高效操作**：一键进入批量模式，支持跨分类批量移动、批量打标签与批量删除。
- **安全回收站**：删除项目自动移入回收站，支持随时单条/批量还原或彻底清空。

### 📥 全格式导入与导出备份
- **主流浏览器全兼容**：一键导入 Chrome、Edge、Firefox、Safari 导出的 `bookmarks.html`，自动保留文件夹层级与标签属性。
- **第三方平台迁移**：支持 Raindrop CSV、Toby JSON、Pocket HTML 格式解析导入。
- **完整备份与导出**：一键导出全量 JSON 资产备份，或导出浏览器通用 HTML 书签文件。

### ⚡ 轻量、零外部编译依赖
- **托管 PostgreSQL**：数据层基于 PostgreSQL(纯 JS `pg` 驱动,无原生编译依赖),天然支持备份、高可用与横向扩容;旧版 SQLite 数据首次启动自动迁移。
- **单应用架构**：Next.js 15 App Router 全栈整合，单端口部署即可运行全部前端与 API 服务。

---

## 🚀 快速上手

### 环境要求
- **Node.js**：`≥ 22.5.0`（推荐使用 Node 24+ LTS 版本）
- **PostgreSQL**:`≥ 13`(本地开发用 `pnpm db:start` 一键启动,无需自行安装)
- **包管理器**：推荐使用 `pnpm`（亦兼容 `npm` / `yarn`）

### 本地运行

```powershell
# 1. 克隆代码仓库
git clone https://github.com/anyaoqi/YunQian.git
cd YunQian

# 2. 安装项目依赖
pnpm install

# 3. 启动本地开发数据库(embedded-postgres,免安装免 Docker,连接串自动写入 .env.local)
pnpm db:start

# 4. 另开一个终端,启动本地开发服务器
pnpm run dev
```

启动完成后，打开浏览器访问：
👉 **<http://127.0.0.1:3000>**

已有旧版 SQLite 数据?把 `data/yunqian.db` 放回 `app/data/` 下,
首次启动 `pnpm dev` 时会自动迁移到 PostgreSQL(原文件保留为备份)。

### 默认账户
首次启动系统会自动初始化默认管理员账户：
- **账号**：`admin`
- **开发环境初始密码**：`admin123`(生产环境用 `INITIAL_ADMIN_PASSWORD` 指定,未指定则生成随机密码并只在启动日志中打印一次)
*(登录后可在左下角用户菜单中随时修改密码或更新个人资料)*

---

## ⚙️ 环境变量配置

支持在根目录或 `app/` 目录下创建 `.env.local` 文件自定义配置项：

| 环境变量 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `DATABASE_URL` | *(必填)* | PostgreSQL 连接串,如 `postgres://user:pass@host:5432/dbname`。Railway 部署引用 `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | *(必填)* | JWT 凭证签名密钥,至少 32 个字符,**生产环境缺失将拒绝启动**。生成方式:`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `PORT` | `3000` | 服务监听端口 |
| `ALLOW_REGISTRATION` | `true` | 是否允许前台公开注册新用户（`true` / `false`） |
| `INITIAL_ADMIN_PASSWORD` | *(未配置时随机)* | 首次初始化管理员账号时的登录密码(至少 8 位;生产环境未配置时自动生成随机密码,仅在启动日志打印一次,无固定默认值) |
| `DB_PATH` | `/data/yunqian.db` | 旧版 SQLite 文件路径,仅用于首次启动时自动迁移存量数据,迁移完成后不再读取 |
| `DISABLE_FETCH_TITLE` | `0` | 设为 `1` 时禁用添加书签时的外网标题抓取功能 |

---

## 🚢 生产部署

项目是单端口 Next.js standalone 应用 + PostgreSQL，需要「常驻容器 + 托管数据库」的部署方式，两套方案共用同一个 `Dockerfile`：

| 方案 | 适用场景 | 入口 |
| :--- | :--- | :--- |
| **腾讯云轻量服务器（Docker Compose）** | 个人自用、单机长期运行、国内访问 | [`docker-compose.yml`](./docker-compose.yml) + [`docs/09-deploy-tencent-lightweight.md`](./docs/09-deploy-tencent-lightweight.md) |
| Railway | 不想管服务器、要公网 HTTPS 现成 | [`railway.toml`](./railway.toml) + [`docs/07-dev-deploy.md`](./docs/07-dev-deploy.md) |

轻量服务器三步走：

```bash
cp .env.example .env        # 填 POSTGRES_PASSWORD / JWT_SECRET / INITIAL_ADMIN_PASSWORD
docker compose up -d --build
curl http://127.0.0.1:3000/api/health   # {"ok":true,"db":"up"}
```

---

## 📜 常用命令

| 脚本命令 | 说明 |
| :--- | :--- |
| `pnpm run dev` | 启动开发服务器（默认端口 `3000`） |
| `pnpm db:start` | 启动本地开发 PostgreSQL(数据落在 `app/.pgdata/`) |
| `pnpm db:reset` | 删除本地开发数据库,下次 `db:start` 全新初始化 |
| `pnpm run typecheck` | 执行 TypeScript 全局类型安全检查 |
| `pnpm run build` | 构建 Next.js 生产版本 |
| `pnpm run start` | 启动生产环境服务 |
| `pnpm run clean` | 清理构建产物与临时缓存 |

---

## 🏗️ 项目架构

```text
Bookmark-Pool/
├── docs/                 # 产品规划、架构设计与技术文档
│   ├── 00-vision.md      # 项目愿景与定位
│   ├── 01-prd.md         # 产品需求文档
│   ├── 02-architecture.md# 技术架构与分层设计
│   ├── 03-database.md    # 数据库模型与索引
│   ├── 04-api.md         # API 接口规范
│   └── 多用户注册登录开发规划.md # 账户体系与鉴权实现方案
├── app/                  # Next.js 15 全栈应用
│   ├── app/              # App Router 路由、页面与 Route Handlers
│   │   ├── (auth)/       # 登录 (/login) 与注册 (/register) 页面
│   │   ├── api/          # 认证、书签、分类、标签、导入导出 API
│   │   ├── styles/       # tokens、base、primitives、shell 样式库
│   │   ├── layout.tsx    # 根布局与全局 Providers
│   │   └── page.tsx      # 主应用首页
│   ├── components/       # UI 组件（Sidebar、UserMenu、Dialogs 等）
│   ├── hooks/            # 状态 Hooks（useAuth、useTheme 等）
│   ├── lib/              # 客户端 API 客户端与服务端 Services
│   │   ├── server/       # 数据库 schema、crypto、jwt、auth 业务层
│   │   └── types.ts      # 共享 TypeScript 类型定义
│   └── public/           # Favicon、Logo 与静态资源
└── package.json          # 工作区依赖与通用脚本
```

---

## 📚 文档中心

更详细的设计方案与实施记录请参考 [`docs/`](./docs/README.md)：
- 📖 [产品需求文档 (PRD)](./docs/01-prd.md)
- 🏛️ [技术架构设计](./docs/02-architecture.md)
- 🗄️ [数据库与数据字典](./docs/03-database.md)
- 🔌 [REST API 接口规范](./docs/04-api.md)
- 🗺️ [版本演进路线图](./docs/05-roadmap.md)
- 🛡️ [多用户注册登录系统实施规划](./docs/多用户注册登录开发规划.md)

---

## 📄 开源许可

本项目遵循 MIT License 开源协议。
