'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  UserRound, ArrowLeft, Wallet, FileText, Receipt, Wrench, Phone, Mail, Shield, Plus, CreditCard,
} from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, tenantLedger, invoiceOutstanding } from '@/store/selectors';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatCard, Badge, StatusBadge, Money, KeyValue, Avatar,
  EmptyState, DataTable, type Column, Tabs, ExportMenu,
} from '@/components/ui';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { leaseStatusMeta, invoiceStatusMeta, paymentStatusMeta, maintenanceStatusMeta } from '@/lib/status';
import { formatDate, classNames } from '@/lib/format';
import { can } from '@/config/roles';
import type { Invoice, Payment, MaintenanceRequest } from '@/types';
import type { LedgerRow as Ledger } from '@/store/selectors';

export function TenantDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [tab, setTab] = useState('ledger');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const tenant = data.tenants.find((t) => t.id === id);

  const derived = useMemo(() => {
    if (!tenant) return null;
    const leases = data.leases.filter((l) => l.tenantId === id).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    const activeLease = leases.find((l) => ['active', 'expiring', 'renewed'].includes(l.status));
    const unit = activeLease ? data.units.find((u) => u.id === activeLease.unitId) : undefined;
    const property = activeLease ? data.properties.find((p) => p.id === activeLease.propertyId) : undefined;
    const invoices = data.invoices.filter((i) => i.tenantId === id).slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const payments = data.payments.filter((p) => p.tenantId === id).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const maintenance = data.maintenance.filter((m) => m.tenantId === id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const ledger = tenantLedger(data, id);
    const balance = invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + invoiceOutstanding(i), 0);
    return { leases, activeLease, unit, property, invoices, payments, maintenance, ledger, balance };
  }, [data, id, tenant]);

  if (!tenant || !derived) {
    return (
      <div>
        <PageHeader title="Tenant not found" />
        <Card><EmptyState icon={<UserRound className="h-6 w-6" />} title="This tenant doesn't exist" action={<button className="btn-primary" onClick={() => navigate('/tenants')}><ArrowLeft className="h-4 w-4" /> Back to tenants</button>} /></Card>
      </div>
    );
  }

  const { leases, activeLease, unit, property, invoices, payments, maintenance, ledger, balance } = derived;
  const pendingPayments = payments.filter((p) => p.status === 'pending-verification').length;

  const tabs = [
    { key: 'ledger', label: 'Ledger', count: ledger.length },
    { key: 'invoices', label: 'Invoices', count: invoices.length },
    { key: 'payments', label: 'Payments', count: payments.length },
    { key: 'leases', label: 'Leases', count: leases.length },
    { key: 'maintenance', label: 'Maintenance', count: maintenance.length },
    { key: 'profile', label: 'Profile' },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Tenants', to: '/tenants' }, { label: tenant.name }]} />}
        title={<span className="flex items-center gap-3"><Avatar name={tenant.name} color={tenant.avatarColor} size={40} />{tenant.name}</span>}
        subtitle={activeLease && unit ? `Unit ${unit.code} · ${property?.name}` : 'No active lease'}
        actions={can(user?.role, 'manage_payments') ? <button className="btn-primary" onClick={() => setPaying(true)}><Plus className="h-4 w-4" /> Record payment</button> : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Balance" value={<Money value={balance} compact />} icon={<Wallet className="h-5 w-5" />} tone={balance > 0 ? 'red' : 'green'} />
        <StatCard label="Lease" value={activeLease ? leaseStatusMeta(activeLease.status).label : 'None'} icon={<FileText className="h-5 w-5" />} tone={activeLease ? 'green' : 'gray'} />
        <StatCard label="Invoices" value={invoices.length} icon={<Receipt className="h-5 w-5" />} tone="blue" />
        <StatCard label="Pending payments" value={pendingPayments} icon={<CreditCard className="h-5 w-5" />} tone={pendingPayments ? 'amber' : 'gray'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'ledger' && (
        <SectionCard title="Payment ledger" subtitle="Running balance across all invoices"
          action={<ExportMenu filename={`ledger-${tenant.name}`} title="Ledger" rows={ledger.map((l) => ({ Date: l.date, Invoice: l.invoiceCode, Amount: l.amount, Method: l.method, Reference: l.reference, Status: l.status, Balance: l.balanceAfter }))} />}
          bodyClassName="p-0">
          <LedgerTable ledger={ledger} onOpen={(pid) => setReviewId(pid)} />
        </SectionCard>
      )}

      {tab === 'invoices' && (
        <Card padded={false}><InvoiceTable invoices={invoices} onOpen={(i) => navigate(`/invoices/${i.id}`)} /></Card>
      )}

      {tab === 'payments' && (
        <Card padded={false}><PaymentTable payments={payments} unitCode={(uid) => data.units.find((u) => u.id === uid)?.code ?? '—'} onOpen={(p) => setReviewId(p.id)} /></Card>
      )}

      {tab === 'leases' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {leases.length === 0 ? <Card className="sm:col-span-2"><EmptyState title="No leases" /></Card> : leases.map((l) => {
            const u = data.units.find((x) => x.id === l.unitId);
            return (
              <button key={l.id} onClick={() => navigate(`/leases/${l.id}`)} className="card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                <div className="flex items-center justify-between"><span className="font-bold text-ink-800">{l.code}</span><StatusBadge meta={leaseStatusMeta(l.status)} /></div>
                <p className="mt-1 text-sm text-ink-500">Unit {u?.code} · {formatDate(l.startDate)} – {formatDate(l.endDate)}</p>
                <div className="mt-2 flex items-center justify-between text-sm"><span className="text-ink-500">Annual rent</span><Money value={l.rent} className="font-semibold text-ink-800" /></div>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'maintenance' && (
        <Card padded={false}><MaintenanceTable requests={maintenance} unitCode={(uid) => data.units.find((u) => u.id === uid)?.code ?? '—'} onOpen={(m) => navigate(`/maintenance/${m.id}`)} /></Card>
      )}

      {tab === 'profile' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Contact">
            <dl className="grid grid-cols-2 gap-x-4">
              <KeyValue label="Email"><span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-400" />{tenant.email}</span></KeyValue>
              <KeyValue label="Phone"><span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-400" />{tenant.phone}</span></KeyValue>
              <KeyValue label="ID type">{tenant.identityType}</KeyValue>
              <KeyValue label="ID number">{tenant.identityNumber}</KeyValue>
            </dl>
          </SectionCard>
          <SectionCard title="Emergency & guarantor">
            <dl className="grid grid-cols-2 gap-x-4">
              <KeyValue label="Emergency contact">{tenant.emergencyContactName || '—'}</KeyValue>
              <KeyValue label="Emergency phone">{tenant.emergencyContactPhone || '—'}</KeyValue>
              <KeyValue label="Guarantor"><span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-ink-400" />{tenant.guarantorName || '—'}</span></KeyValue>
              <KeyValue label="Guarantor phone">{tenant.guarantorPhone || '—'}</KeyValue>
            </dl>
          </SectionCard>
        </div>
      )}

      {reviewId && <PaymentReviewModal paymentId={reviewId} onClose={() => setReviewId(null)} />}
      {paying && <RecordPaymentModal tenantId={tenant.id} onClose={() => setPaying(false)} title={`Record payment · ${tenant.name}`} />}
    </div>
  );
}

function LedgerTable({ ledger, onOpen }: { ledger: Ledger[]; onOpen: (paymentId: string) => void }) {
  const columns: Column<Ledger>[] = [
    { key: 'date', header: 'Date', sortValue: (l) => l.date, render: (l) => <span className="text-ink-600">{formatDate(l.date)}</span> },
    { key: 'inv', header: 'Invoice', render: (l) => <span className="font-medium text-ink-700">{l.invoiceCode}</span> },
    { key: 'method', header: 'Method', render: (l) => <span className="capitalize text-ink-500">{l.method.replace('-', ' ')}</span> },
    { key: 'ref', header: 'Reference', render: (l) => <span className="font-mono text-xs text-ink-500">{l.reference}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (l) => l.amount, render: (l) => <Money value={l.amount} className={classNames('font-semibold', l.status === 'approved' ? 'text-brand-700' : 'text-ink-400')} /> },
    { key: 'status', header: 'Status', render: (l) => <StatusBadge meta={paymentStatusMeta(l.status as Payment['status'])} /> },
    { key: 'bal', header: 'Balance', align: 'right', sortValue: (l) => l.balanceAfter, render: (l) => <Money value={l.balanceAfter} className="font-bold" /> },
  ];
  return <DataTable columns={columns} rows={ledger} keyOf={(l) => l.paymentId} onRowClick={(l) => onOpen(l.paymentId)} pageSize={10} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No payments recorded" />;
}

function InvoiceTable({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (i: Invoice) => void }) {
  const columns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <span className="font-semibold text-ink-800">{i.code}</span> },
    { key: 'issue', header: 'Issued', sortValue: (i) => i.issueDate, render: (i) => <span className="text-ink-600">{formatDate(i.issueDate)}</span> },
    { key: 'due', header: 'Due', sortValue: (i) => i.dueDate, render: (i) => <span className="text-ink-600">{formatDate(i.dueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <Money value={i.total} /> },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (i) => invoiceOutstanding(i), render: (i) => <Money value={invoiceOutstanding(i)} className={invoiceOutstanding(i) > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
  ];
  return <DataTable columns={columns} rows={invoices} keyOf={(i) => i.id} onRowClick={onOpen} pageSize={10} initialSort={{ key: 'issue', dir: 'desc' }} emptyTitle="No invoices" />;
}

function PaymentTable({ payments, unitCode, onOpen }: { payments: Payment[]; unitCode: (id: string) => string; onOpen: (p: Payment) => void }) {
  const columns: Column<Payment>[] = [
    { key: 'code', header: 'Payment', sortValue: (p) => p.code, render: (p) => <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)}</p></div> },
    { key: 'method', header: 'Method', render: (p) => <span className="capitalize text-ink-600">{p.method.replace('-', ' ')}</span> },
    { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs text-ink-500">{p.reference}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <Money value={p.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge meta={paymentStatusMeta(p.status)} /> },
  ];
  return <DataTable columns={columns} rows={payments} keyOf={(p) => p.id} onRowClick={onOpen} pageSize={10} initialSort={{ key: 'code', dir: 'desc' }} emptyTitle="No payments" />;
}

function MaintenanceTable({ requests, unitCode, onOpen }: { requests: MaintenanceRequest[]; unitCode: (id: string) => string; onOpen: (m: MaintenanceRequest) => void }) {
  const columns: Column<MaintenanceRequest>[] = [
    { key: 'title', header: 'Issue', render: (m) => <div><p className="font-medium text-ink-700">{m.title}</p><p className="text-xs text-ink-400">{m.code} · Unit {unitCode(m.unitId)}</p></div> },
    { key: 'date', header: 'Reported', sortValue: (m) => m.createdAt, render: (m) => <span className="text-ink-600">{formatDate(m.createdAt)}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusBadge meta={maintenanceStatusMeta(m.status)} /> },
  ];
  return <DataTable columns={columns} rows={requests} keyOf={(m) => m.id} onRowClick={onOpen} pageSize={10} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No maintenance requests" />;
}
