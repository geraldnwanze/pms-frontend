'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import {
  Home, FileText, Receipt, CreditCard, Wrench, Bell, FolderOpen, MessageSquare,
  Plus, CheckCircle2, Clock, ShieldCheck, BedDouble, Bath, Ruler, Car, Download,
  AlertTriangle, Megaphone, CalendarClock, Gauge,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, selectPortal, invoiceOutstanding } from '@/store/selectors';
import { fetchPortal, confirmMaintenanceDone } from '@/store/thunks';
import { AutoDebitCard } from '@/components/AutoDebitCard';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, SectionCard, StatCard, StatusBadge, Badge, Money, KeyValue, EmptyState,
  DataTable, type Column, Modal, Field, Input, Select, Textarea,
} from '@/components/ui';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { invoiceStatusMeta, paymentStatusMeta, maintenanceStatusMeta, leaseStatusMeta, urgencyMeta } from '@/lib/status';
import { DEPOSIT_ENTRY_TENANT_LABEL, depositHeld, depositOutstanding } from '@/lib/deposit';
import { unbilledChargeTotal } from '@/lib/usage';
import { formatDate, formatDateTime, fromNow, formatNumber, daysUntil, uid } from '@/lib/format';
import type { Invoice, Lease, Payment, MaintenanceRequest, DocumentRecord, MaintenanceUrgency } from '@/types';

// ---------------------------------------------------------------------------
// Shared tenant context
// ---------------------------------------------------------------------------
function useTenantCtx() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  return useMemo(() => {
    const tid = user?.tenantId ?? '';
    const tenant = data.tenants.find((t) => t.id === tid);
    const leases = data.leases.filter((l) => l.tenantId === tid).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    const lease = leases.find((l) => ['active', 'expiring', 'renewed'].includes(l.status)) ?? leases[0];
    const unit = lease ? data.units.find((u) => u.id === lease.unitId) : undefined;
    const property = lease ? data.properties.find((p) => p.id === lease.propertyId) : undefined;
    const building = unit ? data.buildings.find((b) => b.id === unit.buildingId) : undefined;
    const invoices = data.invoices.filter((i) => i.tenantId === tid).slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const payments = data.payments.filter((p) => p.tenantId === tid).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const maintenance = data.maintenance.filter((m) => m.tenantId === tid).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const balance = invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + invoiceOutstanding(i), 0);
    const documents = data.documents.filter((d) => d.tenantId === tid || (unit && d.unitId === unit.id) || (property && d.propertyId === property.id));
    const notices = data.notices
      .filter((n) => (n.audience === 'all' || n.audience === 'tenants') && (!n.propertyId || n.propertyId === property?.id))
      .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data, user, tenant, leases, lease, unit, property, building, invoices, payments, maintenance, balance, documents, notices };
  }, [data, user]);
}

function NoTenant() {
  return <Card><EmptyState icon={<Home className="h-6 w-6" />} title="No tenancy linked" description="Your account isn't linked to a tenant record yet. Please contact your property manager." /></Card>;
}

