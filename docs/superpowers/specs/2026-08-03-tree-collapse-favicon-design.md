# 设计文档:分类树展开收起 + 书签图标多服务回退

日期:2026-08-03
状态:已确认

## 1. 背景与目标

LinkNest V1 的两个体验问题:

1. **左侧分类树没有展开/收起功能**:`Sidebar.tsx` 中的 `CollectionItem` 递归渲染所有层级,一次性全部展开,分类多时难以浏览。需要支持手动收起/展开子分类。
2. **书签图标不显示**:后端 `lib/url.ts` 的 `faviconFor()` 生成 Google favicon 服务链接(`google.com/s2/favicons`)存入 `favicon_url`,但该服务在用户网络下无法访问,导致 `BookmarkList.tsx` 中的 `<img>` 加载失败,退化为 `↗` 符号。需要前端多服务自动回退。

目标:不改变后端数据结构和 API 契约,仅前端实现两个优化。

## 2. 功能一:分类树展开/收起

### 2.1 交互设计

- 有子节点的分类,行首显示展开箭头 `▸`(收起态)/ `▾`(展开态)。
- 点击箭头切换该节点的展开/收起;点击分类名称仍进入分类(现有行为不变)。
- 收起后,该节点的整棵子树不渲染。
- 默认状态:**全部展开**(与现状一致,不改变首次体验)。

### 2.2 状态管理

- 状态:`collapsedIds: Set<number>`,只记录"被收起"的节点 id;未记录的节点默认展开。
- 状态位置:放在 `Sidebar` 组件内部(仅此组件使用),通过 `useState<Set<number>>` 管理。
- 持久化:使用 `localStorage`,key 为 `linknest:collapsed-tree`(JSON 数组)。初始化时读取,变更时写入。
- 失效清理:当 `collections` 数据刷新后,过滤掉已不存在的 id(防御性,不强制)。

### 2.3 组件改造

`CollectionItem` 新增逻辑:

```
渲染顺序:
1. 判断 collection.children.length > 0
   - 有子节点:渲染箭头按钮(collapse-toggle),点击切换 collapsedIds
   - 无子节点:渲染占位空位(保持缩进对齐)
2. 若当前节点不在 collapsedIds 中,继续渲染 children 递归
3. 若在 collapsedIds 中,children 不渲染
```

箭头按钮需 `stopPropagation`,避免触发 `onCollection` 进入分类。

### 2.4 样式

- 新增 `.collapse-toggle` 类:透明按钮,`width: 14px`,点击区域友好,无子节点的占位元素宽度一致以对齐文本。
- 箭头旋转动画可选(`transform: rotate(90deg)` 过渡,简单实现)。

## 3. 功能二:书签图标多服务回退

### 3.1 方案

新增 `Favicon` 组件(`web/src/components/Favicon.tsx`),替换 `BookmarkList.tsx` 中第 66 行的图标渲染。

候选服务顺序(依次尝试,前一个失败后切下一个):

| 序号 | 来源 | URL 模板 |
| --- | --- | --- |
| 1 | 数据库 `faviconUrl`(现有值) | `bookmark.faviconUrl` |
| 2 | DuckDuckGo | `https://icons.duckduckgo.com/ip3/{域名}.ico` |
| 3 | icon.horse | `https://icon.horse/icon/{域名}` |
| 4 | favicon.im | `https://favicon.im/{域名}` |

- 候选列表去重(避免 `faviconUrl` 与某个模板相同导致死循环)。
- `img` 的 `onError` 递增候选索引,索引超出列表长度后停止渲染,显示兜底内容。
- 兜底内容:域名首字母大写,圆形/圆角背景(替代现有 `↗`),样式复用 `.bookmark-icon` 容器。
- 域名从 `bookmark.url` 解析(`domainOf` 现有逻辑提取 hostname)。

### 3.2 组件接口

```tsx
<Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} />
```

组件内部:
- `useMemo` 构建候选 URL 数组(依赖 `faviconUrl`、`url`)
- `useState<number>` 记录当前索引;`onError` 时 `setIdx(i => i + 1)`
- `idx >= candidates.length` 时渲染兜底徽标

### 3.3 样式

- `.favicon-fallback`:宽高 20px,圆角,背景 `#e6e6f2`,字体 11px 加粗,居中显示首字母。
- 与 `.bookmark-icon` 容器(31px 灰底)配合,视觉协调。

## 4. 不变项

- 后端:API、数据库结构、`faviconFor()` 逻辑均不改动。
- 前端数据流:类型、API 调用、过滤逻辑不变。
- `BookmarkDialog` 抓取标题逻辑不变(返回的 `faviconUrl` 照常存库,作为第一候选)。

## 5. 测试与验收

手动验收路径:

1. **展开/收起**:有多级分类时,点击箭头收起/展开子树;收起后子分类从侧栏消失;点击名称仍进入分类;刷新页面后状态保持;新分类默认展开。
2. **图标回退**:在无 Google 访问的网络下打开书签列表,图标依次尝试备选服务,最终显示域名首字母徽标(若全部服务不可用);有任一服务可用时显示真实图标。
3. **回归**:类型检查 `pnpm typecheck` 通过;`pnpm dev` 正常启动。

## 6. 涉及文件

| 文件 | 改动 |
| --- | --- |
| `web/src/components/Sidebar.tsx` | 展开/收起状态、箭头按钮、条件渲染 |
| `web/src/components/Favicon.tsx` | 新增组件 |
| `web/src/components/BookmarkList.tsx` | 替换图标渲染为 `<Favicon>` |
| `web/src/styles.css` | `.collapse-toggle`、`.favicon-fallback` 样式 |
