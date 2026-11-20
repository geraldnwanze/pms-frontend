import { describe, expect, it } from 'vitest';
import { usagePeriods, unbilledCharge, unbilledChargeTotal, billPreview, canManageMeters, leaseEndedOn } from './usage';

const h = (...v: [string, number][]) => v.map(([date, value]) => ({ date, value }));

describe('usagePeriods', () => {
  it('measures use between consecutive readings, then what has been used since the last one', () => {
    const p = usagePeriods({ history: h(['2026-08-01', 100], ['2026-09-01', 120], ['2026-10-01', 150]), currentReading: 165 });

    expect(p).toEqual([{ endDate: '2026-09-01', units: 20 }, { endDate: '2026-10-01', units: 30 }, { units: 15 }]);
  });

  it('puts readings in date order whatever order they were stored in', () => {
    const p = usagePeriods({ history: h(['2026-10-01', 150], ['2026-08-01', 100], ['2026-09-01', 120]), currentReading: 150 });

    expect(p.map((x) => x.units)).toEqual([20, 30]);
  });

  it('shows only the most recent periods', () => {
    const history = h(['2026-01-01', 0], ['2026-02-01', 10], ['2026-03-01', 20], ['2026-04-01', 30], ['2026-05-01', 40], ['2026-06-01', 50], ['2026-07-01', 60]);

    expect(usagePeriods({ history, currentReading: 70 }, 3).map((x) => x.units)).toEqual([10, 10, 10]);
    expect(usagePeriods({ history, currentReading: 70 })).toHaveLength(5);
  });

  it('has nothing to show for a meter with no history', () => {
    expect(usagePeriods({ history: [], currentReading: 50 })).toEqual([]);
    expect(usagePeriods({ history: undefined as never, currentReading: 50 })).toEqual([]);
  });

  it('leaves out a period that would be negative, such as after a meter was replaced', () => {
    const p = usagePeriods({ history: h(['2026-09-01', 900], ['2026-10-01', 5]), currentReading: 20 });

    expect(p).toEqual([{ units: 15 }]);
  });
});

describe('unbilledCharge', () => {
  const m = (over: object) => ({ previousReading: 100, currentReading: 250, billedReading: undefined as number | null | undefined, ratePerUnit: 60, ...over });

  it('charges the use since the previous reading for a meter never billed', () => {
    expect(unbilledCharge(m({}))).toBe(9_000);
  });

  it('charges only from the reading it was last billed up to', () => {
    expect(unbilledCharge(m({ billedReading: 230 }))).toBe(1_200);
    expect(unbilledCharge(m({ billedReading: 250 }))).toBe(0);
  });

  it('rounds to whole naira and adds meters together', () => {
    expect(unbilledCharge(m({ previousReading: 0, currentReading: 1.5, ratePerUnit: 68 }))).toBe(102);
    expect(unbilledChargeTotal([m({}), m({ billedReading: 230 })])).toBe(10_200);
    expect(unbilledChargeTotal([])).toBe(0);
  });
});

describe('canManageMeters', () => {
  it('is the roles the server lets bill: admins and managers', () => {
    expect(canManageMeters('admin')).toBe(true);
    expect(canManageMeters('manager')).toBe(true);
  });

  it.each(['finance', 'owner', 'agent', 'maintenance', 'tenant', 'user', undefined])('is not %s', (role) => {
    expect(canManageMeters(role)).toBe(false);
  });
});

describe('final bills: the tenant who has just left', () => {
  const meter = { unitId: 'u1', previousReading: 100, currentReading: 250, billedReading: null, ratePerUnit: 60 };
  const tenants = [{ id: 't1', name: 'Ada Obi' }];
  const lease = (over: object) => ({ unitId: 'u1', tenantId: 't1', code: 'LSE-1', status: 'terminated', startDate: '2026-01-01', endDate: '2027-01-01', terminatedOn: '2026-11-10', ...over }) as never;

  it('bills a tenant who was terminated a few days ago, and says it is their final bill', () => {
    const r = billPreview(meter, [lease({})], tenants, '2026-11-15');

    expect(r).toMatchObject({ ok: true, tenantName: 'Ada Obi', leaseCode: 'LSE-1', total: 9000, final: true, endedOn: '2026-11-10' });
  });

  it('is not a final bill while the tenant still holds the unit', () => {
    const r = billPreview(meter, [lease({ status: 'active', terminatedOn: null })], tenants, '2026-11-15');

    expect(r).toMatchObject({ ok: true, final: false, endedOn: null });
  });

  it('prefers whoever holds the unit now over someone who left earlier', () => {
    const next = lease({ tenantId: 't2', code: 'LSE-2', status: 'active', terminatedOn: null, startDate: '2026-11-12', endDate: '2027-11-11' });

    expect(billPreview(meter, [lease({}), next], [...tenants, { id: 't2', name: 'Nia New' }], '2026-11-15')).toMatchObject({ tenantName: 'Nia New', final: false });
  });

  it('picks the most recent leaver when several have left', () => {
    const older = lease({ tenantId: 't0', code: 'LSE-0', terminatedOn: '2026-10-01' });

    expect(billPreview(meter, [older, lease({})], [...tenants, { id: 't0', name: 'Old Tenant' }], '2026-11-15')).toMatchObject({ leaseCode: 'LSE-1' });
  });

  it('stays responsible for sixty days and not for a day longer', () => {
    expect(billPreview(meter, [lease({ terminatedOn: '2026-09-16' })], tenants, '2026-11-15').ok).toBe(true);        // 60 days
    expect(billPreview(meter, [lease({ terminatedOn: '2026-09-15' })], tenants, '2026-11-15')).toMatchObject({ ok: false, reason: expect.stringMatching(/no tenant/) });   // 61
  });

  it('cannot tell when an older terminated lease with a future end date ended, so it does not guess', () => {
    expect(billPreview(meter, [lease({ terminatedOn: null })], tenants, '2026-11-15').ok).toBe(false);
    expect(billPreview(meter, [lease({ terminatedOn: null, endDate: '2026-11-01' })], tenants, '2026-11-15')).toMatchObject({ ok: true, final: true, endedOn: '2026-11-01' });
  });

  it('works out when a tenancy ended in each state', () => {
    expect(leaseEndedOn({ status: 'terminated', terminatedOn: '2026-11-10', endDate: '2027-01-01' }, '2026-11-15')).toBe('2026-11-10');
    expect(leaseEndedOn({ status: 'expired', endDate: '2026-11-01' }, '2026-11-15')).toBe('2026-11-01');
    expect(leaseEndedOn({ status: 'active', endDate: '2026-11-14' }, '2026-11-15')).toBe('2026-11-14');      // ran out; the daily job has not caught up
    expect(leaseEndedOn({ status: 'active', endDate: '2026-11-15' }, '2026-11-15')).toBeNull();               // its last day: still theirs
    expect(leaseEndedOn({ status: 'active', endDate: '2027-01-01' }, '2026-11-15')).toBeNull();
  });
});
