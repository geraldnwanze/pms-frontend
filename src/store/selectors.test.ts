import { describe, expect, it, vi } from 'vitest';
import { computeKpis, invoiceOutstanding, isLeaseExpiring, isOverdue } from './selectors';
import type { Invoice, Lease } from '@/types';
import { localNoon } from '@/test/utils';

const invoice = (over: Partial<Invoice>): Invoice =>
  ({ id: 'i1', total: 100_000, amountPaid: 0, status: 'unpaid', dueDate: '2026-11-01', ...over }) as Invoice;

const lease = (over: Partial<Lease>): Lease => ({ id: 'l1', status: 'active', endDate: '2026-12-01', ...over }) as Lease;

function atNov11() {
  vi.useFakeTimers();
  vi.setSystemTime(localNoon(2026, 11, 11));
}

describe('invoiceOutstanding', () => {
  it('is total minus paid, floored at zero', () => {
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 40 }))).toBe(60);
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 100 }))).toBe(0);
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 130 }))).toBe(0);
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 0, status: 'cancelled' }))).toBe(0);      // nothing is owed on a cancelled invoice
    expect(invoiceOutstanding(invoice({ total: 100, amountPaid: 40, status: 'cancelled' }))).toBe(0);
  });
});

describe('isOverdue — decided by the calendar, not the stored status', () => {
  it('flags unpaid invoices past their due date', () => {
    atNov11();
    expect(isOverdue(invoice({ dueDate: '2026-11-10' }))).toBe(true);
  });

  it('is not overdue on the due date itself, or before it', () => {
    atNov11();
    expect(isOverdue(invoice({ dueDate: '2026-11-11' }))).toBe(false);
    expect(isOverdue(invoice({ dueDate: '2026-11-12' }))).toBe(false);
  });

  it('counts part-paid invoices still owing money — the stored status says "partially-paid", the server says overdue', () => {
    atNov11();
    expect(isOverdue(invoice({ dueDate: '2026-10-01', status: 'partially-paid', amountPaid: 40_000 }))).toBe(true);
  });

  it('ignores the stored status field entirely (it can lag behind the calendar)', () => {
    atNov11();
    expect(isOverdue(invoice({ dueDate: '2026-10-01', status: 'unpaid' }))).toBe(true);
    expect(isOverdue(invoice({ dueDate: '2026-12-01', status: 'overdue' }))).toBe(false);
  });

  it('never flags settled or cancelled invoices', () => {
    atNov11();
    expect(isOverdue(invoice({ dueDate: '2026-10-01', status: 'fully-paid', amountPaid: 100_000 }))).toBe(false);
    expect(isOverdue(invoice({ dueDate: '2026-10-01', status: 'cancelled' }))).toBe(false);
    expect(isOverdue(invoice({ dueDate: '2026-10-01', amountPaid: 100_000, status: 'unpaid' }))).toBe(false);
  });

  it('moves with the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    const inv = invoice({ dueDate: '2026-11-12' });
    expect(isOverdue(inv)).toBe(false);
    vi.setSystemTime(localNoon(2026, 11, 13));
    expect(isOverdue(inv)).toBe(true);
  });
});

describe('isLeaseExpiring — running and ending within the window', () => {
  it('includes leases ending today through 60 days out', () => {
    atNov11();
    expect(isLeaseExpiring(lease({ endDate: '2026-11-11' }))).toBe(true);
    expect(isLeaseExpiring(lease({ endDate: '2026-12-01' }))).toBe(true);
    expect(isLeaseExpiring(lease({ endDate: '2027-01-10' }))).toBe(true); // exactly +60
  });

  it('excludes leases beyond the window or already ended', () => {
    atNov11();
    expect(isLeaseExpiring(lease({ endDate: '2027-01-11' }))).toBe(false); // +61
    expect(isLeaseExpiring(lease({ endDate: '2026-11-10' }))).toBe(false);
  });

  it('only considers active/expiring leases', () => {
    atNov11();
    for (const status of ['expired', 'terminated', 'renewed'] as const) {
      expect(isLeaseExpiring(lease({ status, endDate: '2026-12-01' }))).toBe(false);
    }
    expect(isLeaseExpiring(lease({ status: 'expiring', endDate: '2026-12-01' }))).toBe(true);
  });

  it('does not trust a stale "expiring" status when the end date is far away', () => {
    atNov11();
    expect(isLeaseExpiring(lease({ status: 'expiring', endDate: '2027-06-01' }))).toBe(false);
  });

  it('honours a custom window', () => {
    atNov11();
    expect(isLeaseExpiring(lease({ endDate: '2026-12-01' }), 10)).toBe(false);
    expect(isLeaseExpiring(lease({ endDate: '2026-11-20' }), 10)).toBe(true);
  });
});

describe('computeKpis — the rent roll is annual', () => {
  const data = {
    properties: [{ id: 'p1', name: 'A', owners: [] }], buildings: [], tenants: [], payments: [], maintenance: [], expenses: [], invoices: [], leases: [],
    units: [
      { id: 'u1', propertyId: 'p1', status: 'occupied', rent: 3_600_000 },
      { id: 'u2', propertyId: 'p1', status: 'occupied', rent: 2_400_000 },
      { id: 'u3', propertyId: 'p1', status: 'available', rent: 9_000_000 },
    ],
  } as never;

  it('is the sum of the annual rents of the occupied units, under a name that says so', () => {
    const kpis = computeKpis(data, new Set(['p1']));

    expect(kpis.annualRentRoll).toBe(6_000_000);
    expect(kpis).not.toHaveProperty('monthlyExpectedRent');
  });
});
