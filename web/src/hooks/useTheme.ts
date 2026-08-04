import { useEffect, useState } from 'react';

const THEME_KEY = 'linknest:theme';
type Theme = 'light' | 'dark' | 'system';

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch { /* ignore */ }
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolveTheme(theme));
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }

    if (theme === 'system') {
      const listener = (event: MediaQueryListEvent) => {
        root.setAttribute('data-theme', event.matches ? 'dark' : 'light');
      };
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  return { theme, setTheme };
}
