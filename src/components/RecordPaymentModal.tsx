'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Zap } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, selectIntegrations, selectModuleOn, invoiceOutstanding, openPaymentForInvoice } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { api, ApiError } from '@/lib/api';
import { Modal, Field, Input, Select, Textarea, Money, Badge } from '@/components/ui';
import { FileDrop, type UploadedFile } from '@/components/ui/form';
import { invoiceStatusMeta } from '@/lib/status';
import { formatDate, today, uid } from '@/lib/format';
import type { PaymentType, PaymentMethod, Invoice } from '@/types';

const TYPES: PaymentType[] = ['rent', 'partial-rent', 'security-deposit', 'service-charge', 'utility', 'maintenance', 'application-fee', 'other'];
const METHODS: PaymentMethod[] = ['bank-transfer', 'online', 'cash', 'pos', 'cheque'];

/**
 * Submit a payment against an invoice — used by tenants (upload receipt) and by
 * managers/finance (record an offline payment). Enters the verification queue.
 */
export function RecordPaymentModal({
  invoiceId,
  tenantId,
  onClose,
  title = 'Record a payment',
}: {
  invoiceId?: string;
  tenantId?: string;
  onClose: () => void;
  title?: string;
}) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const integrations = useAppSelector(selectIntegrations);
  const [payingOnline, setPayingOnline] = useState(false);

  // Candidate invoices to pay: the fixed one, or the tenant's open invoices.
  const candidates = useMemo(() => {
    if (invoiceId) return data.invoices.filter((i) => i.id === invoiceId);
    const tid = tenantId ?? (user?.tenantId ?? '');
    return data.invoices
      .filter((i) => i.tenantId === tid && i.status !== 'fully-paid' && i.status !== 'cancelled')
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [data.invoices, invoiceId, tenantId, user]);

  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '');
  const invoice: Invoice | undefined = data.invoices.find((i) => i.id === selectedId) ?? candidates[0];

  const [amount, setAmount] = useState(invoice ? invoiceOutstanding(invoice) : 0);
  const [type, setType] = useState<PaymentType>('rent');
  const [method, setMethod] = useState<PaymentMethod>('bank-transfer');
  const [paymentDate, setPaymentDate] = useState(today());
  const [bankName, setBankName] = useState('');
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState<UploadedFile | null>(null);

  // When invoice selection changes, refresh the amount + type default.
  const onSelectInvoice = (id: string) => {
    setSelectedId(id);
    const inv = data.invoices.find((i) => i.id === id);
    if (inv) {
      setAmount(invoiceOutstanding(inv));
      const first = inv.lineItems[0];
      if (first) setType(first.type);
    }
  };

  const toast = (message: string, kind: 'success' | 'error' = 'success') =>
    dispatch(pushToast({ id: uid('t'), kind, message }));

  const openPayment = invoice ? openPaymentForInvoice(data, invoice.id) : undefined;

  // Offer to keep the card for auto-debit — only when it isn't already on.
  const [saveCard, setSaveCard] = useState(false);
  const [autoDebitOff, setAutoDebitOff] = useState(false);
  const autoDebitModuleOn = useAppSelector(selectModuleOn('auto-debit'));
  useEffect(() => {
    if (!autoDebitModuleOn || user?.role !== 'tenant' || !integrations?.paystack?.configured) return;
    api.autoDebitStatus().then((st) => setAutoDebitOff(st.available && !st.enabled)).catch(() => setAutoDebitOff(false));
  }, [autoDebitModuleOn, user?.role, integrations?.paystack?.configured]);

  const canPayOnline =
    user?.role === 'tenant' &&
    Boolean(integrations?.paystack?.configured) &&
    Boolean(invoice) &&
    !openPayment &&
    Number(amount) > 0;

  const payOnline = async () => {
    if (!invoice || openPayment) return;
    setPayingOnline(true);
    try {
      const { authorizationUrl } = await api.paystackInitialize({
        invoiceId: invoice.id,
        amount: Math.round(Number(amount)),
        saveCard: saveCard && autoDebitOff,
      });
      window.location.href = authorizationUrl; // redirect to Paystack hosted checkout
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not start the online payment.';
      toast(message, 'error');
      setPayingOnline(false);
    }
  };

  const submit = () => {
    if (!invoice) { toast('Select an invoice to pay.', 'error'); return; }
    if (openPayment) { toast(`${openPayment.code} is already ${openPayment.status === 'initiated' ? 'in progress' : 'awaiting verification'} on this invoice.`, 'error'); return; }
    if (amount <= 0) { toast('Enter a valid amount.', 'error'); return; }
    if (!reference.trim()) { toast('A payment reference is required.', 'error'); return; }
    dispatch(dataActions.submitPayment({
      invoiceId: invoice.id, leaseId: invoice.leaseId, unitId: invoice.unitId,
      propertyId: invoice.propertyId, tenantId: invoice.tenantId,
      type, method, amount: Number(amount), paymentDate,
      bankName: method === 'bank-transfer' || method === 'cheque' ? bankName : undefined,
      reference: reference.trim(),
      payerName: payerName || data.tenants.find((t) => t.id === invoice.tenantId)?.name,
      description: description || undefined,
      receiptFileName: receipt?.name,
      receiptDataUrl: receipt?.dataUrl,
    }));
    toast('Payment submitted for verification.');
    onClose();
  };

  const needsBank = method === 'bank-transfer' || method === 'cheque';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      subtitle="It will be sent to Finance for verification before the balance updates."
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={!!openPayment}><Wallet className="h-4 w-4" /> Submit payment</button></>}
    >
      {candidates.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">No outstanding invoices to pay.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Invoice">
            {invoiceId ? (
              <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
                <span className="font-semibold text-ink-800">{invoice?.code}</span>
                {invoice && <Badge tone={invoiceStatusMeta(invoice.status).tone}>{invoiceStatusMeta(invoice.status).label}</Badge>}
              </div>
            ) : (
              <Select value={selectedId} onChange={(e) => onSelectInvoice(e.target.value)}>
                {candidates.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} · due {formatDate(i.dueDate)} · ₦{invoiceOutstanding(i).toLocaleString('en-NG')} outstanding</option>
                ))}
              </Select>
            )}
          </Field>

          {invoice && (
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
              <span className="text-ink-600">Outstanding on this invoice</span>
              <Money value={invoiceOutstanding(invoice)} className="font-bold text-brand-700" />
            </div>
          )}

          {openPayment && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <b>{openPayment.code}</b> is already {openPayment.status === 'initiated' ? 'a checkout in progress' : 'awaiting verification'} on this invoice.
              You can start another payment once it completes or is rejected.
            </div>
          )}

          {canPayOnline && (
            <div className="rounded-xl border border-brand-300 bg-gradient-to-br from-brand-50 to-white p-4 dark:border-brand-500/40 dark:from-brand-500/10 dark:to-transparent">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
                    <Zap className="h-4 w-4 text-brand-600" /> Pay online with Paystack
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Card, bank transfer or USSD. Verified automatically — no receipt to upload.
                  </p>
                </div>
                <button className="btn-primary shrink-0" onClick={payOnline} disabled={payingOnline}>
                  {payingOnline ? 'Redirecting…' : <>Pay <Money value={Math.round(Number(amount))} /></>}
                </button>
              </div>
              {autoDebitOff && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-brand-200/60 pt-3 text-xs text-ink-600 dark:border-brand-500/20">
                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-brand-600" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                  <span>
                    <b className="text-ink-800">Save this card for automatic rent payments.</b> Future invoices are charged to it on their due date — you can turn it off any time.
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₦)" required><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
            <Field label="Payment date" required><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></Field>
            <Field label="Payment for"><Select value={type} onChange={(e) => setType(e.target.value as PaymentType)} className="capitalize">{TYPES.map((t) => <option key={t} value={t}>{t.replace('-', ' ')}</option>)}</Select></Field>
            <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="capitalize">{METHODS.map((m) => <option key={m} value={m}>{m.replace('-', ' ')}</option>)}</Select></Field>
            {needsBank && <Field label="Bank"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" /></Field>}
            <Field label="Reference / teller no." required className={needsBank ? '' : 'sm:col-span-2'}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference" /></Field>
            <Field label="Payer name" className="sm:col-span-2"><Input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Who made the payment" /></Field>
            <Field label="Note (optional)" className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything the reviewer should know" /></Field>
          </div>

          <Field label="Proof of payment">
            <FileDrop value={receipt} onFile={setReceipt} label="Upload receipt or transfer screenshot" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
