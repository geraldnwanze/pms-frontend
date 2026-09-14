'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import {
  CheckCircle2, XCircle, MessageCircleQuestion, FileText, Receipt, Landmark,
  ExternalLink, RotateCcw, ShieldCheck, Clock, Loader2,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { api } from '@/lib/api';
import { Modal, Badge, StatusBadge, Money, KeyValue, Textarea, Avatar } from '@/components/ui';
import { paymentStatusMeta, invoiceStatusMeta } from '@/lib/status';
import { formatDate, formatDateTime, fromNow, uid, classNames } from '@/lib/format';
import { canApprovePayments } from '@/config/roles';
import type { Payment } from '@/types';

/** Proof-of-payment slip. Fetches a short-lived signed URL to the stored file. */
function ReceiptCard({ payment }: { payment: Payment }) {
  const isImage = /\.(jpe?g|png|webp)$/i.test(payment.receiptFileName ?? '');
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!payment.receiptPath) { setLink(null); return; }
    setLoading(true);
    api.paymentReceiptLink(payment.id)
      .then((r) => { if (!cancelled) setLink(r.url); })
      .catch(() => { if (!cancelled) setLink(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [payment.id, payment.receiptPath]);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-dashed border-ink-200 bg-ink-50/70 px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500"><Receipt className="h-4 w-4" /> Proof of payment</span>
        {payment.receiptFileName ? <Badge tone="blue">{isImage ? 'Image' : 'PDF'}</Badge> : <Badge tone="amber">Not attached</Badge>}
      </div>
      {payment.receiptFileName ? (
        <div className="p-4">
          {link && isImage && (
            <a href={link} target="_blank" rel="noreferrer" className="mb-3 block overflow-hidden rounded-lg ring-1 ring-ink-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={link} alt={payment.receiptFileName} className="max-h-64 w-full object-contain bg-ink-50" />
            </a>
          )}
          <div className="flex items-center gap-3 rounded-lg bg-gradient-to-br from-ink-50 to-ink-100 p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
              <FileText className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-800">{payment.receiptFileName}</p>
              <p className="text-xs text-ink-500">Uploaded {fromNow(payment.submittedAt)}</p>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
            ) : link ? (
              <a href={link} target="_blank" rel="noreferrer" className="btn-ghost p-2 text-brand-600" title="Open proof of payment">
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <span className="text-[11px] text-ink-400">not stored</span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 rounded-lg border border-ink-100 p-3 text-sm">
            <div className="flex items-center gap-1.5 text-ink-500"><Landmark className="h-3.5 w-3.5" /> Bank</div>
            <div className="text-right font-semibold text-ink-800">{payment.bankName ?? '—'}</div>
            <div className="mt-1.5 text-ink-500">Reference</div>
            <div className="mt-1.5 text-right font-mono text-xs font-semibold text-ink-800">{payment.reference}</div>
            <div className="mt-1.5 text-ink-500">Payer</div>
            <div className="mt-1.5 text-right font-semibold text-ink-800">{payment.payerName ?? '—'}</div>
          </dl>
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-ink-500">No receipt was attached to this payment.</div>
      )}
    </div>
  );
}

type ActionMode = 'approve' | 'reject' | 'info' | null;

