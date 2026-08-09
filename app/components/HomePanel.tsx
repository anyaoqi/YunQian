'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Favicon, hostOf as domainOf } from './Favicon';
import { Logo } from './Logo';
import type { Bookmark } from '@/lib/types';

type Props = {
  onVisit: (bookmark: Bookmark) => void;
  onShowAll: () => void;
};

export function HomePanel({ onVisit, onShowAll }: Props) {
  const [popular, setPopular] = useState<Bookmark[]>([]);
  const [recent, setRecent] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.bookmarks({ sort: 'popular', page: 1, pageSize: 12 }),
      api.bookmarks({ sort: 'newest', page: 1, pageSize: 8 }),
    ]).then(([pop, rec]) => {
      if (!active) return;
      setPopular(pop.items);
      setRecent(rec.items);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="content-state"><span className="loader" />正在加载…</div>;
  if (popular.length === 0 && recent.length === 0) return <div className="content-state empty-state">
    <div className="empty-icon"><Logo size={36} /></div><h2>还没有收藏</h2><p>添加一个常用网址，或者导入浏览器已有的收藏。</p><button className="button primary" onClick={onShowAll}>+ 添加第一条书签</button>
  </div>;

  return <div className="home-panel">
    {popular.length > 0 && <section className="home-section">
      <div className="home-section-head"><h2>高频站点</h2><small>按访问次数排序</small></div>
      <div className="home-grid">
        {popular.map((bookmark) => <a key={bookmark.id} className="home-tile" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)} title={bookmark.title || domainOf(bookmark.url)}>
          <span className="home-tile-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
          <span className="home-tile-name">{bookmark.title || domainOf(bookmark.url)}</span>
          {bookmark.clickCount > 0 && <span className="home-tile-count">↗ {bookmark.clickCount}</span>}
        </a>)}
      </div>
    </section>}
    {recent.length > 0 && <section className="home-section">
      <div className="home-section-head"><h2>最近添加</h2><small>最新收藏</small></div>
      <div className="home-recent">
        {recent.map((bookmark) => <a key={bookmark.id} className="home-recent-item" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)} title={bookmark.title || domainOf(bookmark.url)}>
          <span className="home-recent-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
          <div className="home-recent-body">
            <span className="home-recent-title">{bookmark.title || domainOf(bookmark.url)}</span>
            <span className="home-recent-domain">{domainOf(bookmark.url)}</span>
          </div>
          {bookmark.description && <span className="home-recent-desc">{bookmark.description}</span>}
        </a>)}
      </div>
    </section>}
  </div>;
}
