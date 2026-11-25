import { api } from '@/lib/api';

/**
 * The "I'm not a robot" challenge (Cloudflare Turnstile). Whether it is on, and its public key, come from the server
 * (GET /auth/captcha), so switching it on or changing keys is a server setting, never a rebuild of this app.
 */
export interface CaptchaConfig {
  enabled: boolean;
  siteKey: string | null;
}

export interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme?: 'light' | 'dark';
    callback: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
  }) => string | undefined;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let configPromise: Promise<CaptchaConfig> | null = null;

/** The server's challenge settings, asked for once per page load. If they cannot be read, assume off: the server refuses what it needs to. */
export function getCaptchaConfig(): Promise<CaptchaConfig> {
  configPromise ??= Promise.resolve()
    .then(() => api.captchaConfig())
    .catch(() => ({ enabled: false, siteKey: null } as CaptchaConfig));
  return configPromise;
}

/** Forget what was read (tests, and after a deploy changed the settings). */
export function resetCaptchaConfig(): void {
  configPromise = null;
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Load Cloudflare's script once and resolve when its widget API is ready. A failed load can be retried. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    // Deliberately no async/defer and no turnstile.ready(): Turnstile throws if the two meet. Waiting for onload is enough with explicit rendering.
    script.onload = () => {
      const g = window.turnstile;
      if (g?.render) resolve(g);
      else reject(new Error('Turnstile did not start'));
    };
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Turnstile could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
