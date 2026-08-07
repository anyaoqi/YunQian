# 分类树展开收起 + 书签图标多服务回退 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为左侧分类树增加展开/收起功能(localStorage 记忆),为书签图标增加前端多服务自动回退与首字母兜底。

**Architecture:** 纯前端改动,不动后端。展开/收起状态放在 `Sidebar` 组件内部(`collapsedIds: Set<number>`,记录"被收起"的节点),持久化到 `localStorage`。图标新增独立 `Favicon` 组件,按候选服务数组依次尝试,`onError` 递增索引,全部失败渲染域名首字母徽标。

**Tech Stack:** React 19 + TypeScript + Vite,样式位于单文件 `web/src/styles.css`。项目无测试框架,验证用 `pnpm typecheck`(web 工作区 `tsc -b`)加手动浏览器验收。

---

### Task 1: Sidebar 分类树展开/收起

**Files:**
- Modify: `web/src/components/Sidebar.tsx`(全部重写)
- Modify: `web/src/styles.css`

- [ ] **Step 1: 重写 `web/src/components/Sidebar.tsx`**

完整替换为以下代码:

```tsx
import { useEffect, useState } from 'react';
import type { Collection, Stats, Tag } from '../types';

const COLLAPSED_KEY = 'linknest:collapsed-tree';

function loadCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is number => typeof id === 'number'));
  } catch {
    return new Set();
  }
}

type Props = {
  collections: Collection[];
  tags: Tag[];
  stats: Stats | null;
  collectionId?: number | 'none';
  tag?: string;
  favorite?: 'true' | 'false';
  onCollection: (id?: number | 'none') => void;
  onTag: (name?: string) => void;
  onFavorite: (value?: 'true') => void;
  onCreateCollection: (parentId: number | null) => void;
  onRenameCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
  onDeleteTag: (tag: Tag) => void;
};

function CollectionItem({ collection, depth, activeId, collapsed, onToggle, onCollection, onCreate, onRename, onDelete }: {
  collection: Collection; depth: number; activeId: Props['collectionId']; collapsed: Set<number>;
  onToggle: (id: number) => void;
  onCollection: Props['onCollection']; onCreate: Props['onCreateCollection']; onRename: Props['onRenameCollection']; onDelete: Props['onDeleteCollection'];
}) {
  const hasChildren = collection.children.length > 0;
  const isCollapsed = collapsed.has(collection.id);
  return <>
    <div className={`tree-item ${activeId === collection.id ? 'active' : ''}`} style={{ paddingLeft: 12 + depth * 15 }}>
      <button className="collapse-toggle" onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(collection.id); }} title={hasChildren ? (isCollapsed ? '展开' : '收起') : undefined} aria-label={hasChildren ? (isCollapsed ? '展开' : '收起') : undefined}>
        {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
      </button>
      <button className="tree-main" onClick={() => onCollection(collection.id)} onDoubleClick={() => onRename(collection)} title="双击重命名">
        <span>{collection.icon ?? '📁'}</span><span className="tree-name">{collection.name}</span><small>{collection.bookmarkCount}</small>
      </button>
      <span className="tree-actions">
        <button onClick={() => onCreate(collection.id)} title="新建子分类">+</button>
        <button onClick={() => onDelete(collection)} title="删除分类">×</button>
      </span>
    </div>
    {!isCollapsed && collection.children.map((child) => <CollectionItem key={child.id} collection={child} depth={depth + 1} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onCollection={onCollection} onCreate={onCreate} onRename={onRename} onDelete={onDelete} />)}
  </>;
}

export function Sidebar(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);

  useEffect(() => {
    const known = new Set<number>();
    const collect = (list: Collection[]) => { for (const category of list) { known.add(category.id); collect(category.children); } };
    collect(props.collections);
    let changed = false;
    const next = new Set<number>();
    for (const id of collapsed) { if (known.has(id)) next.add(id); else changed = true; }
    if (changed) setCollapsed(next);
  }, [props.collections, collapsed]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch { /* 忽略存储失败 */ }
  }, [collapsed]);

  const toggleCollapsed = (id: number) => setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">⌘</span><span>LinkNest</span></div>
    <nav className="primary-nav" aria-label="书签筛选">
      <button className={!props.collectionId && !props.favorite && !props.tag ? 'active' : ''} onClick={() => { props.onCollection(); props.onFavorite(); props.onTag(); }}><span>◈</span>全部书签<small>{props.stats?.bookmarks ?? 0}</small></button>
      <button className={props.favorite === 'true' ? 'active' : ''} onClick={() => { props.onFavorite(props.favorite === 'true' ? undefined : 'true'); props.onCollection(); props.onTag(); }}><span>★</span>星标收藏<small>{props.stats?.favorites ?? 0}</small></button>
      <button className={props.collectionId === 'none' ? 'active' : ''} onClick={() => { props.onCollection('none'); props.onFavorite(); props.onTag(); }}><span>◌</span>未分类<small>{props.stats?.uncategorized ?? 0}</small></button>
    </nav>

    <section className="side-section collection-section">
      <div className="section-title"><span>分类</span><button onClick={() => props.onCreateCollection(null)} title="新建根分类">+</button></div>
      <div className="collection-tree">
        {props.collections.length === 0 ? <p className="side-empty">还没有分类</p> : props.collections.map((collection) => <CollectionItem key={collection.id} collection={collection} depth={0} activeId={props.collectionId} collapsed={collapsed} onToggle={toggleCollapsed} onCollection={props.onCollection} onCreate={props.onCreateCollection} onRename={props.onRenameCollection} onDelete={props.onDeleteCollection} />)}
      </div>
    </section>

    <section className="side-section tags-section">
      <div className="section-title"><span>标签</span><small>{props.stats?.tags ?? 0}</small></div>
      <div className="tag-list">
        {props.tags.length === 0 ? <p className="side-empty">标签会在收藏时自动创建</p> : props.tags.map((tag) => <div className={`tag-row ${props.tag === tag.name ? 'active' : ''}`} key={tag.id}>
          <button onClick={() => props.onTag(props.tag === tag.name ? undefined : tag.name)}><span className="tag-dot" style={{ background: tag.color ?? '#8b8fc7' }} />{tag.name}<small>{tag.count}</small></button>
          <button className="tag-delete" onClick={() => props.onDeleteTag(tag)} title="删除标签">×</button>
        </div>)}
      </div>
    </section>
    <div className="sidebar-note">本地优先 · 数据保存在你的电脑</div>
  </aside>;
}
```

