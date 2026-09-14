'use client';

import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';

/**
 * Client-side app shell: mounts the Redux store and keeps the `.dark` class on
 * <html> in sync with the stored theme preference and the OS setting (this is
 * the wiring that lived in the Vite `main.tsx`).
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const { theme } = store.getState().ui;
      const isDark = theme === 'dark' || (theme === 'system' && prefersDark.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    applyTheme();
    const unsubscribe = store.subscribe(applyTheme);
    prefersDark.addEventListener('change', applyTheme);
    return () => {
      unsubscribe();
      prefersDark.removeEventListener('change', applyTheme);
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
}
