import type { Collection, Stats, Tag } from '../types';

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

function CollectionItem({ collection, depth, activeId, onCollection, onCreate, onRename, onDelete }: {
  collection: Collection; depth: number; activeId: Props['collectionId']; onCollection: Props['onCollection'];
  onCreate: Props['onCreateCollection']; onRename: Props['onRenameCollection']; onDelete: Props['onDeleteCollection'];
}) {
  return <>
    <div className={`tree-item ${activeId === collection.id ? 'active' : ''}`} style={{ paddingLeft: 12 + depth * 15 }}>
      <button className="tree-main" onClick={() => onCollection(collection.id)} onDoubleClick={() => onRename(collection)} title="双击重命名">
        <span>{collection.icon ?? '📁'}</span><span className="tree-name">{collection.name}</span><small>{collection.bookmarkCount}</small>
      </button>
      <span className="tree-actions">
        <button onClick={() => onCreate(collection.id)} title="新建子分类">+</button>
        <button onClick={() => onDelete(collection)} title="删除分类">×</button>
      </span>
    </div>
    {collection.children.map((child) => <CollectionItem key={child.id} collection={child} depth={depth + 1} activeId={activeId} onCollection={onCollection} onCreate={onCreate} onRename={onRename} onDelete={onDelete} />)}
  </>;
}

export function Sidebar(props: Props) {
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
        {props.collections.length === 0 ? <p className="side-empty">还没有分类</p> : props.collections.map((collection) => <CollectionItem key={collection.id} collection={collection} depth={0} activeId={props.collectionId} onCollection={props.onCollection} onCreate={props.onCreateCollection} onRename={props.onRenameCollection} onDelete={props.onDeleteCollection} />)}
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
