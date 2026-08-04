type Props = {
  count: number;
  total: number;
  onMove: () => void;
  onTags: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: () => void;
};

export function BatchActionBar({ count, total, onMove, onTags, onDelete, onClear, onSelectAll }: Props) {
  if (count === 0) return null;
  return <div className="batch-action-bar">
    <span>已选 <b>{count}</b> / {total} 项</span>
    <div className="batch-actions">
      <button className="button secondary" onClick={onSelectAll}>全选</button>
      <button className="button secondary" onClick={onMove}>移动到</button>
      <button className="button secondary" onClick={onTags}>加标签</button>
      <button className="button danger" onClick={onDelete}>删除</button>
      <button className="button secondary" onClick={onClear}>取消</button>
    </div>
  </div>;
}
