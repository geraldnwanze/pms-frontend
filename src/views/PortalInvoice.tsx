'use client';

import { useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import { Receipt, ArrowLeft, Download, CreditCard, CalendarClock, Info } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, paymentsForInvoice, invoiceOutstanding } from '@/store/selectors';
import { pushToast } from '@/store/uiSlice';
import { PageHeader, Breadcrumbs, Card, SectionCard, StatusBadge, Money, KeyValue, EmptyState } from '@/components/ui';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { invoiceStatusMeta, paymentStatusMeta } from '@/lib/status';
import { UtilityLineDetail } from '@/components/UtilityLineDetail';
import { exportToPdf } from '@/lib/export';
import { pdfLineDescription } from '@/lib/invoiceLines';
import { formatDate, uid } from '@/lib/format';

/** One of the signed-in tenant's own invoices: what is billed (including any late fee), what is paid, what is left. */
export function PortalInvoice() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [paying, setPaying] = useState(false);

  // Only ever the tenant's own invoice — never another tenant's, whatever the address says.
  const invoice = data.invoices.find((i) => i.id === id && i.tenantId === user?.tenantId);

  if (!invoice) {
    return (
      <div>
        <PageHeader title="Invoice not found" />
        <Card><EmptyState icon={<Receipt className="h-6 w-6" />} title="We couldn't find that invoice" action={<button className="btn-primary" onClick={() => navigate('/portal/bills')}><ArrowLeft className="h-4 w-4" /> Back to bills</button>} /></Card>
      </div>
    );
  }

  const unit = data.units.find((u) => u.id === invoice.unitId);
  const property = data.properties.find((p) => p.id === invoice.propertyId);
  const payments = paymentsForInvoice(data, invoice.id).filter((p) => p.tenantId === user?.tenantId).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const outstanding = invoiceOutstanding(invoice);
  const subtotal = invoice.lineItems.reduce((s, li) => s + li.amount, 0);
  const fee = invoice.penalty ?? 0;
  const feeWaived = !!invoice.lateFeeWaivedOn && fee === 0;
  const canPay = outstanding > 0 && invoice.status !== 'cancelled';

  const downloadPdf = () => {
    exportToPdf({
      filename: invoice.code,
      title: `Invoice ${invoice.code}`,
      subtitle: `${property?.name ?? ''} · Unit ${unit?.code ?? ''}`,
      columns: ['Description', 'Type', 'Amount (₦)'],
      rows: [
        ...invoice.lineItems.map((li) => [pdfLineDescription(li, data.meters), li.type.replace('-', ' '), li.amount.toLocaleString('en-NG')]),
        ...(fee ? [['Late fee', '', fee.toLocaleString('en-NG')]] : []),
        ...(invoice.discount ? [['Discount', '', `-${invoice.discount.toLocaleString('en-NG')}`]] : []),
        ['', 'TOTAL', invoice.total.toLocaleString('en-NG')],
        ['', 'PAID', invoice.amountPaid.toLocaleString('en-NG')],
        ['', 'OUTSTANDING', outstanding.toLocaleString('en-NG')],
      ],
      meta: { 'Issue date': formatDate(invoice.issueDate), 'Due date': formatDate(invoice.dueDate), Status: invoiceStatusMeta(invoice.status).label },
    });
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Invoice PDF downloaded.' }));
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Bills & Invoices', to: '/portal/bills' }, { label: invoice.code }]} />}
        title={<span className="flex items-center gap-2.5">{invoice.code}<StatusBadge meta={invoiceStatusMeta(invoice.status)} /></span>}
        subtitle={`Issued ${formatDate(invoice.issueDate)} · due ${formatDate(invoice.dueDate)}`}
        actions={<>
          <button className="btn-secondary" onClick={downloadPdf}><Download className="h-4 w-4" /> PDF</button>
          {canPay && <button className="btn-primary" onClick={() => setPaying(true)}><CreditCard className="h-4 w-4" /> Pay</button>}
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="border-b border-ink-100 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">From</p>
              <p className="mt-1 font-bold text-ink-800">{property?.name ?? 'Property'}</p>
              <p className="text-sm text-ink-500">{property?.address} · Unit {unit?.code}</p>
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
                    <td className="py-2.5"><span className="font-medium text-ink-700">{li.description}</span><span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] capitalize text-ink-500">{li.type.replace('-', ' ')}</span><UtilityLineDetail item={li} staff={false} /></td>
                    <td className="py-2.5 text-right"><Money value={li.amount} className="text-ink-800" /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
              <Row label="Subtotal"><Money value={subtotal} /></Row>
              {fee > 0 && <Row label="Late fee"><Money value={fee} className="text-red-600" /></Row>}
              {feeWaived && <Row label="Late fee"><span className="text-ink-400">waived</span></Row>}
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

          {fee > 0 && (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>A late fee of ₦{fee.toLocaleString('en-NG')} was added because this invoice was still unpaid after its grace period. It is charged once. If you think it was added in error, message your property manager.</p>
            </div>
          )}

          <SectionCard title="Your payments" subtitle={`${payments.length} payment${payments.length === 1 ? '' : 's'} on this invoice`} bodyClassName="p-0">
            {payments.length === 0 ? (
              <p className="p-5 text-sm text-ink-400">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)} · <span className="capitalize">{p.method.replace('-', ' ')}</span></p></div>
                    <div className="flex items-center gap-3"><Money value={p.amount} className="font-semibold" /><StatusBadge meta={paymentStatusMeta(p.status)} /></div>
                  </li>
                ))}
              </ul>
            )}
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

          {canPay && (
            <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white">
              <p className="text-sm font-medium text-white/80">Outstanding balance</p>
              <Money value={outstanding} className="mt-1 text-3xl font-extrabold" />
              <div className="mt-2 flex items-center gap-1.5 text-xs text-white/70"><CalendarClock className="h-3.5 w-3.5" /> Due {formatDate(invoice.dueDate)}</div>
              <button className="mt-4 w-full rounded-lg bg-white py-2 text-sm font-semibold text-brand-700 transition hover:bg-white/90" onClick={() => setPaying(true)}>Pay this invoice</button>
            </Card>
          )}
        </div>
      </div>

      {paying && <RecordPaymentModal invoiceId={invoice.id} onClose={() => setPaying(false)} title="Pay invoice" />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-ink-500">{label}</span>{children}</div>;
}
