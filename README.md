# 云签（YunQian）

> 跨浏览器的**云书签 + 链接导航**。将不同浏览器的书签汇集到一处，可组织、可检索、可分享。

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.5-339933?logo=node.js&logoColor=white) ![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white) ![React](https://img.shields.io/badge/UI-React%2019-149ECA?logo=react&logoColor=white) ![Next.js](https://img.shields.io/badge/Framework-Next.js%2015-000000?logo=next.js&logoColor=white)

## 今日可用的 v0.1.0

- 书签：新增、编辑、删除、星标、访问计数、分页、四种排序。
- 组织：树形集合、无限层级子集合、跨集合标签；可按关键词、集合、标签、星标交叉筛选。
- 导入：支持 Chrome、Edge、Firefox、Safari 导出的 Netscape `bookmarks.html`；保留文件夹层级与 `TAGS` 属性，自动跳过重复 URL。额外支持 Raindrop CSV、Toby JSON、Pocket HTML。
- 导出：一键下载完整 JSON 备份，或导出浏览器可重新导入的 HTML。
- 体验：粘贴网址后抓取标题与封面、响应式界面、深层集合管理、批量操作、回收站、深色模式。
- 数据：无需注册、无需云服务，所有数据保存在本机 SQLite 文件中。

## 快速开始

**环境要求：Node.js ≥ 22.5**（推荐 Node 24+；项目使用内置 `node:sqlite`）。

```powershell
# 1. 进入项目目录
cd D:\Project\yunqian

# 2. 安装依赖（首次执行）
npm install

# 3. 启动开发服务器
npm run dev
```

打开：<http://127.0.0.1:3000>

- 开发服务器：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3000/api`
- 数据库：`app/data/yunqian.db`（首次启动自动创建）

### 第一次使用

1. 在 Chrome 打开 `chrome://bookmarks`（Edge：`edge://favorites`），点击菜单中的「导出书签」。
2. 在云签顶栏点击「导入」，选择导出的 `bookmarks.html`。
3. 集合保留为左侧文件夹树；浏览器中的标签会变成云签标签。
4. 点击「+ 添加书签」添加新网址。标签输入可用中文逗号、英文逗号或换行分隔。
5. 使用「导出」定期下载 JSON 备份。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Next.js 开发服务器（3000） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 构建 Next.js 生产包（standalone 输出） |
| `npm start` | 生产模式启动，单端口 `3000` |
| `npm run clean` | 清除构建产物 |

生产模式：

```powershell
npm run build
npm start
# 访问 http://127.0.0.1:3000
```

## 数据与安全

- 默认只监听 `127.0.0.1`，且当前版本**没有登录鉴权**；请勿将它直接暴露到公网。
- 数据库使用 WAL 模式，默认文件为 `app/data/yunqian.db`，已被 Git 忽略。
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
└── app/        # Next.js 15 + React 19 + node:sqlite
    ├── app/    # App Router、页面、API Route Handlers
    ├── components/  # 客户端组件
    ├── hooks/       # 客户端 hooks
    ├── lib/         # 共享类型、API 客户端、服务端 services
    └── public/      # 静态资源
```

## 版本演进

V1/V2 阶段采用 Express + Vite 拆分架构；自 v0.1.0 起迁移至 Next.js App Router，合并为单项目单端口，为后续分享页 SSR、用户体系与 AI 能力打底。详见[版本路线图](./docs/05-roadmap.md)。
