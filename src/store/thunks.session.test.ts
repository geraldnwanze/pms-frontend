import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { login } from './authSlice';
import dataReducer from './dataSlice';
import uiReducer from './uiSlice';
import { bootstrap } from './thunks';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { bootstrap: vi.fn() },
  setAuthToken: vi.fn(),
}));
import { api, ApiError, setAuthToken } from '@/lib/api';

function makeStore() {
  const store = configureStore({
    reducer: { data: dataReducer, auth: authReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(login({ userId: 'u1', token: 'stale' }));
  return store;
}
const toasts = (s: ReturnType<typeof makeStore>) => s.getState().ui.toasts.map((t) => `${t.kind}:${t.message}`);

beforeEach(() => vi.clearAllMocks());

describe('bootstrap when the server ends the session', () => {
  it('signs out, clears the data and says why in the server’s own words', async () => {
    vi.mocked(api.bootstrap).mockRejectedValue(new ApiError('This account has been deactivated.', 401));
    const store = makeStore();

    const ok = await store.dispatch(bootstrap() as never);

    expect(ok).toBe(false);
    expect(store.getState().auth.currentUserId).toBeNull();
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(toasts(store)).toEqual(['info:This account has been deactivated.']);
  });

  it('uses a plain sentence for an ordinary expired token', async () => {
    vi.mocked(api.bootstrap).mockRejectedValue(new ApiError('Unauthenticated.', 401));
    const store = makeStore();

    await store.dispatch(bootstrap() as never);

    expect(toasts(store)).toEqual(['info:Your session has ended. Please sign in again.']);
  });

  it('does not stack the same message when several requests fail together', async () => {
    vi.mocked(api.bootstrap).mockRejectedValue(new ApiError('Unauthenticated.', 401));
    const store = makeStore();

    await Promise.all([store.dispatch(bootstrap() as never), store.dispatch(bootstrap() as never), store.dispatch(bootstrap() as never)]);

    expect(toasts(store)).toHaveLength(1);
  });

  it('keeps the session and shows an error when the failure is not about sign-in', async () => {
    vi.mocked(api.bootstrap).mockRejectedValue(new ApiError('Server exploded.', 500));
    const store = makeStore();

    await store.dispatch(bootstrap() as never);

    expect(store.getState().auth.currentUserId).toBe('u1');
    expect(toasts(store)).toEqual(['error:Server exploded.']);
  });
});
