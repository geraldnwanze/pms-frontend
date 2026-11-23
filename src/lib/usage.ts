import { unbilledUnits } from '@/lib/deposit';
import type { BillPreview, Lease, Meter, RbacMatrix } from '@/types';

export type { BillPreview };

export interface UsagePeriod {
  /** The reading date the period ends on; the newest period has none ("latest"). */
  endDate?: string;
  units: number;
}

/**
 * How much was used between consecutive readings, oldest first, ending with whatever has been used since the last
 * recorded reading. A meter with one reading or none has no completed period to show.
 */
export function usagePeriods(meter: Pick<Meter, 'history' | 'currentReading'>, max = 5): UsagePeriod[] {
  const points = [...(meter.history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const periods: UsagePeriod[] = [];
  for (let i = 1; i < points.length; i++) {
    periods.push({ endDate: points[i].date, units: round(points[i].value - points[i - 1].value) });
  }
  const last = points[points.length - 1];
  if (last && meter.currentReading != null && meter.currentReading !== last.value) {
    periods.push({ units: round(meter.currentReading - last.value) });
  }
  return periods.filter((p) => p.units >= 0).slice(-max);
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** What the use since a meter was last billed comes to, in naira, at its rate. */
export function unbilledCharge(meter: Pick<Meter, 'currentReading' | 'previousReading' | 'billedReading' | 'ratePerUnit'>): number {
  return Math.round(unbilledUnits(meter) * meter.ratePerUnit);
}

/** The same, for all of a unit's meters together. */
export function unbilledChargeTotal(meters: Parameters<typeof unbilledCharge>[0][]): number {
  return meters.reduce((sum, m) => sum + unbilledCharge(m), 0);
}

/**
 * Who may manage meters: log readings on them and bill them. This is the server's own rule, read from the RBAC matrix it
 * sends with the data (so the buttons cannot drift from what the server allows): the role must be one that manages meters
 * and hold the `edit` permission. Before the matrix has loaded nobody is shown the controls.
 */
export function canManageMeters(role: string | undefined, rbac: Pick<RbacMatrix, 'permissions' | 'resources'> | null | undefined): boolean {
  if (!role || !rbac) return false;
  const manage = (rbac.resources?.meters?.manage ?? []) as string[];
  return manage.includes(role) && (rbac.permissions?.[role] ?? []).includes('edit');
}

const CURRENT_LEASE = ['active', 'expiring', 'renewed'];

/**
 * The day a tenancy ended, as of `asOf`, or null if it has not (or we cannot tell). Mirrors the server: a terminated lease
 * ended the day it was terminated (its endDate is still the contract's), an older one with no such day counts from its end date
 * once that has passed, an expired one ended on its end date, and so did a running one whose end date went by before the daily
 * status job caught up.
 */
export function leaseEndedOn(l: Pick<Lease, 'status' | 'endDate'> & { terminatedOn?: string | null }, asOf: string): string | null {
  if (l.status === 'terminated') return l.terminatedOn || (l.endDate && l.endDate <= asOf ? l.endDate : null);
  if (l.status === 'expired') return l.endDate || null;
  if (CURRENT_LEASE.includes(l.status)) return l.endDate && l.endDate < asOf ? l.endDate : null;
  return null;
}
