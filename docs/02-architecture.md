# 02 技术架构设计

## 1. 架构总览

```
┌──────────────────────── 浏览器 ────────────────────────┐
│  Web SPA (React 19 + TypeScript + Vite + Tailwind 4)   │
│  状态: React Hooks + 轻量 API 客户端 (fetch 封装)        │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON  (/api/*)
┌───────────────────────────▼────────────────────────────┐
│  API 服务 (Node.js 22+ / Express 5 / TypeScript)        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ routes   │→│ services │→│ repo/db  │ │ lib       │  │
│  │ 参数校验  │ │ 业务规则  │ │ SQL 语句  │ │ url/解析器 │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │ node:sqlite (内置，无原生编译)
┌───────────────────────────▼────────────────────────────┐
│  SQLite 单文件数据库  server/data/linknest.db (WAL)     │
└────────────────────────────────────────────────────────┘
```

## 2. 技术选型与理由

| 层 | 选型 | 理由 | 备选 |
| --- | --- | --- | --- |
| 数据库 | **SQLite**（`node:sqlite`） | 零部署、单文件备份、内置 FTS5 满足 V4 全文检索；Node 22+ 内置驱动，**无需 node-gyp 原生编译**，Windows 上开箱即用 | better-sqlite3（需编译）、PostgreSQL（V4 多用户可迁移） |
| 后端框架 | **Express 5** | 生态成熟、心智负担低、中间件丰富 | Fastify（性能更好）、Hono |
| 语言 | **TypeScript**（前后端统一） | 类型贯通 API 契约，减少联调错误 | JS |
| 校验 | **Zod** | schema 即类型，请求校验与 TS 类型单一来源 | 手写校验 |
| 前端 | **React + Vite** | 启动快、HMR 快、生态最大 | Vue3、SvelteKit |
| 样式 | **Tailwind CSS 4** | 无需写 CSS 文件即可高密度排版，`@tailwindcss/vite` 零配置 | CSS Modules、UnoCSS |
| 运行编排 | **npm workspaces + concurrently** | 单命令启动前后端，无需 Docker 即可开发 | pnpm、Turborepo |
| 开发执行 | **tsx** | 直接跑 TS，无编译等待 | ts-node、nodemon+tsc |

**不引入的东西（V1 刻意省略）**：ORM（SQL 直写更透明）、状态管理库（Hooks 足够）、组件库（Tailwind 手写更可控）、Docker（V1 目标是"今天就能跑"）。

## 3. 目录结构

```
bookmark/
├── docs/                       # 规划文档（本目录）
├── package.json                # workspaces 根，聚合脚本
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                   # SQLite 数据文件（gitignore）
│   └── src/
│       ├── index.ts            # 启动入口、中间件、错误处理
│       ├── db/
│       │   ├── index.ts        # 连接、WAL、迁移执行
│       │   └── schema.sql      # 建表 DDL
│       ├── routes/
│       │   ├── bookmarks.ts
│       │   ├── collections.ts
│       │   ├── tags.ts
│       │   └── transfer.ts     # 导入 / 导出
│       ├── services/
│       │   ├── bookmarks.ts    # 查询组装、事务、标签同步
│       │   ├── collections.ts
│       │   ├── tags.ts
│       │   └── importer.ts     # Netscape HTML → 领域对象
│       └── lib/
│           ├── url.ts          # 规范化、favicon、SSRF 防护
│           ├── html.ts         # Netscape 解析器、标题抓取
│           ├── errors.ts       # AppError + 统一错误响应
│           └── validators.ts   # Zod schema
└── web/
    ├── package.json
    ├── vite.config.ts          # /api 代理到 3001
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx             # 页面编排与筛选状态
        ├── api.ts              # 类型化 API 客户端
        ├── types.ts            # 与后端共享的数据契约
        ├── styles.css
        └── components/
            ├── Sidebar.tsx
            ├── Toolbar.tsx
            ├── BookmarkList.tsx
            ├── BookmarkItem.tsx
            ├── BookmarkDialog.tsx
            ├── ImportDialog.tsx
            └── ui.tsx           # Modal/Button/Input 等原子组件
```

## 4. 分层职责

