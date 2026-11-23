import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingModal } from './Utilities';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import { today } from '@/lib/format';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { billRuns: vi.fn().mockResolvedValue([]), previewMeterBill: vi.fn(), billAllMeters: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => '/utilities' }));

// What the server sends with the data: which roles manage meters, and what each role may do (config/rbac.php).
const RBAC = {
  roles: ['admin', 'owner', 'manager', 'agent', 'finance', 'maintenance', 'tenant', 'user'],
  permissions: {
    admin: ['view', 'create', 'edit', 'delete'], owner: ['view', 'export'], manager: ['view', 'create', 'edit'], agent: ['view', 'create', 'edit'],
    finance: ['view', 'create', 'edit'], maintenance: ['view', 'edit'], tenant: ['view', 'create'], user: ['view', 'create'],
  },
  resources: { meters: { view: ['admin', 'owner', 'manager', 'agent', 'finance', 'maintenance', 'tenant'], manage: ['admin', 'owner', 'manager'] } },
};

/** The server's answer for a meter logged at 250 and billed up to 100, at ₦60. */
const answer = (over: object = {}) => ({
  ok: true, tenantName: 'Ada Obi', leaseCode: 'LSE-1', issueDate: '2026-11-15', dueDate: '2026-11-29',
  from: 100, to: 250, units: 150, rate: 60, total: 9000, final: false, endedOn: null, ...over,
});
const refusal = (reason: string) => ({ ok: false, reason });

const previewMeterBill = vi.mocked(api.previewMeterBill);
const billAllMeters = vi.mocked(api.billAllMeters);

beforeEach(() => {
  previewMeterBill.mockReset();
  previewMeterBill.mockImplementation(async (_id, reading) => (reading === undefined ? answer() : answer({ to: reading, units: reading - 100, total: Math.round((reading - 100) * 60) })) as never);
  billAllMeters.mockReset();
  billAllMeters.mockResolvedValue({ dryRun: true, invoices: 0, meters: 1, total: 9000, units: [], skipped: [] } as never);
});

function hydrate(role: string, over: object = {}, extra: Record<string, unknown> = {}) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({
    users: [{ id: 'u', role, name: 'Staff', email: 's@x.test', propertyIds: ['p1'] }],
    properties: [{ id: 'p1', name: 'Alpha', owners: [], amenities: [] }],
    units: [{ id: 'u1', propertyId: 'p1', code: 'A01' }],
    tenants: [{ id: 't1', name: 'Ada Obi' }],
    leases: [{ id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', startDate: '2000-01-01', endDate: '2999-12-31' }],
    meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'electricity', meterNumber: 'MTR-1', unitOfMeasure: 'kWh', previousReading: 100, currentReading: 250, ratePerUnit: 60, history: [], ...over }],
    rbac: RBAC,
    ...extra,
  } as never));
  store.dispatch(login({ userId: 'u', token: 't' }));
  return store;
}

function setup(role: string, over: object = {}, calls?: string[]) {
  const store = hydrate(role, over);
  if (calls) {
    const dispatch = store.dispatch;
    store.dispatch = ((a: { type: string }) => { calls.push(a.type); return dispatch(a); }) as never;
  }
  renderWithStore(<ReadingModal meterId="m1" onClose={() => {}} />, store);
  return store;
}

const card = () => screen.findByTestId('bill-preview');
const ready = async () => { await screen.findByText('To'); };       // the server's answer has arrived and is shown

