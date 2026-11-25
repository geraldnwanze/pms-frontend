import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCaptchaConfig, loadTurnstile, resetCaptchaConfig } from './captcha';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { captchaConfig: vi.fn() } }));
import { api } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  resetCaptchaConfig();
  delete window.turnstile;
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove());
});
afterEach(() => { delete window.turnstile; });

describe('getCaptchaConfig', () => {
  it('asks the server once and remembers the answer for the rest of the page', async () => {
    vi.mocked(api.captchaConfig).mockResolvedValue({ enabled: true, siteKey: 'site' });

    const [a, b] = await Promise.all([getCaptchaConfig(), getCaptchaConfig()]);
    const c = await getCaptchaConfig();

    expect(a).toEqual({ enabled: true, siteKey: 'site' });
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(api.captchaConfig).toHaveBeenCalledTimes(1);
  });

  it('treats a settings request that fails as "off" (the server still refuses what it needs to)', async () => {
    vi.mocked(api.captchaConfig).mockRejectedValue(new Error('down'));

    expect(await getCaptchaConfig()).toEqual({ enabled: false, siteKey: null });
  });

  it('can be told to forget what it read', async () => {
    vi.mocked(api.captchaConfig).mockResolvedValueOnce({ enabled: false, siteKey: null }).mockResolvedValueOnce({ enabled: true, siteKey: 'site' });
    await getCaptchaConfig();

    resetCaptchaConfig();

    expect((await getCaptchaConfig()).enabled).toBe(true);
  });
});

describe('loadTurnstile', () => {
  const scripts = () => [...document.head.querySelectorAll<HTMLScriptElement>('script[src*="turnstile"]')];
  /** The loader remembers its script for the life of the page, so each test starts from a fresh copy of it. */
  async function freshLoader() {
    vi.resetModules();
    return (await import('./captcha')).loadTurnstile;
  }
  const widget = () => ({ render: vi.fn(), reset: vi.fn() });

  it('uses Cloudflare’s script if the page already has it, adding nothing', async () => {
    const loadTurnstile = await freshLoader();
    const g = { render: vi.fn(), reset: vi.fn() };
    window.turnstile = g;

    expect(await loadTurnstile()).toBe(g);
    expect(scripts()).toHaveLength(0);
  });

  it('adds the script once however many ask, and resolves when Cloudflare says it is ready', async () => {
    const loadTurnstile = await freshLoader();
    const first = loadTurnstile();
    const second = loadTurnstile();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    // Turnstile throws if its script tag carries async/defer and the page calls turnstile.ready(); the loader must not set either.
    expect(scripts()[0].hasAttribute('async')).toBe(false);
    expect(scripts()[0].hasAttribute('defer')).toBe(false);

    const g = widget();
    window.turnstile = g;
    scripts()[0].onload!(new Event('load'));

    expect(await first).toBe(g);
    expect(await second).toBe(g);
  });

  it('fails if the script loads but Cloudflare’s API did not start', async () => {
    const loadTurnstile = await freshLoader();
    const attempt = loadTurnstile();

    scripts()[0].onload!(new Event('load'));

    await expect(attempt).rejects.toThrow('did not start');
  });

  it('fails if the script cannot be loaded, removes it, and lets the next attempt start afresh', async () => {
    const loadTurnstile = await freshLoader();
    const attempt = loadTurnstile();
    scripts()[0].onerror!(new Event('error'));

    await expect(attempt).rejects.toThrow('could not be loaded');
    expect(scripts()).toHaveLength(0);

    const again = loadTurnstile();
    expect(scripts()).toHaveLength(1);                                  // a second try adds a new script
    window.turnstile = widget();
    scripts()[0].onload!(new Event('load'));
    await expect(again).resolves.toBeDefined();
  });
});
