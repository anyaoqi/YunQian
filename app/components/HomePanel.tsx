'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Telescope, ArrowUpRight, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Favicon, hostOf as domainOf } from './Favicon';
import type { Bookmark } from '@/lib/types';

type Props = {
  onVisit: (bookmark: Bookmark) => void;
  onAdd: () => void;
  onImport: () => void;
};

/** 星等:rank 1-2 → 1 等(最亮),依次递减 */
function magnitudeOf(rank: number): string {
  if (rank < 3) return 'mag-1';
  if (rank < 6) return 'mag-2';
  if (rank < 10) return 'mag-3';
  return 'mag-4';
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

export function HomePanel({ onVisit, onAdd, onImport }: Props) {
  const [popular, setPopular] = useState<Bookmark[]>([]);
  const [recent, setRecent] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      api.bookmarks({ sort: 'popular', page: 1, pageSize: 12 }),
      api.bookmarks({ sort: 'newest', page: 1, pageSize: 8 }),
    ]).then(([pop, rec]) => {
      if (!active) return;
      setPopular(pop.items);
      setRecent(rec.items);
      setLoading(false);
    }).catch((reason) => {
      // 加载失败要显式提示,不能伪装成「空数据」误导用户以为书签丢了
      if (!active) return;
      setLoadError(reason instanceof Error ? reason.message : '星图加载失败');
      setLoading(false);
    });
    return () => { active = false; };
  }, [retryKey]);

  if (loading) return <div className="content-state"><span className="loader" />正在绘制星图…</div>;

  if (loadError) return <div className="content-state empty-state">
    <div className="empty-mark"><AlertCircle aria-hidden /></div>
    <h2>星图暂时无法加载</h2>
    <p>{loadError}</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button type="button" className="button primary" onClick={() => setRetryKey((value) => value + 1)}>重试</button>
    </div>
  </div>;

  if (popular.length === 0 && recent.length === 0) return <div className="content-state empty-state">
    <div className="empty-mark"><Telescope aria-hidden /></div>
    <h2>这片夜空还没有星</h2>
    <p>导入浏览器已有的书签,或手动点亮第一颗。</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button type="button" className="button primary" onClick={onImport}>导入浏览器书签</button>
      <button type="button" className="button secondary" onClick={onAdd}>手动添加</button>
    </div>
  </div>;

  return <div className="home-panel">
    {popular.length > 0 && <section className="home-section" aria-label="高频站点">
      <div className="home-section-head">
        <h2>高频站点</h2>
        <span className="mono">按访问次数</span>
        <span className="magnitude-legend" title="星等 = 使用频率"><i /><i /><i /><i />星等</span>
      </div>
      <div className="star-field">
        <div className="home-grid">
          {popular.map((bookmark, rank) => (
            <motion.a
              key={bookmark.id}
              data-star-id={bookmark.id}
              className={`home-tile ${magnitudeOf(rank)}`}
              href={bookmark.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onVisit(bookmark)}
              title={bookmark.title || domainOf(bookmark.url)}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: rank * 0.05, ease: [0.2, 0, 0, 1] }}
            >
              <span className="home-tile-star"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
              <span className="home-tile-name">{bookmark.title || domainOf(bookmark.url)}</span>
              {bookmark.clickCount > 0 && <span className="home-tile-count"><ArrowUpRight aria-hidden />{bookmark.clickCount}</span>}
            </motion.a>
          ))}
        </div>
      </div>
    </section>}

    {recent.length > 0 && <section className="home-section" aria-label="最近添加">
      <div className="home-section-head">
        <h2>最近添加</h2>
        <span className="mono">观测日志</span>
      </div>
      <div className="log-panel">
        {recent.map((bookmark, index) => <a key={bookmark.id} className="log-row" href={bookmark.url} target="_blank" rel="noreferrer" onClick={() => onVisit(bookmark)} title={bookmark.title || domainOf(bookmark.url)}>
          <span className="log-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="log-icon"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
          <span className="log-body">
            <span className="log-title">{bookmark.title || domainOf(bookmark.url)}</span>
            <span className="log-domain">{domainOf(bookmark.url)}</span>
            {bookmark.description && <span className="log-desc">{bookmark.description}</span>}
          </span>
          <span className="log-date">{shortDate(bookmark.createdAt)}</span>
        </a>)}
      </div>
    </section>}
  </div>;
}
