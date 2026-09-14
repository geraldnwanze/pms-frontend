'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { fetchNotifications } from '@/store/thunks';
import { pushToast } from '@/store/uiSlice';
import { getEcho, teardownEcho, realtimeEnabled } from '@/lib/echo';
import { uid } from '@/lib/format';
import type { AppNotification } from '@/types';

const POLL_MS = 60_000;
const EVENT = '.NotificationCreated';

/**
 * Live notification delivery. Subscribes the signed-in user to their Reverb
 * channels (user / tenant-record / role / global) and prepends anything that
 * arrives; a 60s poll of GET /notifications backs it up so nothing missed
 * while offline is lost. Mounted once, in AppLayout.
 */
export function useRealtimeNotifications() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const token = useAppSelector((s) => s.auth.token);
  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const tenantId = user?.tenantId ?? null;

  // Poll fallback.
  useEffect(() => {
    if (!token || !userId) return;
    void dispatch(fetchNotifications());
    const poll = setInterval(() => void dispatch(fetchNotifications()), POLL_MS);
    return () => clearInterval(poll);
  }, [dispatch, token, userId]);

  // Real-time subscription.
  useEffect(() => {
    if (!token || !userId || !role || !realtimeEnabled()) return;

    const echo = getEcho(token);
    if (!echo) return;

    const channels = [
      `notifications.user.${userId}`,
      `notifications.role.${role}`,
      'notifications.all',
      ...(tenantId ? [`notifications.user.${tenantId}`] : []),
    ];

    const onCreated = (payload: AppNotification) => {
      dispatch(dataActions.receiveNotification(payload));
      dispatch(pushToast({ id: uid('t'), kind: 'info', message: payload.title }));
    };

    for (const name of channels) {
      echo.private(name).listen(EVENT, onCreated);
    }

    return () => {
      for (const name of channels) {
        echo.private(name).stopListening(EVENT, onCreated);
      }
    };
  }, [dispatch, token, userId, role, tenantId]);

  // Drop the socket entirely when the session ends.
  useEffect(() => {
    if (!token) teardownEcho();
  }, [token]);
}
