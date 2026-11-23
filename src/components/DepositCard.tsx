'use client';

import { useState } from 'react';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectCurrentUser, selectData } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { SectionCard, Money, Modal, Field, Input, Select } from '@/components/ui';
import { can } from '@/config/roles';
import { formatDate, today, uid } from '@/lib/format';
import { DEPOSIT_ENTRY_LABEL, arrearsOwed, depositHeld, depositOutstanding, depositReceived, planArrears, arrearsAwaitingPayment } from '@/lib/deposit';
import type { Lease } from '@/types';

const METHODS = [
  { value: 'bank-transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const TONE: Record<string, string> = { received: 'text-brand-700', deduction: 'text-amber-600', offset: 'text-amber-600', refund: 'text-ink-700' };

/** The lease's security deposit: what it asks for, what is held in trust, and the record of every movement. */
export function DepositCard({ lease }: { lease: Lease }) {
  const user = useAppSelector(selectCurrentUser);
  const [receiving, setReceiving] = useState(false);
  const [settling, setSettling] = useState(false);

  const required = lease.securityDeposit ?? 0;
  const received = depositReceived(lease);
  const held = depositHeld(lease);
  const outstanding = depositOutstanding(lease);
  const ledger = lease.depositLedger ?? [];
  const isCurrent = ['active', 'expiring', 'renewed'].includes(lease.status);
  const staff = can(user?.role, 'manage_payments');
  const settled = !!lease.depositSettledOn;

  if (required === 0 && ledger.length === 0) return null;

  return (
    <SectionCard
      title="Security deposit"
      subtitle={settled ? `Settled ${formatDate(lease.depositSettledOn!)}` : isCurrent ? 'Held in trust for the tenant' : 'Lease ended — settle the deposit'}
      action={staff ? (
        <div className="flex gap-2">
          {isCurrent && outstanding > 0 && <button className="btn-secondary" onClick={() => setReceiving(true)}><Plus className="h-4 w-4" /> Receive</button>}
          {!isCurrent && !settled && held > 0 && <button className="btn-primary" onClick={() => setSettling(true)}><ShieldCheck className="h-4 w-4" /> Settle</button>}
        </div>
      ) : undefined}
    >
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-ink-400">Required</dt><dd className="font-semibold text-ink-800"><Money value={required} /></dd></div>
        <div><dt className="text-xs text-ink-400">Received</dt><dd className="font-semibold text-ink-800"><Money value={received} /></dd></div>
        <div><dt className="text-xs text-ink-400">Held</dt><dd className="font-semibold text-brand-700"><Money value={held} /></dd></div>
      </dl>
      {isCurrent && outstanding > 0 && <p className="mt-3 text-xs text-amber-600">₦{outstanding.toLocaleString('en-NG')} of the deposit has not been paid yet.</p>}

      {ledger.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100 text-sm">
          {ledger.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="font-medium text-ink-700">{DEPOSIT_ENTRY_LABEL[e.type]}</p><p className="truncate text-xs text-ink-400">{formatDate(e.date)} · {e.note}</p></div>
              <Money value={e.type === 'received' ? e.amount : -e.amount} className={TONE[e.type]} />
            </li>
          ))}
        </ul>
      )}

      {receiving && <ReceiveDepositModal lease={lease} onClose={() => setReceiving(false)} />}
      {settling && <SettleDepositModal lease={lease} onClose={() => setSettling(false)} />}
    </SectionCard>
  );
}