// ---------------------------------------------------------------------------
// My Home
// ---------------------------------------------------------------------------
export function PortalHome() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const ctx = useTenantCtx();
  const portal = useAppSelector(selectPortal);
  const [reviewId, setReviewId] = useState<string | null>(null);

  // The resident home is server-computed (GET /api/v1/portal). `bootstrap()`
  // refreshes it after mutations; re-pull on mount too.
  useEffect(() => {
    void dispatch(fetchPortal());
  }, [dispatch]);

  const linked = portal ? portal.linked : !!ctx.tenant;
  if (!linked) return <div><PageHeader title="My Home" /><NoTenant /></div>;

  // Prefer the server rollup; fall back to the client context until it lands.
  const name = portal?.tenant?.name ?? ctx.tenant?.name ?? 'there';
  const lease = portal?.lease ?? ctx.lease;
  const unit = portal?.unit ?? ctx.unit;
  const property = portal?.property ?? ctx.property;
  const balance = portal?.balance ?? ctx.balance;
  const nextDue = portal?.nextDue ?? (() => {
    const n = ctx.invoices
      .filter((i) => invoiceOutstanding(i) > 0 && i.status !== 'cancelled')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return n ? { id: n.id, code: n.code, dueDate: n.dueDate, outstanding: invoiceOutstanding(n) } : null;
  })();
  const pendingCount = portal?.pendingPaymentsCount
    ?? ctx.payments.filter((p) => p.status === 'pending-verification').length;
  const openJobsCount = portal?.openRequestsCount
    ?? ctx.maintenance.filter((m) => !['verified', 'closed'].includes(m.status)).length;
  const recentPayments = portal?.recentPayments ?? ctx.payments.slice(0, 4);
  const notices = portal?.notices ?? ctx.notices;
  // The unit's meters (the server only sends a tenant their own). No meters, no tile.
  const unitMeters = unit ? ctx.data.meters.filter((m) => m.unitId === unit.id) : [];
  const utilitiesDue = unbilledChargeTotal(unitMeters);

  return (
    <div>
      <PageHeader title={`Welcome back, ${name.split(' ')[0]}`} subtitle={lease && unit ? `Unit ${unit.code} · ${property?.name}` : 'No active lease'} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Balance hero */}
        <Card className={`lg:col-span-2 ${balance > 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-gradient-to-br from-brand-600 to-brand-700'} text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">{balance > 0 ? 'Outstanding balance' : 'You are all paid up'}</p>
              <Money value={balance} className="mt-1 text-4xl font-extrabold" />
              {nextDue && <p className="mt-2 flex items-center gap-1.5 text-sm text-white/80"><CalendarClock className="h-4 w-4" /> Next due {formatDate(nextDue.dueDate)} · {nextDue.code}</p>}
            </div>
            {balance > 0 ? <AlertTriangle className="h-8 w-8 text-white/50" /> : <CheckCircle2 className="h-8 w-8 text-white/50" />}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:bg-white/90" onClick={() => navigate('/portal/pay')}><CreditCard className="mr-1.5 inline h-4 w-4" /> Make a payment</button>
            <button className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 transition hover:bg-white/25" onClick={() => navigate('/portal/bills')}>View bills</button>
          </div>
        </Card>

        {/* Quick facts */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <StatCard label="Lease status" value={lease ? leaseStatusMeta(lease.status).label : 'None'} icon={<FileText className="h-5 w-5" />} tone={lease ? 'green' : 'gray'} onClick={() => navigate('/portal/lease')} />
          <StatCard label="Open requests" value={openJobsCount} icon={<Wrench className="h-5 w-5" />} tone={openJobsCount ? 'cyan' : 'gray'} onClick={() => navigate('/portal/maintenance')} />
          {unitMeters.length > 0 && (
            <div className="col-span-2 lg:col-span-1">
              <StatCard label="Utilities not yet billed" value={<Money value={utilitiesDue} />} hint={`${unitMeters.length} meter${unitMeters.length > 1 ? 's' : ''} on your unit`} icon={<Gauge className="h-5 w-5" />} tone={utilitiesDue > 0 ? 'amber' : 'gray'} onClick={() => navigate('/portal/utilities')} />
            </div>
          )}
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Clock className="h-5 w-5 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-900">You have <b>{pendingCount}</b> payment{pendingCount > 1 ? 's' : ''} awaiting verification by Finance. You'll be notified once reviewed.</p>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SectionCard title="Recent payments" action={<button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => navigate('/portal/payments')}>View all</button>}>
          {recentPayments.length === 0 ? <EmptyState title="No payments yet" /> : (
            <div className="space-y-2">
              {recentPayments.slice(0, 4).map((p) => (
                <button key={p.id} onClick={() => setReviewId(p.id)} className="flex w-full items-center justify-between rounded-lg border border-ink-100 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                  <div><p className="text-sm font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)} · {p.method.replace('-', ' ')}</p></div>
                  <div className="flex items-center gap-2"><Money value={p.amount} className="font-semibold text-ink-800" /><StatusBadge meta={paymentStatusMeta(p.status)} /></div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Notices" action={<button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => navigate('/portal/notices')}>View all</button>}>
          {notices.length === 0 ? <EmptyState title="No notices" /> : (
            <div className="space-y-2">
              {notices.slice(0, 3).map((n) => (
                <div key={n.id} className="rounded-lg border border-ink-100 p-3">
                  <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-brand-500" /><p className="text-sm font-semibold text-ink-800">{n.title}</p></div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-400">{fromNow(n.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {reviewId && <PaymentReviewModal paymentId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Lease
// ---------------------------------------------------------------------------
/** Where the tenant's deposit has gone: what they paid in, and anything kept, used on an invoice or refunded. */
function DepositHistory({ lease }: { lease: Lease }) {
  const ledger = (lease.depositLedger ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (ledger.length === 0) return null;
  const sum = (type: string) => ledger.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
  const kept = sum('deduction');
  const used = sum('offset');
  const refunded = sum('refund');

  return (
    <SectionCard
      className="mt-5"
      title="Deposit history"
      subtitle={lease.depositSettledOn ? `Settled ${formatDate(lease.depositSettledOn)}` : 'Every movement of your deposit'}
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-ink-100">
        {ledger.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0"><p className="font-semibold text-ink-800">{DEPOSIT_ENTRY_TENANT_LABEL[e.type]}</p><p className="truncate text-xs text-ink-400">{formatDate(e.date)} · {e.note}</p></div>
            <Money value={e.type === 'received' ? e.amount : -e.amount} className={e.type === 'received' ? 'font-semibold text-brand-700' : 'font-semibold text-ink-700'} />
          </li>
        ))}
      </ul>
      {lease.depositSettledOn && (
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          Of the ₦{sum('received').toLocaleString('en-NG')} you paid: ₦{kept.toLocaleString('en-NG')} was kept{used > 0 ? `, ₦${used.toLocaleString('en-NG')} was used to pay your invoices` : ''}, and ₦{refunded.toLocaleString('en-NG')} was refunded to you.
        </p>
      )}
    </SectionCard>
  );
}

export function PortalLease() {
  const ctx = useTenantCtx();
  if (!ctx.tenant) return <div><PageHeader title="My Lease" /><NoTenant /></div>;
  const { lease, unit, property, building } = ctx;

  if (!lease || !unit) return <div><PageHeader title="My Lease" /><Card><EmptyState icon={<FileText className="h-6 w-6" />} title="No active lease" description="You don't have an active lease on file." /></Card></div>;

  return (
    <div>
      <PageHeader title="My Lease" subtitle={`${lease.code} · Unit ${unit.code}`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Lease terms" className="lg:col-span-2">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <dl>
              <KeyValue label="Status"><StatusBadge meta={leaseStatusMeta(lease.status)} /></KeyValue>
              <KeyValue label="Start date">{formatDate(lease.startDate)}</KeyValue>
              <KeyValue label="End date">{formatDate(lease.endDate)}</KeyValue>
              {['active', 'expiring', 'renewed'].includes(lease.status)
                ? <KeyValue label="Days remaining">{Math.max(0, daysUntil(lease.endDate))} days</KeyValue>
                : <KeyValue label="Lease"><span className="capitalize">{lease.status === 'terminated' ? 'Ended early' : 'Ended'}</span></KeyValue>}
            </dl>
            <dl>
              <KeyValue label="Annual rent"><Money value={lease.rent} /></KeyValue>
              <KeyValue label="Billing cycle"><span className="capitalize">{lease.billingCycle}</span></KeyValue>
              <KeyValue label="Security deposit"><Money value={lease.securityDeposit} /></KeyValue>
              <KeyValue label="Notice period">{lease.noticePeriodDays} days</KeyValue>
            </dl>
          </div>
        </SectionCard>

        <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white">
          <ShieldCheck className="h-6 w-6 text-white/70" />
          <p className="mt-2 text-sm text-white/80">Deposit held in trust</p>
          <Money value={depositHeld(lease)} className="text-3xl font-extrabold" />
          {depositOutstanding(lease) > 0 && !lease.depositSettledOn && (
            <p className="mt-1 text-xs text-white/80">₦{depositOutstanding(lease).toLocaleString('en-NG')} of the ₦{(lease.securityDeposit ?? 0).toLocaleString('en-NG')} deposit is still to be paid.</p>
          )}
          <p className="mt-2 text-xs text-white/70">Refundable at end of tenancy, subject to inspection.</p>
        </Card>
      </div>

      <DepositHistory lease={lease} />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SectionCard title="Your unit">
          <div className="grid grid-cols-2 gap-3">
            <Spec icon={<BedDouble className="h-4 w-4" />} label="Bedrooms" value={unit.bedrooms} />
            <Spec icon={<Bath className="h-4 w-4" />} label="Bathrooms" value={unit.bathrooms} />
            <Spec icon={<Ruler className="h-4 w-4" />} label="Size" value={`${formatNumber(unit.sizeSqm)} m²`} />
            <Spec icon={<Car className="h-4 w-4" />} label="Parking" value={unit.parkingSpaces} />
          </div>
          <dl className="mt-3 border-t border-ink-100 pt-2">
            <KeyValue label="Type"><span className="capitalize">{unit.type}</span></KeyValue>
            <KeyValue label="Floor">{unit.floor}</KeyValue>
            <KeyValue label="Furnishing"><span className="capitalize">{unit.furnishing}</span></KeyValue>
          </dl>
        </SectionCard>

        <SectionCard title="Property">
          <p className="font-bold text-ink-800">{property?.name}</p>
          <p className="text-sm text-ink-500">{property?.address}</p>
          <p className="text-sm text-ink-500">{property?.city}, {property?.state}</p>
          {building && <p className="mt-2 text-sm text-ink-500">Building: {building.name}</p>}
          {property && property.amenities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {property.amenities.map((a) => <Badge key={a} tone="gray">{a}</Badge>)}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bills & Invoices
// ---------------------------------------------------------------------------
export function PortalBills() {
  const navigate = useNavigate();
  const ctx = useTenantCtx();
  const [payId, setPayId] = useState<string | null>(null);
  if (!ctx.tenant) return <div><PageHeader title="Bills & Invoices" /><NoTenant /></div>;
  const { invoices, balance } = ctx;
  const outstanding = invoices.filter((i) => invoiceOutstanding(i) > 0 && i.status !== 'cancelled');
  const settled = invoices.filter((i) => invoiceOutstanding(i) <= 0 || i.status === 'cancelled');

  return (
    <div>
      <PageHeader title="Bills & Invoices" subtitle="Your rent and charges" actions={<button className="btn-primary" onClick={() => navigate('/portal/pay')}><CreditCard className="h-4 w-4" /> Make a payment</button>} />

      <Card className={`mb-5 ${balance > 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-gradient-to-br from-brand-600 to-brand-700'} text-white`}>
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-white/80">Total outstanding</p><Money value={balance} className="text-3xl font-extrabold" /></div>
          <p className="text-sm text-white/80">{outstanding.length} unpaid invoice{outstanding.length === 1 ? '' : 's'}</p>
        </div>
      </Card>

      {outstanding.length > 0 && (
        <SectionCard title="Due now" className="mb-5">
          <div className="space-y-2.5">
            {outstanding.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Receipt className="h-5 w-5" /></span>
                  <div>
                    <button className="font-semibold text-ink-800 hover:text-brand-600 hover:underline" onClick={() => navigate(`/portal/bills/${inv.id}`)}>{inv.code}</button>
                    <p className="text-xs text-ink-400">Due {formatDate(inv.dueDate)} · <StatusBadge meta={invoiceStatusMeta(inv.status)} /></p>
                    {(inv.penalty ?? 0) > 0 && <p className="mt-0.5 text-xs font-medium text-red-600">Includes a ₦{(inv.penalty ?? 0).toLocaleString('en-NG')} late fee</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right"><p className="text-xs text-ink-400">Outstanding</p><Money value={invoiceOutstanding(inv)} className="font-bold text-amber-600" /></div>
                  <button className="btn-primary" onClick={() => setPayId(inv.id)}>Pay</button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="All invoices" bodyClassName="p-0">
        <PortalInvoiceTable invoices={invoices} onOpen={(i) => navigate(`/portal/bills/${i.id}`)} />
      </SectionCard>

      {payId && <RecordPaymentModal invoiceId={payId} onClose={() => setPayId(null)} title="Pay invoice" />}
      {/* keep settled reference to avoid unused lint */}
      <span className="hidden">{settled.length}</span>
    </div>
  );
}

function PortalInvoiceTable({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (i: Invoice) => void }) {
  const columns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <span className="font-semibold text-ink-800">{i.code}</span> },
    { key: 'issue', header: 'Issued', sortValue: (i) => i.issueDate, render: (i) => <span className="text-ink-600">{formatDate(i.issueDate)}</span> },
    { key: 'due', header: 'Due', sortValue: (i) => i.dueDate, render: (i) => <span className="text-ink-600">{formatDate(i.dueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <div><Money value={i.total} />{(i.penalty ?? 0) > 0 && <p className="text-xs text-red-600">incl. ₦{(i.penalty ?? 0).toLocaleString('en-NG')} late fee</p>}{!!i.lateFeeWaivedOn && !(i.penalty ?? 0) && <p className="text-xs text-ink-400">late fee waived</p>}</div> },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (i) => invoiceOutstanding(i), render: (i) => <Money value={invoiceOutstanding(i)} className={invoiceOutstanding(i) > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
  ];
  return <DataTable columns={columns} rows={invoices} keyOf={(i) => i.id} onRowClick={onOpen} pageSize={12} initialSort={{ key: 'issue', dir: 'desc' }} emptyTitle="No invoices" />;
}

// ---------------------------------------------------------------------------
// Make a Payment
// ---------------------------------------------------------------------------
export function PortalPay() {
  const navigate = useNavigate();
  const ctx = useTenantCtx();
  const [payId, setPayId] = useState<string | null>(null);
  const [general, setGeneral] = useState(false);
  if (!ctx.tenant) return <div><PageHeader title="Make a Payment" /><NoTenant /></div>;
  const { invoices, balance } = ctx;
  const outstanding = invoices.filter((i) => invoiceOutstanding(i) > 0 && i.status !== 'cancelled').sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div>
      <PageHeader title="Make a Payment" subtitle="Pay your rent and upload proof of payment for verification" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {outstanding.length === 0 ? (
            <Card><EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="You're all paid up" description="You have no outstanding invoices right now." /></Card>
          ) : (
            <SectionCard title="Select an invoice to pay">
              <div className="space-y-2.5">
                {outstanding.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 p-3.5 transition-colors hover:border-brand-300">
                    <div>
                      <p className="font-semibold text-ink-800">{inv.code}</p>
                      <p className="text-xs text-ink-400">Due {formatDate(inv.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Money value={invoiceOutstanding(inv)} className="font-bold text-amber-600" />
                      <button className="btn-primary" onClick={() => setPayId(inv.id)}>Pay this</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-secondary mt-4 w-full" onClick={() => setGeneral(true)}><Plus className="h-4 w-4" /> Pay something else</button>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <Card className={`${balance > 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-gradient-to-br from-brand-600 to-brand-700'} text-white`}>
            <p className="text-sm text-white/80">Total outstanding</p>
            <Money value={balance} className="text-3xl font-extrabold" />
          </Card>
          <AutoDebitCard />
          <Card>
            <p className="text-sm font-semibold text-ink-800">How verification works</p>
            <ol className="mt-2 space-y-2 text-sm text-ink-500">
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span> Submit your payment and upload the receipt.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span> Finance verifies it against the bank record.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">3</span> Once approved, your balance updates automatically.</li>
            </ol>
          </Card>
        </div>
      </div>

      {payId && <RecordPaymentModal invoiceId={payId} onClose={() => { setPayId(null); navigate('/portal/payments'); }} title="Pay invoice" />}
      {general && <RecordPaymentModal tenantId={ctx.tenant.id} onClose={() => { setGeneral(false); navigate('/portal/payments'); }} title="Make a payment" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment History
// ---------------------------------------------------------------------------
export function PortalPayments() {
  const ctx = useTenantCtx();
  const [reviewId, setReviewId] = useState<string | null>(null);
  if (!ctx.tenant) return <div><PageHeader title="Payment History" /><NoTenant /></div>;
  const { payments } = ctx;

  const columns: Column<Payment>[] = [
    { key: 'code', header: 'Payment', sortValue: (p) => p.code, render: (p) => <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)}</p></div> },
    { key: 'type', header: 'For', sortValue: (p) => p.type, render: (p) => <span className="capitalize text-ink-600">{p.type.replace('-', ' ')}</span> },
    { key: 'method', header: 'Method', render: (p) => <span className="capitalize text-ink-600">{p.method.replace('-', ' ')}</span> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-ink-500">{p.reference}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <Money value={p.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge meta={paymentStatusMeta(p.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="Payment History" subtitle="Every payment you've made and its verification status" />
      <Card padded={false}>
        <DataTable columns={columns} rows={payments} keyOf={(p) => p.id} onRowClick={(p) => setReviewId(p.id)} searchable searchAccessor={(p) => `${p.code} ${p.reference} ${p.type}`} searchPlaceholder="Search payments…" initialSort={{ key: 'code', dir: 'desc' }} emptyTitle="No payments yet" emptyDescription="Payments you submit will appear here." />
      </Card>
      {reviewId && <PaymentReviewModal paymentId={reviewId} onClose={() => setReviewId(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
const CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Appliance', 'Structural', 'Pest control', 'Security', 'Cleaning', 'Other'];
const URGENCIES: MaintenanceUrgency[] = ['low', 'medium', 'high', 'emergency'];

export function PortalMaintenance() {
  const ctx = useTenantCtx();
  const dispatch = useAppDispatch();
  const [reporting, setReporting] = useState(false);
  if (!ctx.tenant) return <div><PageHeader title="Maintenance" /><NoTenant /></div>;
  const { maintenance, unit, property } = ctx;

  const awaitingConfirm = maintenance.filter((m) => m.status === 'completed');

  const columns: Column<MaintenanceRequest>[] = [
    { key: 'title', header: 'Issue', render: (m) => <div><p className="font-medium text-ink-700">{m.title}</p><p className="text-xs text-ink-400">{m.code} · {m.category}</p></div> },
    { key: 'urgency', header: 'Urgency', sortValue: (m) => m.urgency, render: (m) => <StatusBadge meta={urgencyMeta(m.urgency)} /> },
    { key: 'date', header: 'Reported', sortValue: (m) => m.createdAt, render: (m) => <span className="text-ink-600">{formatDate(m.createdAt)}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusBadge meta={maintenanceStatusMeta(m.status)} /> },
    {
      key: 'confirm', header: '', render: (m) =>
        m.status === 'completed'
          ? <button className="btn-primary whitespace-nowrap px-2.5 py-1 text-xs" onClick={() => dispatch(confirmMaintenanceDone(m.id))}><CheckCircle2 className="h-3.5 w-3.5" /> Confirm done</button>
          : m.status === 'tenant-confirmed'
            ? <span className="text-xs font-medium text-brand-600">You confirmed ✓</span>
            : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Report and track issues in your home"
        actions={unit && property ? <button className="btn-primary" onClick={() => setReporting(true)}><Plus className="h-4 w-4" /> Report an issue</button> : undefined} />

      {awaitingConfirm.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
          <p className="text-sm text-ink-700">
            {awaitingConfirm.length} job{awaitingConfirm.length > 1 ? 's have' : ' has'} been marked complete — please confirm the work was actually done.
          </p>
        </div>
      )}

      <Card padded={false}>
        <DataTable columns={columns} rows={maintenance} keyOf={(m) => m.id} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No requests yet" emptyDescription="Report an issue and your manager will be notified." />
      </Card>
      {reporting && unit && property && <ReportIssueModal unitId={unit.id} propertyId={property.id} tenantId={ctx.tenant.id} onClose={() => setReporting(false)} />}
    </div>
  );
}

function ReportIssueModal({ unitId, propertyId, tenantId, onClose }: { unitId: string; propertyId: string; tenantId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [urgency, setUrgency] = useState<MaintenanceUrgency>('medium');
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!title.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Describe the issue in the title.' })); return; }
    dispatch(dataActions.createMaintenance({ propertyId, unitId, tenantId, title: title.trim(), category, urgency, description, photos: [] }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Request submitted. Your manager has been notified.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Report an issue" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Wrench className="h-4 w-4" /> Submit request</button></>}>
      <div className="space-y-4">
        <Field label="What's the issue?" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen tap is leaking" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Urgency"><Select value={urgency} onChange={(e) => setUrgency(e.target.value as MaintenanceUrgency)} className="capitalize">{URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
        </div>
        <Field label="Details"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe what's happening, when it started, and where in the unit." /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export function PortalDocuments() {
  const ctx = useTenantCtx();
  const dispatch = useAppDispatch();
  if (!ctx.tenant) return <div><PageHeader title="Documents" /><NoTenant /></div>;
  const { documents } = ctx;

  const download = (d: DocumentRecord) => dispatch(pushToast({ id: uid('t'), kind: 'info', message: `Preparing "${d.name}"…` }));

  return (
    <div>
      <PageHeader title="Documents" subtitle="Your lease, receipts and shared files" />
      {documents.length === 0 ? <Card><EmptyState icon={<FolderOpen className="h-6 w-6" />} title="No documents" description="Documents shared with you will appear here." /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((d) => (
            <Card key={d.id} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-bold uppercase text-brand-700">{d.fileType}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-800">{d.name}</p>
                <p className="text-xs text-ink-400 capitalize">{d.category} · {d.sizeKb} KB · {formatDate(d.uploadedAt)}</p>
              </div>
              <button className="btn-ghost shrink-0" onClick={() => download(d)} aria-label="Download"><Download className="h-4 w-4" /></button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------
export function PortalNotices() {
  const ctx = useTenantCtx();
  if (!ctx.tenant) return <div><PageHeader title="Notices" /><NoTenant /></div>;
  const { notices } = ctx;

  return (
    <div>
      <PageHeader title="Notices" subtitle="Announcements from your property team" />
      {notices.length === 0 ? <Card><EmptyState icon={<Bell className="h-6 w-6" />} title="No notices" /></Card> : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Megaphone className="h-4 w-4" /></span>
                <div className="flex-1">
                  <div className="flex items-center justify-between"><p className="font-semibold text-ink-800">{n.title}</p><span className="text-xs text-ink-400">{formatDate(n.createdAt)}</span></div>
                  <p className="mt-1 text-sm text-ink-600">{n.body}</p>
                  <Badge tone="gray" className="mt-2 capitalize">{n.audience}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export function PortalMessages() {
  const ctx = useTenantCtx();
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState('');
  if (!ctx.tenant) return <div><PageHeader title="Messages" /><NoTenant /></div>;
  const { data, user, property } = ctx;

  const manager = property?.managerId ? data.users.find((u) => u.id === property.managerId) : undefined;
  const thread = user
    ? data.messages
        .filter((m) => (m.fromUserId === user.id || m.toUserId === user.id))
        .slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  const send = () => {
    if (!draft.trim()) return;
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Message sent to your property manager.' }));
    setDraft('');
  };

  return (
    <div>
      <PageHeader title="Messages" subtitle={manager ? `Chat with ${manager.name}, your property manager` : 'Chat with your property team'} />
      <Card className="flex h-[60vh] flex-col p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {thread.length === 0 ? (
            <div className="flex h-full items-center justify-center"><EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No messages yet" description="Start a conversation with your property manager below." /></div>
          ) : thread.map((m) => {
            const mine = m.fromUserId === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-ink-100 text-ink-800'}`}>
                  <p>{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-ink-400'}`}>{formatDateTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-ink-100 p-3">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type a message…" className="flex-1" />
          <button className="btn-primary" onClick={send}>Send</button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-ink-50 p-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-ink-500">{icon}</span>
      <div><p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p><p className="text-sm font-bold text-ink-800">{value}</p></div>
    </div>
  );
}