- **routes**：只做「解析请求 → Zod 校验 → 调用 service → 返回 JSON」，不含业务分支。
- **services**：业务规则、事务边界、多表协作（如书签与标签的关联同步）。
- **db**：连接单例、迁移、`prepare` 语句。V1 直接在 service 内写 SQL（表少、语句短），表数超过 10 张时再抽 repository 层。
- **lib**：无状态纯函数，可单测。

## 5. 关键流程

### 5.1 新增书签
```
POST /api/bookmarks
  → Zod 校验 (url 必填, http/https)
  → normalizeUrl(url)           去空格/补协议/去 utm_*
  → SELECT 查重 (url UNIQUE)     命中 → 409 DUPLICATE_URL
  → BEGIN
      INSERT bookmarks
      upsert tags (INSERT OR IGNORE) → INSERT bookmark_tags
    COMMIT
  → 返回聚合后的 Bookmark（含 tags 数组）
```

### 5.2 书签导入
```
POST /api/import  { html }  (text/plain 或 JSON)
  → 分词式解析 Netscape HTML：<DL> 入栈 / </DL> 出栈 / <H3> 建集合 / <A> 建书签
  → 已存在集合按 (parent_id, name) 复用
  → 单事务批量 INSERT（1000 条 ~100ms 级）
  → 汇总 { imported, skipped, collectionsCreated, tagsCreated }
```

### 5.3 列表查询
```
GET /api/bookmarks?q=&collectionId=&tag=&favorite=&sort=&page=&pageSize=
  → collectionId 展开为「自身 + 全部子孙」（递归 CTE）
  → 动态拼接 WHERE（参数化，杜绝注入）
  → COUNT(*) 取 total + LIMIT/OFFSET 取页数据
  → 一次 IN 查询批量取回标签，内存归并，避免 N+1
```

### 5.4 抓取标题（SSRF 防护）
```
POST /api/fetch-title { url }
  → 仅允许 http/https
  → 拒绝 localhost / 127.* / 10.* / 172.16-31.* / 192.168.* / *.local / 169.254.*
  → fetch + 5s AbortSignal.timeout，仅读前 512KB
  → 正则取 <title>，解码 HTML 实体
```
> 说明：该端点会由服务端向用户提供的 URL 发起出站请求，属已知风险面，因此加了协议与内网地址白/黑名单。生产部署若无需该功能，可通过 `DISABLE_FETCH_TITLE=1` 关闭。

## 6. 安全性

| 项 | V1 措施 | 后续 |
| --- | --- | --- |
| 认证 | **无**（仅绑定 `127.0.0.1` 的本地单用户模式） | V3 JWT + 多用户；此前不要暴露到公网 |
| SQL 注入 | 全部使用参数化占位符 `?` | — |
| XSS | React 默认转义；不使用 `dangerouslySetInnerHTML` | 快照渲染需 sanitize（V4） |
| SSRF | 抓取标题的协议与内网地址过滤 | 出站代理白名单 |
| 体积攻击 | 请求体上限 20MB | 分片上传 |
| CORS | 仅允许本地开发源 | 同源部署后关闭 |

> ⚠️ V1 **没有任何身份认证**，默认监听 `127.0.0.1`。若改为 `0.0.0.0` 或反代到公网，任何人都能读写你的全部书签，必须先加上 V3 的鉴权或前置 Basic Auth / 内网限制。

## 7. 性能预算

| 操作 | 目标 | 手段 |
| --- | --- | --- |
| 列表首屏（1 万条库） | < 100ms | 索引 + LIMIT + 批量取标签 |
| 搜索（LIKE） | < 150ms | `title/url` 索引；V4 换 FTS5 |
| 导入 1000 条 | < 3s | 单事务 + prepared statement 复用 |
| 前端首屏 | < 1s | Vite 构建、无重型依赖 |

## 8. 演进策略

- **数据层**：SQL 集中在 services，迁移到 PostgreSQL 时只改连接与少量方言（`INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`）。
- **迁移机制**：`schema.sql` 幂等 DDL + `schema_migrations` 版本表，启动时自动执行未应用的迁移。
- **API 兼容**：路径固定 `/api/*`，破坏性变更走 `/api/v2/*`。
- **多用户**：所有业务表预留 `user_id`（V1 恒为 1），V3 打开过滤即可，无需重建表。
