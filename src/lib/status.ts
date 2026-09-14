import type {
  UnitStatus, InvoiceStatus, PaymentStatus, LeaseStatus, MaintenanceStatus,
  ExpenseStatus, LeadStatus, PropertyStatus, MaintenanceUrgency, InspectionStatus,
  MaintenancePayoutStatus,
} from '@/types';

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple' | 'cyan' | 'indigo';

export const toneClasses: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-400/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/25',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25',
  gray: 'bg-ink-100 text-ink-600 ring-ink-500/20 dark:bg-white/10 dark:ring-white/15',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-400/25',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/25',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25',
};

export const toneDot: Record<Tone, string> = {
  green: 'bg-brand-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  gray: 'bg-ink-400',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
  indigo: 'bg-indigo-500',
};

interface StatusMeta {
  label: string;
  tone: Tone;
}

const titleCase = (s: string) =>
  s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function unitStatusMeta(s: UnitStatus): StatusMeta {
  const map: Record<UnitStatus, Tone> = {
    available: 'blue', occupied: 'green', reserved: 'purple',
    maintenance: 'amber', renovation: 'amber', unavailable: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function invoiceStatusMeta(s: InvoiceStatus): StatusMeta {
  const map: Record<InvoiceStatus, Tone> = {
    unpaid: 'gray', 'pending-verification': 'amber', 'partially-paid': 'blue',
    'fully-paid': 'green', overdue: 'red', cancelled: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function paymentStatusMeta(s: PaymentStatus): StatusMeta {
  const map: Record<PaymentStatus, Tone> = {
    initiated: 'blue', 'pending-verification': 'amber', approved: 'green',
    rejected: 'red', failed: 'red', refunded: 'purple', cancelled: 'gray',
  };
  return { label: titleCase(s), tone: map[s] ?? 'gray' };
}

export function leaseStatusMeta(s: LeaseStatus): StatusMeta {
  const map: Record<LeaseStatus, Tone> = {
    active: 'green', expiring: 'amber', renewed: 'cyan',
    terminated: 'red', expired: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function maintenanceStatusMeta(s: MaintenanceStatus): StatusMeta {
  const map: Record<MaintenanceStatus, Tone> = {
    open: 'red', assigned: 'blue', 'in-progress': 'amber',
    completed: 'cyan', 'tenant-confirmed': 'purple', verified: 'green', closed: 'gray',
  };
  const label = s === 'tenant-confirmed' ? 'Tenant confirmed' : titleCase(s);
  return { label, tone: map[s] ?? 'gray' };
}

export function payoutStatusMeta(s: MaintenancePayoutStatus): StatusMeta {
  const map: Record<MaintenancePayoutStatus, Tone> = {
    requested: 'amber', approved: 'blue', rejected: 'red', paid: 'green',
  };
  return { label: titleCase(s), tone: map[s] ?? 'gray' };
}

export function urgencyMeta(s: MaintenanceUrgency): StatusMeta {
  const map: Record<MaintenanceUrgency, Tone> = {
    low: 'gray', medium: 'blue', high: 'amber', emergency: 'red',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function expenseStatusMeta(s: ExpenseStatus): StatusMeta {
  const map: Record<ExpenseStatus, Tone> = {
    pending: 'amber', approved: 'blue', rejected: 'red', paid: 'green',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function leadStatusMeta(s: LeadStatus): StatusMeta {
  const map: Record<LeadStatus, Tone> = {
    new: 'blue', contacted: 'cyan', 'viewing-scheduled': 'purple',
    negotiating: 'amber', converted: 'green', lost: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function propertyStatusMeta(s: PropertyStatus): StatusMeta {
  const map: Record<PropertyStatus, Tone> = {
    active: 'green', inactive: 'gray', construction: 'amber',
    renovation: 'amber', sold: 'purple', archived: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}

export function inspectionStatusMeta(s: InspectionStatus): StatusMeta {
  const map: Record<InspectionStatus, Tone> = {
    scheduled: 'blue', completed: 'green', cancelled: 'gray',
  };
  return { label: titleCase(s), tone: map[s] };
}
