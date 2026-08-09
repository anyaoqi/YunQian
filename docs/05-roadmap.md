# 05 版本路线图

## 总览

| 版本 | 主题 | 状态 |
| --- | --- | --- |
| **V1** | 能用：导入 + 增删改查 | ✅ 已完成 |
| **V2** | 好用：效率与视觉 | ✅ 已完成 |
| **v0.1.0** | 重构：改名 + Next.js 迁移 + UI 改版 + CI/CD | 规划中 |
| **v0.2.0** | 联通与智能：书签导航预览分享 + AI 书签整理 | 规划中 |

> 版本编号说明：V1/V2 为早期里程碑式编号（已交付）；自 v0.1.0 起切换为语义化版本号，以正式发布为单位推进。

---

## V1 — 最小可用（已完成）

**目标**：把历史书签搬进来，并能增删改查、按集合/标签/关键词找到它们。

范围：
- SQLite schema 与自动迁移
- 书签：新增 / 编辑 / 删除 / 列表 / 分页 / 排序 / 星标 / 点击计数
- 集合：树形 CRUD（删除时书签转未分类）
- 标签：自动创建、计数、删除
- 搜索：关键词 + 集合 + 标签交叉过滤
- 导入：Chrome/Edge/Firefox 书签 HTML
- 导出：全量 JSON
- 前端：侧边栏 + 列表 + 工具栏 + 新增/编辑弹窗 + 导入弹窗

验收见 [06-v1-plan.md](./06-v1-plan.md)。

---

## V2 — 效率与视觉（已完成）

| 功能 | 要点 |
| --- | --- |
| 回收站 | 软删除（`deleted_at`）、30 天保留、恢复/彻底删除 |
| 批量操作 | 多选 checkbox、批量移动集合/加标签/删除 |
| 元数据抓取 | 后台队列抓取 OG title/description/image，失败重试与退避 |
| 卡片 / 网格视图 | 封面图、三档密度、视图偏好持久化 |
| 导航面板首页 | 高频站点九宫格，可设为浏览器新标签页 |
| 拖拽 | 书签拖到集合、集合间排序（`sort_order`） |
| 快捷键 | `n` 新增、`/` 搜索、`e` 编辑、`Del` 删除、`g+数字` 跳集合 |
| 标签管理 | 重命名、合并、着色、清理孤儿标签 |
| 导入导出增强 | Raindrop CSV、Toby JSON、Pocket；导出浏览器 HTML |
| 主题 | 深色模式 |

技术债偿还：抽出 repository 层；补 Vitest 单测（URL 规范化、HTML 解析、查询构造）。

---

## v0.1.0 — 重构与基建

**目标**：在 V2 功能完整的基础上，完成产品定名、框架迁移、视觉升级与部署流水线，为后续联网与 AI 能力打底。

### 1. 修改应用名称和其他文档

- 确定最终产品名 **云签（YunQian）**，统一前后端 `package.json`、文档标题、UI 文案、数据库名、环境变量前缀
- 同步更新 `docs/` 全部文档：[00-vision.md](./00-vision.md)、[01-prd.md](./01-prd.md)、[02-architecture.md](./02-architecture.md)、[07-dev-deploy.md](./07-dev-deploy.md) 中的旧代号
- 更新 `README.md` 项目介绍与一键启动说明

### 2. 迁移到 Next.js（App Router）

V1/V2 采用 React + Vite + Express 拆分架构（选型理由见 [02-architecture.md](./02-architecture.md)）。迁移到 Next.js 的核心收益——SSR、Server Actions、分享页元信息——将在 v0.2.0 的「书签导航预览分享」中直接兑现；同时合并为单项目单端口，消除 concurrently 与 Vite 代理。

迁移评估（基于 V1 代码 1465 行）：

| 类别 | 涉及文件 | 行数 | 动作 |
| --- | --- | --- | --- |
| 零改动搬运 | `services/*`、`lib/{url,validators}.ts`、`db/schema.ts`、`types.ts` | 723 | 移入 `lib/server/` |
| 加 `'use client'` | `components/*.tsx`、`App.tsx` | 447 | 移入 `lib/components/` |
| 需改写 | `routes/api.ts`、`index.ts`、`lib/errors.ts`、`db/index.ts` | 195 | 见下四点 |
| 可能删除 | `web/src/{api,main}.ts(x)` | 45 | 改用 Server Actions 后不再需要 |

services 层是纯函数 + 参数化 SQL，不 import 任何 Express 类型，这是迁移成本可控的根本原因。

四个必须处理的改动点：

