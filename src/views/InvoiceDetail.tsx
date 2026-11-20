'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  Receipt, ArrowLeft, Plus, Download, Ban, Building2, UserRound, CalendarClock, FileText,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, paymentsForInvoice, invoiceOutstanding } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatusBadge, Money, KeyValue, Avatar,
  EmptyState, DataTable, type Column, ConfirmDialog, Modal, Field, Textarea,
} from '@/components/ui';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { InvoiceAutoDebitCard } from '@/components/InvoiceAutoDebitCard';
import { invoiceStatusMeta, paymentStatusMeta } from '@/lib/status';
import { UtilityLineDetail } from '@/components/UtilityLineDetail';
import { exportToPdf } from '@/lib/export';
import { pdfLineDescription } from '@/lib/invoiceLines';
import { formatDate, uid } from '@/lib/format';
import { can } from '@/config/roles';
import type { Payment } from '@/types';

export function InvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [paying, setPaying] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [waiving, setWaiving] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');

  const invoice = data.invoices.find((i) => i.id === id);

  const ctx = useMemo(() => {
    if (!invoice) return null;
    const tenant = data.tenants.find((t) => t.id === invoice.tenantId);
    const unit = data.units.find((u) => u.id === invoice.unitId);
    const property = data.properties.find((p) => p.id === invoice.propertyId);
    const lease = data.leases.find((l) => l.id === invoice.leaseId);
    const owner = property?.owners?.length
      ? data.users.find((u) => u.id === [...property.owners].sort((a, b) => b.percentage - a.percentage)[0].ownerId)
      : undefined;
    const payments = paymentsForInvoice(data, invoice.id).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return { tenant, unit, property, lease, owner, payments };
  }, [data, invoice]);

  if (!invoice || !ctx) {
    return (
      <div>
        <PageHeader title="Invoice not found" />
        <Card><EmptyState icon={<Receipt className="h-6 w-6" />} title="This invoice doesn't exist" action={<button className="btn-primary" onClick={() => navigate('/invoices')}><ArrowLeft className="h-4 w-4" /> Back to invoices</button>} /></Card>
      </div>
    );
  }

  const { tenant, unit, property, lease, owner, payments } = ctx;
  const outstanding = invoiceOutstanding(invoice);
  const subtotal = invoice.lineItems.reduce((s, li) => s + li.amount, 0);
  const canPay = can(user?.role, 'manage_payments') && outstanding > 0 && invoice.status !== 'cancelled';
  const canCancel = can(user?.role, 'manage_financials') && invoice.amountPaid === 0 && invoice.status !== 'cancelled' && invoice.status !== 'fully-paid';

  const canWaive = can(user?.role, 'approve') && (invoice.penalty ?? 0) > 0 && invoice.status !== 'cancelled';

  const doWaive = () => {
    if (waiveReason.trim().length < 3) return;
    dispatch(dataActions.waiveLateFee({ invoiceId: invoice.id, actorId: user!.id, reason: waiveReason.trim() }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Late fee on ${invoice.code} waived.` }));
    setWaiving(false);
    setWaiveReason('');
  };

  const downloadPdf = () => {
    exportToPdf({
      filename: invoice.code,
      title: `Invoice ${invoice.code}`,
      subtitle: `${property?.name ?? ''} · Unit ${unit?.code ?? ''}`,
      columns: ['Description', 'Type', 'Amount (₦)'],
      rows: [
        ...invoice.lineItems.map((li) => [pdfLineDescription(li, data.meters), li.type.replace('-', ' '), li.amount.toLocaleString('en-NG')]),
        ...(invoice.penalty ? [['Late fee', '', invoice.penalty.toLocaleString('en-NG')]] : []),
        ...(invoice.discount ? [['Discount', '', `-${invoice.discount.toLocaleString('en-NG')}`]] : []),
        ['', 'TOTAL', invoice.total.toLocaleString('en-NG')],
        ['', 'PAID', invoice.amountPaid.toLocaleString('en-NG')],
        ['', 'OUTSTANDING', outstanding.toLocaleString('en-NG')],
      ],
      meta: {
        'Billed to': tenant?.name ?? '—',
        'Issue date': formatDate(invoice.issueDate),
        'Due date': formatDate(invoice.dueDate),
        Status: invoiceStatusMeta(invoice.status).label,
      },
    });
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Invoice PDF downloaded.' }));
  };

  const doCancel = () => {
    dispatch(dataActions.cancelInvoice({ invoiceId: invoice.id, actorId: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${invoice.code} cancelled.` }));
    setCancelling(false);
  };

  const paymentColumns: Column<Payment>[] = [
    { key: 'code', header: 'Payment', sortValue: (p) => p.code, render: (p) => <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)}</p></div> },
    { key: 'method', header: 'Method', render: (p) => <span className="capitalize text-ink-600">{p.method.replace('-', ' ')}</span> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-ink-500">{p.reference}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <Money value={p.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge meta={paymentStatusMeta(p.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[
          { label: 'Invoices', to: '/invoices' },
          { label: property?.name ?? 'Property', to: property ? `/properties/${property.id}` : undefined },
          { label: `Unit ${unit?.code ?? ''}`, to: unit ? `/units/${unit.id}` : undefined },
          { label: invoice.code },
        ]} />}
        title={<span className="flex items-center gap-2.5">{invoice.code}<StatusBadge meta={invoiceStatusMeta(invoice.status)} /></span>}
        subtitle={`Issued ${formatDate(invoice.issueDate)} · due ${formatDate(invoice.dueDate)}`}
        actions={<>
          <button className="btn-secondary" onClick={downloadPdf}><Download className="h-4 w-4" /> PDF</button>
          {canWaive && <button className="btn-secondary" onClick={() => setWaiving(true)}>Waive late fee</button>}
          {canCancel && <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={() => setCancelling(true)}><Ban className="h-4 w-4" /> Cancel</button>}
          {canPay && <button className="btn-primary" onClick={() => setPaying(true)}><Plus className="h-4 w-4" /> Record payment</button>}
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Invoice document */}
          <Card>
            <div className="flex items-start justify-between border-b border-ink-100 pb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">From</p>
                <p className="mt-1 font-bold text-ink-800">{property?.name ?? 'Property'}</p>
                <p className="text-sm text-ink-500">{property?.address}</p>
                {owner && <p className="mt-0.5 text-sm text-ink-500">Managed for {owner.name}</p>}
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">Billed to</p>
                <p className="mt-1 font-bold text-ink-800">{tenant?.name ?? '—'}</p>
                <p className="text-sm text-ink-500">{tenant?.email}</p>
                <p className="text-sm text-ink-500">Unit {unit?.code}</p>
              </div>
            </div>

            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="pb-2 font-semibold">Description</th>
                  <th className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {invoice.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="py-2.5"><span className="font-medium text-ink-700">{li.description}</span><span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] capitalize text-ink-500">{li.type.replace('-', ' ')}</span><UtilityLineDetail item={li} staff={true} /></td>
                    <td className="py-2.5 text-right"><Money value={li.amount} className="text-ink-800" /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
              <Row label="Subtotal"><Money value={subtotal} /></Row>
              {!!invoice.penalty && <Row label="Late fee"><Money value={invoice.penalty} className="text-red-600" /></Row>}
              {!!invoice.discount && <Row label="Discount"><Money value={-invoice.discount} className="text-brand-600" /></Row>}
              <div className="flex items-center justify-between border-t border-ink-100 pt-2 text-base">
                <span className="font-bold text-ink-800">Total</span><Money value={invoice.total} className="text-lg font-extrabold text-ink-900" />
              </div>
              <Row label="Amount paid"><Money value={invoice.amountPaid} className="text-brand-700" /></Row>
              <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-white">
                <span className="font-semibold">Outstanding</span><Money value={outstanding} className="text-lg font-extrabold" />
              </div>
            </div>
          </Card>

          <SectionCard title="Payments applied" subtitle={`${payments.length} payment${payments.length === 1 ? '' : 's'} linked to this invoice`} bodyClassName="p-0">
            <DataTable columns={paymentColumns} rows={payments} keyOf={(p) => p.id} onRowClick={(p) => setReviewId(p.id)} pageSize={8} initialSort={{ key: 'code', dir: 'desc' }} emptyTitle="No payments yet" emptyDescription="Record a payment to start clearing this invoice." />
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Details">
            <dl>
              <KeyValue label="Billing cycle"><span className="capitalize">{invoice.cycle}</span></KeyValue>
              <KeyValue label="Issue date">{formatDate(invoice.issueDate)}</KeyValue>
              <KeyValue label="Due date">{formatDate(invoice.dueDate)}</KeyValue>
              <KeyValue label="Status"><StatusBadge meta={invoiceStatusMeta(invoice.status)} /></KeyValue>
            </dl>
          </SectionCard>

          <InvoiceAutoDebitCard invoiceId={invoice.id} />

          <SectionCard title="Linked records">
            <div className="space-y-2">
              {tenant && <LinkRow icon={<UserRound className="h-4 w-4" />} label={tenant.name} sub="Tenant" onClick={() => navigate(`/tenants/${tenant.id}`)} avatar={tenant.avatarColor} />}
              {unit && <LinkRow icon={<Building2 className="h-4 w-4" />} label={`Unit ${unit.code}`} sub={property?.name} onClick={() => navigate(`/units/${unit.id}`)} />}
              {lease && <LinkRow icon={<FileText className="h-4 w-4" />} label={lease.code} sub="Lease agreement" onClick={() => navigate(`/leases/${lease.id}`)} />}
            </div>
          </SectionCard>

          {outstanding > 0 && invoice.status !== 'cancelled' && (
            <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white">
              <p className="text-sm font-medium text-white/80">Outstanding balance</p>
              <Money value={outstanding} className="mt-1 text-3xl font-extrabold" />
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/70"><CalendarClock className="h-3.5 w-3.5" /> Due {formatDate(invoice.dueDate)}</div>
              {canPay && <button className="mt-4 w-full rounded-lg bg-white py-2 text-sm font-semibold text-brand-700 transition hover:bg-white/90" onClick={() => setPaying(true)}>Record a payment</button>}
            </Card>
          )}
        </div>
      </div>

      {paying && <RecordPaymentModal invoiceId={invoice.id} onClose={() => setPaying(false)} title={`Record payment · ${invoice.code}`} />}
      {reviewId && <PaymentReviewModal paymentId={reviewId} onClose={() => setReviewId(null)} />}
      {waiving && (
        <Modal open onClose={() => setWaiving(false)} title="Waive late fee" subtitle={`${invoice.code} · ₦${(invoice.penalty ?? 0).toLocaleString('en-NG')}`} size="sm"
          footer={<><button className="btn-secondary" onClick={() => setWaiving(false)}>Cancel</button><button className="btn-primary" disabled={waiveReason.trim().length < 3} onClick={doWaive}>Waive fee</button></>}>
          <Field label="Reason" hint="Recorded in the audit log and shown to the tenant's notification.">
            <Textarea value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="e.g. Bank delay on the tenant's side" />
          </Field>
        </Modal>
      )}
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} onConfirm={doCancel} danger title="Cancel this invoice?" message={`${invoice.code} will be voided. This can't be undone.`} confirmLabel="Cancel invoice" />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-ink-500">{label}</span>{children}</div>;
}

function LinkRow({ icon, label, sub, onClick, avatar }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; avatar?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-ink-200 p-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
      {avatar ? <Avatar name={label} color={avatar} size={32} /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500">{icon}</span>}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-800">{label}</p>{sub && <p className="truncate text-xs text-ink-400">{sub}</p>}</div>
    </button>
  );
}
