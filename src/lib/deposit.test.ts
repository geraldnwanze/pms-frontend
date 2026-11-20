import { describe, it, expect } from 'vitest';
import { depositHeld, depositOutstanding, depositReceived, unbilledUnits } from './deposit';
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
