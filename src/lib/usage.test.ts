import { describe, expect, it } from 'vitest';
import { usagePeriods, unbilledCharge, unbilledChargeTotal, canManageMeters, leaseEndedOn } from './usage';

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

// The matrix as the server sends it (config/rbac.php): who manages meters, and what each role may do.
const rbac = {
  permissions: {
    admin: ['view', 'create', 'edit', 'delete'], owner: ['view', 'export'], manager: ['view', 'create', 'edit'], agent: ['view', 'create', 'edit'],
    finance: ['view', 'create', 'edit'], maintenance: ['view', 'edit'], tenant: ['view', 'create'], user: ['view', 'create'],
  },
  resources: { meters: { view: [], manage: ['admin', 'owner', 'manager'] } },
} as never;

describe('canManageMeters', () => {
  it('follows the rules the server sends: a role that manages meters and may edit', () => {
    expect(canManageMeters('admin', rbac)).toBe(true);
    expect(canManageMeters('manager', rbac)).toBe(true);
  });

  it.each(['finance', 'owner', 'agent', 'maintenance', 'tenant', 'user', undefined])('is not %s', (role) => {
    expect(canManageMeters(role, rbac)).toBe(false);
  });

  it('changes when the server’s rules change, with no change here', () => {
    const financeToo = { ...(rbac as object), resources: { meters: { view: [], manage: ['admin', 'manager', 'finance'] } } } as never;
    expect(canManageMeters('finance', financeToo)).toBe(true);

    const noEdit = { ...(rbac as object), permissions: { ...(rbac as { permissions: object }).permissions, manager: ['view', 'create'] } } as never;
    expect(canManageMeters('manager', noEdit)).toBe(false);                // listed as a manager of meters, but not allowed to edit
  });

  it('shows nobody the controls until the rules have loaded', () => {
    expect(canManageMeters('admin', null)).toBe(false);
    expect(canManageMeters('manager', undefined)).toBe(false);
  });
});

describe('when a tenancy ended', () => {
  it('works out when a tenancy ended in each state', () => {
    expect(leaseEndedOn({ status: 'terminated', terminatedOn: '2026-11-10', endDate: '2027-01-01' }, '2026-11-15')).toBe('2026-11-10');
    expect(leaseEndedOn({ status: 'expired', endDate: '2026-11-01' }, '2026-11-15')).toBe('2026-11-01');
    expect(leaseEndedOn({ status: 'active', endDate: '2026-11-14' }, '2026-11-15')).toBe('2026-11-14');      // ran out; the daily job has not caught up
    expect(leaseEndedOn({ status: 'active', endDate: '2026-11-15' }, '2026-11-15')).toBeNull();               // its last day: still theirs
    expect(leaseEndedOn({ status: 'active', endDate: '2027-01-01' }, '2026-11-15')).toBeNull();
  });
});
