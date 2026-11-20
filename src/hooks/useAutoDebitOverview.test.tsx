import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_DEBIT_STAFF_ROLES, useAutoDebitOverview } from './useAutoDebitOverview';
import { makeTestStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import type { AutoDebitOverview } from '@/types';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { autoDebitOverview: vi.fn() } }));
import { api } from '@/lib/api';
const mocked = vi.mocked(api);
const overview = { invoices: {} } as unknown as AutoDebitOverview;

function setup(role: string | null) {
  const store = makeTestStore();
  if (role) {
    store.dispatch(dataActions.hydrateAll({ users: [{ id: 'u1', role, name: 'U', email: 'u@x.test' }] } as never));
    store.dispatch(login({ userId: 'u1', token: 't' }));
  }
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useAutoDebitOverview(), { wrapper });
}

beforeEach(() => vi.clearAllMocks());

describe('useAutoDebitOverview', () => {
  it('lists the staff roles that may see auto-debit state', () => {
    expect(AUTO_DEBIT_STAFF_ROLES).toEqual(['admin', 'owner', 'manager', 'finance']);
  });

  it('does not call the API when nobody is signed in', () => {
    const { result } = setup(null);
    expect(result.current).toBeNull();
    expect(mocked.autoDebitOverview).not.toHaveBeenCalled();
  });

  it.each(AUTO_DEBIT_STAFF_ROLES)('loads the overview for %s', async (role) => {
    mocked.autoDebitOverview.mockResolvedValue(overview);
    const { result } = setup(role);
    await waitFor(() => expect(result.current).toBe(overview));
  });

  it.each(['tenant', 'agent', 'maintenance', 'user'])('never calls the API for %s', async (role) => {
    mocked.autoDebitOverview.mockResolvedValue(overview);
    const { result } = setup(role);
    await Promise.resolve();
    expect(mocked.autoDebitOverview).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('stays null when the call fails', async () => {
    mocked.autoDebitOverview.mockRejectedValue(new Error('403'));
    const { result } = setup('manager');
    await waitFor(() => expect(mocked.autoDebitOverview).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
