import { describe, expect, it } from 'vitest';
import { can, canApprovePayments, canManageStructure, canRegisterProperty } from './roles';
import type { Role } from '@/types';

describe('canManageStructure — mirrors config/rbac.php for buildings and units', () => {
  it('lets owners build out their properties although owners lack the blanket create/edit permission', () => {
    expect(can('owner', 'create')).toBe(false);
    expect(canManageStructure('owner')).toBe(true);
  });

  it.each(['admin', 'manager'] as Role[])('allows %s', (role) => expect(canManageStructure(role)).toBe(true));

  // These roles can "create records" in general, but the API refuses buildings/units (403) — don't offer the buttons.
  it.each(['agent', 'finance', 'tenant', 'maintenance', 'user'] as Role[])('hides the controls from %s', (role) =>
    expect(canManageStructure(role)).toBe(false));

  it('hides them from signed-out users', () => expect(canManageStructure(undefined)).toBe(false));
});

describe('canRegisterProperty', () => {
  it('adds the plain "user" role (who starts by registering a property) to the structural roles', () => {
    for (const r of ['admin', 'owner', 'manager', 'user'] as Role[]) expect(canRegisterProperty(r), r).toBe(true);
    for (const r of ['agent', 'finance', 'tenant', 'maintenance'] as Role[]) expect(canRegisterProperty(r), r).toBe(false);
    expect(canRegisterProperty(undefined)).toBe(false);
  });
});

describe('canApprovePayments', () => {
  it('is finance and admin only', () => {
    expect(canApprovePayments('finance')).toBe(true);
    expect(canApprovePayments('admin')).toBe(true);
    for (const r of ['manager', 'owner', 'tenant'] as Role[]) expect(canApprovePayments(r)).toBe(false);
  });
});
