import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalHome } from './Portal';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/store/thunks', () => ({ fetchPortal: vi.fn(() => ({ type: 'test/fetchPortal' })), confirmMaintenanceDone: vi.fn(() => ({ type: 'test/confirm' })), bootstrap: vi.fn(() => ({ type: 'test/bootstrap' })) }));
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { autoDebitStatus: vi.fn().mockResolvedValue({ available: false, enabled: false }) } }));

function renderHome(modules: Record<string, boolean> | null) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'tu', role: 'tenant', name: 'Ada Obi', email: 'a@x.test', tenantId: 't1' }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', buildingId: 'b1', code: 'A01', type: 'Flat', status: 'occupied', bedrooms: 2, bathrooms: 2, sizeSqm: 80, parkingSpaces: 1, floor: 1, rent: 1_200_000 }],
    tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
    leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: 'monthly', rent: 1_200_000, startDate: '2026-01-01', endDate: '2027-01-01' }],
    notices: [{ id: 'n1', title: 'Water off Tuesday', body: 'Planned.', audience: 'all', createdAt: '2026-11-10T08:00:00Z' }],
    modules,
  } as never));
  store.dispatch(login({ userId: 'tu', token: 't' }));
  return renderWithStore(<PortalHome />, store);
}

describe('tenant home with modules off', () => {
  it('shows the open-requests tile and the notices while those modules are on', () => {
    renderHome({ maintenance: true, communications: true });

    expect(screen.getByText('Open requests')).toBeInTheDocument();
    expect(screen.getByText('Notices')).toBeInTheDocument();
  });

  it('shows them until the states have loaded', () => {
    renderHome(null);

    expect(screen.getByText('Open requests')).toBeInTheDocument();
    expect(screen.getByText('Notices')).toBeInTheDocument();
  });

  it('drops the open-requests tile when Maintenance is off, and keeps the rest', () => {
    renderHome({ maintenance: false });

    expect(screen.queryByText('Open requests')).toBeNull();
    expect(screen.getByText('Lease status')).toBeInTheDocument();
    expect(screen.getByText('Notices')).toBeInTheDocument();
  });

  it('drops the notices card when Communications is off, and keeps the rest', () => {
    renderHome({ communications: false });

    expect(screen.queryByText('Notices')).toBeNull();
    expect(screen.queryByText('Water off Tuesday')).toBeNull();
    expect(screen.getByText('Open requests')).toBeInTheDocument();
    expect(screen.getByText('Recent payments')).toBeInTheDocument();
  });
});