1. **数据库连接改为惰性单例**。现在 `db/index.ts` 在模块顶层建连接并执行 DDL；Next 下会在 `next build` 阶段就创建数据库文件，且开发态热重载会重复建连接。改为 `getDb()` + `globalThis` 缓存，services 内 `db.prepare(...)` 相应改为 `getDb().prepare(...)`（约 100 处，可用 AST 批量重写）。
2. **每个 Route Handler 声明运行时**：`export const runtime = 'nodejs'`（`node:sqlite` 在 Edge Runtime 不可用）与 `export const dynamic = 'force-dynamic'`（书签数据不可静态缓存，漏掉会导致增删改后读到旧数据）。
3. **统一错误处理**从 Express 的单个 `errorHandler` 中间件改为高阶包装函数，逐个 route 套用（12 个调用点），保持 `AppError` / `ZodError` → 错误码响应的映射不变。
4. **两个特殊响应**：`POST /api/import` 的 `text/plain` 大文本改为 `await request.text()` 并放开体积限制；`GET /api/export` 的 `Content-Disposition` 下载头改用 `new Response(json, { headers })`。

> ⚠️ 部署约束：若考虑部署到 Vercel 等无状态平台，本地 SQLite 文件无法持久化，需连带迁移到 Turso / libSQL 等远程 SQLite —— 该改动量远大于框架迁移本身，必须单独评估。

### 3. UI 改版

- 重新设计视觉语言：配色、字体、间距、圆角、阴影 token 化
- 列表 / 卡片 / 网格三视图统一渲染层，减少分支样式
- 侧边栏与工具栏信息密度可调，适配导航面板形态
- 移动端响应式断点复核，PWA 可安装性保留

### 4. 部署 CI/CD

- GitHub Actions：`pnpm install` → `typecheck` → `build` → 产物归档
- PR 触发 lint + typecheck + 单测门禁
- 主分支推送触发自动构建并发布到 Release / 容器仓库
- Dockerfile 多阶段构建（含 Next.js standalone 输出），`docker-compose.yml` 一键起服务
- 可选：Vercel / Cloudflare Pages 部署配置（需先解决 SQLite 持久化）

---

## v0.2.0 — 联通与智能

**目标**：在 v0.1.0 的 Next.js 基座上，补齐对外分享能力并引入 AI 整理能力，让收藏从「私人仓库」走向「可分享、可被理解」。

### 1. 书签导航预览分享

| 功能 | 要点 |
| --- | --- |
| 公开分享页 | 集合生成 `slug` 分享页，只读、可选口令；Next.js SSR 预取 + OG 元信息 |
| 导航预览 | 分享页以导航面板形态展示，封面图 + 标题 + 描述，支持九宫格 / 列表切换 |
| 分享管理 | 列出已分享集合、撤销分享、轮换 slug、访问统计 |
| 用户体系（前置） | 注册/登录、argon2id 哈希、JWT（access + refresh）；数据隔离打开 `user_id` 过滤 |

安全门槛：上线公网前必须完成用户体系、速率限制、HTTPS、CSRF 策略。

### 2. AI 书签整理

| 功能 | 要点 |
| --- | --- |
| AI 自动打标 | 基于标题+描述（v0.2.0）/ 正文快照（后续）推荐标签与集合，用户一键采纳 |
| AI 摘要 | 生成 2–3 句摘要写入 `description`，长文生成要点列表 |
| 智能去重合并 | 检测近似 URL 与重复收藏，建议合并 / 保留 / 归档 |
| 一键整理 | 按主题聚类未分类书签，批量建议集合归属 |
| 模型接入 | 抽象 LLM Provider 层，支持 OpenAI / 本地模型，所有 AI 功能可关闭 |

设计原则：AI 是增强不是依赖——所有 AI 功能均可关闭，核心功能不依赖外部模型。

---

## 后续展望（v0.3.0+）

暂不排期，按 v0.2.0 上线后反馈决定优先级：

- 全文检索：SQLite FTS5 + 中文分词，高亮片段
- 语义检索：本地或 API 嵌入模型 → `embeddings` 表 → 余弦 Top-K，与关键词结果混排
- 正文快照：抓取并提取可读正文（Readability），存 `content_snapshots`
- 浏览器扩展：Manifest V3，一键收藏当前页、选中文本存为备注、重复提醒
- 失链检测：定时 HEAD 探活，标记 4xx/5xx，提供 Wayback 备份链接
- 团队协作：共享集合、成员角色（owner/editor/viewer）、变更历史、评论

---

## 里程碑排序原则

1. **先数据，后体验**：任何视觉改造都晚于数据模型稳定。
2. **先本地，后联网**：暴露公网前必须先有鉴权。
3. **AI 是增强不是依赖**：所有 AI 功能均可关闭，核心功能不依赖外部模型。
4. **先基建，后功能**：v0.1.0 的框架迁移与 CI/CD 是 v0.2.0 分享与 AI 能力的前置条件。
