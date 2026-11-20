import type { DepositEntry, Invoice, Lease, Payment } from '@/types';

/** Money received for the deposit, in total. */
export function depositReceived(lease: Pick<Lease, 'depositLedger'>): number {
  return (lease.depositLedger ?? []).filter((e) => e.type === 'received').reduce((s, e) => s + e.amount, 0);
}

/** Money still held for the tenant: received less what was kept or given back. */
export function depositHeld(lease: Pick<Lease, 'depositLedger'>): number {
  return (lease.depositLedger ?? []).reduce((s, e) => s + (e.type === 'received' ? e.amount : -e.amount), 0);
}

/** What the lease asks for that has not been paid yet. */
export function depositOutstanding(lease: Pick<Lease, 'securityDeposit' | 'depositLedger'>): number {
  return Math.max(0, (lease.securityDeposit ?? 0) - depositReceived(lease));
}

export const DEPOSIT_ENTRY_LABEL: Record<DepositEntry['type'], string> = {
  received: 'Received',
  deduction: 'Kept',
  offset: 'Applied to invoice',
  refund: 'Refunded',
};

/** The same movements, worded for the tenant whose money it is. */
export const DEPOSIT_ENTRY_TENANT_LABEL: Record<DepositEntry['type'], string> = {
  received: 'You paid',
  deduction: 'Kept for a charge',
  offset: 'Used to pay an invoice',
  refund: 'Refunded to you',
};

/** A reading-based bill: use read since the last bill (a never-billed meter starts from its previous reading). */
export function unbilledUnits(m: { currentReading: number; previousReading: number; billedReading?: number | null }): number {
  const from = m.billedReading ?? m.previousReading;
  return Math.max(0, Math.round((m.currentReading - from) * 1000) / 1000);
}

/**
 * Which unpaid invoices of a lease a deposit would be applied to, and how much of each: oldest due first, each up to
 * what it still owes (late fee included). An invoice with a payment still being checked is left for that payment.
 * Mirrors the server, which does the real work.
 */
export function planArrears(invoices: Invoice[], payments: Pick<Payment, 'invoiceId' | 'status'>[], leaseId: string, available: number): { invoice: Invoice; amount: number }[] {
  const open = new Set(payments.filter((p) => p.status === 'initiated' || p.status === 'pending-verification').map((p) => p.invoiceId));
  const plan: { invoice: Invoice; amount: number }[] = [];
  const candidates = invoices
    .filter((i) => i.leaseId === leaseId && i.status !== 'cancelled')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  for (const invoice of candidates) {
    const owed = invoice.total - invoice.amountPaid;
    if (available <= 0) break;
    if (owed <= 0 || open.has(invoice.id)) continue;
    const amount = Math.min(owed, available);
    plan.push({ invoice, amount });
    available -= amount;
  }
  return plan;
}

/** Everything the lease's unpaid invoices still owe. */
export function arrearsOwed(invoices: Invoice[], leaseId: string): number {
  return invoices.filter((i) => i.leaseId === leaseId && i.status !== 'cancelled').reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
}
