'use client';

import { useEffect } from 'react';

type Shortcuts = {
  onNew: () => void;
  onSearch: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (document.querySelector('.modal-backdrop')) return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault();
          shortcuts.onNew();
          break;
        case '/':
          event.preventDefault();
          shortcuts.onSearch();
          break;
        case 'e':
        case 'E':
          event.preventDefault();
          shortcuts.onEdit();
          break;
        case 'Delete':
          event.preventDefault();
          shortcuts.onDelete();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts.onNew, shortcuts.onSearch, shortcuts.onEdit, shortcuts.onDelete]);
}
