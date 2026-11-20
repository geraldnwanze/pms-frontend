import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DepositCard } from './DepositCard';
import { makeTestStore, renderWithStore } from '@/test/utils';
import { dataActions } from '@/store/dataSlice';
import { login } from '@/store/authSlice';
import type { Lease } from '@/types';

const baseLease = (over: Partial<Lease> = {}): Lease => ({
  id: 'l1', code: 'LSE-1', propertyId: 'p1', unitId: 'u1', tenantId: 't1', status: 'active', billingCycle: 'annual', rent: 1_200_000,
  startDate: '2026-01-01', endDate: '2026-12-31', securityDeposit: 500_000, noticePeriodDays: 90, signed: true, createdAt: '2026-01-01', ...over,
});

const unpaid = (id: string, dueDate: string, total: number, amountPaid = 0) => ({ id, code: id.toUpperCase(), leaseId: 'l1', unitId: 'u1', propertyId: 'p1', tenantId: 't1', issueDate: '2026-01-01', dueDate, lineItems: [], total, amountPaid, status: 'overdue', cycle: 'monthly' });

function setup(lease: Lease, role = 'manager', extra: object = {}) {
  const store = makeTestStore();
  store.dispatch(dataActions.hydrateAll({ users: [{ id: 'me', role, name: 'Me', email: 'me@x.test' }], leases: [lease], ...extra } as never));
  store.dispatch(login({ userId: 'me', token: 't' }));
  renderWithStore(<DepositCard lease={store.getState().data.leases[0]} />, store);
  return store;
}

