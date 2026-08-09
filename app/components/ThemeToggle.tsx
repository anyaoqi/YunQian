'use client';

import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      className={`theme-switch ${isDark ? 'dark' : 'light'}`}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '切换为浅色' : '切换为深色'}
      aria-label={isDark ? '切换为浅色' : '切换为深色'}
    >
      <span className="theme-switch-thumb">{isDark ? '🌙' : '☀️'}</span>
    </button>
  );
}
