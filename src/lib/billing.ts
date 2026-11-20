import type { BillingCycle } from '@/types';

/**
 * Rent and service charge on a lease and its unit are ANNUAL figures. An invoice carries the share of the year
 * its billing period covers — a month is a twelfth, a quarter a quarter. Months in each cycle; `custom` has no
 * fixed length, so the person raising the invoice chooses.
 */
export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, 'half-yearly': 6, annual: 12, custom: 1 };

/** The months a lease's billing cycle covers (a custom cycle starts at one month and can be changed). */
export function monthsInCycle(cycle: BillingCycle | string | undefined): number {
  return CYCLE_MONTHS[cycle as BillingCycle] ?? 1;
}

/** This many months' share of an annual amount, in whole naira. */
export function periodShare(annual: number, months: number): number {
  return Math.round((annual * months) / 12);
}
