# LinkNest（链巢）

> 本地优先的**网址导航 + 知识库**。将浏览器书签转化为可组织、可检索、可注释的个人链接资产。

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.5-339933?logo=node.js&logoColor=white) ![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white) ![React](https://img.shields.io/badge/UI-React%2019-149ECA?logo=react&logoColor=white)

## 今日可用的 V1

- 书签：新增、编辑、删除、星标、访问计数、分页、四种排序。
- 组织：树形集合、无限层级子集合、跨集合标签；可按关键词、集合、标签、星标交叉筛选。
- 导入：支持 Chrome、Edge、Firefox、Safari 导出的 Netscape `bookmarks.html`；保留文件夹层级与 `TAGS` 属性，自动跳过重复 URL。
- 导出：一键下载完整 JSON 备份。
- 体验：粘贴网址后抓取标题、响应式界面、深层集合管理。
- 数据：无需注册、无需云服务，所有数据保存在本机 SQLite 文件中。

## 快速开始

**环境要求：Node.js ≥ 22.5**（推荐 Node 24+；项目使用内置 `node:sqlite`）。

```powershell
# 1. 进入项目目录
cd D:\Project\bookmark

# 2. 安装依赖（首次执行）
npm install

# 3. 同时启动 API 和 Web 开发服务器
npm run dev
```

打开：<http://127.0.0.1:5173>

- 前端开发服务器：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3001/api`
- 数据库：`server/data/linknest.db`（首次启动自动创建）

### 第一次使用

1. 在 Chrome 打开 `chrome://bookmarks`（Edge：`edge://favorites`），点击菜单中的「导出书签」。
2. 在 LinkNest 顶栏点击「导入」，选择导出的 `bookmarks.html`。
3. 集合保留为左侧文件夹树；浏览器中的标签会变成 LinkNest 标签。
4. 点击「+ 添加书签」添加新网址。标签输入可用中文逗号、英文逗号或换行分隔。
5. 使用「导出」定期下载 JSON 备份。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动后端（3001）与前端（5173） |
| `npm run dev:server` | 仅启动后端 |
| `npm run dev:web` | 仅启动前端 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 构建后端与前端生产文件 |
| `npm start` | 生产模式启动，单端口 `3001` 托管 API 与页面 |
| `npm run clean` | 清除构建产物 |

生产模式：

```powershell
npm run build
npm start
# 访问 http://127.0.0.1:3001
```

## 数据与安全

- 默认只监听 `127.0.0.1`，且 V1 **没有登录鉴权**；请勿将它直接暴露到公网。
- 数据库使用 WAL 模式，默认文件为 `server/data/linknest.db`，已被 Git 忽略。
- 推荐定期点击「导出」保存 JSON；详见[开发、部署与备份指南](./docs/07-dev-deploy.md)。
- 标题抓取端点会拦截 `localhost`、私有 IP 与 `.local` 域名。若不需要该功能，可设置 `DISABLE_FETCH_TITLE=1`。

## 文档

完整规划、领域模型、数据表、API 契约和版本路线图位于 [`docs/`](./docs/README.md)：

- [项目愿景与竞品分析](./docs/00-vision.md)
- [产品需求文档](./docs/01-prd.md)
- [技术架构](./docs/02-architecture.md)
- [数据库设计](./docs/03-database.md)
- [API 设计](./docs/04-api.md)
- [版本路线图](./docs/05-roadmap.md)
- [V1 实施计划与验收标准](./docs/06-v1-plan.md)
- [开发与部署指南](./docs/07-dev-deploy.md)

## 工程结构

```text
.
├── docs/       # 产品、架构、数据与运维规划
├── server/     # Express 5 + TypeScript + node:sqlite API
│   └── data/   # 运行时 SQLite 数据库（自动创建，不提交）
└── web/        # React 19 + Vite 单页应用
```

## V1 边界与下一步

V1 专注于「今天可用」：本地单用户、书签导入与基础管理。回收站、批量整理、卡片导航面板、浏览器扩展、多用户分享、全文/语义检索和 AI 自动打标已完成设计，按 [V2–V4 路线图](./docs/05-roadmap.md)演进。
