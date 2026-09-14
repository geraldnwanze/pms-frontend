import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { DataState } from './dataSlice';
import type {
  User, Unit, Lease, Invoice, Payment, Property, Tenant, AppNotification,
} from '@/types';
import { TODAY } from '@/lib/format';

// ---- Raw slice selectors (stable references) -------------------------------

export const selectData = (s: RootState) => s.data;
export const selectProperties = (s: RootState) => s.data.properties;
export const selectBuildings = (s: RootState) => s.data.buildings;
export const selectUnits = (s: RootState) => s.data.units;
export const selectTenants = (s: RootState) => s.data.tenants;
export const selectLeases = (s: RootState) => s.data.leases;
export const selectInvoices = (s: RootState) => s.data.invoices;
export const selectPayments = (s: RootState) => s.data.payments;
export const selectMaintenance = (s: RootState) => s.data.maintenance;
export const selectExpenses = (s: RootState) => s.data.expenses;
export const selectVendors = (s: RootState) => s.data.vendors;
export const selectInspections = (s: RootState) => s.data.inspections;
export const selectMeters = (s: RootState) => s.data.meters;
export const selectListings = (s: RootState) => s.data.listings;
export const selectLeads = (s: RootState) => s.data.leads;
export const selectDocuments = (s: RootState) => s.data.documents;
export const selectNotifications = (s: RootState) => s.data.notifications;
export const selectNotices = (s: RootState) => s.data.notices;
export const selectAudit = (s: RootState) => s.data.audit;
export const selectUsers = (s: RootState) => s.data.users;
export const selectTasks = (s: RootState) => s.data.tasks;
export const selectEvents = (s: RootState) => s.data.events;
export const selectMemberships = (s: RootState) => s.data.memberships;
export const selectInvitations = (s: RootState) => s.data.invitations;
export const selectSettings = (s: RootState) => s.data.settings;
export const selectIntegrations = (s: RootState) => s.data.integrations;
export const selectRbac = (s: RootState) => s.data.rbac;
export const selectDashboard = (s: RootState) => s.data.dashboard;
export const selectPortal = (s: RootState) => s.data.portal;

export const selectCurrentUser = (s: RootState): User | null =>
  s.data.users.find((u) => u.id === s.auth.currentUserId) ?? null;

// ---- Which properties can this user see? ----------------------------------

/**
 * The API already RBAC-scopes the bootstrap payload to the properties this
 * user may see (via property_members), so `data.properties` *is* the visible
 * set. This helper stays for the many call sites that pass `(data, user)`.
 */
export function visiblePropertyIds(data: DataState, _user: User | null): Set<string> {
  return new Set(data.properties.map((p) => p.id));
}

/**
 * Property ids after applying the global property filter on top of RBAC.
 *
 * Memoized so it returns a stable `Set` reference for unchanged inputs — read
 * directly via `useAppSelector(scopedPropertyIds)`, a new object each call would
 * trigger react-redux's "selector returned a different result" warning and
 * needless rerenders.
 */
export const scopedPropertyIds = createSelector(
  [selectData, selectCurrentUser, (state: RootState) => state.ui.propertyFilter],
  (data, user, filter): Set<string> => {
    const visible = visiblePropertyIds(data, user);
    if (filter !== 'all' && visible.has(filter)) return new Set([filter]);
    return visible;
  },
);

// ---- Relationship helpers --------------------------------------------------

