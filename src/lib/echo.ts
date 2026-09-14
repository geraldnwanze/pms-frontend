// ============================================================================
// Laravel Echo <-> Reverb client for real-time notifications.
//
// A single Echo connection per authenticated session. It is rebuilt when the
// bearer token changes (account switch) and torn down on sign-out. Channel auth
// rides the Sanctum token via the `/api/v1/broadcasting/auth` endpoint.
// ============================================================================

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');
const KEY = process.env.NEXT_PUBLIC_REVERB_APP_KEY ?? '';
const HOST = process.env.NEXT_PUBLIC_REVERB_HOST ?? 'localhost';
const PORT = Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080);
const SCHEME = process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'http';

// laravel-echo expects Pusher on the global scope.
type WithPusher = typeof globalThis & { Pusher?: typeof Pusher };
if (typeof window !== 'undefined') {
  (window as WithPusher).Pusher = Pusher;
}

type ReverbEcho = Echo<'reverb'>;

let instance: ReverbEcho | null = null;
let boundToken: string | null = null;

/** Whether real-time is configured at all (key present, browser context). */
export function realtimeEnabled(): boolean {
  return typeof window !== 'undefined' && KEY.length > 0;
}

/** Get (or lazily (re)create) the Echo client bound to the given bearer token. */
export function getEcho(token: string): ReverbEcho | null {
  if (!realtimeEnabled()) return null;
  if (instance && boundToken === token) return instance;
  if (instance) teardownEcho();

  boundToken = token;
  instance = new Echo({
    broadcaster: 'reverb',
    key: KEY,
    wsHost: HOST,
    wsPort: PORT,
    wssPort: PORT,
    forceTLS: SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${API_URL}/broadcasting/auth`,
    auth: { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  });

  return instance;
}

/** Disconnect and drop the client (called on sign-out / token change). */
export function teardownEcho(): void {
  try {
    instance?.disconnect();
  } catch {
    /* ignore */
  }
  instance = null;
  boundToken = null;
}
