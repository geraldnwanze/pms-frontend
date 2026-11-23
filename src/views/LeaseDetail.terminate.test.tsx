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
  it('opens a dialog that asks for the closing readings and explains the final bill', () => {
    open();

    fireEvent.click(screen.getByRole('button', { name: /Terminate/ }));

    expect(screen.getByText('Terminate this lease?')).toBeInTheDocument();
    expect(screen.getByTestId('final-bill-summary')).toHaveTextContent('There are no meters on this unit, so no final utility bill.');     // this unit has none in the test store
  });

  it('records the day the lease was terminated, which the final bill counts from', () => {
    const store = open();

    store.dispatch(dataActions.terminateLease({ leaseId: 'l1', actorId: 'u' }));

    const lease = store.getState().data.leases[0];
    expect(lease.status).toBe('terminated');
    expect(lease.terminatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('when a tenancy ended', () => {
  function show(over: object) {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({
      users: [{ id: 'u', role: 'manager', name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
      properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
      units: [{ id: 'u1', propertyId: 'p1', code: 'A01', status: 'available' }],
      tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
      leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: 'monthly', rent: 1_200_000, securityDeposit: 0, startDate: '2026-01-20', endDate: '2027-01-20', noticePeriodDays: 90, ...over }],
    } as never));
    store.dispatch(login({ userId: 'u', token: 't' }));
    renderWithStore(<LeaseDetail />, store);
  }
  const tile = () => screen.getByText('Ended').closest('.card') as HTMLElement;

  it('shows the day a terminated lease ended — not the contract end date — and says it was early', () => {
    show({ status: 'terminated', terminatedOn: '2026-11-20' });

    expect(tile()).toHaveTextContent('20 Nov 2026');
    expect(tile()).toHaveTextContent('Ended early · contract ran to 20 Jan 2027');
    expect(screen.getByText('Terminated on').parentElement).toHaveTextContent('20 Nov 2026');
    expect(screen.getByText('End date').parentElement).toHaveTextContent('20 Jan 2027');      // the contract's end date is still there
  });

  it('shows the end date of a lease that simply ran out, with no "terminated on" line', () => {
    show({ status: 'expired', endDate: '2026-10-15' });

    expect(tile()).toHaveTextContent('15 Oct 2026');
    expect(screen.queryByText('Terminated on')).toBeNull();
    expect(tile()).not.toHaveTextContent('Ended early');
  });

  it('falls back to the contract end date for an older terminated lease that never recorded when it ended', () => {
    show({ status: 'terminated', terminatedOn: null, endDate: '2026-11-01' });

    expect(tile()).toHaveTextContent('01 Nov 2026');
  });

  it('still counts down a lease that is running', () => {
    show({});

    expect(screen.getByText('Ends in')).toBeInTheDocument();
    expect(screen.queryByText('Ended')).toBeNull();
  });
});
