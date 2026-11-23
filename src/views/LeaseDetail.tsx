'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  FileText, ArrowLeft, Plus, RefreshCw, Ban, UserRound, Building2, CalendarClock, ShieldCheck, Coins,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, invoiceOutstanding } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatCard, StatusBadge, Money, KeyValue, Avatar, Badge,
  EmptyState, DataTable, type Column, Modal, Field, Input,
} from '@/components/ui';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { DepositCard } from '@/components/DepositCard';
import { TerminateLeaseModal } from '@/components/TerminateLeaseModal';
import { depositHeld } from '@/lib/deposit';
import { leaseEndedOn } from '@/lib/usage';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { leaseStatusMeta, invoiceStatusMeta, paymentStatusMeta } from '@/lib/status';
import { formatDate, addMonths, daysUntil, today, uid } from '@/lib/format';
import { can } from '@/config/roles';
import type { Invoice, Payment } from '@/types';

export function LeaseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [paying, setPaying] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const lease = data.leases.find((l) => l.id === id);

  const ctx = useMemo(() => {
    if (!lease) return null;
    const tenant = data.tenants.find((t) => t.id === lease.tenantId);
    const unit = data.units.find((u) => u.id === lease.unitId);
    const property = data.properties.find((p) => p.id === lease.propertyId);
    const building = unit ? data.buildings.find((b) => b.id === unit.buildingId) : undefined;
    const invoices = data.invoices.filter((i) => i.leaseId === lease.id).slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const payments = data.payments.filter((p) => p.leaseId === lease.id).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const balance = invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + invoiceOutstanding(i), 0);
    return { tenant, unit, property, building, invoices, payments, balance };
  }, [data, lease]);

  if (!lease || !ctx) {
    return (
      <div>
        <PageHeader title="Lease not found" />
        <Card><EmptyState icon={<FileText className="h-6 w-6" />} title="This lease doesn't exist" action={<button className="btn-primary" onClick={() => navigate('/leases')}><ArrowLeft className="h-4 w-4" /> Back to leases</button>} /></Card>
      </div>
    );
  }

  const { tenant, unit, property, building, invoices, payments, balance } = ctx;
  const isActive = ['active', 'expiring', 'renewed'].includes(lease.status);
  const daysLeft = daysUntil(lease.endDate);
  // When the tenancy actually ended: for a terminated lease that is the day it was terminated, not the contract's end date.
  const endedOn = lease.status === 'terminated' || lease.status === 'expired' ? leaseEndedOn(lease, today()) : null;
  const manage = can(user?.role, 'create');

  const invoiceColumns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <span className="font-semibold text-ink-800">{i.code}</span> },
    { key: 'issue', header: 'Issued', sortValue: (i) => i.issueDate, render: (i) => <span className="text-ink-600">{formatDate(i.issueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <Money value={i.total} /> },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (i) => invoiceOutstanding(i), render: (i) => <Money value={invoiceOutstanding(i)} className={invoiceOutstanding(i) > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
  ];
  const paymentColumns: Column<Payment>[] = [
    { key: 'code', header: 'Payment', sortValue: (p) => p.code, render: (p) => <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)}</p></div> },
    { key: 'method', header: 'Method', render: (p) => <span className="capitalize text-ink-600">{p.method.replace('-', ' ')}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <Money value={p.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge meta={paymentStatusMeta(p.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[
          { label: 'Leases', to: '/leases' },
          { label: property?.name ?? 'Property', to: property ? `/properties/${property.id}` : undefined },
          { label: `Unit ${unit?.code ?? ''}`, to: unit ? `/units/${unit.id}` : undefined },
          { label: lease.code },
        ]} />}
        title={<span className="flex items-center gap-2.5">{lease.code}<StatusBadge meta={leaseStatusMeta(lease.status)} /></span>}
        subtitle={`${tenant?.name ?? '—'} · Unit ${unit?.code ?? ''}`}
        actions={<>
          {can(user?.role, 'manage_payments') && isActive && <button className="btn-secondary" onClick={() => setPaying(true)}><Plus className="h-4 w-4" /> Payment</button>}
          {manage && lease.status !== 'terminated' && <button className="btn-secondary" onClick={() => setRenewing(true)}><RefreshCw className="h-4 w-4" /> Renew</button>}
          {manage && isActive && <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={() => setTerminating(true)}><Ban className="h-4 w-4" /> Terminate</button>}
        </>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Annual rent" value={<Money value={lease.rent} compact />} icon={<Coins className="h-5 w-5" />} tone="green" />
        <StatCard label="Outstanding" value={<Money value={balance} compact />} icon={<Coins className="h-5 w-5" />} tone={balance > 0 ? 'amber' : 'gray'} />
        <StatCard label={isActive ? 'Ends in' : 'Ended'} value={isActive ? `${Math.max(0, daysLeft)}d` : formatDate(endedOn ?? lease.endDate)} icon={<CalendarClock className="h-5 w-5" />} tone={isActive && daysLeft < 60 ? 'red' : 'blue'}
          hint={isActive ? formatDate(lease.endDate) : endedOn && endedOn !== lease.endDate ? `Ended early · contract ran to ${formatDate(lease.endDate)}` : undefined} />
        <StatCard label="Deposit held" value={<Money value={depositHeld(lease)} compact />} hint={`of ₦${(lease.securityDeposit ?? 0).toLocaleString('en-NG')} required`} icon={<ShieldCheck className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Invoices" subtitle={`${invoices.length} invoices under this lease`} bodyClassName="p-0">
            <DataTable columns={invoiceColumns} rows={invoices} keyOf={(i) => i.id} onRowClick={(i) => navigate(`/invoices/${i.id}`)} pageSize={8} initialSort={{ key: 'issue', dir: 'desc' }} emptyTitle="No invoices" />
          </SectionCard>
          <SectionCard title="Payments" subtitle={`${payments.length} payments recorded`} bodyClassName="p-0">
            <DataTable columns={paymentColumns} rows={payments} keyOf={(p) => p.id} onRowClick={(p) => setReviewId(p.id)} pageSize={8} initialSort={{ key: 'code', dir: 'desc' }} emptyTitle="No payments" />
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Lease terms">
            <dl>
              <KeyValue label="Start date">{formatDate(lease.startDate)}</KeyValue>
              <KeyValue label="End date">{formatDate(lease.endDate)}</KeyValue>
              {lease.status === 'terminated' && endedOn && <KeyValue label="Terminated on">{formatDate(endedOn)}</KeyValue>}
              <KeyValue label="Billing cycle"><span className="capitalize">{lease.billingCycle}</span></KeyValue>
              <KeyValue label="Notice period">{lease.noticePeriodDays} days</KeyValue>
              <KeyValue label="Agreement">{lease.signed ? <Badge tone="green" dot>Signed</Badge> : <Badge tone="amber" dot>Unsigned</Badge>}</KeyValue>
            </dl>
            {lease.notes && <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-500">{lease.notes}</p>}
          </SectionCard>

          <DepositCard lease={lease} />

          <SectionCard title="Parties">
            <div className="space-y-2">
              {tenant && <LinkRow label={tenant.name} sub="Tenant" onClick={() => navigate(`/tenants/${tenant.id}`)} avatar={tenant.avatarColor} />}
              {unit && <LinkRow icon={<Building2 className="h-4 w-4" />} label={`Unit ${unit.code}`} sub={`${property?.name ?? ''}${building ? ' · ' + building.name : ''}`} onClick={() => navigate(`/units/${unit.id}`)} />}
            </div>
          </SectionCard>
        </div>
      </div>

      {paying && <RecordPaymentModal tenantId={tenant?.id} onClose={() => setPaying(false)} title={`Record payment · ${lease.code}`} />}
      {reviewId && <PaymentReviewModal paymentId={reviewId} onClose={() => setReviewId(null)} />}
      {renewing && <RenewLeaseModal currentEnd={lease.endDate} onClose={() => setRenewing(false)} onConfirm={(newEnd) => {
        dispatch(dataActions.renewLease({ leaseId: lease.id, actorId: user!.id, newEndDate: newEnd }));
        dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${lease.code} renewed to ${formatDate(newEnd)}.` }));
        setRenewing(false);
      }} />}
      {terminating && <TerminateLeaseModal lease={lease} unitCode={unit?.code} tenantName={tenant?.name} onClose={() => setTerminating(false)} />}
    </div>
  );
}

function RenewLeaseModal({ currentEnd, onClose, onConfirm }: { currentEnd: string; onClose: () => void; onConfirm: (newEnd: string) => void }) {
  const [newEnd, setNewEnd] = useState(addMonths(currentEnd, 12).slice(0, 10));
  return (
    <Modal open onClose={onClose} title="Renew lease" size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onConfirm(newEnd)}><RefreshCw className="h-4 w-4" /> Renew</button></>}>
      <p className="mb-3 text-sm text-ink-500">Current end date is {formatDate(currentEnd)}. Set the new end date for the renewed term.</p>
      <Field label="New end date"><Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></Field>
    </Modal>
  );
}

function LinkRow({ icon, label, sub, onClick, avatar }: { icon?: React.ReactNode; label: string; sub?: string; onClick: () => void; avatar?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-ink-200 p-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
      {avatar ? <Avatar name={label} color={avatar} size={32} /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500">{icon}</span>}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-800">{label}</p>{sub && <p className="truncate text-xs text-ink-400">{sub}</p>}</div>
    </button>
  );
}