/** The "current" lease occupying a unit (active/expiring/renewed), latest first. */
export function currentLeaseForUnit(data: DataState, unitId: string): Lease | undefined {
  return data.leases
    .filter((l) => l.unitId === unitId && ['active', 'expiring', 'renewed'].includes(l.status))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export function tenantForUnit(data: DataState, unitId: string): Tenant | undefined {
  const lease = currentLeaseForUnit(data, unitId);
  return lease ? data.tenants.find((t) => t.id === lease.tenantId) : undefined;
}

export function invoicesForUnit(data: DataState, unitId: string): Invoice[] {
  return data.invoices.filter((i) => i.unitId === unitId);
}

export function paymentsForInvoice(data: DataState, invoiceId: string): Payment[] {
  return data.payments.filter((p) => p.invoiceId === invoiceId);
}

export const selectMaintenancePayouts = (s: RootState) => s.data.maintenancePayouts;

/** The active (non-rejected) payout for a work order, if any. */
export function payoutForMaintenance(data: DataState, maintenanceId: string) {
  return data.maintenancePayouts.find(
    (p) => p.maintenanceId === maintenanceId && p.status !== 'rejected',
  );
}

/**
 * True when the invoice already has a payment that blocks a new attempt: an
 * online checkout in progress (`initiated`) or a receipt awaiting finance
 * (`pending-verification`). Mirrors the backend guard.
 */
export function openPaymentForInvoice(data: DataState, invoiceId: string): Payment | undefined {
  return data.payments.find(
    (p) => p.invoiceId === invoiceId && (p.status === 'initiated' || p.status === 'pending-verification'),
  );
}

/** Outstanding balance on a unit = sum of (total - amountPaid) over its non-cancelled invoices. */
export function unitBalance(data: DataState, unitId: string): number {
  return invoicesForUnit(data, unitId)
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
}

export interface LedgerRow {
  date: string;
  invoiceCode: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
  balanceAfter: number;
  paymentId: string;
}

/** Chronological payment ledger for a tenant across all their invoices. */
export function tenantLedger(data: DataState, tenantId: string): LedgerRow[] {
  const invoices = data.invoices.filter((i) => i.tenantId === tenantId);
  const invTotal = invoices.reduce((s, i) => s + i.total, 0);
  const pays = data.payments
    .filter((p) => p.tenantId === tenantId)
    .slice()
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.submittedAt.localeCompare(b.submittedAt));
  let balance = invTotal;
  return pays.map((p) => {
    if (p.status === 'approved') balance -= p.amount;
    const inv = invoices.find((i) => i.id === p.invoiceId);
    return {
      date: p.paymentDate,
      invoiceCode: inv?.code ?? '—',
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      status: p.status,
      balanceAfter: Math.max(0, balance),
      paymentId: p.id,
    };
  });
}

// ---- Portfolio KPIs --------------------------------------------------------

export interface PortfolioKpis {
  totalProperties: number;
  totalBuildings: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  reserved: number;
  maintenance: number;
  underRenovation: number;
  totalTenants: number;
  activeLeases: number;
  expiringLeases: number;
  monthlyExpectedRent: number;
  expectedBilled: number;
  collected: number;
  outstanding: number;
  overdue: number;
  totalExpenses: number;
  netIncome: number;
  openMaintenance: number;
  pendingVerifications: number;
  occupancyRate: number;
  collectionRate: number;
}

export function computeKpis(data: DataState, propertyIds: Set<string>): PortfolioKpis {
  const props = data.properties.filter((p) => propertyIds.has(p.id));
  const buildings = data.buildings.filter((b) => propertyIds.has(b.propertyId));
  const units = data.units.filter((u) => propertyIds.has(u.propertyId));
  const invoices = data.invoices.filter((i) => propertyIds.has(i.propertyId) && i.status !== 'cancelled');
  const expenses = data.expenses.filter((e) => propertyIds.has(e.propertyId) && (e.status === 'approved' || e.status === 'paid'));
  const leases = data.leases.filter((l) => propertyIds.has(l.propertyId));
  const payments = data.payments.filter((p) => propertyIds.has(p.propertyId));

  const occupied = units.filter((u) => u.status === 'occupied').length;
  const vacant = units.filter((u) => u.status === 'available').length;
  const reserved = units.filter((u) => u.status === 'reserved').length;
  const maintenance = units.filter((u) => u.status === 'maintenance').length;
  const underRenovation = units.filter((u) => u.status === 'renovation').length;

  const monthlyExpectedRent = units.filter((u) => u.status === 'occupied').reduce((s, u) => s + u.rent, 0);
  const expectedBilled = invoices.reduce((s, i) => s + i.total, 0);
  const collected = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
  const overdue = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const activeLeases = leases.filter((l) => ['active', 'expiring', 'renewed'].includes(l.status)).length;
  const expiringLeases = leases.filter((l) => l.status === 'expiring').length;
  const activeTenantIds = new Set(leases.filter((l) => ['active', 'expiring', 'renewed'].includes(l.status)).map((l) => l.tenantId));

  const openMaintenance = data.maintenance.filter((m) => propertyIds.has(m.propertyId) && !['verified', 'closed'].includes(m.status)).length;
  const pendingVerifications = payments.filter((p) => p.status === 'pending-verification').length;

  const rentable = occupied + vacant + reserved;
  return {
    totalProperties: props.length,
    totalBuildings: buildings.length,
    totalUnits: units.length,
    occupied, vacant, reserved, maintenance, underRenovation,
    totalTenants: activeTenantIds.size,
    activeLeases, expiringLeases,
    monthlyExpectedRent, expectedBilled, collected, outstanding, overdue,
    totalExpenses,
    netIncome: collected - totalExpenses,
    openMaintenance, pendingVerifications,
    occupancyRate: rentable > 0 ? (occupied / rentable) * 100 : 0,
    collectionRate: expectedBilled > 0 ? (collected / expectedBilled) * 100 : 0,
  };
}

