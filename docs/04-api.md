# 04 API 设计

Base URL：`http://127.0.0.1:3001/api`（前端开发态由 Vite 代理 `/api` 转发）

## 1. 通用约定

- 编码：`application/json; charset=utf-8`；时间为 ISO8601 UTC 字符串。
- 成功：`2xx` + 资源本体或 `{ items, total, page, pageSize }`。
- 失败：统一结构
  ```json
  { "error": { "code": "DUPLICATE_URL", "message": "该网址已收藏", "details": null } }
  ```
- 错误码表

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数校验失败，`details` 为 Zod issues |
| 400 | `INVALID_URL` | URL 非 http/https 或无法解析 |
| 400 | `BAD_IMPORT_FILE` | 导入内容不是 Netscape 书签 HTML |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `DUPLICATE_URL` | URL 已存在 |
| 409 | `DUPLICATE_NAME` | 同级集合/标签重名 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体 > 20MB |
| 422 | `INVALID_PARENT` | 集合父子关系形成环 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

- V1 无认证（本地单用户）。V3 起 `Authorization: Bearer <jwt>`。

## 2. 数据契约

```ts
type Bookmark = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  note: string | null;
  faviconUrl: string | null;
  coverUrl: string | null;
  isFavorite: boolean;
  clickCount: number;
  lastVisitedAt: string | null;
  collectionId: number | null;
  collectionName: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type Collection = {
  id: number; name: string; parentId: number | null;
  icon: string | null; color: string | null; sortOrder: number;
  bookmarkCount: number;          // 仅自身直属数量
  children: Collection[];         // 树形返回
};

type Tag = { id: number; name: string; color: string | null; count: number };
```

## 3. 端点清单

| 方法 | 路径 | 说明 | 版本 |
| --- | --- | --- | :-: |
| GET | `/health` | 健康检查 | V1 |
| GET | `/stats` | 总数统计（书签/集合/标签/未分类） | V1 |
| GET | `/bookmarks` | 列表 + 搜索 + 分页 | V1 |
| POST | `/bookmarks` | 新增 | V1 |
| GET | `/bookmarks/:id` | 详情 | V1 |
| PATCH | `/bookmarks/:id` | 局部更新 | V1 |
| DELETE | `/bookmarks/:id` | 删除 | V1 |
| POST | `/bookmarks/:id/visit` | 点击计数 +1 | V1 |
| GET | `/collections` | 集合树 | V1 |
| POST | `/collections` | 新增 | V1 |
| PATCH | `/collections/:id` | 重命名/移动/改图标 | V1 |
| DELETE | `/collections/:id` | 删除（书签转未分类） | V1 |
| GET | `/tags` | 标签 + 计数 | V1 |
| POST | `/tags` | 新增 | V1 |
| DELETE | `/tags/:id` | 删除 | V1 |
| POST | `/fetch-title` | 抓取网页标题 | V1 |
| POST | `/import` | 导入 Netscape HTML | V1 |
| GET | `/export` | 导出全量 JSON | V1 |
| POST | `/bookmarks/batch` | 批量移动/打标/删除 | V2 |
| GET/POST | `/trash`, `/trash/:id/restore` | 回收站 | V2 |
| POST | `/auth/login`,`/auth/register` | 鉴权 | V3 |
| GET | `/search?mode=semantic` | 语义检索 | V4 |

## 4. 详细定义（V1）

### GET /bookmarks
查询参数：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `q` | string | — | 关键词，匹配 title/url/description/note |
| `collectionId` | number \| `"none"` | — | 集合 id（含子孙）；`none` = 未分类 |
| `tag` | string | — | 标签名精确匹配 |
| `favorite` | `true`/`false` | — | 仅看星标 |
| `sort` | `newest`\|`oldest`\|`title`\|`popular` | `newest` | 排序 |
| `page` | number | 1 | 页码，从 1 起 |
| `pageSize` | number | 24 | 1–200 |

响应 `200`
```json
{ "items": [ /* Bookmark[] */ ], "total": 137, "page": 1, "pageSize": 24 }
```

