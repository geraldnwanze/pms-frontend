import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateInvoiceModal } from './Invoices';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/invoices' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));

// a unit on ₦3.6m a year rent and ₦480k a year service charge, plus ₦30k utility
const unit = { id: 'u1', propertyId: 'p1', buildingId: 'b1', code: 'A01', type: 'Flat', status: 'occupied', rent: 3_600_000, serviceCharge: 480_000, utilityCharge: 30_000, otherCharges: 0 };
const lease = (cycle: string) => ({ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: cycle, rent: 3_600_000, startDate: '2026-01-01', endDate: '2026-12-31' });

function renderFor(cycle: string) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'me', role: 'manager', name: 'Me', email: 'me@x.test' }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [{ ownerId: 'me' }] }],
    units: [unit], leases: [lease(cycle)], tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
  } as never));
  store.dispatch(login({ userId: 'me', token: 't' }));
  renderWithStore(<GenerateInvoiceModal onClose={vi.fn()} />, store);
  return store;
}
const total = () => screen.getByText('Invoice total').parentElement!.textContent!.replace(/[^\d]/g, '');
const months = () => screen.getByRole('spinbutton') as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());

describe('GenerateInvoiceModal', () => {
  it.each([
    ['monthly', 1, 300_000 + 40_000],
    ['quarterly', 3, 900_000 + 120_000],
    ['half-yearly', 6, 1_800_000 + 240_000],
    ['annual', 12, 3_600_000 + 480_000],
  ])('bills a %s lease for %i month(s) of the annual rent and service charge', (cycle, m, expected) => {
    renderFor(cycle);

    expect(months().value).toBe(String(m));
    expect(total()).toBe(String(expected));
  });

  it('does not bill a monthly lease its whole year’s rent', () => {
    renderFor('monthly');

    expect(Number(total())).toBeLessThan(3_600_000);
  });

  it('starts a custom cycle at one month and lets the person change it', async () => {
    renderFor('custom');
    expect(months().value).toBe('1');
    expect(total()).toBe(String(340_000));

    await userEvent.clear(months());
    await userEvent.type(months(), '4');

    expect(months().value).toBe('4');
    expect(total()).toBe(String(1_200_000 + 160_000));
  });

  it('bills utility and other charges as they stand, whatever the months', async () => {
    renderFor('monthly');
    await userEvent.click(screen.getByRole('checkbox', { name: /Utility/ }));

    expect(total()).toBe(String(300_000 + 40_000 + 30_000));

    await userEvent.clear(months());
    await userEvent.type(months(), '3');
    expect(total()).toBe(String(900_000 + 120_000 + 30_000));
  });

  it('lets the person clear the box and type a new number without it jumping', async () => {
    renderFor('monthly');

    await userEvent.clear(months());
    expect(months().value).toBe('');
    await userEvent.type(months(), '7');

    expect(months().value).toBe('7');
    expect(total()).toBe(String(2_100_000 + 280_000));          // 7 months of the annual rent and service charge
  });

  it('keeps the months within a sensible range', async () => {
    renderFor('monthly');

    await userEvent.clear(months());
    await userEvent.type(months(), '99');
    await userEvent.tab();
    expect(months().value).toBe('24');
    expect(total()).toBe(String(7_200_000 + 960_000));          // 24 months of the annual figures

    await userEvent.clear(months());
    await userEvent.type(months(), '0');
    await userEvent.tab();
    expect(months().value).toBe('1');

    await userEvent.clear(months());
    await userEvent.type(months(), '-3');
    await userEvent.tab();
    expect(months().value).toBe('1');
    expect(Number(total())).toBeGreaterThan(0);
  });

  it('creates the invoice with those amounts and says how many months they cover', async () => {
    const store = renderFor('quarterly');

    await userEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

    const inv = store.getState().data.invoices[0];
    expect(inv.total).toBe(1_020_000);
    expect(inv.cycle).toBe('quarterly');
    expect(inv.lineItems.map((l) => [l.type, l.amount, l.description])).toEqual([
      ['rent', 900_000, 'Rent — 3 months'],
      ['service-charge', 120_000, 'Service charge — 3 months'],
    ]);
  });

  it('goes back to the new lease’s own cycle when a different lease is picked', async () => {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({
      users: [{ id: 'me', role: 'manager', name: 'Me', email: 'me@x.test' }],
      properties: [{ id: 'p1', name: 'Alpha', owners: [{ ownerId: 'me' }] }],
      units: [unit], tenants: [{ id: 't1', name: 'Ada Obi', email: 'a@x.test' }],
      leases: [lease('monthly'), { ...lease('annual'), id: 'l2', code: 'LSE-2' }],
    } as never));
    store.dispatch(login({ userId: 'me', token: 't' }));
    renderWithStore(<GenerateInvoiceModal onClose={vi.fn()} />, store);

    await userEvent.clear(months());
    await userEvent.type(months(), '5');
    await userEvent.tab();
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'l2');

    expect(months().value).toBe('12');
  });
});
