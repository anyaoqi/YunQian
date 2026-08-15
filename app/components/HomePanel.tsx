'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Telescope, ArrowUpRight } from 'lucide-react';
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

type ConstellationLine = { x1: number; y1: number; x2: number; y2: number };

export function HomePanel({ onVisit, onAdd, onImport }: Props) {
  const [popular, setPopular] = useState<Bookmark[]>([]);
  const [recent, setRecent] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [lines, setLines] = useState<ConstellationLine[]>([]);
  const [drawn, setDrawn] = useState(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

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

  // 星座连线:hover 一颗星,连出同分类的星
  const constellationIds = useMemo(() => {
    if (hoveredId == null) return null;
    const hovered = popular.find((b) => b.id === hoveredId);
    if (!hovered || hovered.collectionId == null) return null;
    const ids = popular
      .filter((b) => b.collectionId === hovered.collectionId && b.id !== hovered.id)
      .map((b) => b.id);
    return ids.length > 0 ? new Set([hoveredId, ...ids]) : null;
  }, [hoveredId, popular]);

  useEffect(() => {
    if (!constellationIds || !fieldRef.current) { setLines([]); setDrawn(false); return; }
    const field = fieldRef.current;
    const centerOf = (element: HTMLElement | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      return { x: rect.left - fieldRect.left + rect.width / 2, y: rect.top - fieldRect.top + rect.height / 2 };
    };
    const hub = centerOf(field.querySelector<HTMLElement>(`[data-star-id="${hoveredId}"]`));
    if (!hub) { setLines([]); return; }
    const next: ConstellationLine[] = [];
    for (const id of constellationIds) {
      if (id === hoveredId) continue;
      const point = centerOf(field.querySelector<HTMLElement>(`[data-star-id="${id}"]`));
      if (point) next.push({ x1: hub.x, y1: hub.y, x2: point.x, y2: point.y });
    }
    setLines(next);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [constellationIds, hoveredId]);

  if (loading) return <div className="content-state"><span className="loader" />正在绘制星图…</div>;

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
      <div
        className="star-field"
        ref={fieldRef}
        onMouseLeave={() => { setHoveredId(null); }}
      >
        <AnimatePresence>
          {lines.length > 0 && (
            <motion.svg
              className={`star-field-svg ${drawn && !reduceMotion ? 'animate' : ''}`}
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {lines.map((line, i) => <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
            </motion.svg>
          )}
        </AnimatePresence>
        <div className="home-grid">
          {popular.map((bookmark, rank) => {
            const inConstellation = constellationIds?.has(bookmark.id) ?? false;
            return <motion.a
              key={bookmark.id}
              data-star-id={bookmark.id}
              className={`home-tile ${magnitudeOf(rank)} ${inConstellation ? 'constellation' : ''} ${constellationIds && !inConstellation ? 'dimmed' : ''}`}
              href={bookmark.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onVisit(bookmark)}
              title={bookmark.title || domainOf(bookmark.url)}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.32, delay: rank * 0.05, ease: [0.2, 0, 0, 1] }}
              onMouseEnter={() => setHoveredId(bookmark.id)}
            >
              <span className="home-tile-star"><Favicon faviconUrl={bookmark.faviconUrl} url={bookmark.url} /></span>
              <span className="home-tile-name">{bookmark.title || domainOf(bookmark.url)}</span>
              {bookmark.clickCount > 0 && <span className="home-tile-count"><ArrowUpRight aria-hidden />{bookmark.clickCount}</span>}
            </motion.a>;
          })}
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
