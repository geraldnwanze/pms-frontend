import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from './authSlice';
import dataReducer, { dataActions } from './dataSlice';
import uiReducer, { pushToast } from './uiSlice';
import { apiMiddleware } from './apiMiddleware';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { request: vi.fn() } }));
vi.mock('./thunks', () => ({
  bootstrap: vi.fn(() => ({ type: 'test/bootstrap' })),
  signOut: vi.fn(() => ({ type: 'test/signOut' })),
  announceSessionEnded: vi.fn(),
}));
import { api, ApiError } from '@/lib/api';
import { announceSessionEnded, bootstrap, signOut } from './thunks';

function makeStore() {
  const seen: string[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    seen.push((action as { type: string }).type);
    return next(action);
  };
  const store = configureStore({
    reducer: { data: dataReducer, auth: authReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }).concat(apiMiddleware).concat(recorder),
  });
  return { store, seen };
}

/** A write whose server answer we control. */
function pendingWrite() {
  let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
  vi.mocked(api.request).mockReturnValue(new Promise((resolve, reject) => { settle = { resolve, reject }; }) as never);
  return settle;
}
const toast = (id: string, kind: 'success' | 'error' | 'info', message: string) => pushToast({ id, kind, message });
const messages = (store: ReturnType<typeof makeStore>['store']) => store.getState().ui.toasts.map((t) => `${t.kind}:${t.message}`);
const tick = () => new Promise((r) => setTimeout(r, 5));

/** What a view does: dispatch the change, then announce success straight away. */
function save(store: ReturnType<typeof makeStore>['store'], message = 'Document deleted.') {
  store.dispatch(dataActions.deleteDocument({ id: 'doc_1', actorId: 'u1' }));
  store.dispatch(toast('t_ok', 'success', message));
}

beforeEach(() => vi.clearAllMocks());

describe('apiMiddleware', () => {
  it('sends the write to the API and leaves the success message alone when it works', async () => {
    const { store } = makeStore();
    const server = pendingWrite();

    save(store);
    await tick();
    server.resolve({});
    await tick();

    expect(api.request).toHaveBeenCalledWith('DELETE', '/documents/doc_1', undefined);
    expect(messages(store)).toEqual(['success:Document deleted.']);
  });

  it('takes back the success message when the server refuses, and shows why instead', async () => {
    const { store } = makeStore();
    const server = pendingWrite();

    save(store, 'Payment submitted for verification.');
    await tick();
    expect(messages(store)).toEqual(['success:Payment submitted for verification.']);      // optimistic, for now

    server.reject(new ApiError('The given data was invalid.', 422, { receiptDataUrl: ['The receipt must be a PNG, JPEG, WebP or PDF file.'] }));
    await tick();

    expect(messages(store)).toEqual(['error:Couldn’t save: The receipt must be a PNG, JPEG, WebP or PDF file.']);
  });

  it('falls back to the response message when there are no field errors', async () => {
    const { store } = makeStore();
    const server = pendingWrite();

    save(store);
    await tick();
    server.reject(new ApiError('This action is unauthorized.', 403, null));
    await tick();

    expect(messages(store)).toEqual(['error:Couldn’t save: This action is unauthorized.']);
  });

  it('re-syncs from the server after a refusal so the optimistic change is undone', async () => {
    const { store, seen } = makeStore();
    const server = pendingWrite();

    save(store);
    await tick();
    server.reject(new ApiError('nope', 422, null));
    await tick();

    expect(bootstrap).toHaveBeenCalled();
    expect(seen).toContain('test/bootstrap');
  });

  it('does not retract messages that have nothing to do with the failed write', async () => {
    const { store } = makeStore();
    store.dispatch(toast('t_old', 'success', 'Earlier: lead updated.'));
    const server = pendingWrite();

    save(store);
    await tick();
    store.dispatch(toast('t_other', 'success', 'Something else finished.'));      // arrives after the write, from elsewhere
    server.reject(new ApiError('nope', 422, null));
    await tick();

    expect(messages(store)).toEqual(['success:Earlier: lead updated.', 'success:Something else finished.', 'error:Couldn’t save: nope']);
  });

  it('leaves other kinds of message raised alongside the write alone', async () => {
    const { store } = makeStore();
    const server = pendingWrite();

    save(store);
    store.dispatch(toast('t_info', 'info', 'Heads up: finance has been notified.'));
    await tick();
    server.reject(new ApiError('nope', 422, null));
    await tick();

    expect(messages(store)).toEqual(['info:Heads up: finance has been notified.', 'error:Couldn’t save: nope']);
  });

  it('explains a dropped connection', async () => {
    const { store } = makeStore();
    const server = pendingWrite();

    save(store);
    await tick();
    server.reject(new ApiError('Could not reach the API. Is the Laravel server running?', 0, null));
    await tick();

    expect(messages(store)[0]).toContain('Could not reach the API');
  });

  it('signs the user out on a 401, says why, and shows no "couldn’t save" error', async () => {
    const { store, seen } = makeStore();
    const server = pendingWrite();

    save(store);
    await tick();
    server.reject(new ApiError('Unauthenticated.', 401, null));
    await tick();

    expect(signOut).toHaveBeenCalled();
    expect(announceSessionEnded).toHaveBeenCalled();
    expect(seen).toContain('test/signOut');
    expect(messages(store).some((m) => m.startsWith('error:'))).toBe(false);
  });

  it('ignores actions that are not written through to the API', async () => {
    const { store } = makeStore();
    store.dispatch({ type: 'ui/somethingLocal' });
    store.dispatch({ type: 'data/notARoute', payload: {} });
    await tick();

    expect(api.request).not.toHaveBeenCalled();
  });

  it('sends writes to one meter in order, so a reading is saved before it is billed', async () => {
    const { store } = makeStore();
    const order: string[] = [];
    let release!: () => void;
    vi.mocked(api.request).mockImplementation(((_m: string, path: string) => {
      order.push(`start ${path}`);
      return path.endsWith('/readings') ? new Promise<void>((r) => { release = r; }).then(() => { order.push('done readings'); }) : Promise.resolve().then(() => { order.push('done bill'); });
    }) as never);

    store.dispatch(dataActions.addMeterReading({ meterId: 'm1', value: 300, date: '2026-11-19' }));
    store.dispatch(dataActions.billMeter({ meterId: 'm1', actorId: 'u1' }));
    await tick();

    expect(order).toEqual(['start /meters/m1/readings']);       // the bill waits
    release();
    await tick();
    expect(order).toEqual(['start /meters/m1/readings', 'done readings', 'start /meters/m1/bill', 'done bill']);
  });

  it('does not make writes to different meters wait for each other', async () => {
    const { store } = makeStore();
    vi.mocked(api.request).mockReturnValue(new Promise(() => {}) as never);

    store.dispatch(dataActions.addMeterReading({ meterId: 'm1', value: 300, date: '2026-11-19' }));
    store.dispatch(dataActions.addMeterReading({ meterId: 'm2', value: 300, date: '2026-11-19' }));
    await tick();

    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('carries on with the next write to a meter after one fails', async () => {
    const { store } = makeStore();
    vi.mocked(api.request).mockRejectedValueOnce(new ApiError('nope', 422) as never).mockResolvedValue({} as never);

    store.dispatch(dataActions.addMeterReading({ meterId: 'm1', value: 300, date: '2026-11-19' }));
    store.dispatch(dataActions.billMeter({ meterId: 'm1', actorId: 'u1' }));
    await tick();

    expect(api.request).toHaveBeenCalledTimes(2);
  });
});