关键点:
- 无子节点的分类渲染空的 `.collapse-toggle` 占位,保持行内对齐(图标列宽一致)。
- 箭头点击 `stopPropagation`,不会触发进入分类。
- 第一个 effect 清理已不存在的分类 id(防止 localStorage 残留);第二个 effect 持久化。
- 收起时子树整体不渲染(`!isCollapsed && children.map(...)`)。

- [ ] **Step 2: 在 `web/src/styles.css` 添加箭头样式**

在第 11 行 `.tree-actions` 相关规则所在行末尾追加(该文件为单行压缩格式,在 `.tree-item { ... }` 定义附近插入一条新行即可,推荐在第 11 行之后新增一行):

```css
.collapse-toggle { border: 0; background: transparent; color: #8d8fae; width: 14px; font-size: 10px; padding: 0; flex: 0 0 auto; line-height: 1; }.tree-item:hover .collapse-toggle { color: #d9daec; }
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --workspace @linknest/web run typecheck`
Expected: 无错误输出,退出码 0

- [ ] **Step 4: 手动验收**

Run: `pnpm dev`,打开 http://127.0.0.1:5173
- 有多级分类时,行首出现 `▸/▾` 箭头;点击箭头收起/展开子树
- 无子节点的分类箭头位置留空,行对齐正常
- 点击名称仍进入分类;双击仍重命名
- 收起后刷新页面,状态保持;删除分类后刷新,localStorage 无残留报错
- 新建分类默认展开

