// ============================================================================
// Web Push helpers: service-worker registration + PushManager subscribe/unsub,
// synced to the Laravel backend (/push/subscriptions).
// ============================================================================

import { api } from '@/lib/api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const SW_URL = '/sw.js';

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'unsubscribed';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL);
}

function serialize(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

/** Current state without prompting or mutating anything. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) return 'subscribed';
  } catch {
    /* ignore */
  }
  return Notification.permission === 'granted' ? 'unsubscribed' : 'default';
}

/** Prompt for permission (if needed), subscribe, and register with the API. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const reg = await registration();
  await navigator.serviceWorker.ready;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await api.savePushSubscription(serialize(sub));
  return 'subscribed';
}

/** Unsubscribe on this device and tell the API to forget it. */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await api.deletePushSubscription(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
  return getPushState();
}

/** Best-effort cleanup used on sign-out (before the token is cleared). */
export async function teardownPush(): Promise<void> {
  await disablePush().catch(() => {});
}