### POST /bookmarks
```json
{
  "url": "https://react.dev",
  "title": "React 官方文档",
  "description": "用于构建用户界面的库",
  "note": "Hooks 章节值得反复读",
  "collectionId": 3,
  "tags": ["前端", "文档"],
  "isFavorite": true
}
```
- 仅 `url` 必填。`tags` 中不存在的标签自动创建。
- URL 会被规范化（补 `https://`、去除 `utm_*`/`fbclid`/`gclid`、去尾部空白）。
- 未提供 `faviconUrl` 时按域名生成默认图标地址。
- 响应 `201` + `Bookmark`；URL 重复返回 `409 DUPLICATE_URL`。

### PATCH /bookmarks/:id
任意子集字段：`url,title,description,note,collectionId,tags,isFavorite`。
- `tags` 传数组即**整体替换**关联；不传则不动。
- `collectionId: null` 表示移到未分类。

### DELETE /bookmarks/:id
`204 No Content`。V1 为物理删除（关联表级联清理），V2 改为软删除进回收站。

### POST /bookmarks/:id/visit
`click_count + 1`、更新 `last_visited_at`，响应 `{ "clickCount": 12 }`。

### GET /collections
```json
[ { "id": 1, "name": "前端", "parentId": null, "icon": "🧩", "color": null,
    "sortOrder": 0, "bookmarkCount": 12,
    "children": [ { "id": 4, "name": "React", "parentId": 1, "bookmarkCount": 5, "children": [] } ] } ]
```

### POST /collections
`{ "name": "设计", "parentId": null, "icon": "🎨" }` → `201 Collection`；同级重名 `409`。

### PATCH /collections/:id
`{ "name": "新名字", "parentId": 2 }`；若 `parentId` 是自身或自身子孙 → `422 INVALID_PARENT`。

### DELETE /collections/:id
`204`。其下书签 `collection_id → NULL`，子集合 `parent_id → 被删集合的父级`。

### GET /tags
`[ { "id": 2, "name": "文档", "color": null, "count": 31 } ]`，按 count 降序。

### POST /fetch-title
请求 `{ "url": "https://react.dev" }` → `{ "title": "React", "faviconUrl": "..." }`
- 5s 超时；失败返回 `{ "title": null }`（不视为错误，避免阻塞收藏流程）。
- 拒绝 `localhost`、私有网段与非 http(s) 协议（SSRF 防护）。

### POST /import
两种请求体二选一：
- `Content-Type: text/plain` —— 直接 POST 书签 HTML 全文；
- `Content-Type: application/json` —— `{ "html": "...", "collectionId": 3, "mode": "skip" }`

| 字段 | 说明 |
| --- | --- |
| `html` | Netscape 书签 HTML 内容 |
| `collectionId` | 可选，导入到指定集合之下（作为根挂载点） |
| `mode` | `skip`（默认，跳过已存在 URL）\| `overwrite`（更新标题/集合） |

响应 `200`
```json
{ "imported": 842, "skipped": 15, "collectionsCreated": 26, "tagsCreated": 7, "durationMs": 412 }
```

### GET /export
`200` + `Content-Disposition: attachment; filename="linknest-export-<date>.json"`
```json
{
  "version": 1,
  "exportedAt": "2026-07-26T05:00:00.000Z",
  "collections": [ { "id": 1, "name": "前端", "parentId": null } ],
  "tags": [ { "id": 1, "name": "文档" } ],
  "bookmarks": [ { "url": "...", "title": "...", "collectionId": 1, "tags": ["文档"] } ]
}
```

### GET /stats
`{ "bookmarks": 857, "collections": 26, "tags": 41, "uncategorized": 12, "favorites": 18 }`

## 5. 调用示例（curl）

```bash
# 新增
curl -X POST http://127.0.0.1:3001/api/bookmarks \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://react.dev\",\"title\":\"React\",\"tags\":[\"前端\"]}"

# 搜索
curl "http://127.0.0.1:3001/api/bookmarks?q=react&page=1&pageSize=10"

# 导入
curl -X POST http://127.0.0.1:3001/api/import \
  -H "Content-Type: text/plain" --data-binary @bookmarks.html

# 导出
curl -o backup.json http://127.0.0.1:3001/api/export
```
