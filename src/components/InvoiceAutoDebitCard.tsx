'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { SectionCard, Money } from '@/components/ui';
import { AutoDebitBadge, AUTO_DEBIT_STATE_META } from '@/components/AutoDebitBadge';
import { formatDate, formatDateTime } from '@/lib/format';
import type { AutoDebitInvoiceDetail } from '@/types';

/**
 * Staff view of one invoice's auto-debit: is the tenant enrolled, what has been tried, what happens next.
 * Renders nothing when the tenant isn't on auto-debit and nothing was ever attempted, and nothing for
 * roles the API won't answer (it returns 403) — so it is safe to drop on any staff-visible invoice page.
 */
export function InvoiceAutoDebitCard({ invoiceId }: { invoiceId: string }) {
  const [detail, setDetail] = useState<AutoDebitInvoiceDetail | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    api.autoDebitInvoice(invoiceId).then((d) => live && setDetail(d)).catch(() => live && setDetail(null));
    return () => { live = false; };
  }, [invoiceId]);

  if (!detail || (!detail.enrolled && detail.attempts.length === 0)) return null;

  const { state, attempts, maxAttempts } = detail;
  const last = attempts[attempts.length - 1];

  return (
    <SectionCard
      title={<span className="whitespace-nowrap">Auto-debit</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {state && <AutoDebitBadge state={state} info={{ dueDate: null, nextAttemptOn: last?.nextAttemptOn ?? null, lastReason: last?.reason ?? null }} />}
        <span className="text-xs text-ink-500">{detail.enrolled ? 'Tenant has auto-debit on.' : 'Tenant has since turned auto-debit off.'}</span>
      </div>
      {state === 'manual' && (
        <div className="mb-3 flex gap-2 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>All {maxAttempts} attempts failed. The tenant was asked to pay manually — consider sending a reminder or recording their payment.</span>
        </div>
      )}
      {state === 'retrying' && last?.nextAttemptOn && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><Clock className="h-3.5 w-3.5" /> Next attempt {formatDate(last.nextAttemptOn)} · {attempts.length} of {maxAttempts} used</p>
      )}
      {attempts.length === 0 ? (
        <p className="text-sm text-ink-500">{AUTO_DEBIT_STATE_META.scheduled.help}</p>
      ) : (
        <ol className="space-y-2">
          {attempts.map((a) => (
            <li key={a.attemptNo} className="rounded-lg border border-ink-100 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                  {a.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : a.status === 'failed' ? <XCircle className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
                  Attempt {a.attemptNo}
                </span>
                <Money value={a.amount} className="text-sm font-bold text-ink-700" />
              </div>
              <p className="mt-0.5 text-xs text-ink-400">
                {formatDateTime(a.attemptedAt)} · {a.status === 'success' ? 'Paid' : a.status === 'failed' ? 'Failed' : 'Awaiting confirmation'}
              </p>
              {a.reason && a.status !== 'success' && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{a.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
