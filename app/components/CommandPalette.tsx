'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Plus, Upload, Star, Trash2, Compass, Moon, Sun, FolderOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { hostOf } from './Favicon';
import type { Bookmark, Collection } from '@/lib/types';

type Props = {
  open: boolean;
  collections: Collection[];
  onClose: () => void;
  onAdd: () => void;
  onImport: () => void;
  onAll: () => void;
  onFavorites: () => void;
  onTrash: () => void;
  onCollection: (id: number) => void;
  onVisit: (bookmark: Bookmark) => void;
};

type Item =
  | { kind: 'action'; id: string; label: string; icon: React.ReactNode; run: () => void }
  | { kind: 'bookmark'; id: number; label: string; domain: string; url: string; bookmark: Bookmark }
  | { kind: 'collection'; id: number; label: string; icon: React.ReactNode; run: () => void };

export function CommandPalette(props: Props) {
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.open) { setQuery(''); setBookmarks([]); setIndex(0); }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open || !query.trim()) { setBookmarks([]); return; }
    const timer = window.setTimeout(() => {
      api.bookmarks({ q: query.trim(), sort: 'popular', page: 1, pageSize: 8 })
        .then((result) => setBookmarks(result.items))
        .catch(() => setBookmarks([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, props.open]);

  const close = props.onClose;
  const { onAdd, onImport, onAll, onFavorites, onTrash, onCollection, onVisit } = props;

  const items = useMemo<Item[]>(() => {
    const keyword = query.trim().toLowerCase();
    const allActions: Item[] = [
      { kind: 'action', id: 'add', label: '添加书签', icon: <Plus />, run: () => { close(); onAdd(); } },
      { kind: 'action', id: 'import', label: '导入书签', icon: <Upload />, run: () => { close(); onImport(); } },
      { kind: 'action', id: 'all', label: '全部书签', icon: <Compass />, run: () => { close(); onAll(); } },
      { kind: 'action', id: 'favorites', label: '星标收藏', icon: <Star />, run: () => { close(); onFavorites(); } },
      { kind: 'action', id: 'trash', label: '回收站', icon: <Trash2 />, run: () => { close(); onTrash(); } },
      {
        kind: 'action',
        id: 'theme',
        label: theme === 'dark' ? '切换为浅色(坐标纸)' : '切换为深色(夜空)',
        icon: theme === 'dark' ? <Sun /> : <Moon />,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    const actions = allActions.filter((action) => !keyword || action.label.toLowerCase().includes(keyword));

    const collections: Item[] = props.collections
      .flatMap((top) => [top, ...top.children])
      .filter((collection) => !keyword || collection.name.toLowerCase().includes(keyword))
      .slice(0, 5)
      .map((collection) => ({
        kind: 'collection' as const,
        id: collection.id,
        label: collection.name,
        icon: <FolderOpen />,
        run: () => { close(); onCollection(collection.id); },
      }));

    const bookmarkItems: Item[] = bookmarks.map((bookmark) => ({
      kind: 'bookmark',
      id: bookmark.id,
      label: bookmark.title || hostOf(bookmark.url),
      domain: hostOf(bookmark.url),
      url: bookmark.url,
      bookmark,
    }));

    return [...bookmarkItems, ...collections, ...actions];
  }, [query, bookmarks, props.collections, theme, setTheme, close, onAdd, onImport, onAll, onFavorites, onTrash, onCollection]);

  useEffect(() => { setIndex(0); }, [items.length, query]);

  useEffect(() => {
    if (!props.open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((current) => Math.min(current + 1, items.length - 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((current) => Math.max(current - 1, 0)); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        const item = items[index];
        if (!item) return;
        if (item.kind === 'bookmark') {
          onVisit(item.bookmark);
          window.open(item.url, '_blank', 'noreferrer');
          close();
        } else item.run();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [props.open, items, index, close, onVisit]);

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const groups: Array<{ label: string; items: Item[] }> = [];
  const bookmarkItems = items.filter((item) => item.kind === 'bookmark');
  const collectionItems = items.filter((item) => item.kind === 'collection');
  const actionItems = items.filter((item) => item.kind === 'action');
  if (bookmarkItems.length > 0) groups.push({ label: '书签', items: bookmarkItems });
  if (collectionItems.length > 0) groups.push({ label: '分类', items: collectionItems });
  if (actionItems.length > 0) groups.push({ label: '操作', items: actionItems });

  let cursor = -1;

  return <AnimatePresence>
    {props.open && (
      <motion.div
        className="cmdk-backdrop"
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14, ease: 'linear' }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
      >
        <motion.div
          className="cmdk"
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          initial={{ opacity: 0, scale: 0.985, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: -4 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        >
          <div className="cmdk-input-row">
            <Search />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索书签、跳转分类、执行操作…"
              aria-label="命令面板搜索"
            />
          </div>
          <div className="cmdk-list" ref={listRef}>
            {groups.length === 0 && <div className="cmdk-empty">没有匹配的结果</div>}
            {groups.map((group) => <div key={group.label}>
              <div className="cmdk-group-label">{group.label}</div>
              {group.items.map((item) => {
                cursor += 1;
                const selected = cursor === index;
                return <button
                  key={`${item.kind}-${item.id}`}
                  className={`cmdk-item ${selected ? 'selected' : ''}`}
                  data-selected={selected}
                  tabIndex={-1}
                  onMouseEnter={() => setIndex(items.indexOf(item))}
                  onClick={() => {
                    if (item.kind === 'bookmark') {
                      props.onVisit(item.bookmark);
                      window.open(item.url, '_blank', 'noreferrer');
                      close();
                    } else item.run();
                  }}
                >
                  {item.kind === 'bookmark' ? <Compass /> : item.icon}
                  <span>{item.label}</span>
                  {item.kind === 'bookmark' && <span className="cmdk-domain">{item.domain}</span>}
                </button>;
              })}
            </div>)}
          </div>
          <div className="cmdk-foot">
            <span><span className="kbd">↑</span><span className="kbd">↓</span> 选择</span>
            <span><span className="kbd">↵</span> 打开</span>
            <span><span className="kbd">esc</span> 关闭</span>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>;
}