describe('bill preview in the meter modal', () => {
  it('shows who would be billed, what for, and when it falls due, as the server works it out', async () => {
    setup('manager');

    await ready();
    const c = await card();
    expect(c.textContent).toContain('Ada Obi · LSE-1');
    expect(c.textContent).toContain('100 → 250 kWh');
    expect(c.textContent).toContain('150 × ₦60');
    expect(c.textContent).toContain('9,000');
    expect(c.textContent).toContain('29 Nov 2026');
    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
    expect(previewMeterBill).toHaveBeenCalledWith('m1', undefined);
    expect(today()).toBeTruthy();
  });

  it('offers nothing to bill until the server has answered', async () => {
    let resolve!: (v: never) => void;
    previewMeterBill.mockImplementation(() => new Promise((r) => { resolve = r as never; }));
    setup('manager');

    expect((await card()).textContent).toContain('Checking what billing would raise');
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();

    resolve(answer() as never);
    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('shows the server’s reason when a meter cannot be billed, and offers no bill button', async () => {
    previewMeterBill.mockResolvedValue(refusal('This unit has no tenant at the moment, so there is nobody to bill.') as never);
    setup('manager');

    await waitFor(async () => expect((await card()).textContent).toMatch(/no tenant at the moment/));
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
  });

  it('passes on whatever reason the server gives, such as nothing new to bill', async () => {
    previewMeterBill.mockResolvedValue(refusal('Nothing to bill: no use has been read since the last bill.') as never);
    setup('manager');

    await waitFor(async () => expect((await card()).textContent).toMatch(/Nothing to bill/));
  });

  it('says so, and offers no bill button, when the server cannot be reached', async () => {
    previewMeterBill.mockRejectedValue(new Error('offline'));
    setup('manager');

    await waitFor(async () => expect((await card()).textContent).toMatch(/Could not check what billing would raise/));
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Log reading' })).toBeInTheDocument();     // logging a reading does not depend on it
  });

  it.each(['maintenance', 'finance', 'owner', 'agent'])('gives a %s a read-only view, and never asks the server for a preview', (role) => {
    setup(role);

    expect(screen.queryByTestId('bill-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: /Bill ₦/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log reading' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText('Readings · MTR-1')).toBeInTheDocument();
    expect(screen.getByText('Current reading')).toBeInTheDocument();
    expect(screen.getByText('₦60 per kWh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(previewMeterBill).not.toHaveBeenCalled();
  });

  it.each(['admin', 'manager'])('shows the preview, the reading form and the bill button to an %s', async (role) => {
    setup(role);

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log reading' })).toBeInTheDocument();
    expect(await card()).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('follows the server’s rules, not a list of roles: if finance may manage meters there, they get the controls', async () => {
    const store = hydrate('finance', {}, { rbac: { ...RBAC, resources: { meters: { view: RBAC.resources.meters.view, manage: ['admin', 'manager', 'finance'] } } } });
    renderWithStore(<ReadingModal meterId="m1" onClose={() => {}} />, store);

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('gives nobody the controls before the server’s rules have arrived', () => {
    const store = hydrate('manager', {}, { rbac: null });
    renderWithStore(<ReadingModal meterId="m1" onClose={() => {}} />, store);

    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(previewMeterBill).not.toHaveBeenCalled();
  });
});

describe('arriving from an invoice (staff)', () => {
  it('opens the meter named in the link', async () => {
    const mod = await import('next/navigation');
    vi.spyOn(mod, 'useSearchParams').mockReturnValue(new URLSearchParams('meter=m1') as never);
    const { Utilities } = await import('./Utilities');
    renderWithStore(<Utilities />, hydrate('manager'));

    expect(screen.getByText('Log reading · MTR-1')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('preview for a typed reading', () => {
  const type = (v: string) => fireEvent.change(screen.getByRole('spinbutton'), { target: { value: v } });

  it('asks the server to price the reading typed in, and offers to log it and bill in one go', async () => {
    setup('manager');                                   // logged: 250, billed up to 100 at ₦60
    await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ });

    type('300');

    expect(await screen.findByRole('button', { name: /Log & bill ₦12,000/ })).toBeInTheDocument();
    expect(previewMeterBill).toHaveBeenLastCalledWith('m1', 300);
    const c = screen.getByTestId('bill-preview');
    expect(c.textContent).toContain('Invoice if you log this reading and bill');
    expect(c.textContent).toContain('100 → 300 kWh');
    expect(c.textContent).toContain('200 × ₦60');
    expect(screen.queryByRole('button', { name: /to tenant/ })).toBeNull();
  });

  it('cannot bill the old figure while a newly typed reading is still being priced', async () => {
    setup('manager');
    await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ });

    type('300');

    expect(screen.queryByRole('button', { name: /bill ₦9,000/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /bill ₦/i })).toBeNull();
    expect(screen.getByTestId('bill-preview').textContent).toContain('Checking what billing would raise');
    await screen.findByRole('button', { name: /Log & bill ₦12,000/ });
  });

  it('waits for the typing to settle instead of asking the server about every keystroke', async () => {
    setup('manager');
    await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ });

    type('26');
    await new Promise((r) => setTimeout(r, 60));
    type('260');
    await new Promise((r) => setTimeout(r, 60));
    type('300');

    await screen.findByRole('button', { name: /Log & bill ₦12,000/ });
    expect(previewMeterBill.mock.calls.map((c) => c[1])).toEqual([undefined, 300]);
  });

  it('goes back to the logged reading when the typed one is not above it', async () => {
    setup('manager');
    await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ });

    type('300');
    await screen.findByRole('button', { name: /Log & bill ₦12,000/ });
    type('250');

    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
    expect(screen.getByTestId('bill-preview').textContent).toContain('Invoice if billed now');
    expect(previewMeterBill).toHaveBeenLastCalledWith('m1', undefined);
  });

  it('logs the reading and then bills it, in that order', async () => {
    const calls: string[] = [];
    const store = setup('manager', {}, calls);
    await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ });

    type('300');
    fireEvent.click(await screen.findByRole('button', { name: /Log & bill/ }));

    expect(calls.filter((t) => t.startsWith('data/'))).toEqual(['data/addMeterReading', 'data/billMeter']);
    const m = store.getState().data.meters[0];
    expect(m.currentReading).toBe(300);
    expect(m.billedReading).toBe(300);
  });
});

describe('the "Bill all ready" button', () => {
  async function page(role: string) {
    const { Utilities } = await import('./Utilities');
    renderWithStore(<Utilities />, hydrate(role));
  }

  it('is counted by the server’s own dry run, for the properties shown', async () => {
    billAllMeters.mockResolvedValue({ dryRun: true, invoices: 0, meters: 3, total: 9000, units: [], skipped: [] } as never);
    await page('manager');

    expect(await screen.findByRole('button', { name: /Bill all ready \(3\)/ })).toBeInTheDocument();
    expect(billAllMeters).toHaveBeenCalledWith({ propertyIds: ['p1'], dryRun: true });
  });

  it('is not shown when the server says nothing is ready', async () => {
    billAllMeters.mockResolvedValue({ dryRun: true, invoices: 0, meters: 0, total: 0, units: [], skipped: [] } as never);
    await page('manager');

    await waitFor(() => expect(billAllMeters).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
  });

  it('is not shown if the server cannot be asked', async () => {
    billAllMeters.mockRejectedValue(new Error('offline'));
    await page('manager');

    await waitFor(() => expect(billAllMeters).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
  });

  it('is not shown to people the server would refuse, and is not even asked about', async () => {
    await page('finance');

    expect(screen.queryByRole('button', { name: /Bill all ready/ })).toBeNull();
    expect(billAllMeters).not.toHaveBeenCalled();
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

  it('says what the new reading adds, apart from the invoice total that includes earlier unbilled use', async () => {
    setup('manager');                                   // logged 250, billed up to 100, ₦60 a kWh

    type('300');

    expect(screen.getByTestId('reading-adds').textContent).toContain('This reading adds 50 kWh × ₦60');
    expect(screen.getByTestId('reading-adds').textContent).toContain('3,000');                  // just the new 50 kWh …
    await waitFor(() => expect(screen.getByTestId('bill-preview').textContent).toContain('12,000'));   // … while the invoice covers 100 → 300
  });

  it('explains a reading below the current one, blocks logging it, and clears once corrected', () => {
    setup('manager');                                   // current reading 250 kWh

    type('240');
    expect(screen.getByTestId('reading-below')).toHaveTextContent('Not below the current reading (250 kWh).');
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Log reading' })).toBeDisabled();

    type('250');                                        // equal to the current reading is allowed
    expect(screen.queryByTestId('reading-below')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log reading' })).toBeEnabled();
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
    renderWithStore(<Utilities />, hydrate(role, { history: [{ date: '2026-10-01', value: 100 }, { date: '2026-11-01', value: 250 }] }));
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
  it('is shown as a final bill, naming who left and when, as the server says', async () => {
    previewMeterBill.mockResolvedValue(answer({ final: true, endedOn: '2026-11-10' }) as never);
    setup('manager');

    expect((await screen.findByTestId('final-note')).textContent).toMatch(/Final bill: Ada Obi moved out on 10 Nov 2026/);
    expect(await screen.findByRole('button', { name: /Bill ₦9,000 to tenant/ })).toBeInTheDocument();
  });

  it('is not marked as a final bill while they still hold the unit', async () => {
    setup('manager');

    await ready();
    expect(screen.queryByTestId('final-note')).toBeNull();
  });
});
