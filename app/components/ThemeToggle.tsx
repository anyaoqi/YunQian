'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '切换为浅色 · 坐标纸' : '切换为深色 · 夜空'}
      aria-label={isDark ? '切换为浅色' : '切换为深色'}
      suppressHydrationWarning
    >
      <Sun className="theme-icon-sun" aria-hidden />
      <Moon className="theme-icon-moon" aria-hidden />
    </button>
  );
}
