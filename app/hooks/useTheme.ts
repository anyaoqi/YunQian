'use client';

import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'yunqian:theme';
type Theme = 'light' | 'dark';

function resolveTheme(): Theme {
  // layout 内联脚本在首帧前已写入 data-theme,客户端优先读取(避免闪色)
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 模块级单一数据源:命令面板、工具栏等多个 useTheme 实例共享同一主题状态,
 * 任一处切换时通过订阅通知其余实例,避免图标/状态滞留。
 */
// eslint-disable-next-line no-var
var currentTheme: Theme | null = null;
const listeners = new Set<() => void>();

function getTheme(): Theme {
  if (currentTheme === null) currentTheme = resolveTheme();
  return currentTheme;
}

function applyTheme(next: Theme): void {
  currentTheme = next;
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  for (const listener of listeners) listener();
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    const listener = () => setThemeState(getTheme());
    listeners.add(listener);
    // 其他标签页切换主题时同步本页
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        currentTheme = event.newValue;
        setThemeState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme | ((prev: Theme) => Theme)) => {
    const value = typeof next === 'function' ? next(getTheme()) : next;
    applyTheme(value);
  }, []);

  return { theme, setTheme };
}
