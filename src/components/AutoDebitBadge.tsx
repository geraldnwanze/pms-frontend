'use client';

import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { AutoDebitInvoiceInfo, AutoDebitStaffState } from '@/types';

type Tone = 'blue' | 'amber' | 'red' | 'green' | 'purple';

export const AUTO_DEBIT_STATE_META: Record<AutoDebitStaffState, { tone: Tone; label: (i?: Pick<AutoDebitInvoiceInfo, 'dueDate' | 'nextAttemptOn'>) => string; help: string }> = {
  scheduled: { tone: 'blue', label: (i) => (i?.dueDate ? `Charges ${formatDate(i.dueDate)}` : 'Scheduled'), help: 'Will be charged to the tenant’s saved card on the due date.' },
  processing: { tone: 'amber', label: () => 'Charging…', help: 'A charge is in flight; waiting for the bank to confirm.' },
  retrying: { tone: 'amber', label: (i) => (i?.nextAttemptOn ? `Retry ${formatDate(i.nextAttemptOn)}` : 'Retrying'), help: 'A charge failed; it will be retried automatically.' },
  manual: { tone: 'red', label: () => 'Auto-debit failed', help: 'All attempts failed — the tenant has been asked to pay manually.' },
  paid: { tone: 'green', label: () => 'Paid by auto-debit', help: 'Collected from the tenant’s saved card.' },
  partial: { tone: 'purple', label: () => 'Part-paid by auto-debit', help: 'A charge succeeded but a balance remains.' },
};

/** Compact status pill for an invoice's auto-debit state. */
export function AutoDebitBadge({ state, info }: { state: AutoDebitStaffState; info?: Pick<AutoDebitInvoiceInfo, 'dueDate' | 'nextAttemptOn' | 'lastReason'> }) {
  const meta = AUTO_DEBIT_STATE_META[state];
  const title = [meta.help, info?.lastReason ? `Last reason: ${info.lastReason}` : null].filter(Boolean).join(' ');
  return <span title={title}><Badge tone={meta.tone}>{meta.label(info)}</Badge></span>;
}
