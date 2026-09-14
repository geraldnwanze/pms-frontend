'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { pushToast } from '@/store/uiSlice';
import { uid } from '@/lib/format';
import { getPushState, enablePush, disablePush, pushSupported, type PushState } from '@/lib/push';

/**
 * Drives the "Browser push notifications" control: reports the current state and
 * exposes enable/disable actions (which prompt for permission and sync the
 * subscription to the API).
 */
export function usePushNotifications() {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<PushState>(pushSupported() ? 'default' : 'unsupported');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setState(await getPushState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'subscribed') {
        dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Push notifications enabled on this device.' }));
      } else if (next === 'denied') {
        dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Notifications are blocked in your browser settings.' }));
      }
    } catch {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Could not enable push notifications.' }));
    } finally {
      setBusy(false);
    }
  }, [dispatch]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      setState(await disablePush());
      dispatch(pushToast({ id: uid('t'), kind: 'info', message: 'Push notifications turned off on this device.' }));
    } finally {
      setBusy(false);
    }
  }, [dispatch]);

  return {
    supported: state !== 'unsupported',
    denied: state === 'denied',
    subscribed: state === 'subscribed',
    state,
    busy,
    enable,
    disable,
    refresh,
  };
}
