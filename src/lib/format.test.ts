import { describe, expect, it, vi } from 'vitest';
import { SEED_TODAY, addMonths, formatCurrency, daysBetween, daysOverdue, daysUntil, fromNow, today } from './format';
import { localNoon } from '@/test/utils';

describe('today()', () => {
  it('is the real local date, not the old frozen demo date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(today()).toBe('2026-11-11');
    expect(today()).not.toBe(SEED_TODAY);
  });

  it('rolls over at midnight — it is a function precisely so a tab left open does not go stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 23, 59, 0));
    expect(today()).toBe('2026-11-11');
    vi.setSystemTime(new Date(2026, 10, 12, 0, 1, 0));
    expect(today()).toBe('2026-11-12');
  });

  it('pads single-digit months and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2027, 3, 5));
    expect(today()).toBe('2027-03-05');
  });
});

describe('SEED_TODAY', () => {
  it('stays fixed — the demo dataset is generated against it and must be reproducible', () => {
    expect(SEED_TODAY).toBe('2026-08-25');
  });
});

describe('daysUntil / daysOverdue (count from the real today)', () => {
  it('counts forwards and backwards from today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(daysUntil('2026-11-11')).toBe(0);
    expect(daysUntil('2026-11-21')).toBe(10);
    expect(daysUntil('2026-11-01')).toBe(-10);
  });

  it('daysOverdue is never negative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(daysOverdue('2026-11-01')).toBe(10);
    expect(daysOverdue('2026-11-11')).toBe(0);
    expect(daysOverdue('2026-12-01')).toBe(0);
  });

  it('follows the clock — the same date is a different distance on another day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(daysUntil('2026-11-20')).toBe(9);
    vi.setSystemTime(localNoon(2026, 11, 15));
    expect(daysUntil('2026-11-20')).toBe(5);
  });
});

describe('fromNow()', () => {
  it('describes recent and upcoming dates relative to today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(fromNow('2026-11-11')).toBe('Today');
    expect(fromNow('2026-11-10')).toBe('Yesterday');
    expect(fromNow('2026-11-08')).toBe('3d ago');
    expect(fromNow('2026-11-16')).toBe('in 5d');
  });

  it('switches to months for older dates and has a dash for nothing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(localNoon(2026, 11, 11));
    expect(fromNow('2026-08-11')).toBe('3mo ago');
    expect(fromNow(undefined)).toBe('—');
  });
});

describe('date helpers', () => {
  it('daysBetween is signed', () => {
    expect(daysBetween('2026-11-01', '2026-11-11')).toBe(10);
    expect(daysBetween('2026-11-11', '2026-11-01')).toBe(-10);
  });

  it('addMonths clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-11', 12)).toBe('2027-11-11');
    expect(addMonths('2026-03-15', -2)).toBe('2026-01-15');
  });
});

describe('formatCurrency()', () => {
  it('puts the minus sign in front of the naira symbol', () => {
    expect(formatCurrency(-350_000)).toBe('-₦350,000');
    expect(formatCurrency(-1_500_000, { compact: true })).toBe('-₦1.5M');
    expect(formatCurrency(-4_000, { compact: true })).toBe('-₦4K');
  });

  it('leaves positive amounts and zero alone', () => {
    expect(formatCurrency(350_000)).toBe('₦350,000');
    expect(formatCurrency(2_400_000, { compact: true })).toBe('₦2.4M');
    expect(formatCurrency(0)).toBe('₦0');
    expect(formatCurrency(-0.2)).toBe('₦0');
  });
});
