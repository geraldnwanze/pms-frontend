import { describe, it, expect } from 'vitest';
import { arrearsAwaitingPayment, depositHeld, depositOutstanding, depositReceived, unbilledUnits } from './deposit';
import type { DepositEntry } from '@/types';

const e = (type: DepositEntry['type'], amount: number): DepositEntry => ({ id: type + amount, type, amount, date: '2026-01-01', note: '' });

describe('deposit ledger', () => {
  it('holds what was received less what was kept or refunded', () => {
    const lease = { securityDeposit: 500, depositLedger: [e('received', 300), e('received', 200), e('deduction', 80), e('refund', 420)] };
    expect(depositReceived(lease)).toBe(500);
    expect(depositHeld(lease)).toBe(0);
  });
  it('treats a missing ledger as nothing held and the whole deposit outstanding', () => {
    expect(depositHeld({ depositLedger: null })).toBe(0);
    expect(depositOutstanding({ securityDeposit: 500, depositLedger: undefined })).toBe(500);
  });
  it('shows only what is still to be paid, never negative', () => {
    expect(depositOutstanding({ securityDeposit: 500, depositLedger: [e('received', 200)] })).toBe(300);
    expect(depositOutstanding({ securityDeposit: 100, depositLedger: [e('received', 200)] })).toBe(0);
  });
});

describe('unbilledUnits', () => {
  it('measures from the billed reading when there is one', () => {
    expect(unbilledUnits({ previousReading: 100, currentReading: 280, billedReading: 250 })).toBe(30);
  });
  it('falls back to the previous reading for a never-billed meter', () => {
    expect(unbilledUnits({ previousReading: 100, currentReading: 250 })).toBe(150);
  });
  it('is never negative and ignores float noise', () => {
    expect(unbilledUnits({ previousReading: 0, currentReading: 10, billedReading: 20 })).toBe(0);
    expect(unbilledUnits({ previousReading: 0.1, currentReading: 0.3 })).toBe(0.2);
  });
});

describe('arrearsAwaitingPayment', () => {
  const inv = (id: string, total: number, amountPaid = 0, over: object = {}) => ({ id, leaseId: 'l1', status: 'overdue', total, amountPaid, ...over }) as never;

  it('adds up what is still owed on invoices that have a payment waiting to be verified or started', () => {
    const invoices = [inv('a', 100_000, 40_000), inv('b', 50_000), inv('c', 70_000)];
    const payments = [{ invoiceId: 'a', status: 'pending-verification' }, { invoiceId: 'b', status: 'initiated' }];

    expect(arrearsAwaitingPayment(invoices, payments as never, 'l1')).toBe(60_000 + 50_000);
  });

  it('ignores payments that are finished (approved, rejected, refunded), cancelled invoices, other leases and settled invoices', () => {
    const invoices = [inv('a', 100_000), inv('b', 50_000, 0, { status: 'cancelled' }), inv('c', 70_000, 0, { leaseId: 'other' }), inv('d', 20_000, 20_000)];
    const payments = ['approved', 'rejected', 'refunded'].map((status, i) => ({ invoiceId: 'a', status, id: i }))
      .concat([{ invoiceId: 'b', status: 'pending-verification', id: 9 }, { invoiceId: 'c', status: 'pending-verification', id: 10 }, { invoiceId: 'd', status: 'pending-verification', id: 11 }]);

    expect(arrearsAwaitingPayment(invoices, payments as never, 'l1')).toBe(0);
  });
});
