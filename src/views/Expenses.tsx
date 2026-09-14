'use client';

import { useMemo, useState } from 'react';
import {
  Coins, Plus, Wallet, CheckCircle2, Clock, Receipt, Building2, Phone, Mail, Briefcase, TrendingUp,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, SectionCard, StatCard, StatusBadge, Badge, Money, KeyValue, Avatar,
  EmptyState, DataTable, type Column, Chip, ExportMenu, Modal, Field, Input, Select, Textarea, FileDrop,
  type UploadedFile,
} from '@/components/ui';
import { expenseStatusMeta } from '@/lib/status';
import { can } from '@/config/roles';
import { formatDate, TODAY, uid, classNames } from '@/lib/format';
import type { Expense, ExpenseCategory, ExpenseStatus, Vendor } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['repairs', 'security', 'cleaning', 'utilities', 'fuel', 'insurance', 'tax', 'staff', 'management-fee', 'other'];
const STATUS_FILTERS: { key: ExpenseStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
];

// ===========================================================================
// Expenses
// ===========================================================================
export function Expenses() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [status, setStatus] = useState<ExpenseStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const all = useMemo(
    () => data.expenses.filter((e) => scoped.has(e.propertyId)).slice().sort((a, b) => b.date.localeCompare(a.date)),
    [data.expenses, scoped],
  );
  const rows = status === 'all' ? all : all.filter((e) => e.status === status);

  const totalSpend = all.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const pending = all.filter((e) => e.status === 'pending');
  const pendingAmt = pending.reduce((s, e) => s + e.amount, 0);
  const approvedUnpaid = all.filter((e) => e.status === 'approved');
  const approvedAmt = approvedUnpaid.reduce((s, e) => s + e.amount, 0);

  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const vendorName = (id?: string) => id ? (data.vendors.find((v) => v.id === id)?.name ?? '—') : '—';

  const exportRows = rows.map((e) => ({
    Code: e.code, Description: e.description, Property: propName(e.propertyId), Category: e.category,
    Vendor: vendorName(e.vendorId), Amount: e.amount, Date: e.date, Status: e.status,
  }));

  const columns: Column<Expense>[] = [
    { key: 'desc', header: 'Expense', sortValue: (e) => e.description, render: (e) => <div><p className="font-semibold text-ink-800">{e.description}</p><p className="text-xs text-ink-400">{e.code} · {propName(e.propertyId)}</p></div> },
    { key: 'cat', header: 'Category', sortValue: (e) => e.category, render: (e) => <Badge tone="gray" className="capitalize">{e.category.replace('-', ' ')}</Badge> },
    { key: 'vendor', header: 'Vendor', sortValue: (e) => vendorName(e.vendorId), render: (e) => <span className="text-ink-600">{vendorName(e.vendorId)}</span> },
    { key: 'date', header: 'Date', sortValue: (e) => e.date, render: (e) => <span className="text-ink-600">{formatDate(e.date)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (e) => e.amount, render: (e) => <Money value={e.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (e) => e.status, render: (e) => <StatusBadge meta={expenseStatusMeta(e.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Operating costs across your portfolio"
        actions={<>
          <ExportMenu filename="expenses" title="Expenses" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Record expense</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Paid (YTD)" value={<Money value={totalSpend} compact />} icon={<Wallet className="h-5 w-5" />} tone="purple" />
        <StatCard label="Pending approval" value={<Money value={pendingAmt} compact />} icon={<Clock className="h-5 w-5" />} tone={pending.length ? 'amber' : 'gray'} hint={`${pending.length} items`} onClick={pending.length ? () => setStatus('pending') : undefined} />
        <StatCard label="Approved · unpaid" value={<Money value={approvedAmt} compact />} icon={<CheckCircle2 className="h-5 w-5" />} tone={approvedUnpaid.length ? 'blue' : 'gray'} hint={`${approvedUnpaid.length} items`} onClick={approvedUnpaid.length ? () => setStatus('approved') : undefined} />
        <StatCard label="Total records" value={all.length} icon={<Receipt className="h-5 w-5" />} tone="gray" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((e) => e.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(e) => e.id} onRowClick={(e) => setReviewId(e.id)}
          searchable searchAccessor={(e) => `${e.code} ${e.description} ${e.category} ${vendorName(e.vendorId)}`} searchPlaceholder="Search expenses…"
          initialSort={{ key: 'date', dir: 'desc' }} />
      </Card>

      {creating && <RecordExpenseModal onClose={() => setCreating(false)} />}
      {reviewId && <ExpenseReviewModal expenseId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
}

function RecordExpenseModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const properties = useMemo(() => data.properties.filter((p) => scoped.has(p.id)), [data.properties, scoped]);

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>('repairs');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(TODAY);
  const [receipt, setReceipt] = useState<UploadedFile | null>(null);

  const submit = () => {
    if (!propertyId) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a property.' })); return; }
    if (!description.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a description.' })); return; }
    if (amount <= 0) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Amount must be greater than zero.' })); return; }
    dispatch(dataActions.createExpense({ propertyId, category, vendorId: vendorId || undefined, description: description.trim(), amount: Number(amount), date, receiptFileName: receipt?.name }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Expense recorded — pending approval.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Record expense" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Record expense</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" className="sm:col-span-2"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="capitalize">{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}</Select></Field>
        <Field label="Vendor (optional)"><Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">— None —</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What was this expense for?" /></Field>
        <Field label="Amount (₦)"><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Receipt (optional)" className="sm:col-span-2"><FileDrop label="Attach receipt" accept="image/*,application/pdf" value={receipt} onFile={setReceipt} /></Field>
      </div>
    </Modal>
  );
}

function ExpenseReviewModal({ expenseId, onClose }: { expenseId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const e = data.expenses.find((x) => x.id === expenseId);
  if (!e) return null;

  const property = data.properties.find((p) => p.id === e.propertyId);
  const vendor = e.vendorId ? data.vendors.find((v) => v.id === e.vendorId) : undefined;
  const approver = e.approvedById ? data.users.find((u) => u.id === e.approvedById) : undefined;

  const act = (status: ExpenseStatus, msg: string) => {
    dispatch(dataActions.setExpenseStatus({ id: e.id, status, actorId: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: msg }));
    onClose();
  };

  const canApprove = can(user?.role, 'approve');
  const canPay = can(user?.role, 'manage_financials');

  return (
    <Modal open onClose={onClose} title={e.code} subtitle={e.description} size="md"
      footer={<div className="flex w-full items-center justify-between">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <div className="flex gap-2">
          {e.status === 'pending' && can(user?.role, 'reject') && <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={() => act('rejected', `${e.code} rejected.`)}>Reject</button>}
          {e.status === 'pending' && canApprove && <button className="btn-primary" onClick={() => act('approved', `${e.code} approved.`)}><CheckCircle2 className="h-4 w-4" /> Approve</button>}
          {e.status === 'approved' && canPay && <button className="btn-primary" onClick={() => act('paid', `${e.code} marked as paid.`)}><Wallet className="h-4 w-4" /> Mark as paid</button>}
        </div>
      </div>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-ink-50 p-4">
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Amount</p><Money value={e.amount} className="text-2xl font-bold text-ink-900" /></div>
          <StatusBadge meta={expenseStatusMeta(e.status)} />
        </div>
        <dl>
          <KeyValue label="Property">{property?.name ?? '—'}</KeyValue>
          <KeyValue label="Category"><span className="capitalize">{e.category.replace('-', ' ')}</span></KeyValue>
          {vendor && <KeyValue label="Vendor">{vendor.name} · {vendor.service}</KeyValue>}
          <KeyValue label="Date">{formatDate(e.date)}</KeyValue>
          {e.receiptFileName && <KeyValue label="Receipt"><span className="inline-flex items-center gap-1.5 text-brand-600"><Receipt className="h-4 w-4" />{e.receiptFileName}</span></KeyValue>}
          {approver && <KeyValue label="Reviewed by">{approver.name}</KeyValue>}
        </dl>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Vendors
// ===========================================================================
export function Vendors() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [creating, setCreating] = useState(false);

  const vendors = useMemo(() => {
    const list = user?.role === 'owner' && user.ownerId ? data.vendors.filter((v) => v.ownerId === user.ownerId) : data.vendors;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [data.vendors, user]);

  const spendByVendor = useMemo(() => {
    const map: Record<string, number> = {};
    data.expenses.forEach((e) => { if (e.vendorId && e.status === 'paid') map[e.vendorId] = (map[e.vendorId] ?? 0) + e.amount; });
    return map;
  }, [data.expenses]);

  const totalPaid = vendors.reduce((s, v) => s + v.totalPaid, 0);
  const totalOutstanding = vendors.reduce((s, v) => s + v.outstanding, 0);

  const exportRows = vendors.map((v) => ({ Name: v.name, Service: v.service, Phone: v.phone, Email: v.email, 'Total paid': v.totalPaid, Outstanding: v.outstanding }));

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Contractors and service providers"
        actions={<>
          <ExportMenu filename="vendors" title="Vendors" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add vendor</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Vendors" value={vendors.length} icon={<Briefcase className="h-5 w-5" />} tone="blue" />
        <StatCard label="Total paid" value={<Money value={totalPaid} compact />} icon={<Wallet className="h-5 w-5" />} tone="green" />
        <StatCard label="Outstanding" value={<Money value={totalOutstanding} compact />} icon={<TrendingUp className="h-5 w-5" />} tone={totalOutstanding ? 'amber' : 'gray'} />
      </div>

      {vendors.length === 0 ? (
        <Card><EmptyState icon={<Briefcase className="h-6 w-6" />} title="No vendors yet" description="Add contractors and service providers to track spend." action={can(user?.role, 'create') ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add vendor</button> : undefined} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <Card key={v.id} className="transition-shadow hover:shadow-card-hover">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600"><Building2 className="h-5 w-5" /></span>
                  <div><p className="font-semibold text-ink-800">{v.name}</p><p className="text-xs text-ink-400">{v.service}</p></div>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                <p className="flex items-center gap-2 text-ink-500"><Phone className="h-3.5 w-3.5 text-ink-300" />{v.phone}</p>
                <p className="flex items-center gap-2 truncate text-ink-500"><Mail className="h-3.5 w-3.5 text-ink-300" />{v.email}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
                <div><p className="text-[11px] uppercase tracking-wide text-ink-400">Paid</p><Money value={v.totalPaid} compact className="font-semibold text-ink-800" /></div>
                <div><p className="text-[11px] uppercase tracking-wide text-ink-400">Outstanding</p><Money value={v.outstanding} compact className={classNames('font-semibold', v.outstanding > 0 ? 'text-amber-600' : 'text-ink-400')} /></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <AddVendorModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function AddVendorModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const owners = useMemo(() => data.users.filter((u) => u.role === 'owner'), [data.users]);

  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ownerId, setOwnerId] = useState(user?.role === 'owner' ? user.id : (owners[0]?.id ?? ''));

  const submit = () => {
    if (!name.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Add a vendor name.' })); return; }
    if (!ownerId) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Assign an owner.' })); return; }
    dispatch(dataActions.createVendor({ name: name.trim(), service: service.trim(), phone: phone.trim(), email: email.trim(), ownerId }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Vendor added.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Add vendor" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Add vendor</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bright Spark Electricals" /></Field>
        <Field label="Service"><Input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Electrical" /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {user?.role !== 'owner' && (
          <Field label="Owner" className="sm:col-span-2"><Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        )}
      </div>
    </Modal>
  );
}