export function PaymentReviewModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const payment = data.payments.find((p) => p.id === paymentId);
  const [mode, setMode] = useState<ActionMode>(null);
  const [note, setNote] = useState('');

  if (!payment) return null;

  const invoice = data.invoices.find((i) => i.id === payment.invoiceId);
  const tenant = data.tenants.find((t) => t.id === payment.tenantId);
  const unit = data.units.find((u) => u.id === payment.unitId);
  const property = data.properties.find((p) => p.id === payment.propertyId);
  const reviewer = data.users.find((u) => u.id === payment.reviewedById);
  const canVerify = canApprovePayments(user?.role) && payment.status === 'pending-verification';
  const canRefund = canApprovePayments(user?.role) && payment.status === 'approved';

  const toast = (message: string, kind: 'success' | 'error' | 'info' = 'success') =>
    dispatch(pushToast({ id: uid('t'), kind, message }));

  const doApprove = () => {
    dispatch(dataActions.approvePayment({ paymentId, actorId: user!.id, notes: note || undefined }));
    toast(`${payment.code} approved — invoice updated.`);
    onClose();
  };
  const doReject = () => {
    if (!note.trim()) { toast('A rejection reason is required.', 'error'); return; }
    dispatch(dataActions.rejectPayment({ paymentId, actorId: user!.id, reason: note.trim() }));
    toast(`${payment.code} rejected.`, 'info');
    onClose();
  };
  const doInfo = () => {
    if (!note.trim()) { toast('Add a note describing what you need.', 'error'); return; }
    dispatch(dataActions.requestPaymentInfo({ paymentId, actorId: user!.id, note: note.trim() }));
    toast('Information request sent to tenant.', 'info');
    onClose();
  };
  const doRefund = () => {
    if (!note.trim()) { toast('A refund reason is required.', 'error'); return; }
    dispatch(dataActions.refundPayment({ paymentId, actorId: user!.id, reason: note.trim() }));
    toast(`${payment.code} refunded.`, 'info');
    onClose();
  };

  const footer = canVerify ? (
    <div className="flex w-full flex-col gap-2">
      {mode && (
        <Textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === 'approve' ? 'Optional verification note…' : mode === 'reject' ? 'Reason for rejection (shared with tenant)…' : 'What extra information do you need?'}
        />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === null ? (
          <>
            <button className="btn-secondary text-amber-700" onClick={() => setMode('info')}><MessageCircleQuestion className="h-4 w-4" /> Request info</button>
            <button className="btn-secondary text-red-600" onClick={() => setMode('reject')}><XCircle className="h-4 w-4" /> Reject</button>
            <button className="btn-primary" onClick={() => setMode('approve')}><CheckCircle2 className="h-4 w-4" /> Approve payment</button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => { setMode(null); setNote(''); }}>Back</button>
            {mode === 'approve' && <button className="btn-primary" onClick={doApprove}><CheckCircle2 className="h-4 w-4" /> Confirm approval</button>}
            {mode === 'reject' && <button className="btn-danger" onClick={doReject}><XCircle className="h-4 w-4" /> Confirm rejection</button>}
            {mode === 'info' && <button className="btn-primary" onClick={doInfo}><MessageCircleQuestion className="h-4 w-4" /> Send request</button>}
          </>
        )}
      </div>
    </div>
  ) : canRefund ? (
    <div className="flex w-full flex-col gap-2">
      {mode === 'reject' && <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for refund…" />}
      <div className="flex items-center justify-between gap-2">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        {mode === 'reject'
          ? <button className="btn-danger" onClick={doRefund}><RotateCcw className="h-4 w-4" /> Confirm refund</button>
          : <button className="btn-secondary text-red-600" onClick={() => setMode('reject')}><RotateCcw className="h-4 w-4" /> Refund payment</button>}
      </div>
    </div>
  ) : (
    <button className="btn-secondary" onClick={onClose}>Close</button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2.5">{payment.code}<StatusBadge meta={paymentStatusMeta(payment.status)} /></span>}
      subtitle={`Submitted ${formatDateTime(payment.submittedAt)}`}
      footer={footer}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Amount submitted</p>
            <p className="mt-1 text-3xl font-extrabold"><Money value={payment.amount} /></p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="gray" className="!bg-white/15 !text-white capitalize">{payment.type.replace('-', ' ')}</Badge>
              <Badge tone="gray" className="!bg-white/15 !text-white capitalize">{payment.method.replace('-', ' ')}</Badge>
              <Badge tone="gray" className="!bg-white/15 !text-white">Paid {formatDate(payment.paymentDate)}</Badge>
            </div>
          </div>
          <ReceiptCard payment={payment} />
          {payment.description && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">“{payment.description}”</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-ink-200 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={tenant?.name ?? 'Tenant'} color={tenant?.avatarColor} />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink-800">{tenant?.name ?? 'Unknown tenant'}</p>
                <p className="text-xs text-ink-500">{tenant?.phone ?? ''}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 border-t border-ink-100 pt-2">
              <KeyValue label="Property">{property?.name ?? '—'}</KeyValue>
              <KeyValue label="Unit"><button className="text-brand-600 hover:underline" onClick={() => unit && (onClose(), navigate(`/units/${unit.id}`))}>{unit?.code ?? '—'}</button></KeyValue>
            </dl>
          </div>

          {invoice ? (
            <button onClick={() => { onClose(); navigate(`/invoices/${invoice.id}`); }} className="block w-full rounded-xl border border-ink-200 p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-800"><FileText className="h-4 w-4 text-ink-400" />{invoice.code}</span>
                <StatusBadge meta={invoiceStatusMeta(invoice.status)} />
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Invoice total</span><Money value={invoice.total} className="font-semibold" /></div>
                <div className="flex justify-between"><span className="text-ink-500">Already paid</span><Money value={invoice.amountPaid} className="text-brand-700" /></div>
                <div className="flex justify-between border-t border-ink-100 pt-1.5"><span className="font-semibold text-ink-600">Outstanding</span><Money value={Math.max(0, invoice.total - invoice.amountPaid)} className="font-bold text-amber-600" /></div>
                {payment.status === 'pending-verification' && (
                  <div className="flex justify-between rounded-lg bg-brand-50 px-2 py-1.5 text-brand-700"><span className="font-semibold">If approved, outstanding →</span><Money value={Math.max(0, invoice.total - invoice.amountPaid - payment.amount)} className="font-bold" /></div>
                )}
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-ink-200 p-4 text-sm text-ink-500">Not linked to an invoice.</div>
          )}

          <div className="rounded-xl border border-ink-200 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Verification trail</p>
            <ol className="space-y-2.5 text-sm">
              <TrailStep icon={<Clock className="h-3.5 w-3.5" />} tone="blue" title="Submitted for verification" time={payment.submittedAt} />
              {payment.status === 'approved' && <TrailStep icon={<ShieldCheck className="h-3.5 w-3.5" />} tone="green" title={`Approved by ${reviewer?.name ?? 'reviewer'}`} time={payment.reviewedAt} note={payment.verificationNotes} />}
              {payment.status === 'rejected' && <TrailStep icon={<XCircle className="h-3.5 w-3.5" />} tone="red" title={`Rejected by ${reviewer?.name ?? 'reviewer'}`} time={payment.reviewedAt} note={payment.rejectionReason} />}
              {payment.status === 'refunded' && <TrailStep icon={<RotateCcw className="h-3.5 w-3.5" />} tone="amber" title="Refunded" time={payment.reviewedAt} />}
              {payment.status === 'pending-verification' && payment.verificationNotes && <TrailStep icon={<MessageCircleQuestion className="h-3.5 w-3.5" />} tone="amber" title="Information requested" note={payment.verificationNotes} />}
            </ol>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TrailStep({ icon, tone, title, time, note }: { icon: React.ReactNode; tone: 'blue' | 'green' | 'red' | 'amber'; title: string; time?: string; note?: string }) {
  const toneBg = { blue: 'bg-blue-100 text-blue-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-700' }[tone];
  return (
    <li className="flex gap-2.5">
      <span className={classNames('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', toneBg)}>{icon}</span>
      <div>
        <p className="font-medium text-ink-700">{title}</p>
        {time && <p className="text-xs text-ink-400">{formatDateTime(time)}</p>}
        {note && <p className="mt-0.5 rounded bg-ink-50 px-2 py-1 text-xs text-ink-600">{note}</p>}
      </div>
    </li>
  );
}
