import type { Role, Permission } from '@/types';

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  owner: 'Property Owner',
  manager: 'Property Manager',
  agent: 'Real Estate Agent',
  tenant: 'Tenant',
  maintenance: 'Maintenance Staff',
  finance: 'Finance Officer',
  user: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: 'Everything an admin can do, and the only role that switches platform modules on and off.',
  admin: 'Full system access across all owners, properties and settings.',
  owner: 'Owns properties — sees portfolio performance, finances and reports.',
  manager: 'Runs day-to-day operations for assigned properties.',
  agent: 'Handles listings, leads and viewings to fill vacant units.',
  tenant: 'Occupant portal — bills, payments and maintenance requests.',
  maintenance: 'Field technician — assigned jobs and inspections.',
  finance: 'Verifies payments and manages invoices, expenses and books.',
  user: 'Registered account — create a property or accept an invitation to get started.',
};

export const ROLE_COLORS: Record<Role, string> = {
  superadmin: '#4c1d95',
  admin: '#7c3aed',
  owner: '#059669',
  manager: '#0284c7',
  agent: '#d97706',
  tenant: '#4f46e5',
  maintenance: '#0891b2',
  finance: '#db2777',
  user: '#64748b',
};

/** Permission matrix per role (drives the Users & Roles screen and UI gating). */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'manage_payments', 'manage_users', 'manage_documents', 'manage_financials', 'manage_modules'],
  admin: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'manage_payments', 'manage_users', 'manage_documents', 'manage_financials'],
  owner: ['view', 'export', 'manage_financials'],
  manager: ['view', 'create', 'edit', 'approve', 'reject', 'export', 'manage_payments', 'manage_documents'],
  agent: ['view', 'create', 'edit'],
  tenant: ['view', 'create'],
  maintenance: ['view', 'edit'],
  finance: ['view', 'create', 'edit', 'approve', 'reject', 'export', 'manage_payments', 'manage_financials'],
  user: ['view', 'create'],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  view: 'View records',
  create: 'Create records',
  edit: 'Edit records',
  delete: 'Delete records',
  approve: 'Approve',
  reject: 'Reject',
  export: 'Export data',
  manage_payments: 'Manage payments',
  manage_users: 'Manage users',
  manage_documents: 'Manage documents',
  manage_financials: 'Manage financials',
  manage_modules: 'Switch modules on and off',
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * A Property Owner is oversight-only by default (no `create`/`edit`), but may
 * still build out the *structure* of properties they own — register a property,
 * add buildings and units. Mirrors the backend's `Rbac::OWNER_STRUCTURAL`.
 * Row-level scope (only their own properties) is enforced server-side.
 */
export function canManageStructure(role: Role | undefined): boolean {
  return isAdminRole(role) || role === 'owner' || role === 'manager';
}

/** Registering a new property: the structural roles, plus a plain registered account starting out. Mirrors `config/rbac.php`. */
export function canRegisterProperty(role: Role | undefined): boolean {
  return canManageStructure(role) || role === 'user';
}

/**
 * Approving or rejecting tenant-submitted payments is restricted to Finance
 * Officers, with the Super Admin retained for oversight. Managers can still
 * record payments (via `manage_payments`) but not sign them off.
 */
export function canApprovePayments(role: Role | undefined): boolean {
  return role === 'finance' || isAdminRole(role);
}

/** Roles that see and manage the whole platform. */
export const ADMIN_ROLES: Role[] = ['superadmin', 'admin'];

export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === 'superadmin' || role === 'admin';
}

/** The roles that can be given to a person through the Users screen (a superadmin is set up outside the app). */
export const ALL_ROLES: Role[] = ['admin', 'owner', 'manager', 'finance', 'agent', 'maintenance', 'tenant'];