// ---- Per-property performance ----------------------------------------------

export interface PropertyPerformance {
  property: Property;
  units: number;
  occupied: number;
  vacant: number;
  monthlyExpectedRent: number;
  expectedBilled: number;
  collected: number;
  outstanding: number;
  expenses: number;
  netIncome: number;
  collectionRate: number;
  occupancyRate: number;
  pendingVerifications: number;
}

export function propertyPerformance(data: DataState, property: Property): PropertyPerformance {
  const single = new Set([property.id]);
  const k = computeKpis(data, single);
  return {
    property,
    units: k.totalUnits,
    occupied: k.occupied,
    vacant: k.vacant,
    monthlyExpectedRent: k.monthlyExpectedRent,
    expectedBilled: k.expectedBilled,
    collected: k.collected,
    outstanding: k.outstanding,
    expenses: k.totalExpenses,
    netIncome: k.netIncome,
    collectionRate: k.collectionRate,
    occupancyRate: k.occupancyRate,
    pendingVerifications: k.pendingVerifications,
  };
}

// ---- Invoice status helper -------------------------------------------------

export function invoiceOutstanding(inv: Invoice): number {
  return Math.max(0, inv.total - inv.amountPaid);
}

export function isOverdue(inv: Invoice): boolean {
  return inv.status !== 'fully-paid' && inv.status !== 'cancelled' && inv.dueDate < TODAY && invoiceOutstanding(inv) > 0;
}

// ---- Notifications relevant to a user --------------------------------------

/** Notifications addressed to this user, their role, or broadcast to everyone. */
export function notificationsForUser(data: DataState, user: User | null): AppNotification[] {
  if (!user) return [];
  return data.notifications.filter(
    (n) =>
      (!n.forRole && !n.forUserId) ||
      n.forUserId === user.id ||
      // tenant users have their own id but notifications are addressed to the Tenant record
      (!!user.tenantId && n.forUserId === user.tenantId) ||
      n.forRole === user.role,
  );
}

/**
 * Memoized selector for the current user's notifications — returns a stable
 * array reference for unchanged notifications/user, so it can be read directly
 * via `useAppSelector` without tripping the "selector returned a different
 * result" warning.
 */
export const selectNotificationsForCurrentUser = createSelector(
  [selectNotifications, selectCurrentUser],
  (notifications, user): AppNotification[] => {
    if (!user) return [];
    return notifications.filter(
      (n) =>
        (!n.forRole && !n.forUserId) ||
        n.forUserId === user.id ||
        (!!user.tenantId && n.forUserId === user.tenantId) ||
        n.forRole === user.role,
    );
  },
);

// ---- Unit drill-down context ----------------------------------------------

export interface UnitContext {
  unit: Unit;
  property?: Property;
  building?: { id: string; name: string };
  lease?: Lease;
  tenant?: Tenant;
  invoices: Invoice[];
  balance: number;
}

export function unitContext(data: DataState, unitId: string): UnitContext | null {
  const unit = data.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const property = data.properties.find((p) => p.id === unit.propertyId);
  const building = data.buildings.find((b) => b.id === unit.buildingId);
  const lease = currentLeaseForUnit(data, unitId);
  const tenant = lease ? data.tenants.find((t) => t.id === lease.tenantId) : undefined;
  return {
    unit,
    property,
    building: building ? { id: building.id, name: building.name } : undefined,
    lease,
    tenant,
    invoices: invoicesForUnit(data, unitId),
    balance: unitBalance(data, unitId),
  };
}
