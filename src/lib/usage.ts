import { unbilledUnits } from '@/lib/deposit';
import dayjs from 'dayjs';
import type { Lease, Meter, Tenant } from '@/types';

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
 * Who may manage meters: log readings on them and bill them. The server allows exactly the roles that can edit meters
 * (admins and managers); finance can record payments but not change meters, and owners, agents and maintenance staff can
 * only look. The screens mirror that: everyone else gets a read-only view.
 */
export const canManageMeters = (role?: string) => role === 'admin' || role === 'manager';

/** Days a tenant has to pay a utility invoice (the server's rule). */
export const UTILITY_DUE_DAYS = 14;
const CURRENT_LEASE = ['active', 'expiring', 'renewed'];

/** How long after a tenancy ends its last tenant is still the one billed for the unit's use (the server's rule). */
export const FINAL_BILL_DAYS = 60;

type LeaseDates = Pick<Lease, 'unitId' | 'tenantId' | 'code' | 'status' | 'startDate' | 'endDate'> & { terminatedOn?: string | null };

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

function endedRecently(l: LeaseDates, asOf: string): string | null {
  const ended = leaseEndedOn(l, asOf);
  return ended && ended <= asOf && dayjs(ended).add(FINAL_BILL_DAYS, 'day').format('YYYY-MM-DD') >= asOf ? ended : null;
}

export type BillPreview =
  | { ok: true; tenantName: string; leaseCode: string; issueDate: string; dueDate: string; from: number; to: number; units: number; rate: number; total: number; final: boolean; endedOn: string | null }
  | { ok: false; reason: string };

/**
 * What billing one meter now would raise, or why it cannot be billed. Mirrors the server, which does the real work:
 * the tenant who holds the unit today — or, for FINAL_BILL_DAYS after they leave, the tenant who just did — is billed from the
 * reading the meter was last billed up to, at its rate.
 */
export function billPreview(
  meter: Pick<Meter, 'unitId' | 'currentReading' | 'previousReading' | 'billedReading' | 'ratePerUnit'>,
  leases: LeaseDates[],
  tenants: Pick<Tenant, 'id' | 'name'>[],
  asOf: string,
): BillPreview {
  if (!meter.unitId) return { ok: false, reason: 'This meter is not attached to a unit, so there is no tenant to bill.' };
  const from = meter.billedReading ?? meter.previousReading;
  const to = meter.currentReading;
  if (to < from) return { ok: false, reason: `The reading (${to}) is lower than what was last billed (${from}); check the meter.` };
  if (Math.abs(to - from) < 0.0005) return { ok: false, reason: 'Nothing to bill: no use has been read since the last bill.' };
  if (!(meter.ratePerUnit > 0)) return { ok: false, reason: 'No rate is set, so its use cannot be priced.' };
  const forUnit = leases.filter((l) => l.unitId === meter.unitId);
  const holding = forUnit
    .filter((l) => CURRENT_LEASE.includes(l.status) && l.startDate <= asOf && l.endDate >= asOf)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const justLeft = holding ? undefined : forUnit
    .map((l) => ({ l, ended: endedRecently(l, asOf) }))
    .filter((x): x is { l: LeaseDates; ended: string } => !!x.ended)
    .sort((a, b) => b.ended.localeCompare(a.ended))[0];
  const lease = holding ?? justLeft?.l;
  if (!lease) return { ok: false, reason: 'This unit has no tenant at the moment, so there is nobody to bill.' };
  const units = round(to - from);
  return {
    ok: true,
    tenantName: tenants.find((t) => t.id === lease.tenantId)?.name ?? 'the tenant',
    leaseCode: lease.code,
    issueDate: asOf,
    dueDate: dayjs(asOf).add(UTILITY_DUE_DAYS, 'day').format('YYYY-MM-DD'),
    from, to, units, rate: meter.ratePerUnit,
    total: Math.round(units * meter.ratePerUnit),
    final: !holding,
    endedOn: justLeft?.ended ?? null,
  };
}
