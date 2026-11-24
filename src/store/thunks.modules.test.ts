import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { login } from './authSlice';
import dataReducer from './dataSlice';
import uiReducer from './uiSlice';
import { moduleTurnedOff, setModuleEnabled, syncModules } from './thunks';
import { selectModuleOn } from './selectors';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { setModule: vi.fn(), modules: vi.fn(), bootstrap: vi.fn(), dashboard: vi.fn().mockResolvedValue(null), portal: vi.fn().mockResolvedValue(null) },
}));
import { api, ApiError } from '@/lib/api';

function makeStore() {
  const store = configureStore({
    reducer: { data: dataReducer, auth: authReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(login({ userId: 'u1', token: 't' }));
  return store;
}
const toasts = (s: ReturnType<typeof makeStore>) => s.getState().ui.toasts.map((t) => `${t.kind}:${t.message}`);

beforeEach(() => vi.clearAllMocks());

describe('setModuleEnabled', () => {
  it('asks the server, then reloads the store so the new states reach the whole app', async () => {
    vi.mocked(api.setModule).mockResolvedValue({ modules: [], changed: ['utilities'] });
    vi.mocked(api.bootstrap).mockResolvedValue({ users: [{ id: 'u1', role: 'superadmin' }], modules: { utilities: false } } as never);
    const store = makeStore();
    expect(selectModuleOn('utilities')(store.getState() as never)).toBe(true);

    const result = await store.dispatch(setModuleEnabled('utilities', false) as never);

    expect(result).toEqual({ ok: true });
    expect(api.setModule).toHaveBeenCalledWith('utilities', false, false);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(selectModuleOn('utilities')(store.getState() as never)).toBe(false);
  });

  it('passes the cascade flag on', async () => {
    vi.mocked(api.setModule).mockResolvedValue({ modules: [], changed: ['maintenance', 'payouts'] });
    vi.mocked(api.bootstrap).mockResolvedValue({ users: [], modules: {} } as never);

    await makeStore().dispatch(setModuleEnabled('maintenance', false, true) as never);

    expect(api.setModule).toHaveBeenCalledWith('maintenance', false, true);
  });

  it('hands back the modules that would also go off, instead of an error toast, and changes nothing', async () => {
    vi.mocked(api.setModule).mockRejectedValue(new ApiError('The given data was invalid.', 422, { dependents: ['Technician payouts needs Maintenance and would be turned off too.'] }));
    const store = makeStore();

    const result = await store.dispatch(setModuleEnabled('maintenance', false) as never);

    expect(result).toEqual({ ok: false, dependents: ['Technician payouts needs Maintenance and would be turned off too.'] });
    expect(toasts(store)).toEqual([]);
    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  it('says why in the server’s words when it is refused for any other reason', async () => {
    vi.mocked(api.setModule).mockRejectedValue(new ApiError('Only a superadmin can switch modules on or off.', 403));
    const store = makeStore();

    const result = await store.dispatch(setModuleEnabled('utilities', false) as never);

    expect(result).toEqual({ ok: false });
    expect(toasts(store)).toEqual(['error:Only a superadmin can switch modules on or off.']);
    expect(api.bootstrap).not.toHaveBeenCalled();
  });
});

describe('selectModuleOn', () => {
  it('is on until the states have loaded, then follows them', () => {
    const store = makeStore();
    expect(selectModuleOn('planner')(store.getState() as never)).toBe(true);

    store.dispatch({ type: 'data/hydrateAll', payload: { modules: { planner: false, reports: true } } });

    expect(selectModuleOn('planner')(store.getState() as never)).toBe(false);
    expect(selectModuleOn('reports')(store.getState() as never)).toBe(true);
    expect(selectModuleOn('utilities')(store.getState() as never)).toBe(true);
  });
});

describe('moduleTurnedOff (a request found a module off that the app thought was on)', () => {
  const SAYS = 'The Utilities & meters module is turned off.';
  const loaded = (modules: Record<string, boolean> | null) => {
    const store = makeStore();
    store.dispatch({ type: 'data/hydrateAll', payload: { modules } });
    return store;
  };
  const fresh = () => vi.mocked(api.bootstrap).mockResolvedValue({ users: [], modules: { utilities: false } } as never);

  it('says so once and reloads, so the app learns the module is off', async () => {
    fresh();
    const store = loaded({ utilities: true });

    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(toasts(store)).toEqual([`info:${SAYS}`]);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(selectModuleOn('utilities')(store.getState() as never)).toBe(false);
  });

  it('does not add a second toast when a screen has already shown the same message', async () => {
    fresh();
    const store = loaded({ utilities: true });
    store.dispatch({ type: 'ui/pushToast', payload: { id: 't1', kind: 'error', message: SAYS } });

    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(toasts(store)).toEqual([`error:${SAYS}`]);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the app already knew the module was off (reloading would not help)', async () => {
    const store = loaded({ utilities: false });

    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(api.bootstrap).not.toHaveBeenCalled();
    expect(toasts(store)).toEqual([]);
  });

  it('reloads when the states had not loaded yet', async () => {
    fresh();
    const store = loaded(null);

    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('reloads once however many requests fail together', async () => {
    let release!: () => void;
    vi.mocked(api.bootstrap).mockImplementation(() => new Promise((resolve) => { release = () => resolve({ users: [], modules: { utilities: false } } as never); }));
    const store = loaded({ utilities: true });

    const all = [1, 2, 3].map(() => store.dispatch(moduleTurnedOff('utilities', SAYS) as never));
    await Promise.resolve();
    release();
    await Promise.all(all);

    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(toasts(store)).toEqual([`info:${SAYS}`]);
  });

  it('does nothing when nobody is signed in', async () => {
    const store = configureStore({
      reducer: { data: dataReducer, auth: authReducer, ui: uiReducer },
      middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    });

    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  it('can reload again later, even after a reload failed', async () => {
    vi.mocked(api.bootstrap).mockRejectedValueOnce(new Error('down'));
    const store = loaded({ utilities: true });
    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    fresh();
    await store.dispatch(moduleTurnedOff('utilities', SAYS) as never);

    expect(api.bootstrap).toHaveBeenCalledTimes(2);
  });
});

describe('syncModules (catching up when the tab comes back into view)', () => {
  const rows = (states: Record<string, boolean>) => Object.entries(states).map(([key, enabled]) => ({ key, label: key, description: '', requires: [], dependents: [], enabled }));
  const ready = (modules: Record<string, boolean> | null, signedIn = true) => {
    const store = makeStore();
    if (!signedIn) store.dispatch({ type: 'auth/logout' });
    store.dispatch({ type: 'data/hydrateAll', payload: { modules } });
    if (signedIn) store.dispatch({ type: 'auth/dataReady', payload: true });
    return store;
  };

  it('reloads everything when a module has changed since the app last loaded', async () => {
    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: true, planner: false }) as never);
    vi.mocked(api.bootstrap).mockResolvedValue({ users: [], modules: { utilities: true, planner: false } } as never);
    const store = ready({ utilities: false, planner: false });

    const changed = await store.dispatch(syncModules() as never);

    expect(changed).toBe(true);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(selectModuleOn('utilities')(store.getState() as never)).toBe(true);
  });

  it('also catches a module that was switched off', async () => {
    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: false }) as never);
    vi.mocked(api.bootstrap).mockResolvedValue({ users: [], modules: { utilities: false } } as never);

    const changed = await ready({ utilities: true }).dispatch(syncModules() as never);

    expect(changed).toBe(true);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('does not reload when nothing has changed', async () => {
    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: true, planner: false }) as never);

    const changed = await ready({ utilities: true, planner: false }).dispatch(syncModules() as never);

    expect(changed).toBe(false);
    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  it('treats a module the app has no state for as on, like the rest of the app does', async () => {
    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: true, planner: true }) as never);

    const changed = await ready({ utilities: true }).dispatch(syncModules() as never);

    expect(changed).toBe(false);
  });

  it('does nothing before the app has loaded its states, or when nobody is signed in', async () => {
    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: false }) as never);

    expect(await ready(null).dispatch(syncModules() as never)).toBe(false);
    expect(await ready({ utilities: true }, false).dispatch(syncModules() as never)).toBe(false);

    expect(api.modules).not.toHaveBeenCalled();
    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  it('stays quiet when the check fails, and tries again next time', async () => {
    vi.mocked(api.modules).mockRejectedValueOnce(new Error('offline'));
    const store = ready({ utilities: true });
    const quiet = await store.dispatch(syncModules() as never);

    vi.mocked(api.modules).mockResolvedValue(rows({ utilities: false }) as never);
    vi.mocked(api.bootstrap).mockResolvedValue({ users: [], modules: { utilities: false } } as never);
    const later = await store.dispatch(syncModules() as never);

    expect(quiet).toBe(false);
    expect(toasts(store)).toEqual([]);
    expect(later).toBe(true);
  });

  it('checks once at a time', async () => {
    let release!: () => void;
    vi.mocked(api.modules).mockImplementation(() => new Promise((resolve) => { release = () => resolve(rows({ utilities: true }) as never); }));
    const store = ready({ utilities: true });

    const all = [1, 2, 3].map(() => store.dispatch(syncModules() as never));
    await Promise.resolve();
    release();
    await Promise.all(all);

    expect(api.modules).toHaveBeenCalledTimes(1);
  });
});
