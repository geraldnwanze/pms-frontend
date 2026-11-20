'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Plus, Wallet, Coins, AlertTriangle, TrendingUp, BellRing } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds, invoiceOutstanding, isOverdue } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { api, ApiError } from '@/lib/api';
import {
  PageHeader, Card, StatCard, StatusBadge, Money, Avatar, Chip, DataTable, type Column, ExportMenu,
  Modal, Field, Input, Select,
} from '@/components/ui';
import { invoiceStatusMeta } from '@/lib/status';
import { useAutoDebitOverview } from '@/hooks/useAutoDebitOverview';
import { AutoDebitBadge } from '@/components/AutoDebitBadge';
import { can } from '@/config/roles';
import { formatDate, today, addMonths, uid, classNames } from '@/lib/format';
import type { Invoice, InvoiceStatus, PaymentType, BillingCycle } from '@/types';
import { monthsInCycle, periodShare } from '@/lib/billing';

const STATUS_FILTERS: { key: InvoiceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'pending-verification', label: 'Pending' },
  { key: 'partially-paid', label: 'Partial' },
  { key: 'fully-paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
];

export function Invoices() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const propertyFilter = useAppSelector((s) => s.ui.propertyFilter);
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [reminding, setReminding] = useState(false);
  const autoDebit = useAutoDebitOverview();
  const [adFilter, setAdFilter] = useState<'all' | 'on' | 'attention'>('all');

  const canRemind = ['admin', 'owner', 'manager', 'finance'].includes(user?.role ?? '');

  const sendReminders = async () => {
    setReminding(true);
    try {
      const { data: r } = await api.sendOverdueReminders(propertyFilter === 'all' ? undefined : propertyFilter);
      dispatch(pushToast({
        id: uid('t'),
        kind: r.invoices === 0 ? 'info' : 'success',
        message: r.invoices === 0
          ? 'No overdue invoices — nothing to send.'
          : `Reminders sent for ${r.invoices} overdue invoice${r.invoices === 1 ? '' : 's'} (${r.emailed} email${r.emailed === 1 ? '' : 's'}).`,
      }));
    } catch (err) {
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: err instanceof ApiError ? err.message : 'Could not send reminders.' }));
    } finally {
      setReminding(false);
    }
  };

  const all = useMemo(
    () => data.invoices.filter((i) => scoped.has(i.propertyId)).slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [data.invoices, scoped],
  );
  // "Overdue" is decided by the calendar (unpaid and past its due date), not the stored status
  // field, which only changes when something rewrites it — the reminder job uses the same rule.
  const inFilter = (i: Invoice, key: InvoiceStatus | 'all') => (key === 'all' ? true : key === 'overdue' ? isOverdue(i) : i.status === key);
  // Auto-debit chips (staff only): "on auto-debit" = any invoice it is handling; "needs attention" = failing or given up.
  const adInfo = (id: string) => autoDebit?.invoices[id];
  const adMatch = (i: Invoice) => {
    const a = adInfo(i.id);
    if (adFilter === 'on') return !!a;
    if (adFilter === 'attention') return a?.state === 'retrying' || a?.state === 'manual';
    return true;
  };
  const adOn = autoDebit ? all.filter((i) => adInfo(i.id)).length : 0;
  const adVisible = adOn > 0; // don't add an empty column for portfolios nobody has enrolled in
  const adAttention = autoDebit ? all.filter((i) => ['retrying', 'manual'].includes(adInfo(i.id)?.state ?? '')).length : 0;
  const rows = all.filter((i) => inFilter(i, status) && adMatch(i));

  const billed = all.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.total, 0);
  const collected = all.reduce((s, i) => s + i.amountPaid, 0);
  const outstanding = all.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + invoiceOutstanding(i), 0);
  const overdue = all.filter(isOverdue).length;

  const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? '—';
  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';

  const exportRows = rows.map((i) => ({
    Invoice: i.code, Tenant: tenantName(i.tenantId), Unit: unitCode(i.unitId),
    Issued: i.issueDate, Due: i.dueDate, Total: i.total, Paid: i.amountPaid, Outstanding: invoiceOutstanding(i), Status: i.status,
  }));

  const columns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <div><p className="font-semibold text-ink-800">{i.code}</p><p className="text-xs text-ink-400">{formatDate(i.issueDate)}</p></div> },
    { key: 'tenant', header: 'Tenant', sortValue: (i) => tenantName(i.tenantId), render: (i) => {
      const t = data.tenants.find((x) => x.id === i.tenantId);
      return <div className="flex items-center gap-2"><Avatar name={t?.name ?? '?'} color={t?.avatarColor} size={28} /><div><p className="text-sm font-medium text-ink-700">{t?.name ?? '—'}</p><p className="text-xs text-ink-400">Unit {unitCode(i.unitId)}</p></div></div>;
    } },
    { key: 'due', header: 'Due', sortValue: (i) => i.dueDate, render: (i) => <span className="text-ink-600">{formatDate(i.dueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <Money value={i.total} /> },
    { key: 'paid', header: 'Paid', align: 'right', sortValue: (i) => i.amountPaid, render: (i) => <Money value={i.amountPaid} className="text-brand-700" /> },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (i) => invoiceOutstanding(i), render: (i) => <Money value={invoiceOutstanding(i)} className={invoiceOutstanding(i) > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
    ...(adVisible ? [{
      key: 'autodebit', header: 'Auto-debit',
      sortValue: (i: Invoice) => adInfo(i.id)?.state ?? 'zzz',
      render: (i: Invoice) => { const a = adInfo(i.id); return a ? <AutoDebitBadge state={a.state} info={a} /> : <span className="text-ink-300">—</span>; },
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Rent & Invoices"
        subtitle="Billing across your portfolio"
        actions={<>
          <ExportMenu filename="invoices" title="Invoices" rows={exportRows} size="md" />
          {canRemind && (
            <button className="btn-secondary" onClick={sendReminders} disabled={reminding || overdue === 0} title={overdue === 0 ? 'No overdue invoices' : undefined}>
              <BellRing className="h-4 w-4" /> {reminding ? 'Sending…' : `Remind overdue${overdue ? ` (${overdue})` : ''}`}
            </button>
          )}
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Generate invoice</button>}
        </>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Billed" value={<Money value={billed} compact />} icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
        <StatCard label="Collected" value={<Money value={collected} compact />} icon={<Coins className="h-5 w-5" />} tone="green" />
        <StatCard label="Outstanding" value={<Money value={outstanding} compact />} icon={<Wallet className="h-5 w-5" />} tone={outstanding ? 'amber' : 'gray'} />
        <StatCard label="Overdue" value={overdue} icon={<AlertTriangle className="h-5 w-5" />} tone={overdue ? 'red' : 'gray'} onClick={overdue ? () => setStatus('overdue') : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}
            {f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((i) => inFilter(i, f.key)).length}</span>}
          </Chip>
        ))}
      </div>

      {autoDebit && (adVisible || autoDebit.enrolledTenants.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Auto-debit</span>
          <Chip active={adFilter === 'all'} onClick={() => setAdFilter('all')}>All invoices</Chip>
          <Chip active={adFilter === 'on'} onClick={() => setAdFilter('on')}>
            On auto-debit <span className={classNames('ml-1', adFilter === 'on' ? 'text-white/80' : 'text-ink-400')}>{adOn}</span>
          </Chip>
          <Chip active={adFilter === 'attention'} onClick={() => setAdFilter('attention')}>
            Needs attention <span className={classNames('ml-1', adFilter === 'attention' ? 'text-white/80' : adAttention ? 'font-semibold text-red-500' : 'text-ink-400')}>{adAttention}</span>
          </Chip>
          <span className="ml-1 text-xs text-ink-400">{autoDebit.enrolledTenants.length} tenant{autoDebit.enrolledTenants.length === 1 ? '' : 's'} enrolled</span>
        </div>
      )}

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(i) => i.id}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          searchable
          searchAccessor={(i) => `${i.code} ${tenantName(i.tenantId)} ${unitCode(i.unitId)}`}
          searchPlaceholder="Search invoices…"
          initialSort={{ key: 'code', dir: 'desc' }}
        />
      </Card>

      {creating && <GenerateInvoiceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

// Rent and service charge are annual figures, so an invoice carries the share of the year it covers.
// Utility and other charges are billed as they stand.
const CHARGE_DEFS: { key: keyof typeof CHARGE_LABELS; type: PaymentType; label: string; annual: boolean }[] = [
  { key: 'rent', type: 'rent', label: 'Rent', annual: true },
  { key: 'serviceCharge', type: 'service-charge', label: 'Service charge', annual: true },
  { key: 'utilityCharge', type: 'utility', label: 'Utility', annual: false },
  { key: 'otherCharges', type: 'other', label: 'Other charges', annual: false },
];
const CHARGE_LABELS = { rent: '', serviceCharge: '', utilityCharge: '', otherCharges: '' };

export function GenerateInvoiceModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);

  const leases = useMemo(
    () => data.leases.filter((l) => scoped.has(l.propertyId) && ['active', 'expiring', 'renewed'].includes(l.status)),
    [data.leases, scoped],
  );
  const [leaseId, setLeaseId] = useState(leases[0]?.id ?? '');
  const lease = data.leases.find((l) => l.id === leaseId);
  const unit = lease ? data.units.find((u) => u.id === lease.unitId) : undefined;
  const tenant = lease ? data.tenants.find((t) => t.id === lease.tenantId) : undefined;

  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(addMonths(today(), 1).slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({ rent: true, serviceCharge: true, utilityCharge: false, otherCharges: false });

  // How many months this invoice covers: the lease's billing cycle unless the person says otherwise.
  const [monthsText, setMonthsText] = useState<string | null>(null);          // what is typed in the box, until the person leaves it
  const defaultMonths = monthsInCycle(lease?.billingCycle);
  const months = monthsText === null ? defaultMonths : Math.min(24, Math.max(1, Math.round(Number(monthsText)) || 1));
  const amountFor = (c: (typeof CHARGE_DEFS)[number]) => {
    const annual = unit ? (unit[c.key as keyof typeof unit] as number) : 0;
    return c.annual ? periodShare(annual, months) : annual;
  };

  const lineItems = unit
    ? CHARGE_DEFS.filter((c) => selected[c.key] && amountFor(c) > 0)
        .map((c) => ({ id: uid('li'), description: c.annual ? `${c.label} — ${months} month${months === 1 ? '' : 's'}` : c.label, type: c.type, amount: amountFor(c) }))
    : [];
  const total = lineItems.reduce((s, li) => s + li.amount, 0);

  const submit = () => {
    if (!lease || !unit || !tenant) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a lease first.' })); return; }
    if (lineItems.length === 0) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select at least one charge.' })); return; }
    const action = dispatch(dataActions.createInvoice({
      leaseId: lease.id, unitId: unit.id, propertyId: lease.propertyId, tenantId: tenant.id,
      issueDate, dueDate, lineItems, total, cycle: lease.billingCycle as BillingCycle,
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Invoice generated for ${tenant.name}.` }));
    onClose();
    navigate(`/invoices/${(action.payload as { id: string }).id}`);
  };

  return (
    <Modal open onClose={onClose} title="Generate invoice" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Generate invoice</button></>}>
      {leases.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">No active leases to invoice.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Lease">
            <Select value={leaseId} onChange={(e) => { setLeaseId(e.target.value); setMonthsText(null); }}>
              {leases.map((l) => {
                const u = data.units.find((x) => x.id === l.unitId);
                const t = data.tenants.find((x) => x.id === l.tenantId);
                return <option key={l.id} value={l.id}>{l.code} · {t?.name} · Unit {u?.code}</option>;
              })}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issue date"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </div>
          <Field label="Months billed" hint="Rent and service charge are annual figures; this invoice carries this many months of them.">
            <Input type="number" min={1} max={24} step={1} value={monthsText ?? months}
              onChange={(e) => setMonthsText(e.target.value)}
              onBlur={() => setMonthsText(String(months))} />
          </Field>
          <div>
            <p className="label mb-2">Charges</p>
            <div className="space-y-1.5">
              {CHARGE_DEFS.map((c) => {
                const amt = amountFor(c);
                const disabled = amt <= 0;
                return (
                  <label key={c.key} className={classNames('flex items-center justify-between rounded-lg border px-3 py-2', disabled ? 'border-ink-100 opacity-50' : 'border-ink-200', selected[c.key] && !disabled && 'border-brand-300 bg-brand-50/40')}>
                    <span className="flex items-center gap-2.5">
                      <input type="checkbox" disabled={disabled} checked={!!selected[c.key] && !disabled} onChange={(e) => setSelected((s) => ({ ...s, [c.key]: e.target.checked }))} className="h-4 w-4 rounded accent-brand-600" />
                      <span className="text-sm font-medium text-ink-700">{c.label}</span>
                    </span>
                    <Money value={amt} className="text-sm font-semibold text-ink-800" />
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink-900 px-4 py-3 text-white">
            <span className="text-sm font-medium">Invoice total</span>
            <Money value={total} className="text-lg font-extrabold" />
          </div>
        </div>
      )}
    </Modal>
  );
}
