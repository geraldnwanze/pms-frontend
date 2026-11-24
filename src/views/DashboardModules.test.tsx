import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/dashboard' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/store/thunks', () => ({ fetchDashboard: vi.fn(() => ({ type: 'test/fetchDashboard' })) }));

// The charts measure themselves; jsdom has no ResizeObserver.
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));

const kpis = {
  totalProperties: 7, totalBuildings: 13, totalUnits: 140, occupied: 113, vacant: 27, reserved: 0, maintenance: 0, underRenovation: 0, totalTenants: 100,
  activeLeases: 100, expiringLeases: 3, annualRentRoll: 400_000_000, expectedBilled: 300_000_000, collected: 150_000_000, outstanding: 160_000_000, overdue: 30_000_000,
  collectionRate: 0.5, occupancyRate: 0.88, openMaintenance: 24, pendingVerifications: 27, totalExpenses: 8_600_000, netIncome: 141_400_000,
};
const queue = { byStatus: {}, byUrgency: { emergency: 0, high: 0, medium: 0, low: 0 }, openCount: 0, emergencyCount: 0, items: [] };

function render(persona: 'portfolio' | 'finance', role: string, modules: Record<string, boolean> | null) {
  const store = makeTestStore();
  const dashboard = persona === 'portfolio'
    ? { role, persona, kpis, rentTrend: [], recentActivity: [], unitStatus: [], occupancyByProperty: [{ id: 'p1', name: 'Alpha', city: 'Lagos', state: 'Lagos', occupancyRate: 90, collected: 1000, outstanding: 500, netIncome: 400 }], expiringLeases: [], overdueInvoices: [] }
    : { role, persona, kpis, rentTrend: [], recentActivity: [], overdueInvoices: [], pendingPayments: [], expensesPending: [{ id: 'e1', code: 'EXP-1', propertyId: 'p1', category: 'repairs', description: 'd', amount: 5000 }], expensesByCategory: [{ category: 'repairs', count: 1, total: 5000 }], maintenanceQueue: queue };
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'u1', role, name: 'Pat Person', email: 'p@x.test' }], properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    dashboard, modules,
  } as never));
  store.dispatch(login({ userId: 'u1', token: 't' }));
  return renderWithStore(<Dashboard />, store);
}
const has = (text: RegExp | string) => screen.queryAllByText(text).length > 0;

describe('portfolio dashboard (admin, owner, superadmin) and the modules that are off', () => {
  it('shows every tile while the modules are on, or until the states have loaded', () => {
    for (const modules of [{ maintenance: true, expenses: true, reports: true }, null]) {
      const { unmount } = render('portfolio', 'admin', modules);

      expect(has('Open maintenance')).toBe(true);
      expect(has('Net income')).toBe(true);
      unmount();
    }
  });

  it('drops the open-maintenance tile and row when Maintenance is off, and keeps the rest', () => {
    render('portfolio', 'admin', { maintenance: false });

    expect(has('Open maintenance')).toBe(false);
    expect(has('Active work orders')).toBe(false);
    expect(has('Net income')).toBe(true);
    expect(has('Outstanding')).toBe(true);
    expect(has('Pending verification')).toBe(true);
  });

  it('shows the per-property net income column while Expenses is on', () => {
    render('portfolio', 'admin', { expenses: true });

    expect(screen.getAllByText('Net income')).toHaveLength(2);        // the tile, and the column
    expect(screen.getByText('Alpha').closest('tr')!.querySelectorAll('td')).toHaveLength(5);
  });

  it('drops the net-income tile, the per-property column, and the expense total, when Expenses is off', () => {
    render('portfolio', 'admin', { expenses: false });

    expect(has('Net income')).toBe(false);
    expect(has('Alpha')).toBe(true);                                  // the property table itself stays
    expect(screen.getByText('Alpha').closest('tr')!.querySelectorAll('td')).toHaveLength(4);     // minus its net-income cell
    expect(has(/expenses$/)).toBe(false);
    expect(has('Open maintenance')).toBe(true);
  });

  it('keeps the net-income tile when only Reports is off (it simply stops linking to the report)', () => {
    render('portfolio', 'admin', { reports: false });

    expect(has('Net income')).toBe(true);
  });

  it('works the same for a superadmin', () => {
    render('portfolio', 'superadmin', { maintenance: false, expenses: false });

    expect(has('Open maintenance')).toBe(false);
    expect(has('Net income')).toBe(false);
    expect(has('Outstanding')).toBe(true);
  });
});

describe('finance dashboard and the Expenses module', () => {
  it('shows the expense tile, the category chart and the approval list while Expenses is on', () => {
    render('finance', 'finance', { expenses: true });

    expect(has('Expenses')).toBe(true);
    expect(has('Expenses by category')).toBe(true);
    expect(has('Expenses awaiting approval')).toBe(true);
  });

  it('shows none of the three when Expenses is off, and keeps the rest', () => {
    render('finance', 'finance', { expenses: false });

    expect(has('Expenses')).toBe(false);
    expect(has('Expenses by category')).toBe(false);
    expect(has('Expenses awaiting approval')).toBe(false);
    expect(has('Collected')).toBe(true);
    expect(has('Verification queue')).toBe(true);
  });
});
