# 06 V1 实施计划（今日交付）

## 1. 范围确认

**做**：书签/集合/标签的增删改查、搜索分页、浏览器书签 HTML 导入、JSON 导出、抓取标题、点击计数、星标。
**不做**：登录鉴权、回收站、批量操作、卡片视图、拖拽、封面抓取。

## 2. 环境前置

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | **≥ 22.5**（推荐 22 LTS / 24 / 25） | 需要内置 `node:sqlite` |
| npm | ≥ 10 | workspaces |

`node:sqlite` 在 Node 22/23 中为实验模块（启动会打印 experimental 警告，功能可用），Node 24+ 转为稳定。

## 3. 任务拆解

| # | 任务 | 产出文件 | 预估 |
| --- | --- | --- | --- |
| 1 | 规划文档 | `docs/*.md` | 1h |
| 2 | 工程骨架、workspaces、脚本 | 根 `package.json`、两个子包配置 | 15m |
| 3 | DB 层：连接、WAL、迁移、DDL | `server/src/db/*` | 30m |
| 4 | lib：URL 规范化、错误、校验 | `server/src/lib/*` | 30m |
| 5 | services + routes：书签/集合/标签 | `server/src/{services,routes}/*` | 2h |
| 6 | Netscape HTML 解析器 + 导入导出 | `server/src/lib/html.ts`、`services/importer.ts` | 1h |
| 7 | 前端骨架、API 客户端、类型 | `web/src/{api,types,main}.ts(x)` | 30m |
| 8 | 前端组件：侧边栏/工具栏/列表/弹窗 | `web/src/components/*` | 2h |
| 9 | 联调、typecheck、构建、冒烟测试 | — | 1h |
| 10 | README 与运行说明 | `README.md` | 15m |

## 4. 实现要点备忘

### URL 规范化
```
trim → 无协议则补 https:// → new URL 解析（失败报 INVALID_URL）
→ 删除 utm_source/utm_medium/utm_campaign/utm_term/utm_content/fbclid/gclid/spm
→ 去掉空 query 的 '?'、保留 hash → toString()
```

### Netscape HTML 解析
浏览器导出格式特征：
```html
<DL><p>
    <DT><H3 ADD_DATE="..." >开发</H3>
    <DL><p>
        <DT><A HREF="https://react.dev" ADD_DATE="1690000000" ICON="data:..." TAGS="前端,文档">React</A>
        <DD>可选的描述行
    </DL><p>
</DL>
```
解析策略（不引依赖）：
- 用一个正则按顺序扫描 `<DL`、`</DL`、`<H3...>text</H3>`、`<A ...>text</A>`、`<DD>text` 五类 token。
- 维护集合栈：遇 `<H3>` 先记为「待入栈集合」，下一个 `<DL` 时压栈；`</DL` 出栈。
- `<A>` 的 `HREF` 为 URL，内文为标题，`TAGS` 逗号切分为标签，`ADD_DATE`（秒）转 `created_at`，紧随的 `<DD>` 作为描述。
- HTML 实体解码：`&amp; &lt; &gt; &quot; &#39; &nbsp;` 及 `&#\d+;`。
- 跳过 `javascript:`、`place:`、`about:` 等非 http(s) 链接。
- 全流程放进**单个事务**，prepared statement 复用。

### 标签同步（编辑时整体替换）
```
DELETE FROM bookmark_tags WHERE bookmark_id = ?
for name of tags: INSERT OR IGNORE INTO tags(name) → SELECT id → INSERT OR IGNORE INTO bookmark_tags
```

### 避免 N+1
列表查询拿到当页 id 列表后，一条 `WHERE bookmark_id IN (?,?,...)` 取回全部标签，内存里按 id 归组。

## 5. 验收清单（逐条勾验）

后端（curl / PowerShell）：
- [ ] `GET /api/health` → `{"ok":true}`
- [ ] `POST /api/collections` 创建集合成功，重名返回 409
- [ ] `POST /api/bookmarks` 创建成功；同 URL 再提交返回 409
- [ ] `GET /api/bookmarks?q=...&collectionId=...&tag=...` 过滤与分页正确
- [ ] `PATCH /api/bookmarks/:id` 改标题与标签生效
- [ ] `DELETE /api/bookmarks/:id` → 204，列表不再返回
- [ ] `POST /api/import` 导入示例 HTML，集合树与标签正确建立
- [ ] `GET /api/export` 返回完整 JSON
- [ ] `GET /api/tags`、`GET /api/stats` 计数与实际一致

前端：
- [ ] 打开 `http://localhost:5173` 正常渲染，空库有引导
- [ ] 新增/编辑/删除书签，列表即时更新
- [ ] 侧边栏集合、标签点击可过滤，可组合
- [ ] 搜索框输入有防抖并正确过滤
- [ ] 导入弹窗选择 HTML 文件后显示导入统计
- [ ] 导出按钮下载 JSON 文件
- [ ] 点击书签标题在新标签打开且 `clickCount` 增加

工程：
- [ ] `npm run typecheck` 前后端均无错误
- [ ] `npm run build` 成功产出 `server/dist` 与 `web/dist`
- [ ] `npm run dev` 一条命令同时起前后端

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| Node < 22.5 无 `node:sqlite` | 启动时检测版本并给出明确报错；README 标注要求 |
| 实验性 API 警告干扰 | 文档说明可忽略；`--no-warnings=ExperimentalWarning` 可静音 |
| 大文件导入阻塞事件循环 | 20MB 上限 + 单事务；V2 改为流式/分片 |
| 中文搜索 LIKE 效率 | V1 数据量可接受；V4 换 FTS5 |
| 无认证被误暴露 | 默认绑定 `127.0.0.1`，README 显著警示 |
