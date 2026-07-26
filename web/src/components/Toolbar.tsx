import type { Sort } from '../types';

type Props = {
  query: string;
  sort: Sort;
  total: number;
  onQueryChange: (value: string) => void;
  onSortChange: (value: Sort) => void;
  onAdd: () => void;
  onImport: () => void;
};

export function Toolbar({ query, sort, total, onQueryChange, onSortChange, onAdd, onImport }: Props) {
  return <header className="toolbar">
    <div className="search-wrap">
      <span>⌕</span>
      <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索标题、网址、备注…" aria-label="搜索书签" />
      {query && <button className="clear-search" onClick={() => onQueryChange('')} aria-label="清空搜索">×</button>}
    </div>
    <div className="toolbar-right">
      <span className="result-count">{total} 条</span>
      <select value={sort} onChange={(event) => onSortChange(event.target.value as Sort)} aria-label="排序方式">
        <option value="newest">最近添加</option><option value="oldest">最早添加</option><option value="title">标题 A–Z</option><option value="popular">访问最多</option>
      </select>
      <button className="button secondary" onClick={onImport}>⇧ 导入</button>
      <a className="button secondary" href="/api/export">⇩ 导出</a>
      <button className="button primary" onClick={onAdd}>+ 添加书签</button>
    </div>
  </header>;
}
