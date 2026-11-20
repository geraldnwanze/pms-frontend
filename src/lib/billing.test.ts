import { describe, expect, it } from 'vitest';
import { CYCLE_MONTHS, monthsInCycle, periodShare } from './billing';

describe('periodShare', () => {
  it('is the months’ share of the annual amount', () => {
    expect(periodShare(1_200_000, 1)).toBe(100_000);
    expect(periodShare(1_200_000, 3)).toBe(300_000);
    expect(periodShare(1_200_000, 6)).toBe(600_000);
    expect(periodShare(1_200_000, 12)).toBe(1_200_000);
  });

  it('never bills an annual rent as if it were monthly', () => {
    expect(periodShare(3_800_000, 1)).toBe(316_667);
  });

  it('rounds to whole naira', () => {
    expect(Number.isInteger(periodShare(1_000_003, 1))).toBe(true);
    expect(periodShare(1_000_003, 1)).toBe(83_334);
  });

  it('is nothing for nothing', () => {
    expect(periodShare(0, 6)).toBe(0);
    expect(periodShare(500_000, 0)).toBe(0);
  });
});

describe('monthsInCycle', () => {
  it('knows the length of each billing cycle', () => {
    expect(CYCLE_MONTHS).toEqual({ monthly: 1, quarterly: 3, 'half-yearly': 6, annual: 12, custom: 1 });
    expect(monthsInCycle('quarterly')).toBe(3);
    expect(monthsInCycle('annual')).toBe(12);
  });

  it('starts a custom or unknown cycle at one month', () => {
    expect(monthsInCycle('custom')).toBe(1);
    expect(monthsInCycle('fortnightly')).toBe(1);
    expect(monthsInCycle(undefined)).toBe(1);
  });
});
