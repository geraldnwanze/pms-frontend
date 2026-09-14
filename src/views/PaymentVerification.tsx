'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Clock, Wallet, Receipt, CheckCircle2, ChevronRight, Inbox } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Badge, Money, Avatar, EmptyState,
} from '@/components/ui';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { canApprovePayments } from '@/config/roles';
import { fromNow, daysBetween, uid, TODAY, classNames } from '@/lib/format';
import type { Payment } from '@/types';

export function PaymentVerification() {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [openId, setOpenId] = useState<string | null>(null);

  const canVerify = canApprovePayments(user?.role);

  const pending = useMemo(
    () => data.payments
      .filter((p) => p.status === 'pending-verification' && scoped.has(p.propertyId))
      .slice()
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)), // oldest first (FIFO)
    [data.payments, scoped],
  );

  const totalAmount = pending.reduce((s, p) => s + p.amount, 0);
  const oldestDays = pending.length ? daysBetween(pending[0].submittedAt.slice(0, 10), TODAY) : 0;
  const withReceipt = pending.filter((p) => p.receiptFileName).length;

  const quickApprove = (p: Payment) => {
    dispatch(dataActions.approvePayment({ paymentId: p.id, actorId: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${p.code} approved — ₦${p.amount.toLocaleString('en-NG')} applied.` }));
  };

  return (
    <div>
      <PageHeader
        title="Payment Verification"
        subtitle="Review submitted receipts and confirm payments to update balances"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="In queue" value={pending.length} icon={<Clock className="h-5 w-5" />} tone={pending.length ? 'amber' : 'green'} />
        <StatCard label="Total value" value={<Money value={totalAmount} compact />} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <StatCard label="Oldest waiting" value={oldestDays === 0 ? '—' : `${oldestDays}d`} icon={<ShieldCheck className="h-5 w-5" />} tone={oldestDays > 3 ? 'red' : 'gray'} />
        <StatCard label="With receipt" value={`${withReceipt}/${pending.length}`} icon={<Receipt className="h-5 w-5" />} tone="indigo" />
      </div>

      {pending.length === 0 ? (
        <Card><EmptyState icon={<Inbox className="h-6 w-6" />} title="All caught up" description="There are no payments awaiting verification right now." /></Card>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => {
            const tenant = data.tenants.find((t) => t.id === p.tenantId);
            const unit = data.units.find((u) => u.id === p.unitId);
            const property = data.properties.find((pr) => pr.id === p.propertyId);
            const invoice = data.invoices.find((i) => i.id === p.invoiceId);
            const waiting = daysBetween(p.submittedAt.slice(0, 10), TODAY);
            return (
              <Card key={p.id} className="flex flex-col gap-4 transition-shadow hover:shadow-card-hover lg:flex-row lg:items-center">
                <div className="flex flex-1 items-center gap-3">
                  <Avatar name={tenant?.name ?? '?'} color={tenant?.avatarColor} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink-800">{tenant?.name ?? 'Unknown'}</span>
                      <Badge tone="gray">{p.code}</Badge>
                      {waiting > 3 && <Badge tone="red" dot>Waiting {waiting}d</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-500">
                      {property?.name} · Unit {unit?.code} · {invoice?.code ?? 'no invoice'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-400">
                      <span className="capitalize">{p.method.replace('-', ' ')}</span>·<span>Ref {p.reference}</span>·<span>submitted {fromNow(p.submittedAt)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 lg:gap-6">
                  <div className="text-right">
                    <Money value={p.amount} className="text-lg font-extrabold text-ink-900" />
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-xs">
                      {p.receiptFileName
                        ? <span className="flex items-center gap-1 text-emerald-600"><Receipt className="h-3 w-3" /> receipt</span>
                        : <span className="text-amber-600">no receipt</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canVerify && (
                      <button className="btn-secondary text-emerald-700" onClick={() => quickApprove(p)} title="Approve immediately">
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </button>
                    )}
                    <button className="btn-primary" onClick={() => setOpenId(p.id)}>
                      Review <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!canVerify && pending.length > 0 && (
        <p className={classNames('mt-4 text-center text-sm text-ink-400')}>
          You can review payment details, but only Finance (or the Super Admin) can approve them.
        </p>
      )}

      {openId && <PaymentReviewModal paymentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
