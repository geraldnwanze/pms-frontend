import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiFetch, authToken, setAuthToken, setModuleOffHandler, setUnauthorizedHandler } from './api';

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

describe('apiFetch', () => {
  beforeEach(() => { setUnauthorizedHandler(null); setModuleOffHandler(null); });
  afterEach(() => { setUnauthorizedHandler(null); setModuleOffHandler(null); });

  it('unwraps the {data,message,meta} envelope', async () => {
    vi.stubGlobal('fetch', reply(200, { data: { id: 1 }, message: 'ok', meta: { page: 2 } }));
    expect(await apiFetch('/things')).toEqual({ data: { id: 1 }, message: 'ok', meta: { page: 2 } });
  });

  it('sends the stored bearer token, and an explicit token wins', async () => {
    setAuthToken('stored');
    const f = reply(200, { data: null });
    vi.stubGlobal('fetch', f);
    await apiFetch('/me');
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer stored' });
    await apiFetch('/me', { token: 'explicit' });
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer explicit' });
    await apiFetch('/login', { token: null });
    expect((f.mock.calls[2] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Authorization');
  });

  it('JSON-encodes bodies and skips empty query values', async () => {
    const f = reply(200, { data: null });
    vi.stubGlobal('fetch', f);
    await apiFetch('/x', { method: 'POST', body: { a: 1 }, query: { q: 'hi', empty: '', none: undefined, n: 0, flag: false } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/x?');
    const qs = new URL(url).searchParams;
    expect([...qs.keys()].sort()).toEqual(['flag', 'n', 'q']);
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('turns a 422 into an ApiError carrying the field errors', async () => {
    vi.stubGlobal('fetch', reply(422, { message: 'Invalid', errors: { email: ['Taken'] } }));
    const err = await apiFetch('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, message: 'Invalid', errors: { email: ['Taken'] } });
  });

  it('calls the unauthorized handler on 401 only', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', reply(403, { message: 'Nope' }));
    await apiFetch('/x').catch(() => {});
    expect(handler).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', reply(401, { message: 'Unauthenticated.' }));
    await apiFetch('/x').catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('tells the module-off handler which module refused a request, and still throws the error', async () => {
    const handler = vi.fn();
    setModuleOffHandler(handler);
    vi.stubGlobal('fetch', reply(403, { message: 'The Utilities & meters module is turned off.', errors: null, module: 'utilities' }));

    const err = await apiFetch('/meters').catch((e) => e);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('utilities', 'The Utilities & meters module is turned off.');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, message: 'The Utilities & meters module is turned off.' });
  });

  it('does not call the module-off handler for any other refusal', async () => {
    const handler = vi.fn();
    setModuleOffHandler(handler);

    vi.stubGlobal('fetch', reply(403, { message: 'This action is unauthorized.', errors: null }));
    await apiFetch('/x').catch(() => {});
    vi.stubGlobal('fetch', reply(404, { message: 'Not found', module: 'utilities' }));       // only a 403 means "turned off"
    await apiFetch('/x').catch(() => {});
    vi.stubGlobal('fetch', reply(422, { message: 'Invalid', errors: { a: ['b'] } }));
    await apiFetch('/x').catch(() => {});
    vi.stubGlobal('fetch', reply(200, { data: null, module: 'utilities' }));
    await apiFetch('/x');

    expect(handler).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-JSON errors', async () => {
    vi.stubGlobal('fetch', reply(500, '<html>boom</html>'));
    const err = await apiFetch('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 500, message: 'Request to /x failed (500)' });
  });

  it('reports an unreachable API as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await apiFetch('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Could not reach the API/);
  });

  it('tolerates empty success bodies (204)', async () => {
    vi.stubGlobal('fetch', reply(204, undefined));
    expect(await apiFetch('/x', { method: 'DELETE' })).toEqual({ data: undefined, message: null, meta: null });
  });
});

describe('token storage', () => {
  it('round-trips and clears', () => {
    setAuthToken('abc');
    expect(authToken()).toBe('abc');
    setAuthToken(null);
    expect(authToken()).toBeNull();
  });
});

describe('the "I\'m not a robot" challenge calls', () => {
  const sent = (f: ReturnType<typeof reply>, n = 0) => {
    const [url, init] = f.mock.calls[n] as unknown as [string, RequestInit];
    return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined };
  };

  it('reads the challenge settings without a sign-in', async () => {
    setAuthToken('stored');
    const f = reply(200, { data: { enabled: true, siteKey: 'site' } });
    vi.stubGlobal('fetch', f);

    expect(await api.captchaConfig()).toEqual({ enabled: true, siteKey: 'site' });

    const { url, init } = sent(f);
    expect(url).toMatch(/\/auth\/captcha$/);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('sends the token with a password sign-in', async () => {
    const f = reply(200, { data: { token: 't', user: {} } });
    vi.stubGlobal('fetch', f);

    await api.login({ email: 'a@x.test', password: 'pw', captchaToken: 'good-token' });

    expect(sent(f).body).toEqual({ email: 'a@x.test', password: 'pw', captchaToken: 'good-token' });
  });

  it('sends the token with a registration', async () => {
    const f = reply(201, { data: { token: 't', user: {} } });
    vi.stubGlobal('fetch', f);

    await api.register({ name: 'N', email: 'a@x.test', password: 'a-long-secret', password_confirmation: 'a-long-secret', captchaToken: 'good-token' });

    expect(sent(f).body.captchaToken).toBe('good-token');
  });

  it('sends the token with a password-reset request', async () => {
    const f = reply(200, { data: null, message: 'ok' });
    vi.stubGlobal('fetch', f);

    await api.forgotPassword('a@x.test', 'good-token');

    expect(sent(f).body).toEqual({ email: 'a@x.test', captchaToken: 'good-token' });
  });

  it('sends no token field at all when the challenge is off', async () => {
    const f = reply(200, { data: null, message: 'ok' });
    vi.stubGlobal('fetch', f);

    await api.forgotPassword('a@x.test');

    expect(sent(f).body).toEqual({ email: 'a@x.test' });          // (undefined is dropped by JSON)
  });

  it('sends the token with the password reset itself', async () => {
    const f = reply(200, { data: null, message: 'ok' });
    vi.stubGlobal('fetch', f);

    await api.resetPassword({ email: 'a@x.test', token: 'emailed', password: 'a-long-secret', password_confirmation: 'a-long-secret', captchaToken: 'good-token' });

    expect(sent(f).body).toEqual({ email: 'a@x.test', token: 'emailed', password: 'a-long-secret', password_confirmation: 'a-long-secret', captchaToken: 'good-token' });
  });
});
