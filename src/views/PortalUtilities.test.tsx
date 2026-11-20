import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortalUtilities } from './PortalUtilities';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import { today } from '@/lib/format';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal/utilities' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => vi.fn(), useParams: () => ({}) }));

const meter = (over: object) => ({
  id: 'm', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh',
  previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over,
});

function setup(meters: object[], opts: { leaseStatus?: string; tenant?: boolean; endDate?: string } = {}) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'tu', role: 'tenant', name: 'Ada Obi', email: 'a@x.test', tenantId: 't1' }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }, { id: 'u2', propertyId: 'p1', code: 'A02' }],
    tenants: [{ id: 't1', name: 'Ada Obi' }],
    leases: opts.tenant === false ? [] : [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: opts.leaseStatus ?? 'active', startDate: '2026-01-01', endDate: opts.endDate ?? '2999-12-31' }],
    meters,
  } as never));
  store.dispatch(login({ userId: 'tu', token: 't' }));
  renderWithStore(<PortalUtilities />, store);
}

describe('tenant utilities page', () => {
  it('shows each meter on the tenant’s unit with its reading, rate and what is not yet billed', () => {
    setup([
      meter({ id: 'e', type: 'electricity', meterNumber: 'MTR-E' }),
      meter({ id: 'w', type: 'water', meterNumber: 'WTR-W', unitOfMeasure: 'm³', ratePerUnit: 350, previousReading: 200, currentReading: 214 }),
      meter({ id: 'g', type: 'gas', meterNumber: 'GAS-G', unitOfMeasure: 'kg', ratePerUnit: 1250, previousReading: 112, currentReading: 128 }),
    ]);

    expect(screen.getByText('Unit A01', { exact: false })).toBeInTheDocument();
    for (const n of ['MTR-E', 'WTR-W', 'GAS-G']) expect(screen.getByText(n)).toBeInTheDocument();
    expect(screen.getByText('214 m³')).toBeInTheDocument();
    expect(screen.getByText('₦350 per m³')).toBeInTheDocument();
    expect(screen.getByText('₦1,250 per kg')).toBeInTheDocument();
  });

  it('adds the meters up into one figure for use since the last bill', () => {
    setup([
      meter({ id: 'e', type: 'electricity' }),                                                                                        // 150 × 60 = 9,000
      meter({ id: 'w', type: 'water', meterNumber: 'W', unitOfMeasure: 'm³', ratePerUnit: 350, previousReading: 200, currentReading: 214 }), // 14 × 350 = 4,900
      meter({ id: 'g', type: 'gas', meterNumber: 'G', unitOfMeasure: 'kg', ratePerUnit: 1250, previousReading: 112, currentReading: 128 }), // 16 × 1,250 = 20,000
    ]);

    expect(screen.getByText('Used since your last utility bill').parentElement!.textContent).toContain('33,900');
  });

  it('counts only use after the reading the meter was last billed up to', () => {
    setup([meter({ billedReading: 230, billedAt: '2026-11-01' })]);          // 250 − 230 = 20 kWh × 60

    expect(screen.getByText('Used since your last utility bill').parentElement!.textContent).toContain('1,200');
    expect(screen.getByText(/Billed up to 230 kWh on 01 Nov 2026/)).toBeInTheDocument();
  });

  it('owes nothing for a meter that is fully billed', () => {
    setup([meter({ billedReading: 250, billedAt: '2026-11-18' })]);

    expect(screen.getByText('Used since your last utility bill').parentElement!.textContent).toContain('₦0');
  });

  it('lists past use from the reading history', () => {
    setup([meter({ currentReading: 205, history: [{ date: '2026-08-01', value: 100 }, { date: '2026-09-01', value: 130 }, { date: '2026-10-01', value: 190 }] })]);

    expect(screen.getByText('Past use')).toBeInTheDocument();
    expect(screen.getByText('30 kWh')).toBeInTheDocument();
    expect(screen.getByText('60 kWh')).toBeInTheDocument();
    expect(screen.getByText('15 kWh')).toBeInTheDocument();                 // 205 − 190, since the last recorded reading
    expect(screen.getByText('Latest')).toBeInTheDocument();
  });

  it('says a meter has never been billed', () => {
    setup([meter({})]);

    expect(screen.getByText('Not billed yet')).toBeInTheDocument();
  });

  it('never shows a meter from another unit', () => {
    setup([meter({ id: 'mine', meterNumber: 'MINE' }), meter({ id: 'theirs', unitId: 'u2', meterNumber: 'THEIRS' })]);

    expect(screen.getByText('MINE')).toBeInTheDocument();
    expect(screen.queryByText('THEIRS')).toBeNull();
  });

  it('says so when the unit has no meters', () => {
    setup([]);

    expect(screen.getByText('No meters on your unit')).toBeInTheDocument();
  });

  it('asks a tenant with no tenancy to contact their manager', () => {
    setup([], { tenant: false });

    expect(screen.getByText('No tenancy linked')).toBeInTheDocument();
  });
});

describe('arriving from an invoice', () => {
  it('marks the meter the invoice line was billed from', async () => {
    const mod = await import('next/navigation');
    vi.spyOn(mod, 'useSearchParams').mockReturnValue(new URLSearchParams('meter=w') as never);
    setup([meter({ id: 'e' }), meter({ id: 'w', type: 'water', meterNumber: 'WTR-W', unitOfMeasure: 'm³', ratePerUnit: 350 })]);

    expect(document.getElementById('meter-w')!.querySelector('.ring-2')).not.toBeNull();
    expect(document.getElementById('meter-e')!.querySelector('.ring-2')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('a tenant whose lease has ended', () => {
  it.each(['expired', 'terminated'])('is told the tenancy is over, not shown the old unit’s meters (%s)', (leaseStatus) => {
    setup([meter({ id: 'e' })], { leaseStatus });

    expect(screen.getByText('No current tenancy')).toBeInTheDocument();
    expect(screen.queryByText('MTR-1')).toBeNull();
  });

  it('is told the same when the end date has passed before the status caught up', () => {
    setup([meter({ id: 'e' })], { endDate: '2000-01-01' });

    expect(screen.getByText('No current tenancy')).toBeInTheDocument();
  });

  it('still sees the meters while the lease runs, including on its last day', () => {
    setup([meter({ id: 'e' })], { endDate: today() });

    expect(screen.getByText('MTR-1')).toBeInTheDocument();
  });

  it('keeps the plain message for someone who never had a lease', () => {
    setup([], { tenant: false });

    expect(screen.getByText('No tenancy linked')).toBeInTheDocument();
  });
});
