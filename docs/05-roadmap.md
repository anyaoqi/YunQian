# 05 版本路线图

## 总览

| 版本 | 主题 | 预计工作量 | 交付形态 |
| --- | --- | --- | --- |
| **V1** | 能用：导入 + 增删改查 | 1 天 | 本地单用户 Web 应用 |
| **V2** | 好用：效率与视觉 | 1–2 周 | 可日常替代浏览器书签栏 |
| **V3** | 联通：多用户 + 扩展 + 分享 | 2–4 周 | 可自托管给小团队 |
| **V4** | 智能：全文 + 语义 + AI | 4–8 周 | 真正的「知识库」 |

---

## V1 — 最小可用（今日交付）

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

不做：认证、回收站、批量操作、卡片视图、拖拽、元数据抓取（除标题）。

验收见 [06-v1-plan.md](./06-v1-plan.md)。

---

## V2 — 效率与视觉

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

## V3 — 多用户与联通

| 功能 | 要点 |
| --- | --- |
| 用户体系 | 注册/登录、argon2id 哈希、JWT（access + refresh） |
| 数据隔离 | 打开 `user_id` 过滤，中间件注入当前用户 |
| 公开分享 | 集合生成 `slug` 分享页，只读、可选口令 |
| 浏览器扩展 | Manifest V3，一键收藏当前页、选中文本存为备注、重复提醒 |
| 失链检测 | 定时 HEAD 探活，标记 4xx/5xx，提供 Wayback 备份链接 |
| 智能集合 | 保存筛选条件为虚拟集合（如「未读 + 前端」） |
| 移动端 | 响应式改造 + PWA 安装、离线读缓存 |
| 部署 | Dockerfile + docker-compose，可选 PostgreSQL 后端 |

安全门槛：上线公网前必须完成用户体系、速率限制、HTTPS、CSRF 策略。

### 技术决策：本阶段迁移到 Next.js

V1/V2 采用 React + Vite + Express 拆分架构（理由见 [02-architecture.md](./02-architecture.md) 选型表）。迁移到 Next.js（App Router）安排在 V3，因为 Next 的核心价值——SSR、Server Actions、分享页元信息——恰好都落在本阶段的公开分享与多用户功能上；提前迁移只会付出固定成本而拿不到收益，还要在 V2 功能开发期间持续承担 Server/Client 边界与缓存语义的心智负担。

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

预估工作量 1–1.5 天（含回归验证）。迁移后收益：单一项目与单端口（不再需要 concurrently 与 Vite 代理）、`page.tsx` 可用 Server Component 直接查库预取首屏、公开分享页获得 SSR 与元信息。

> ⚠️ 部署约束：若同期考虑部署到 Vercel 等无状态平台，本地 SQLite 文件无法持久化，需连带迁移到 Turso / libSQL 等远程 SQLite —— 该改动量远大于框架迁移本身，必须单独评估。

---

## V4 — 知识库与 AI

| 功能 | 要点 |
| --- | --- |
| 正文快照 | 抓取并提取可读正文（Readability），存 `content_snapshots` |
| 全文检索 | SQLite FTS5 + 中文分词（unicode61 / jieba 预处理），高亮片段 |
| 语义检索 | 本地或 API 嵌入模型 → `embeddings` 表 → 余弦 Top-K，与关键词结果混排 |
| AI 自动打标 | 基于标题+正文推荐标签与集合，用户一键采纳 |
| AI 摘要 | 生成 2–3 句摘要写入 `description`，长文生成要点列表 |
| 关联推荐 | 「与此相关的收藏」基于向量近邻 |
| 知识回顾 | 间隔重复提醒回看久未访问的高价值收藏 |
| 团队协作 | 共享集合、成员角色（owner/editor/viewer）、变更历史、评论 |
| 数据洞察 | 收藏趋势、主题分布、阅读完成率仪表盘 |

---

## 里程碑排序原则

1. **先数据，后体验**：任何视觉改造都晚于数据模型稳定。
2. **先本地，后联网**：暴露公网前必须先有鉴权。
3. **AI 是增强不是依赖**：所有 AI 功能均可关闭，核心功能不依赖外部模型。
