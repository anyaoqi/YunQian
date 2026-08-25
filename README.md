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
  <img src="https://img.shields.io/badge/Database-SQLite%20(node%3Asqlite)-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
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
- **内置 SQLite**：全面拥抱 Node.js ≥ 22.5 原生内置 `node:sqlite`（`DatabaseSync`），告别 `node-gyp` 和本地 C++ 编译环境困扰。
- **单应用架构**：Next.js 15 App Router 全栈整合，单端口部署即可运行全部前端与 API 服务。

---

## 🚀 快速上手

### 环境要求
- **Node.js**：`≥ 22.5.0`（推荐使用 Node 24+ LTS 版本）
- **包管理器**：推荐使用 `pnpm`（亦兼容 `npm` / `yarn`）

### 本地运行

```powershell
# 1. 克隆代码仓库
git clone https://github.com/anyaoqi/YunQian.git
cd YunQian

# 2. 安装项目依赖
pnpm install

# 3. 启动本地开发服务器
pnpm run dev
```

启动完成后，打开浏览器访问：
👉 **<http://127.0.0.1:3000>**

### 默认账户
首次启动系统会自动初始化默认管理员账户：
- **账号**：`admin`
- **初始密码**：`admin123`
*(登录后可在左下角用户菜单中随时修改密码或更新个人资料)*

---

## ⚙️ 环境变量配置

支持在根目录或 `app/` 目录下创建 `.env.local` 文件自定义配置项：

| 环境变量 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服务监听端口 |
| `JWT_SECRET` | *(内置安全缺省值)* | JWT 凭证签名密钥（生产环境建议自定义） |
| `ALLOW_REGISTRATION` | `true` | 是否允许前台公开注册新用户（`true` / `false`） |
| `INITIAL_ADMIN_PASSWORD` | `admin123` | 首次初始化管理员账号时的默认登录密码 |
| `DB_PATH` | `data/yunqian.db` | SQLite 数据库文件存放路径 |
| `DISABLE_FETCH_TITLE` | `0` | 设为 `1` 时禁用添加书签时的外网标题抓取功能 |

---

## 📜 常用命令

| 脚本命令 | 说明 |
| :--- | :--- |
| `pnpm run dev` | 启动开发服务器（默认端口 `3000`） |
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