export function ReceiveDepositModal({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const left = depositOutstanding(lease);
  const [amount, setAmount] = useState(String(left));
  const [method, setMethod] = useState('bank-transfer');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());

  const n = Number(amount);
  const error = !Number.isInteger(n) || n <= 0 ? 'Enter a whole amount above zero.' : n > left ? `That is more than the ₦${left.toLocaleString('en-NG')} still outstanding.` : '';

  const submit = () => {
    if (error) return;
    dispatch(dataActions.receiveDeposit({ leaseId: lease.id, actorId: user!.id, amount: n, method, reference: reference.trim() || undefined, date }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Deposit of ₦${n.toLocaleString('en-NG')} recorded.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Receive security deposit" subtitle={`${lease.code} · ₦${left.toLocaleString('en-NG')} outstanding`} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!!error} onClick={submit}>Record deposit</button></>}>
      <div className="space-y-4">
        <Field label="Amount (₦)" error={amount && error ? error : undefined}><Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Reference (optional)"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

interface Row { key: string; reason: string; amount: string }

export function SettleDepositModal({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const data = useAppSelector(selectData);
  const held = depositHeld(lease);
  const [rows, setRows] = useState<Row[]>([]);
  const [applyArrears, setApplyArrears] = useState(false);

  const kept = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const owed = arrearsOwed(data.invoices, lease.id);
  const plan = applyArrears && kept <= held ? planArrears(data.invoices, data.payments, lease.id, held - kept) : [];
  const applied = plan.reduce((s, p) => s + p.amount, 0);
  // Unpaid money the deposit leaves alone because a payment on that invoice is waiting to be verified: not a shortfall.
  const awaiting = arrearsAwaitingPayment(data.invoices, data.payments, lease.id);
  const short = Math.max(0, owed - applied - awaiting);
  const refund = held - kept - applied;
  const invalid = rows.some((r) => r.reason.trim().length < 3 || !Number.isInteger(Number(r.amount)) || Number(r.amount) <= 0);
  const error = invalid ? 'Give every deduction a reason and a whole amount above zero.' : kept > held ? 'The deductions are more than the deposit held.' : '';

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    if (error) return;
    dispatch(dataActions.settleDeposit({ leaseId: lease.id, actorId: user!.id, deductions: rows.map((r) => ({ reason: r.reason.trim(), amount: Number(r.amount) })), applyToArrears: applyArrears }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Deposit settled: ₦${Math.max(0, refund).toLocaleString('en-NG')} refunded.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Settle security deposit" subtitle={`${lease.code} · ₦${held.toLocaleString('en-NG')} held`} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!!error} onClick={submit}>Settle deposit</button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">Keep what the tenant owes for damage or unpaid charges; the rest is refunded. This can only be done once.</p>
        {rows.map((r) => (
          <div key={r.key} className="flex items-end gap-2">
            <Field label="Reason" className="flex-1"><Input value={r.reason} onChange={(e) => update(r.key, { reason: e.target.value })} placeholder="e.g. Repair of broken window" /></Field>
            <Field label="Amount (₦)" className="w-36"><Input type="number" min={1} value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} /></Field>
            <button className="btn-secondary mb-0.5 px-2.5" aria-label="Remove deduction" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="btn-secondary" onClick={() => setRows((rs) => [...rs, { key: uid('row'), reason: '', amount: '' }])}><Plus className="h-4 w-4" /> Add a deduction</button>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {owed > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-200 p-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={applyArrears} onChange={(e) => setApplyArrears(e.target.checked)} />
            <span><span className="font-medium text-ink-800">Use the deposit to pay unpaid invoices</span><br /><span className="text-xs text-ink-500">The tenant still owes ₦{owed.toLocaleString('en-NG')} on this lease. Oldest invoices are paid first, after your deductions.</span></span>
          </label>
        )}
        {applyArrears && short > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">The deposit does not cover everything: the tenant will still owe ₦{short.toLocaleString('en-NG')} after this.</p>
        )}
        {applyArrears && awaiting > 0 && (
          <p data-testid="awaiting-note" className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">₦{awaiting.toLocaleString('en-NG')} is left as it is: a payment on that invoice is waiting to be verified, and approving it settles the invoice.</p>
        )}
        {plan.length > 0 && (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100 text-sm">
            {plan.map((p) => <li key={p.invoice.id} className="flex justify-between px-3 py-1.5"><span className="text-ink-600">{p.invoice.code}</span><Money value={p.amount} /></li>)}
          </ul>
        )}
        <div className="space-y-1 rounded-lg bg-ink-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Held</span><Money value={held} /></div>
          <div className="flex justify-between"><span className="text-ink-500">Kept</span><Money value={-kept} className="text-amber-600" /></div>
          {applyArrears && <div className="flex justify-between"><span className="text-ink-500">Applied to unpaid invoices</span><Money value={-applied} className="text-amber-600" /></div>}
          <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold"><span>Refund to tenant</span><Money value={Math.max(0, refund)} className="text-brand-700" /></div>
        </div>
      </div>
    </Modal>
  );
}
