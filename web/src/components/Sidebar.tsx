import { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
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
  trash?: boolean;
  onCollection: (id?: number | 'none') => void;
  onTag: (name?: string) => void;
  onFavorite: (value?: 'true') => void;
  onTrash: () => void;
  onCreateCollection: (parentId: number | null) => void;
  onRenameCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
  onDeleteTag: (tag: Tag) => void;
  onManageTags: () => void;
  onDropBookmark?: (collectionId: number | null, bookmarkId: number) => void;
  onReorderCollection?: (parentId: number | null, orderedIds: number[]) => void;
};

function CollectionItem({ collection, depth, activeId, collapsed, onToggle, onCollection, onCreate, onRename, onDelete, onDropBookmark, onReorderCollection, siblings }: {
  collection: Collection; depth: number; activeId: Props['collectionId']; collapsed: Set<number>;
  onToggle: (id: number) => void;
  onCollection: Props['onCollection']; onCreate: Props['onCreateCollection']; onRename: Props['onRenameCollection']; onDelete: Props['onDeleteCollection']; onDropBookmark?: Props['onDropBookmark']; onReorderCollection?: Props['onReorderCollection']; siblings: Collection[];
}) {
  const hasChildren = collection.children.length > 0;
  const isCollapsed = collapsed.has(collection.id);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 把拖动的分类插入到当前分类之前，得到同层新顺序
  const computeReorder = (draggedId: number): number[] | null => {
    if (draggedId === collection.id) return null;
    const ordered = siblings.map((s) => s.id).filter((id) => id !== draggedId);
    const targetIndex = ordered.indexOf(collection.id);
    if (targetIndex === -1) return null;
    ordered.splice(targetIndex, 0, draggedId);
    return ordered;
  };
  return <>
    <div
      className={`tree-item drop-target ${activeId === collection.id ? 'active' : ''} ${dragOver ? 'drag-over' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ paddingLeft: 12 + depth * 15 }}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const data = event.dataTransfer.getData('text/plain');
        if (data.startsWith('collection:')) {
          const draggedId = Number(data.slice('collection:'.length));
          const ordered = computeReorder(draggedId);
          if (ordered && onReorderCollection) onReorderCollection(collection.parentId, ordered);
        } else {
          const bookmarkId = Number(data);
          if (bookmarkId && onDropBookmark) onDropBookmark(collection.id, bookmarkId);
        }
      }}
    >
      {hasChildren
        ? <button className="collapse-toggle" onClick={(event) => { event.stopPropagation(); onToggle(collection.id); }} title={isCollapsed ? '展开' : '收起'} aria-label={isCollapsed ? '展开' : '收起'} aria-expanded={!isCollapsed}>
          {isCollapsed ? '▸' : '▾'}
        </button>
        : <span className="collapse-toggle" />}
      <button className="tree-main" draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', `collection:${collection.id}`); event.dataTransfer.effectAllowed = 'move'; setDragging(true); }} onDragEnd={() => setDragging(false)} onClick={() => onCollection(collection.id)} onDoubleClick={() => onRename(collection)} title="双击重命名，拖拽排序">
        <span>{collection.icon ?? '📁'}</span><span className="tree-name">{collection.name}</span><small>{collection.bookmarkCount}</small>
      </button>
      <span className="tree-actions">
        <button onClick={() => onCreate(collection.id)} title="新建子分类">+</button>
        <button onClick={() => onDelete(collection)} title="删除分类">×</button>
      </span>
    </div>
    {!isCollapsed && collection.children.map((child) => <CollectionItem key={child.id} collection={child} depth={depth + 1} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onCollection={onCollection} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropBookmark={onDropBookmark} onReorderCollection={onReorderCollection} siblings={collection.children} />)}
  </>;
}

export function Sidebar(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (props.collections.length === 0) return;
    const known = new Set<number>();
    const collect = (list: Collection[]) => { for (const category of list) { known.add(category.id); collect(category.children); } };
    collect(props.collections);
    let changed = false;
    const next = new Set<number>();
    for (const id of collapsed) { if (known.has(id)) next.add(id); else changed = true; }
    if (changed) setCollapsed(next);
  }, [props.collections, collapsed]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch { }
  }, [collapsed]);

  const toggleCollapsed = (id: number) => setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">⌘</span><span>LinkNest</span></div>
    <div className="theme-toggle" title="切换主题">
      <span>{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️'}</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
        <option value="system">跟随系统</option>
      </select>
    </div>
    <nav className="primary-nav" aria-label="书签筛选">
      <button className={!props.collectionId && !props.favorite && !props.tag && !props.trash ? 'active' : ''} onClick={() => props.onCollection()}><span>◈</span>全部书签<small>{props.stats?.bookmarks ?? 0}</small></button>
      <button className={props.favorite === 'true' ? 'active' : ''} onClick={() => props.onFavorite(props.favorite === 'true' ? undefined : 'true')}><span>★</span>星标收藏<small>{props.stats?.favorites ?? 0}</small></button>
      <button className={props.collectionId === 'none' ? 'active' : ''} onClick={() => props.onCollection('none')}><span>◌</span>未分类<small>{props.stats?.uncategorized ?? 0}</small></button>
      <button className={props.trash ? 'active' : ''} onClick={() => props.onTrash()}><span>🗑</span>回收站<small>{props.stats?.trashed ?? 0}</small></button>
    </nav>

    <section className="side-section collection-section">
      <div className="section-title"><span>分类</span><button onClick={() => props.onCreateCollection(null)} title="新建根分类">+</button></div>
      <div className="collection-tree">
        {props.collections.length === 0 ? <p className="side-empty">还没有分类</p> : props.collections.map((collection) => <CollectionItem key={collection.id} collection={collection} depth={0} activeId={props.collectionId} collapsed={collapsed} onToggle={toggleCollapsed} onCollection={props.onCollection} onCreate={props.onCreateCollection} onRename={props.onRenameCollection} onDelete={props.onDeleteCollection} onDropBookmark={props.onDropBookmark} onReorderCollection={props.onReorderCollection} siblings={props.collections} />)}
      </div>
    </section>

    <section className="side-section tags-section">
      <div className="section-title"><span>标签</span><span><small>{props.stats?.tags ?? 0}</small><button onClick={() => props.onManageTags()} title="管理标签">⚙</button></span></div>
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