describe('DepositCard', () => {
  it('shows what is required, received and held, and what is still unpaid', () => {
    setup(baseLease({ depositLedger: [{ id: 'd1', type: 'received', amount: 200_000, date: '2026-01-02', note: 'Deposit received by cash' }] }));

    expect(screen.getByText('Security deposit')).toBeInTheDocument();
    expect(screen.getByText(/₦300,000 of the deposit has not been paid yet/)).toBeInTheDocument();
    expect(screen.getByText('Received', { selector: 'p' })).toBeInTheDocument();
  });

  it('renders nothing for a lease with no deposit and no history', () => {
    setup(baseLease({ securityDeposit: 0 }));

    expect(screen.queryByText('Security deposit')).not.toBeInTheDocument();
  });

  it('records a deposit through the modal, defaulting to the whole amount outstanding', async () => {
    const store = setup(baseLease());

    await userEvent.click(screen.getByRole('button', { name: /receive/i }));
    await userEvent.click(screen.getByRole('button', { name: /record deposit/i }));

    const ledger = store.getState().data.leases[0].depositLedger!;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'received', amount: 500_000 });
  });

  it('refuses more than is outstanding', async () => {
    const store = setup(baseLease());

    await userEvent.click(screen.getByRole('button', { name: /receive/i }));
    const amount = screen.getByRole('spinbutton');
    await userEvent.clear(amount);
    await userEvent.type(amount, '500001');

    expect(screen.getByText(/more than the ₦500,000 still outstanding/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record deposit/i })).toBeDisabled();
    expect(store.getState().data.leases[0].depositLedger ?? []).toHaveLength(0);
  });

  it('hides the money actions from people who cannot handle payments', () => {
    setup(baseLease(), 'agent');

    expect(screen.queryByRole('button', { name: /receive/i })).not.toBeInTheDocument();
  });

  it('settles an ended lease: keeps the deductions and refunds the rest', async () => {
    const store = setup(baseLease({ status: 'terminated', depositLedger: [{ id: 'd1', type: 'received', amount: 500_000, date: '2026-01-02', note: '' }] }));

    await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
    await userEvent.click(screen.getByRole('button', { name: /add a deduction/i }));
    await userEvent.type(screen.getByPlaceholderText(/repair of broken window/i), 'Broken window');
    const [amount] = screen.getAllByRole('spinbutton');
    await userEvent.type(amount, '80000');

    expect(screen.getByText('Refund to tenant').parentElement!.textContent).toContain('420,000');

    await userEvent.click(screen.getByRole('button', { name: /settle deposit/i }));

    const lease = store.getState().data.leases[0];
    expect(lease.depositSettledOn).toBeTruthy();
    expect(lease.depositLedger!.filter((e) => e.type === 'deduction').map((e) => e.amount)).toEqual([80_000]);
    expect(lease.depositLedger!.find((e) => e.type === 'refund')?.amount).toBe(420_000);
  });

  describe('using the deposit to pay unpaid invoices', () => {
    const ended = () => baseLease({ status: 'terminated', depositLedger: [{ id: 'd1', type: 'received', amount: 500_000, date: '2026-01-02', note: '' }] });
    const invoices = [unpaid('inv-new', '2026-03-01', 100_000), unpaid('inv-old', '2026-02-01', 200_000, 50_000)];

    it('offers nothing when the tenant owes nothing', async () => {
      setup(ended());
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));

      expect(screen.queryByText(/use the deposit to pay unpaid invoices/i)).not.toBeInTheDocument();
    });

    it('previews the split, oldest first, and refunds only what is left', async () => {
      setup(ended(), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      expect(screen.getByText(/still owes ₦250,000/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('checkbox'));

      expect(screen.getByText('Refund to tenant').parentElement!.textContent).toContain('250,000');
      const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '').filter((t) => t.startsWith('INV-'));
      expect(rows).toEqual(['INV-OLD₦150,000', 'INV-NEW₦100,000']);
    });

    it('pays the invoices and records the offsets when settled', async () => {
      const store = setup(ended(), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: /settle deposit/i }));

      const state = store.getState().data;
      expect(state.invoices.map((i) => [i.id, i.amountPaid, i.status]).sort()).toEqual([['inv-new', 100_000, 'fully-paid'], ['inv-old', 200_000, 'fully-paid']]);
      expect(state.leases[0].depositLedger!.filter((e) => e.type === 'offset').map((e) => e.amount)).toEqual([150_000, 100_000]);
      expect(state.leases[0].depositLedger!.find((e) => e.type === 'refund')?.amount).toBe(250_000);
    });

    it('takes the deductions first, so a short deposit pays the oldest invoice in part', async () => {
      const store = setup(baseLease({ status: 'terminated', depositLedger: [{ id: 'd1', type: 'received', amount: 200_000, date: '2026-01-02', note: '' }] }), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      await userEvent.click(screen.getByRole('button', { name: /add a deduction/i }));
      await userEvent.type(screen.getByPlaceholderText(/repair of broken window/i), 'Broken door');
      await userEvent.type(screen.getAllByRole('spinbutton')[0], '100000');
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: /settle deposit/i }));

      const state = store.getState().data;
      expect(state.invoices.find((i) => i.id === 'inv-old')).toMatchObject({ amountPaid: 150_000, status: 'partially-paid' });
      expect(state.invoices.find((i) => i.id === 'inv-new')?.amountPaid).toBe(0);
      expect(state.leases[0].depositLedger!.some((e) => e.type === 'refund')).toBe(false);
    });

    it('warns that the tenant will still owe money when the deposit falls short', async () => {
      setup(baseLease({ status: 'terminated', depositLedger: [{ id: 'd1', type: 'received', amount: 200_000, date: '2026-01-02', note: '' }] }), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      expect(screen.queryByText(/does not cover everything/)).not.toBeInTheDocument();     // not until it is applied

      await userEvent.click(screen.getByRole('checkbox'));

      expect(screen.getByText(/the tenant will still owe ₦50,000 after this/)).toBeInTheDocument();
    });

    it('does not warn when the deposit covers everything', async () => {
      setup(ended(), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      await userEvent.click(screen.getByRole('checkbox'));

      expect(screen.queryByText(/does not cover everything/)).not.toBeInTheDocument();
    });

    it('leaves invoices alone unless asked', async () => {
      const store = setup(ended(), 'manager', { invoices });
      await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
      await userEvent.click(screen.getByRole('button', { name: /settle deposit/i }));

      expect(store.getState().data.invoices.every((i) => i.amountPaid < i.total)).toBe(true);
      expect(store.getState().data.leases[0].depositLedger!.find((e) => e.type === 'refund')?.amount).toBe(500_000);
    });
  });

  it('will not settle with deductions bigger than the deposit, or without a reason', async () => {
    setup(baseLease({ status: 'terminated', depositLedger: [{ id: 'd1', type: 'received', amount: 100_000, date: '2026-01-02', note: '' }] }));

    await userEvent.click(screen.getByRole('button', { name: /^settle$/i }));
    await userEvent.click(screen.getByRole('button', { name: /add a deduction/i }));
    expect(screen.getByRole('button', { name: /settle deposit/i })).toBeDisabled();       // empty row

    await userEvent.type(screen.getByPlaceholderText(/repair of broken window/i), 'Repainting');
    await userEvent.type(screen.getAllByRole('spinbutton')[0], '100001');

    expect(screen.getByText(/more than the deposit held/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /settle deposit/i })).toBeDisabled();
  });

  it('offers no settle button while the lease is still current', () => {
    setup(baseLease({ depositLedger: [{ id: 'd1', type: 'received', amount: 500_000, date: '2026-01-02', note: '' }] }));

    expect(screen.queryByRole('button', { name: /^settle$/i })).not.toBeInTheDocument();
  });

  it('offers no settle button once the deposit is settled', () => {
    setup(baseLease({ status: 'terminated', depositSettledOn: '2026-02-01', depositLedger: [{ id: 'd1', type: 'received', amount: 500_000, date: '2026-01-02', note: '' }, { id: 'd2', type: 'refund', amount: 500_000, date: '2026-02-01', note: '' }] }));

    expect(screen.queryByRole('button', { name: /^settle$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Settled/)).toBeInTheDocument();
  });
});

