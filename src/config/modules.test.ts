import { describe, expect, it } from 'vitest';
import { isModuleOn, moduleForPath } from './modules';
import { navForRole } from './nav';
import type { Role } from '@/types';

describe('isModuleOn', () => {
  it('is on unless the server says it is off', () => {
    expect(isModuleOn({ utilities: false, planner: true }, 'utilities')).toBe(false);
    expect(isModuleOn({ utilities: false, planner: true }, 'planner')).toBe(true);
  });

  it('counts as on until the states have loaded, and for a module the server does not mention', () => {
    expect(isModuleOn(null, 'utilities')).toBe(true);
    expect(isModuleOn(undefined, 'utilities')).toBe(true);
    expect(isModuleOn({}, 'utilities')).toBe(true);
  });

  it('counts a screen that belongs to no module as on', () => {
    expect(isModuleOn({ utilities: false }, null)).toBe(true);
    expect(isModuleOn({ utilities: false }, undefined)).toBe(true);
  });
});

describe('moduleForPath', () => {
  it.each([
    ['/utilities', 'utilities'], ['/portal/utilities', 'utilities'],
    ['/maintenance', 'maintenance'], ['/maintenance/m1', 'maintenance'], ['/portal/maintenance', 'maintenance'],
    ['/inspections', 'inspections'], ['/expenses', 'expenses'], ['/vendors', 'expenses'],
    ['/listings', 'leasing'], ['/leads', 'leasing'], ['/documents', 'documents'], ['/portal/documents', 'documents'],
    ['/notices', 'communications'], ['/messages', 'communications'], ['/portal/notices', 'communications'], ['/portal/messages', 'communications'],
    ['/tasks', 'planner'], ['/calendar', 'planner'], ['/reports', 'reports'], ['/analytics', 'reports'],
  ])('puts %s in %s', (path, key) => {
    expect(moduleForPath(path)).toBe(key);
  });

  it.each(['/', '/dashboard', '/properties', '/units', '/tenants', '/leases', '/leases/l1', '/invoices', '/payments', '/payments/verification', '/users', '/audit', '/notifications', '/portal', '/portal/pay', '/portal/bills', '/portal/lease', '/modules'])(
    'leaves %s in the core',
    (path) => expect(moduleForPath(path)).toBeNull(),
  );

  it('matches whole path segments, ignores a trailing slash, query and hash', () => {
    expect(moduleForPath('/utilities/')).toBe('utilities');
    expect(moduleForPath('/utilities?x=1')).toBe('utilities');
    expect(moduleForPath('/maintenance/m1#top')).toBe('maintenance');
    expect(moduleForPath('/maintenancefoo')).toBeNull();
    expect(moduleForPath('/tasksX')).toBeNull();
  });
});

describe('navForRole with modules', () => {
  const labels = (role: Role, modules?: Record<string, boolean> | null) => navForRole(role, modules).flatMap((g) => g.items.map((i) => i.label));

  it('shows everything a role may see while every module is on or the states are not loaded', () => {
    expect(labels('manager', null)).toContain('Utilities & Meters');
    expect(labels('manager', {})).toContain('Maintenance');
    expect(labels('manager')).toEqual(labels('manager', { utilities: true }));
  });

  it('leaves out the screens of a module that is off, and only those', () => {
    const on = labels('manager');
    const off = labels('manager', { utilities: false });

    expect(off).not.toContain('Utilities & Meters');
    expect(off.length).toBe(on.length - 1);
    expect(off).toContain('Maintenance');
  });

  it('leaves out both screens of a module that has two', () => {
    const off = labels('finance', { expenses: false, reports: false });

    expect(off).not.toContain('Expenses');
    expect(off).not.toContain('Vendors');
    expect(off).not.toContain('Reports');
    expect(off).toContain('Payments');
  });

  it('drops a menu group that ends up empty', () => {
    const groups = navForRole('maintenance', { maintenance: false, inspections: false, planner: false, communications: false, documents: false });

    expect(groups.map((g) => g.title)).not.toContain('Operations');
  });

  it('applies to the tenant portal menu too', () => {
    const off = labels('tenant', { utilities: false, maintenance: false, communications: false, documents: false });

    expect(off).not.toContain('Utilities');
    expect(off).not.toContain('Maintenance');
    expect(off).not.toContain('Notices');
    expect(off).not.toContain('Messages');
    expect(off).not.toContain('Documents');
    expect(off).toContain('Bills & Invoices');
    expect(off).toContain('Make a Payment');
  });

  it('never hides the core, however many modules are off', () => {
    const allOff = Object.fromEntries(['utilities', 'auto-debit', 'reminders', 'maintenance', 'payouts', 'inspections', 'expenses', 'leasing', 'documents', 'communications', 'planner', 'reports'].map((k) => [k, false]));

    expect(labels('admin', allOff)).toEqual(expect.arrayContaining(['Dashboard', 'Properties', 'Tenants', 'Leases', 'Rent & Invoices', 'Payments', 'Payment Verification', 'Users & Roles', 'Audit Logs']));
  });
});

describe('who sees the Modules screen', () => {
  const labels = (role: Role) => navForRole(role).flatMap((g) => g.items.map((i) => i.label));

  it('is the superadmin alone', () => {
    expect(labels('superadmin')).toContain('Modules');
    for (const role of ['admin', 'owner', 'manager', 'agent', 'finance', 'maintenance', 'tenant', 'user'] as Role[]) {
      expect(labels(role), role).not.toContain('Modules');
    }
  });

  it('gives a superadmin every screen an admin has, plus Modules', () => {
    expect(labels('superadmin').filter((l) => l !== 'Modules')).toEqual(labels('admin'));
  });
});
