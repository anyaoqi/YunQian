'use client';

import { useRef } from 'react';
import { Search, X, House, List, LayoutGrid, Upload, Download, Plus, Menu } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import type { Sort } from '@/lib/types';

type Props = {
  query: string;
  sort: Sort;
  view: 'list' | 'grid' | 'home';
  showHomeToggle?: boolean;
  showViewToggle?: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (value: Sort) => void;
  onAdd: () => void;
  onImport: () => void;
  onOpenPalette: () => void;
  onViewChange?: (view: 'list' | 'grid' | 'home') => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onToggleSidebar?: () => void;
};

export function Toolbar({ query, sort, view, showHomeToggle, showViewToggle = true, onQueryChange, onSortChange, onAdd, onImport, onOpenPalette, onViewChange, searchInputRef, onToggleSidebar }: Props) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef || fallbackRef;
  return <header className="toolbar">
    {onToggleSidebar && <button type="button" className="icon-btn toolbar-menu-btn" onClick={onToggleSidebar} aria-label="打开导航菜单"><Menu aria-hidden /></button>}
    <div className="search-wrap">
      <Search aria-hidden />
      <input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索标题、网址、备注…" aria-label="搜索书签" />
      {query
        ? <button type="button" className="icon-btn" onClick={() => onQueryChange('')} aria-label="清空搜索"><X /></button>
        : <button type="button" className="kbd" onClick={onOpenPalette} title="命令面板" aria-label="打开命令面板">Ctrl K</button>}
    </div>
    <div className="toolbar-right">
      <select className="select" value={sort} onChange={(event) => onSortChange(event.target.value as Sort)} aria-label="排序方式">
        <option value="newest">最近添加</option><option value="oldest">最早添加</option><option value="title">标题 A–Z</option><option value="popular">访问最多</option>
      </select>
      {(showHomeToggle || showViewToggle) && <div className="view-toggle" role="group" aria-label="视图切换">
        {showHomeToggle && <button className={view === 'home' ? 'active' : ''} onClick={() => onViewChange?.('home')} title="星图导航" aria-label="星图导航视图"><House aria-hidden /></button>}
        {showViewToggle && <>
          <button className={view === 'list' ? 'active' : ''} onClick={() => onViewChange?.('list')} title="列表视图" aria-label="列表视图"><List aria-hidden /></button>
          <button className={view === 'grid' ? 'active' : ''} onClick={() => onViewChange?.('grid')} title="网格视图" aria-label="网格视图"><LayoutGrid aria-hidden /></button>
        </>}
      </div>}
      <button type="button" className="button secondary" onClick={onImport}><Upload aria-hidden />导入</button>
      <div className="export-group">
        <a className="button secondary" href="/api/export?format=html" title="导出为浏览器可导入的 HTML">HTML</a>
        <a className="button secondary" href="/api/export"><Download aria-hidden />导出</a>
      </div>
      <ThemeToggle />
      <button type="button" className="button primary" onClick={onAdd}><Plus aria-hidden />添加书签</button>
    </div>
  </header>;
}
