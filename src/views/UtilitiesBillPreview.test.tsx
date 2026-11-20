import { fireEvent, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import { ReadingModal } from './Utilities';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import { today } from '@/lib/format';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: { billRuns: vi.fn().mockResolvedValue([]) } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/utilities' }));

function setup(role: string, over: object = {}, leases?: object[], calls?: string[]) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'u', role, name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }],
    tenants: [{ id: 't1', name: 'Ada Obi' }],
    leases: leases ?? [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' }],
    meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over }],
  } as never));
  store.dispatch(login({ userId: 'u', token: 't' }));
  if (calls) {
    const dispatch = store.dispatch;
    store.dispatch = ((a: { type: string }) => { calls.push(a.type); return dispatch(a); }) as never;
  }
  renderWithStore(<ReadingModal meterId="m1" onClose={() => {}} />, store);
  return store;
}

describe('bill preview in the meter modal', () => {
  it('shows who would be billed, what for, and when it falls due', () => {
    setup('manager');
    const card = screen.getByTestId('bill-preview');
    expect(card.textContent).toContain('Ada Obi · LSE-1');
    expect(card.textContent).toContain('100 → 250 kWh');
    expect(card.textContent).toContain('150 × ₦60');
    expect(card.textContent).toContain('9,000');
    expect(screen.getByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
    expect(today()).toBeTruthy();
  });

  it('says why a meter cannot be billed, and offers no bill button', () => {
    setup('manager', {}, []);
    expect(screen.getByTestId('bill-preview').textContent).toMatch(/no tenant at the moment/);
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
  });

  it('says so when there is nothing new to bill', () => {
    setup('manager', { billedReading: 250 });
    expect(screen.getByTestId('bill-preview').textContent).toMatch(/Nothing to bill/);
  });

  it.each(['maintenance', 'finance', 'owner', 'agent'])('gives a %s a read-only view, since the server would refuse their changes', (role) => {
    setup(role);

    expect(screen.queryByTestId('bill-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log reading' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText('Readings · MTR-1')).toBeInTheDocument();
    expect(screen.getByText('Current reading')).toBeInTheDocument();
    expect(screen.getByText('₦60 per kWh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it.each(['admin', 'manager'])('shows the preview, the reading form and the bill button to an %s', (role) => {
    setup(role);
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log reading' })).toBeInTheDocument();
    expect(screen.getByTestId('bill-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });
});

describe('arriving from an invoice (staff)', () => {
  it('opens the meter named in the link', async () => {
    const mod = await import('next/navigation');
    vi.spyOn(mod, 'useSearchParams').mockReturnValue(new URLSearchParams('meter=m1') as never);
    const { Utilities } = await import('./Utilities');
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({
      users: [{ id: 'u', role: 'manager', name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
      properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
      units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }], tenants: [], leases: [],
      meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [] }],
    } as never));
    store.dispatch(login({ userId: 'u', token: 't' }));
    renderWithStore(<Utilities />, store);

    expect(screen.getByText('Log reading · MTR-1')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('preview for a typed reading', () => {
  const type = (v: string) => fireEvent.change(screen.getByRole('spinbutton'), { target: { value: v } });

  it('prices the reading typed in, and offers to log it and bill in one go', () => {
    setup('manager');                                   // logged: 250, billed up to 100 at ₦60

    type('300');

    const card = screen.getByTestId('bill-preview');
    expect(card.textContent).toContain('Invoice if you log this reading and bill');
    expect(card.textContent).toContain('100 → 300 kWh');
    expect(card.textContent).toContain('200 × ₦60');
    expect(card.textContent).toContain('12,000');
    expect(screen.getByRole('button', { name: /Log & bill ₦12,000/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to tenant/ })).toBeNull();
  });

  it('goes back to the logged reading when the typed one is not above it', () => {
    setup('manager');

    type('300');
    type('250');

    expect(screen.getByTestId('bill-preview').textContent).toContain('Invoice if billed now');
    expect(screen.getByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('logs the reading and then bills it, in that order', () => {
    const calls: string[] = [];
    const store = setup('manager', {}, undefined, calls);

    type('300');
    fireEvent.click(screen.getByRole('button', { name: /Log & bill/ }));

    expect(calls.filter((t) => t.startsWith('data/'))).toEqual(['data/addMeterReading', 'data/billMeter']);
    const m = store.getState().data.meters[0];
    expect(m.currentReading).toBe(300);
    expect(m.billedReading).toBe(300);
  });
});

describe('the "Bill all ready" button', () => {
  async function page(role: string, over: object = {}, extra?: object[]) {
    const { Utilities } = await import('./Utilities');
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({
      users: [{ id: 'u', role, name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
      properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
      units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }, { id: 'u2', propertyId: 'p1', code: 'A02' }], tenants: [{ id: 't1', name: 'Ada Obi' }],
      leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' }],
      meters: [
        { id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over },
        ...(extra ?? []),
      ],
    } as never));
    store.dispatch(login({ userId: 'u', token: 't' }));
    renderWithStore(<Utilities />, store);
  }

  it('does not count a meter in a unit nobody lives in', async () => {
    await page('manager', {}, [{ id: 'm2', propertyId: 'p1', unitId: 'u2', type: 'electricity', meterNumber: 'MTR-2', unitOfMeasure: 'kWh', previousReading: 0, currentReading: 90, ratePerUnit: 60, history: [] }]);
    expect(screen.getByRole('button', { name: /Bill all ready \(1\)/ })).toBeInTheDocument();      // MTR-1 only
  });

  it('is not shown when the only unbilled meters are in empty units', async () => {
    await page('manager', { billedReading: 250 }, [{ id: 'm2', propertyId: 'p1', unitId: 'u2', type: 'electricity', meterNumber: 'MTR-2', unitOfMeasure: 'kWh', previousReading: 0, currentReading: 90, ratePerUnit: 60, history: [] }]);
    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
  });

  it('counts the meters that are ready, for a manager', async () => {
    await page('manager');
    expect(screen.getByRole('button', { name: /Bill all ready \(1\)/ })).toBeInTheDocument();
  });

  it('is not shown when nothing is ready', async () => {
    await page('manager', { billedReading: 250 });
    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
  });

  it('is not shown to people the server would refuse', async () => {
    await page('finance');
    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
  });

  it('lists the recent bulk runs for someone who can bill, and does not even ask for them otherwise', async () => {
    vi.mocked(api.billRuns).mockClear();
    vi.mocked(api.billRuns).mockResolvedValue([{ id: 'r1', propertyId: 'p1', propertyName: 'Alpha', userId: 'u', userName: 'Fatima Adeyemi', invoices: 24, total: 620_844, unitsSkipped: 0, createdAt: `${today()}T09:00:00+00:00` }] as never);
    await page('manager');
    expect(await screen.findByTestId('recent-bulk-runs')).toHaveTextContent('Alpha · 24 invoices');
    expect(api.billRuns).toHaveBeenCalledTimes(1);
  });

  it('does not ask for the recent runs when the person cannot bill', async () => {
    vi.mocked(api.billRuns).mockClear();
    await page('finance');
    expect(screen.queryByTestId('recent-bulk-runs')).toBeNull();
    expect(api.billRuns).not.toHaveBeenCalled();
  });
});

describe('what a typed reading adds', () => {
  const type = (v: string) => fireEvent.change(screen.getByRole('spinbutton'), { target: { value: v } });

  it('says nothing until a higher reading is typed, since it would only repeat the invoice card', () => {
    setup('manager');
    expect(screen.queryByTestId('reading-adds')).toBeNull();

    type('250');
    expect(screen.queryByTestId('reading-adds')).toBeNull();
    type('200');
    expect(screen.queryByTestId('reading-adds')).toBeNull();
  });

  it('says what the new reading adds, apart from the invoice total that includes earlier unbilled use', () => {
    setup('manager');                                   // logged 250, billed up to 100, ₦60 a kWh

    type('300');

    expect(screen.getByTestId('reading-adds').textContent).toContain('This reading adds 50 kWh × ₦60');
    expect(screen.getByTestId('reading-adds').textContent).toContain('3,000');                  // just the new 50 kWh …
    expect(screen.getByTestId('bill-preview').textContent).toContain('12,000');                  // … while the invoice covers 100 → 300
  });

  it('is not offered to someone who may only look: they get no input to type into', () => {
    setup('maintenance');

    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByTestId('reading-adds')).toBeNull();
  });

  it('formats a thousands rate and decimal use readably', () => {
    setup('manager', { ratePerUnit: 1250, unitOfMeasure: 'kg', currentReading: 100, previousReading: 90 });

    type('112.5');

    expect(screen.getByTestId('reading-adds').textContent).toContain('This reading adds 12.5 kg × ₦1,250');
    expect(screen.getByTestId('reading-adds').textContent).toContain('15,625');
  });
});

describe('opening a meter from the list', () => {
  async function page(role: string) {
    const { Utilities } = await import('./Utilities');
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({
      users: [{ id: 'u', role, name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
      properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
      units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }], tenants: [{ id: 't1', name: 'Ada Obi' }],
      leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' }],
      meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [{ date: '2026-10-01', value: 100 }, { date: '2026-11-01', value: 250 }] }],
    } as never));
    store.dispatch(login({ userId: 'u', token: 't' }));
    renderWithStore(<Utilities />, store);
  }

  it('invites a manager to log a reading or bill', async () => {
    await page('manager');
    expect(screen.getByText('Click a meter to log a reading or bill the tenant')).toBeInTheDocument();

    fireEvent.click(screen.getByText('MTR-1'));

    expect(screen.getByText('Log reading · MTR-1')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it.each(['owner', 'agent', 'maintenance', 'finance'])('lets a %s look at the readings and says that is all it does', async (role) => {
    await page(role);
    expect(screen.getByText('Click a meter to see its readings')).toBeInTheDocument();

    fireEvent.click(screen.getByText('MTR-1'));

    expect(screen.getByText('Readings · MTR-1')).toBeInTheDocument();
    expect(screen.getByText('Not yet billed')).toBeInTheDocument();        // the read-only facts: rate, what is waiting, and the history
    expect(screen.getByText('01 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log reading' })).toBeNull();
  });
});

describe('a tenant who has just moved out', () => {
  const daysAgo = (n: number) => dayjs().subtract(n, 'day').format('YYYY-MM-DD');
  const left = (terminatedOn: string) => [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'terminated', startDate: '2000-01-01', endDate: '2999-12-31', terminatedOn }];

  it('is previewed as a final bill, naming who left and when', () => {
    setup('manager', {}, left(daysAgo(10)));

    const card = screen.getByTestId('bill-preview');
    expect(card.textContent).toContain('Ada Obi · LSE-1');
    expect(screen.getByTestId('final-note').textContent).toMatch(/Final bill: Ada Obi moved out on /);
    expect(screen.getByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('is not a final bill while they still hold the unit', () => {
    setup('manager');

    expect(screen.queryByTestId('final-note')).toBeNull();
  });

  it('is no longer billed once the sixty days are over: the unit is simply vacant', () => {
    setup('manager', {}, left(daysAgo(61)));

    expect(screen.getByTestId('bill-preview').textContent).toMatch(/no tenant at the moment/);
    expect(screen.queryByTestId('final-note')).toBeNull();
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
  });
});