describe('late fees and meter billing in the store', () => {
  const invoice = { id: 'i1', code: 'INV-1', leaseId: 'l1', unitId: 'u1', propertyId: 'p1', tenantId: 't1', issueDate: '2026-01-01', dueDate: '2026-01-10', lineItems: [{ id: 'a', description: 'Rent', type: 'rent', amount: 100_000 }], total: 110_000, amountPaid: 100_000, status: 'overdue', cycle: 'monthly', penalty: 10_000 };

  it('waiving removes the fee from the total and can settle an invoice that was otherwise paid', () => {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({ invoices: [invoice] } as never));

    store.dispatch(dataActions.waiveLateFee({ invoiceId: 'i1', actorId: 'me', reason: 'Bank delay' }));

    const inv = store.getState().data.invoices[0];
    expect(inv.penalty).toBe(0);
    expect(inv.total).toBe(100_000);
    expect(inv.status).toBe('fully-paid');
    expect(inv.lateFeeWaivedOn).toBeTruthy();
  });

  it('billing a meter moves its billed marker to the latest reading', () => {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({ meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'water', meterNumber: 'W1', unitOfMeasure: 'm³', previousReading: 10, currentReading: 40, ratePerUnit: 100, history: [] }] } as never));

    store.dispatch(dataActions.billMeter({ meterId: 'm1', actorId: 'me' }));

    expect(store.getState().data.meters[0].billedReading).toBe(40);
  });

  it('a second reading before billing does not lose the first stretch of use', () => {
    const store = makeTestStore();
    store.dispatch(dataActions.hydrateAll({ meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'water', meterNumber: 'W1', unitOfMeasure: 'm³', previousReading: 10, currentReading: 40, ratePerUnit: 100, history: [] }] } as never));

    store.dispatch(dataActions.addMeterReading({ meterId: 'm1', value: 55, date: '2026-02-01' }));

    const m = store.getState().data.meters[0];
    expect(m.billedReading).toBe(10);
    expect(m.currentReading).toBe(55);
  });
});
