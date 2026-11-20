import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaseDetail } from './LeaseDetail';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/leases/l1' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({ id: 'l1' }) }));

function open() {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'u', role: 'manager', name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', code: 'A01', status: 'occupied' }],
    tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
    leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: 'monthly', rent: 1_200_000, securityDeposit: 0, startDate: '2000-01-01', endDate: '2999-12-31', noticePeriodDays: 90 }],
  } as never));
  store.dispatch(login({ userId: 'u', token: 't' }));
  renderWithStore(<LeaseDetail />, store);
  return store;
}

describe('terminating a lease', () => {
  it('warns that unbilled utility use is billed to the tenant now, and asks for the final readings first', () => {
    open();

    fireEvent.click(screen.getByRole('button', { name: /Terminate/ }));

    expect(screen.getByText(/Any utility use still unbilled on the unit's meters is billed to the tenant now, so log the final readings first/)).toBeInTheDocument();
  });

  it('records the day the lease was terminated, which the final bill counts from', () => {
    const store = open();

    store.dispatch(dataActions.terminateLease({ leaseId: 'l1', actorId: 'u' }));

    const lease = store.getState().data.leases[0];
    expect(lease.status).toBe('terminated');
    expect(lease.terminatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
