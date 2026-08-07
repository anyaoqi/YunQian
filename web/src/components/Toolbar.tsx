import { useRef } from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { Sort } from '../types';

type Props = {
  query: string;
  sort: Sort;
  total: number;
  view: 'list' | 'grid' | 'home';
  showHomeToggle?: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (value: Sort) => void;
  onAdd: () => void;
  onImport: () => void;
  onViewChange?: (view: 'list' | 'grid' | 'home') => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
};

export function Toolbar({ query, sort, total, view, showHomeToggle, onQueryChange, onSortChange, onAdd, onImport, onViewChange, searchInputRef }: Props) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef || fallbackRef;
  return <header className="toolbar">
    <div className="search-wrap">
      <span>⌕</span>
      <input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索标题、网址、备注…" aria-label="搜索书签" />
      {query && <button className="clear-search" onClick={() => onQueryChange('')} aria-label="清空搜索">×</button>}
    </div>
    <div className="toolbar-right">
      <span className="result-count">{total} 条</span>
      <select value={sort} onChange={(event) => onSortChange(event.target.value as Sort)} aria-label="排序方式">
        <option value="newest">最近添加</option><option value="oldest">最早添加</option><option value="title">标题 A–Z</option><option value="popular">访问最多</option>
      </select>
      <div className="view-toggle">
        {showHomeToggle && <button className={view === 'home' ? 'active' : ''} onClick={() => onViewChange?.('home')} title="导航面板">⌂</button>}
        <button className={view === 'list' ? 'active' : ''} onClick={() => onViewChange?.('list')} title="列表视图">≣</button>
        <button className={view === 'grid' ? 'active' : ''} onClick={() => onViewChange?.('grid')} title="网格视图">▦</button>
      </div>
      <button className="button secondary" onClick={onImport}>⇧ 导入</button>
      <div className="export-menu">
        <a className="button secondary" href="/api/export">⇩ 导出 JSON</a>
        <a className="button secondary" href="/api/export?format=html" title="导出为浏览器可导入的 HTML">HTML</a>
      </div>
      <button className="button primary" onClick={onAdd}>+ 添加书签</button>
      <ThemeToggle />
    </div>
  </header>;
}
