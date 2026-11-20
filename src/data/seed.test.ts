import { beforeAll, describe, expect, it } from 'vitest';
import { generateSeed, type SeedData } from './seed';
import { periodShare, monthsInCycle } from '@/lib/billing';
import { SEED_TODAY } from '@/lib/format';
import { depositHeld } from '@/lib/deposit';
import dayjs from 'dayjs';

let seed: SeedData;
beforeAll(() => { seed = generateSeed(); });

const rentLine = (inv: SeedData['invoices'][number]) => inv.lineItems.find((l) => l.type === 'rent')!;
const serviceLine = (inv: SeedData['invoices'][number]) => inv.lineItems.find((l) => l.type === 'service-charge');

describe('seeded invoices carry the share of the year their period covers', () => {
  it('has invoices to check', () => {
    expect(seed.invoices.length).toBeGreaterThan(50);
  });

  it('charges rent as the annual rent times the months in the period over twelve', () => {
    for (const inv of seed.invoices) {
      const lease = seed.leases.find((l) => l.id === inv.leaseId)!;
      const unit = seed.units.find((u) => u.id === inv.unitId)!;
      expect(rentLine(inv).amount, inv.code).toBe(periodShare(unit.rent, monthsInCycle(lease.billingCycle)));
    }
  });

  it('charges the annual service charge the same way', () => {
    for (const inv of seed.invoices) {
      const lease = seed.leases.find((l) => l.id === inv.leaseId)!;
      const unit = seed.units.find((u) => u.id === inv.unitId)!;
      expect(serviceLine(inv)?.amount, inv.code).toBe(periodShare(unit.serviceCharge, monthsInCycle(lease.billingCycle)));
    }
  });

  it('never bills more rent in one invoice than a year of the lease', () => {
    for (const inv of seed.invoices) {
      const lease = seed.leases.find((l) => l.id === inv.leaseId)!;
      expect(rentLine(inv).amount, inv.code).toBeLessThanOrEqual(lease.rent);
    }
  });

  it('has a monthly invoice at about a twelfth of the annual rent, and an annual one at the full rent', () => {
    const monthly = seed.invoices.find((i) => i.cycle === 'monthly')!;
    const annual = seed.invoices.find((i) => i.cycle === 'annual')!;
    const unitOf = (i: typeof monthly) => seed.units.find((u) => u.id === i.unitId)!;

    expect(rentLine(monthly).amount).toBe(Math.round(unitOf(monthly).rent / 12));
    expect(rentLine(annual).amount).toBe(unitOf(annual).rent);
  });

  it('adds up: each total is its line items plus any late fee, and nobody has paid more than they were billed', () => {
    for (const inv of seed.invoices) {
      expect(inv.total, inv.code).toBe(inv.lineItems.reduce((s, l) => s + l.amount, 0) + (inv.penalty ?? 0));
      expect(inv.amountPaid, inv.code).toBeLessThanOrEqual(inv.total);
    }
  });

  it('keeps portfolio totals believable: what is billed is in the order of the annual rent roll, not twelve times it', () => {
    const occupiedRent = seed.units.filter((u) => u.status === 'occupied').reduce((s, u) => s + u.rent, 0);
    const billed = seed.invoices.reduce((s, i) => s + i.total, 0);

    expect(billed).toBeLessThan(occupiedRent * 1.5);
  });
});

describe('seeded units and leases agree with each other', () => {
  const CURRENT = ['active', 'expiring', 'renewed'];
  const current = () => seed.leases.filter((l) => CURRENT.includes(l.status));

  it('has a good mix of unit statuses to check', () => {
    const statuses = new Set(seed.units.map((u) => u.status));

    expect([...statuses]).toEqual(expect.arrayContaining(['occupied', 'available', 'reserved']));
    expect(statuses.size).toBeGreaterThanOrEqual(4);
  });

  it('marks a unit occupied exactly when it has a current lease', () => {
    const leased = new Set(current().map((l) => l.unitId));

    for (const u of seed.units) {
      expect(u.status === 'occupied', `${u.code} (${u.status})`).toBe(leased.has(u.id));
    }
  });

  it('lets each unit to one tenant at a time', () => {
    const perUnit = new Map<string, number>();
    for (const l of current()) perUnit.set(l.unitId, (perUnit.get(l.unitId) ?? 0) + 1);

    expect([...perUnit.values()].every((n) => n === 1)).toBe(true);
  });

  it('has no lease that is still "current" after its end date', () => {
    for (const l of current()) {
      expect(l.endDate >= SEED_TODAY, `${l.code} ends ${l.endDate}`).toBe(true);
    }
  });

  it('has no lease on a reserved, available, maintenance or renovation unit', () => {
    for (const l of seed.leases) {
      const unit = seed.units.find((u) => u.id === l.unitId)!;
      expect(unit.status, `${l.code}`).toBe('occupied');
    }
  });

  it('keeps a reserved unit’s prospective tenant but gives them no lease and no invoices', () => {
    const reserved = seed.units.filter((u) => u.status === 'reserved');
    expect(reserved.length).toBeGreaterThan(0);

    for (const u of reserved) {
      expect(seed.leases.filter((l) => l.unitId === u.id), u.code).toHaveLength(0);
      expect(seed.invoices.filter((i) => i.unitId === u.id), u.code).toHaveLength(0);
    }
    const withLease = new Set(seed.leases.map((l) => l.tenantId));
    expect(seed.tenants.filter((t) => !withLease.has(t.id)).length).toBe(reserved.length);
  });

  it('puts the "expiring" label only on leases that really end within 60 days', () => {
    const daysLeft = (end: string) => (Date.parse(end) - Date.parse(SEED_TODAY)) / 86_400_000;

    for (const l of seed.leases) {
      expect(l.status === 'expiring', `${l.code} ends ${l.endDate}`).toBe(daysLeft(l.endDate) <= 60);
    }
  });
});

describe('seeded late fees and deposits', () => {
  it('charges one late fee of 10% of what is owed on invoices more than five days late with no payment waiting, and on no others', () => {
    const today = dayjs(SEED_TODAY);
    for (const inv of seed.invoices) {
      const items = inv.lineItems.reduce((s, l) => s + l.amount, 0);
      const waiting = seed.payments.some((p) => p.invoiceId === inv.id && (p.status === 'pending-verification' || p.status === 'initiated'));
      const owing = items - inv.amountPaid;
      const late = inv.status !== 'fully-paid' && owing > 0 && !waiting && today.diff(dayjs(inv.dueDate), 'day') > 5;
      if (late) {
        expect(inv.penalty, inv.code).toBe(Math.round(owing * 0.1));
        expect(inv.lateFeeAppliedOn, inv.code).toBeTruthy();
        expect(dayjs(inv.lateFeeAppliedOn).isAfter(today), inv.code).toBe(false);
      } else {
        expect(inv.penalty ?? 0, inv.code).toBe(0);
      }
    }
    expect(seed.invoices.some((i) => (i.penalty ?? 0) > 0)).toBe(true);
  });

  it('records each lease deposit as received in full, so what is held is what the lease asks for', () => {
    for (const l of seed.leases) {
      expect(depositHeld(l), l.code).toBe(l.securityDeposit);
      expect(l.depositSettledOn, l.code).toBeFalsy();
    }
  });
});