- [ ] **Step 5: 提交(执行前询问用户是否提交)**

```bash
git add web/src/components/Sidebar.tsx web/src/styles.css
git commit -m "feat: 分类树支持展开收起并记忆状态"
```

---

### Task 2: Favicon 组件与多服务回退

**Files:**
- Create: `web/src/components/Favicon.tsx`
- Modify: `web/src/components/BookmarkList.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: 创建 `web/src/components/Favicon.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const FALLBACK_SERVICES = [
  (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  (domain: string) => `https://icon.horse/icon/${domain}`,
  (domain: string) => `https://favicon.im/${domain}`,
];

export function Favicon({ faviconUrl, url }: { faviconUrl: string | null; url: string }) {
  const domain = useMemo(() => hostOf(url), [url]);
  const candidates = useMemo(() => {
    const list = faviconUrl ? [faviconUrl] : [];
    for (const make of FALLBACK_SERVICES) {
      const candidate = make(domain);
      if (!list.includes(candidate)) list.push(candidate);
    }
    return list;
  }, [faviconUrl, domain]);
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [candidates]);

  if (index >= candidates.length) {
    return <span className="favicon-fallback">{domain.charAt(0).toUpperCase()}</span>;
  }
  return <img src={candidates[index]} alt="" onError={() => setIndex((current) => current + 1)} />;
}
```

关键点:
- 候选顺序:数据库 `faviconUrl` → DuckDuckGo → icon.horse → favicon.im;去重避免死循环。
- `index >= candidates.length` 时停止渲染 `<img>`,避免 onError 无限触发。
- `candidates` 变化时重置 index(同一卡片复用组件时正确回退)。

- [ ] **Step 2: 修改 `web/src/components/BookmarkList.tsx`**

- 顶部 import 区新增:`import { Favicon } from './Favicon';`
- 将第 66 行:

```tsx
<div className="bookmark-icon">{bookmark.faviconUrl ? <img src={bookmark.faviconUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : '↗'}</div>
```

替换为:

```tsx
<div className="bookmark-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></div>
```

- [ ] **Step 3: 在 `web/src/styles.css` 添加兜底徽标样式**

在 `.bookmark-icon img { width: 20px; height: 20px; }` 所在行(第 15 行)追加同一条行内规则:

```css
.favicon-fallback { width: 20px; height: 20px; border-radius: 6px; background: #e6e6f2; color: #656785; font-size: 11px; font-weight: 600; display: grid; place-items: center; }
```

- [ ] **Step 4: 类型检查**

Run: `pnpm --workspace @linknest/web run typecheck`
Expected: 无错误输出,退出码 0

- [ ] **Step 5: 手动验收**

Run: `pnpm dev`,打开 http://127.0.0.1:5173
- 书签列表中图标正常显示(任一候选服务可用时显示真实图标)
- 断网或全部服务不可用时,显示域名首字母徽标,无控制台无限报错
- 原有布局(31px 图标容器、卡片对齐)不破坏

- [ ] **Step 6: 提交(执行前询问用户是否提交)**

```bash
git add web/src/components/Favicon.tsx web/src/components/BookmarkList.tsx web/src/styles.css
git commit -m "feat: 书签图标多服务回退与首字母兜底"
```

---

## 验收清单(全部完成后)

- [ ] `pnpm --workspace @linknest/web run typecheck` 通过
- [ ] `pnpm dev` 正常启动
- [ ] 分类树可展开/收起、刷新记忆、新建默认展开
- [ ] 书签图标回退链工作,兜底徽标显示
- [ ] 未改动任何后端文件(`git status` 仅显示 web 前端文件与 docs)
