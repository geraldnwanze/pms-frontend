'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { pushToast } from '@/store/uiSlice';
import { api, ApiError } from '@/lib/api';
import { SectionCard, Badge, Money, ConfirmDialog } from '@/components/ui';
import { formatDate, uid } from '@/lib/format';
import type { AutoDebitStatus, AutoDebitUpcoming } from '@/types';

const STATE_LABEL: Record<AutoDebitUpcoming['state'], { text: (u: AutoDebitUpcoming) => string; tone: 'blue' | 'amber' | 'gray' | 'red' }> = {
  scheduled: { text: (u) => `Charges ${formatDate(u.dueDate)}`, tone: 'blue' },
  processing: { text: () => 'Processing…', tone: 'amber' },
  retrying: { text: (u) => `Retry ${u.nextAttemptOn ? formatDate(u.nextAttemptOn) : 'soon'}`, tone: 'amber' },
  manual: { text: () => 'Pay manually', tone: 'red' },
};

/**
 * Tenant-facing control for auto-debit: turn it on (a ₦50 card check that is refunded), see which
 * card is saved and what will be charged next, change the card, or switch it off. The card itself
 * is never seen here — only Paystack's masked summary.
 */
export function AutoDebitCard() {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<AutoDebitStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<'setup' | 'cancel' | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const toast = useCallback(
    (message: string, kind: 'success' | 'error' = 'success') => dispatch(pushToast({ id: uid('t'), kind, message })),
    [dispatch],
  );

  const load = useCallback(async () => {
    try {
      setStatus(await api.autoDebitStatus());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startSetup = async () => {
    setBusy('setup');
    try {
      const { authorizationUrl } = await api.autoDebitSetup();
      window.location.href = authorizationUrl; // Paystack-hosted card entry — we never see the card
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not start the card setup.', 'error');
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy('cancel');
    try {
      await api.autoDebitCancel();
      toast('Auto-debit turned off. You’ll pay each invoice yourself.');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not turn auto-debit off.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return null; // not a tenant, or the API is unreachable — don't clutter the page
  if (!status) {
    return (
      <SectionCard title="Auto-debit">
        <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      </SectionCard>
    );
  }
  if (!status.available) return null; // online payments aren't configured

  if (!status.enabled) {
    return (
      <SectionCard title="Auto-debit" subtitle="Never miss a rent due date">
        {status.status === 'expired' && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {status.card ? <>Your card <b>{status.card.label}</b> can no longer be charged, so auto-debit is paused.</> : 'Auto-debit is paused.'} Add a new card to turn it back on.
          </div>
        )}
        <p className="text-sm text-ink-600">
          Save a card once and each rent invoice is charged on its due date. We remind you the day before, and if a charge fails we try again twice before asking you to pay.
        </p>
        <button className="btn-primary mt-4 w-full" onClick={startSetup} disabled={busy !== null}>
          {busy === 'setup' ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting…</> : <><CreditCard className="h-4 w-4" /> Set up auto-debit</>}
        </button>
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-ink-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>A <Money value={status.setupAmount} /> charge verifies your card and is refunded straight away. We never see or store your card number.</span>
        </p>
      </SectionCard>
    );
  }

  const card = status.card;
  return (
    <SectionCard title="Auto-debit" subtitle="Rent is charged to your card on each due date" action={<Badge tone="green">On</Badge>}>
      <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
        <span className="flex h-9 w-12 items-center justify-center rounded-md bg-ink-800 text-white"><CreditCard className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-800">{card?.label ?? 'Saved card'}</p>
          <p className="text-xs text-ink-400">
            {card?.expMonth && card?.expYear ? `Expires ${card.expMonth}/${card.expYear.slice(-2)}` : ''}
            {card?.bank ? ` · ${card.bank}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-400"><CalendarClock className="h-3.5 w-3.5" /> Coming up</p>
        {status.upcoming.length === 0 ? (
          <p className="text-sm text-ink-400">Nothing queued — your next invoice will be charged on its due date.</p>
        ) : (
          <ul className="space-y-2">
            {status.upcoming.slice(0, 4).map((u) => {
              const meta = STATE_LABEL[u.state];
              return (
                <li key={u.invoiceId} className="rounded-lg border border-ink-100 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-800">{u.code}</span>
                    <Money value={u.amount} className="text-sm font-bold text-ink-700" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                    <Badge tone={meta.tone}>{meta.text(u)}</Badge>
                    {u.state === 'retrying' && <span className="text-[11px] text-ink-400">attempt {u.attempts} of {status.maxAttempts} failed</span>}
                  </div>
                  {u.lastReason && u.state !== 'scheduled' && <p className="mt-1 text-[11px] text-red-600">{u.lastReason}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button className="btn-secondary w-full" onClick={startSetup} disabled={busy !== null}>
          {busy === 'setup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Change card
        </button>
        <button className="btn-secondary w-full text-red-600" onClick={() => setConfirmOff(true)} disabled={busy !== null}>
          {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Turn off
        </button>
      </div>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={turnOff}
        title="Turn off auto-debit?"
        message="Your saved card will be removed and rent will no longer be charged automatically. You’ll need to pay each invoice yourself."
        confirmLabel="Turn off"
        danger
      />
    </SectionCard>
  );
}
