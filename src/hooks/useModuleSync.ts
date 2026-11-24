'use client';

import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { syncModules } from '@/store/thunks';

/** Checking on every focus would hammer the server while someone flips between windows. */
export const MODULE_SYNC_MIN_GAP_MS = 30_000;

/**
 * When the browser tab comes back into view (the window gains focus or the tab becomes visible), check whether a superadmin
 * has changed which modules are on while it was away, and catch up if so. Checks are at least MODULE_SYNC_MIN_GAP_MS apart.
 * Mounted once, in AppLayout.
 */
export function useModuleSync() {
  const dispatch = useAppDispatch();
  const last = useRef(0);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - last.current < MODULE_SYNC_MIN_GAP_MS) return;
      last.current = now;
      void dispatch(syncModules());
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [dispatch]);
}
