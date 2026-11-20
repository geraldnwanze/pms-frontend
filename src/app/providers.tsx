'use client';

import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { ToastHost } from '@/components/layout/ToastHost';

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

  // ToastHost lives here, not in the app layout, so pages outside it (sign-in, register, password reset) can show errors too.
  return (
    <Provider store={store}>
      {children}
      <ToastHost />
    </Provider>
  );
}
