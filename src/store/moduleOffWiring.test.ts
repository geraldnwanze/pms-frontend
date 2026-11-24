import { afterEach, describe, expect, it, vi } from 'vitest';
import { store } from './index';
import { login, logout } from './authSlice';
import { dataActions } from './dataSlice';
import { apiFetch, setAuthToken } from '@/lib/api';

/** The real store, wired as the app wires it: a refused request from any screen makes the app learn what was switched off. */
function server(handler: (path: string) => { status: number; body: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    calls.push(path);
    const { status, body } = handler(path);
    return new Response(JSON.stringify(body), { status });
  }));
  return calls;
}

afterEach(() => {
  store.dispatch(logout());
  store.dispatch(dataActions.resetData());
  setAuthToken(null);
  vi.unstubAllGlobals();
});

describe('a request refused because its module is off', () => {
  it('reloads the app, which then knows the module is off', async () => {
    const calls = server((path) => path === '/meters'
      ? { status: 403, body: { message: 'The Utilities & meters module is turned off.', errors: null, module: 'utilities' } }
      : path === '/bootstrap'
        ? { status: 200, body: { data: { users: [{ id: 'u1', role: 'manager', name: 'M', email: 'm@x.test' }], modules: { utilities: false } }, message: null, meta: null } }
        : { status: 200, body: { data: null, message: null, meta: null } });
    store.dispatch(dataActions.hydrateAll({ users: [{ id: 'u1', role: 'manager', name: 'M', email: 'm@x.test' }], modules: { utilities: true } } as never));
    store.dispatch(login({ userId: 'u1', token: 't' }));

    await apiFetch('/meters').catch(() => {});
    await vi.waitFor(() => expect(store.getState().data.modules?.utilities).toBe(false));

    expect(calls.filter((c) => c === '/bootstrap')).toHaveLength(1);
    expect(store.getState().ui.toasts.map((t) => t.message)).toContain('The Utilities & meters module is turned off.');
  });

  it('leaves the app alone for any other refusal', async () => {
    const calls = server(() => ({ status: 403, body: { message: 'This action is unauthorized.', errors: null } }));
    store.dispatch(dataActions.hydrateAll({ users: [], modules: { utilities: true } } as never));
    store.dispatch(login({ userId: 'u1', token: 't' }));

    await apiFetch('/meters').catch(() => {});
    await new Promise((r) => setTimeout(r, 20));

    expect(calls).toEqual(['/meters']);
    expect(store.getState().data.modules?.utilities).toBe(true);
  });
});
