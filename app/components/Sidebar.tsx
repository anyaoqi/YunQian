'use client';

import { useEffect, useState } from 'react';
import {
  Compass, Star, CircleDashed, Trash2, Folder, Plus, Pencil, X, ChevronRight,
  Settings2, Database, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import type { Collection, Stats, Tag } from '@/lib/types';
import { Logo } from './Logo';

const COLLAPSED_KEY = 'yunqian:collapsed-tree';

function loadCollapsed(): Set<number> {
  if (typeof window === 'undefined') return new Set();
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
  collapsed: boolean;
  onToggleCollapse: () => void;
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

type ContextMenuState = { x: number; y: number; collection: Collection };

function CollectionIcon({ collection }: { collection: Collection }) {
  if (collection.icon) return <span className="tree-icon" aria-hidden>{collection.icon}</span>;
  return <span className="tree-icon"><Folder aria-hidden /></span>;
}

function CollectionItem({ collection, depth, activeId, collapsed, onToggle, onCollection, onCreate, onRename, onDelete, onDropBookmark, onReorderCollection, onContextMenu, siblings }: {
  collection: Collection; depth: number; activeId: Props['collectionId']; collapsed: Set<number>;
  onToggle: (id: number) => void;
  onCollection: Props['onCollection']; onCreate: Props['onCreateCollection']; onRename: Props['onRenameCollection']; onDelete: Props['onDeleteCollection']; onDropBookmark?: Props['onDropBookmark']; onReorderCollection?: Props['onReorderCollection']; onContextMenu: (state: ContextMenuState) => void; siblings: Collection[];
}) {
  const hasChildren = collection.children.length > 0;
  const isCollapsed = collapsed.has(collection.id);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 把拖动的分类插入到当前分类之前,得到同层新顺序
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
      style={{ paddingLeft: 10 + depth * 15 }}
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
        ? <button className={`collapse-toggle ${isCollapsed ? '' : 'open'}`} onClick={(event) => { event.stopPropagation(); onToggle(collection.id); }} title={isCollapsed ? '展开' : '收起'} aria-label={isCollapsed ? '展开' : '收起'} aria-expanded={!isCollapsed}>
            <ChevronRight />
          </button>
        : <span className="collapse-toggle" aria-hidden />}
      <button className="tree-main" draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', `collection:${collection.id}`); event.dataTransfer.effectAllowed = 'move'; setDragging(true); }} onDragEnd={() => setDragging(false)} onClick={() => onCollection(collection.id)} onDoubleClick={() => onRename(collection)} onContextMenu={(event) => { event.preventDefault(); onContextMenu({ x: event.clientX, y: event.clientY, collection }); }} title="点击进入,双击编辑,拖拽排序">
        <CollectionIcon collection={collection} />
        <span className="tree-name">{collection.name}</span>
        <small>{collection.bookmarkCount}</small>
      </button>
      <span className="tree-actions">
        <button className="icon-btn" onClick={() => onCreate(collection.id)} title="新建子分类" aria-label="新建子分类"><Plus /></button>
        <button className="icon-btn" onClick={() => onRename(collection)} title="编辑分类" aria-label="编辑分类"><Pencil /></button>
        <button className="icon-btn danger" onClick={() => onDelete(collection)} title="删除分类" aria-label="删除分类"><X /></button>
      </span>
    </div>
    {!isCollapsed && collection.children.map((child) => <CollectionItem key={child.id} collection={child} depth={depth + 1} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onCollection={onCollection} onCreate={onCreate} onRename={onRename} onDelete={onDelete} onDropBookmark={onDropBookmark} onReorderCollection={onReorderCollection} onContextMenu={onContextMenu} siblings={collection.children} />)}
  </>;
}

export function Sidebar(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  // 右键菜单:点击页面其他位置或按 Esc 关闭
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const toggleCollapsed = (id: number) => setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const handleContextAction = (action: 'edit' | 'create' | 'delete') => {
    if (!contextMenu) return;
    const collection = contextMenu.collection;
    setContextMenu(null);
    if (action === 'edit') props.onRenameCollection(collection);
    else if (action === 'create') props.onCreateCollection(collection.id);
    else if (action === 'delete') props.onDeleteCollection(collection);
  };

  return <aside className="sidebar" aria-label="导航侧栏">
    <div className="brand">
      <Logo size={26} className="brand-mark" />
      <span className="brand-name">云签</span>
      <span className="brand-tag">YUNQIAN</span>
      <button type="button" className="icon-btn" onClick={props.onToggleCollapse} title={props.collapsed ? '展开侧栏' : '收起侧栏'} aria-label={props.collapsed ? '展开侧栏' : '收起侧栏'}>
        {props.collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </button>
    </div>
    <nav className="primary-nav" aria-label="书签筛选">
      <button className={!props.collectionId && !props.favorite && !props.tag && !props.trash ? 'active' : ''} onClick={() => props.onCollection()}><Compass aria-hidden /><span>全部书签</span><small>{props.stats?.bookmarks ?? 0}</small></button>
      <button className={props.favorite === 'true' ? 'active' : ''} onClick={() => props.onFavorite(props.favorite === 'true' ? undefined : 'true')}><Star aria-hidden /><span>星标收藏</span><small>{props.stats?.favorites ?? 0}</small></button>
      <button className={props.collectionId === 'none' ? 'active' : ''} onClick={() => props.onCollection('none')}><CircleDashed aria-hidden /><span>未分类</span><small>{props.stats?.uncategorized ?? 0}</small></button>
      <button className={props.trash ? 'active' : ''} onClick={() => props.onTrash()}><Trash2 aria-hidden /><span>回收站</span><small>{props.stats?.trashed ?? 0}</small></button>
    </nav>

    <section className="side-section collection-section">
      <div className="section-title">
        <button className="section-title-main" onClick={() => props.onCollection()} title="查看全部分类"><span>分类</span></button>
        <span className="section-count">{props.stats?.collections ?? 0}</span>
        <button className="icon-btn" onClick={() => props.onCreateCollection(null)} title="新建根分类"><Plus /></button>
      </div>
      <div className="collection-tree">
        {props.collections.length === 0 ? <p className="side-empty">还没有分类</p> : props.collections.map((collection) => <CollectionItem key={collection.id} collection={collection} depth={0} activeId={props.collectionId} collapsed={collapsed} onToggle={toggleCollapsed} onCollection={props.onCollection} onCreate={props.onCreateCollection} onRename={props.onRenameCollection} onDelete={props.onDeleteCollection} onDropBookmark={props.onDropBookmark} onReorderCollection={props.onReorderCollection} onContextMenu={setContextMenu} siblings={props.collections} />)}
      </div>
    </section>

    <section className="side-section tags-section">
      <div className="section-title">
        <span>标签</span>
        <span className="section-count">{props.stats?.tags ?? 0}</span>
        <button className="icon-btn" onClick={() => props.onManageTags()} title="管理标签"><Settings2 /></button>
      </div>
      <div className="tag-list">
        {props.tags.length === 0 ? <p className="side-empty">标签会在收藏时自动创建</p> : props.tags.map((tag) => <div className={`tag-row ${props.tag === tag.name ? 'active' : ''}`} key={tag.id}>
          <button className="tag-main" onClick={() => props.onTag(props.tag === tag.name ? undefined : tag.name)}><span className="tag-dot" style={{ background: tag.color ?? 'var(--line)' }} />{tag.name}<small>{tag.count}</small></button>
          <button className="icon-btn tag-delete" onClick={() => props.onDeleteTag(tag)} title="删除标签" aria-label={`删除标签 ${tag.name}`}><X /></button>
        </div>)}
      </div>
    </section>
    <div className="sidebar-note"><Database aria-hidden /><span>本地优先 · 数据保存在你的电脑</span></div>

    {contextMenu && (() => {
      const MENU_W = 180; const MENU_H = 150;
      const x = Math.min(contextMenu.x, window.innerWidth - MENU_W - 8);
      const y = Math.min(contextMenu.y, window.innerHeight - MENU_H - 8);
      return <ul className="context-menu" role="menu" style={{ left: Math.max(8, x), top: Math.max(8, y) }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <li><button role="menuitem" onClick={() => handleContextAction('edit')}><Pencil />编辑分类…</button></li>
        <li><button role="menuitem" onClick={() => handleContextAction('create')}><Plus />新建子分类…</button></li>
        <li className="divider" aria-hidden="true" />
        <li><button role="menuitem" className="danger" onClick={() => handleContextAction('delete')}><X />删除分类…</button></li>
      </ul>;
    })()}
  </aside>;
}
