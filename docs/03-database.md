# 03 数据库设计

数据库：**SQLite**（文件 `server/data/yunqian.db`，`journal_mode=WAL`，`foreign_keys=ON`）。

## 1. ER 关系

```
users(1) ─┬─< collections ──┐ (parent_id 自引用，树形)
          │                 │
          └─< bookmarks >───┘  (collection_id 可空 = 未分类)
                  │
                  └─< bookmark_tags >── tags
     (V4) bookmarks ─1:1─ content_snapshots ─1:N─ embeddings
```

关系摘要：
- `collections.parent_id → collections.id`：树形嵌套，`NULL` 为根级。
- `bookmarks.collection_id → collections.id`：**0..1**，集合删除时置 `NULL`（未分类）。
- `bookmark_tags`：书签与标签的**多对多**，联合主键防重复。

## 2. V1 表结构

### 2.1 collections
| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | NOT NULL DEFAULT 1 | 多用户预留 |
| parent_id | INTEGER | NULL, FK→collections.id ON DELETE SET NULL | 父集合 |
| name | TEXT | NOT NULL | 集合名 |
| icon | TEXT | NULL | emoji 或图标名 |
| color | TEXT | NULL | 十六进制色值 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 同级排序 |
| created_at / updated_at | TEXT | NOT NULL | ISO8601 UTC |

唯一约束：`UNIQUE(user_id, parent_id, name)` —— 同一父级下不允许同名集合（导入去重依赖此约束）。
> SQLite 中 `NULL` 不参与唯一性比较，因此根级同名集合无法靠该约束拦截，服务层对 `parent_id IS NULL` 的情况额外做一次查重。

### 2.2 bookmarks
| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | NOT NULL DEFAULT 1 | |
| collection_id | INTEGER | NULL, FK→collections.id ON DELETE SET NULL | 归属集合 |
| url | TEXT | NOT NULL | 规范化后的 URL |
| title | TEXT | NOT NULL DEFAULT '' | 为空时前端显示域名 |
| description | TEXT | NULL | 站点描述 / OG description |
| note | TEXT | NULL | 用户私人备注（知识沉淀核心字段） |
| favicon_url | TEXT | NULL | 图标地址 |
| cover_url | TEXT | NULL | 封面图（V2 抓取） |
| is_favorite | INTEGER | NOT NULL DEFAULT 0 | 0/1 星标 |
| click_count | INTEGER | NOT NULL DEFAULT 0 | 点击次数 |
| last_visited_at | TEXT | NULL | 最近访问 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 手动排序（V2 拖拽） |
| created_at / updated_at | TEXT | NOT NULL | ISO8601 UTC |
| deleted_at | TEXT | NULL | 软删除时间（V2 回收站；V1 保留字段不使用） |

唯一约束：`UNIQUE(user_id, url)` —— URL 级去重。

### 2.3 tags
| 字段 | 类型 | 约束 |
| --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT |
| user_id | INTEGER | NOT NULL DEFAULT 1 |
| name | TEXT | NOT NULL，`UNIQUE(user_id, name)` |
| color | TEXT | NULL |
| created_at | TEXT | NOT NULL |

### 2.4 bookmark_tags
| 字段 | 类型 | 约束 |
| --- | --- | --- |
| bookmark_id | INTEGER | FK→bookmarks.id ON DELETE CASCADE |
| tag_id | INTEGER | FK→tags.id ON DELETE CASCADE |
| — | — | `PRIMARY KEY(bookmark_id, tag_id)` |

### 2.5 schema_migrations
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| version | TEXT PK | 迁移标识，如 `001_init` |
| applied_at | TEXT | 应用时间 |

## 3. 索引

```sql
CREATE INDEX idx_bookmarks_collection ON bookmarks(collection_id);
CREATE INDEX idx_bookmarks_created    ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_favorite   ON bookmarks(is_favorite);
CREATE INDEX idx_bookmarks_title      ON bookmarks(title);
CREATE INDEX idx_collections_parent   ON collections(parent_id);
CREATE INDEX idx_bookmark_tags_tag    ON bookmark_tags(tag_id);
```

> `bookmark_tags` 的联合主键已覆盖 `bookmark_id` 前缀查询，只需补 `tag_id` 方向索引。

## 4. 典型查询

**集合子树展开（含自身）**
```sql
WITH RECURSIVE sub(id) AS (
  SELECT id FROM collections WHERE id = ?
  UNION ALL
  SELECT c.id FROM collections c JOIN sub ON c.parent_id = sub.id
)
SELECT id FROM sub;
```

**交叉过滤（集合 + 标签 + 关键词）**
```sql
SELECT b.* FROM bookmarks b
WHERE b.deleted_at IS NULL
  AND b.collection_id IN (/* 子树 id 列表 */)
  AND b.id IN (SELECT bookmark_id FROM bookmark_tags bt
               JOIN tags t ON t.id = bt.tag_id WHERE t.name = ?)
  AND (b.title LIKE ?1 OR b.url LIKE ?1 OR b.description LIKE ?1 OR b.note LIKE ?1)
ORDER BY b.is_favorite DESC, b.created_at DESC
LIMIT ? OFFSET ?;
```

**标签使用计数**
```sql
SELECT t.id, t.name, COUNT(bt.bookmark_id) AS count
FROM tags t LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.deleted_at IS NULL
GROUP BY t.id ORDER BY count DESC, t.name;
```

## 5. 后续版本的表（预留设计）

### V3 users / shares
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- argon2id
  display_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE shares (                -- 集合公开分享
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL,          -- public | link | private
  created_at TEXT NOT NULL
);
```

### V4 全文检索与向量
```sql
-- 正文快照
CREATE TABLE content_snapshots (
  bookmark_id INTEGER PRIMARY KEY REFERENCES bookmarks(id) ON DELETE CASCADE,
  text_content TEXT, html_path TEXT, fetched_at TEXT
);
-- FTS5 虚拟表（外部内容表模式，避免数据冗余）
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title, description, note, text_content,
  content='', tokenize='unicode61'
);
-- 向量（sqlite-vec 扩展，或落库 BLOB 由应用层计算余弦相似度）
CREATE TABLE embeddings (
  bookmark_id INTEGER PRIMARY KEY REFERENCES bookmarks(id) ON DELETE CASCADE,
  model TEXT NOT NULL, dim INTEGER NOT NULL, vector BLOB NOT NULL, updated_at TEXT NOT NULL
);
```

## 6. 迁移与备份

- **迁移**：启动时读取内置迁移列表，与 `schema_migrations` 对比，按序执行未应用项，单事务保证原子性。DDL 一律写成幂等形式（`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` 前置列检查）。
- **备份**：直接复制 `yunqian.db`（停机）或 `VACUUM INTO 'backup.db'`（热备）；逻辑备份用 `GET /api/export` 的 JSON。
- **恢复**：替换 db 文件，或用导出的 JSON 走导入接口重建。
