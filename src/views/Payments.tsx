'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/lib/router';
import { Wallet, Clock, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, scopedPropertyIds } from '@/store/selectors';
import {
  PageHeader, Card, StatCard, StatusBadge, Money, Badge, Chip, Avatar, DataTable, type Column, ExportMenu,
} from '@/components/ui';
import { PaymentReviewModal } from '@/components/PaymentReviewModal';
import { paymentStatusMeta } from '@/lib/status';
import { formatDate, classNames } from '@/lib/format';
import type { Payment, PaymentStatus } from '@/types';

const STATUS_FILTERS: { key: PaymentStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending-verification', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'refunded', label: 'Refunded' },
];

export function Payments() {
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(
    () => data.payments.filter((p) => scoped.has(p.propertyId)).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [data.payments, scoped],
  );
  const rows = useMemo(() => (status === 'all' ? all : all.filter((p) => p.status === status)), [all, status]);

  const pending = all.filter((p) => p.status === 'pending-verification');
  const pendingAmount = pending.reduce((s, p) => s + p.amount, 0);
  const approvedAmount = all.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0);
  const rejected = all.filter((p) => p.status === 'rejected').length;

  const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? '—';
  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';

  const exportRows = rows.map((p) => ({
    Payment: p.code, Date: p.paymentDate, Tenant: tenantName(p.tenantId), Unit: unitCode(p.unitId),
    Type: p.type, Method: p.method, Amount: p.amount, Reference: p.reference, Status: p.status,
  }));

  const columns: Column<Payment>[] = [
    { key: 'code', header: 'Payment', sortValue: (p) => p.code, render: (p) => (
      <div><p className="font-semibold text-ink-800">{p.code}</p><p className="text-xs text-ink-400">{formatDate(p.paymentDate)}</p></div>
    ) },
    { key: 'tenant', header: 'Tenant', sortValue: (p) => tenantName(p.tenantId), render: (p) => {
      const t = data.tenants.find((x) => x.id === p.tenantId);
      return <div className="flex items-center gap-2"><Avatar name={t?.name ?? '?'} color={t?.avatarColor} size={28} /><div><p className="text-sm font-medium text-ink-700">{t?.name ?? '—'}</p><p className="text-xs text-ink-400">Unit {unitCode(p.unitId)}</p></div></div>;
    } },
    { key: 'type', header: 'For', sortValue: (p) => p.type, render: (p) => <span className="capitalize text-ink-600">{p.type.replace('-', ' ')}</span> },
    { key: 'method', header: 'Method', sortValue: (p) => p.method, render: (p) => <Badge tone="gray" className="capitalize">{p.method.replace('-', ' ')}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <Money value={p.amount} className="font-semibold" /> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge meta={paymentStatusMeta(p.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Every payment submitted across your portfolio"
        actions={<ExportMenu filename="payments" title="Payments" rows={exportRows} size="md" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Awaiting verification" value={pending.length} icon={<Clock className="h-5 w-5" />} tone="amber" hint="Needs review" onClick={pending.length ? () => setStatus('pending-verification') : undefined} />
        <StatCard label="Pending amount" value={<Money value={pendingAmount} compact />} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <StatCard label="Approved (total)" value={<Money value={approvedAmount} compact />} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Rejected" value={rejected} icon={<XCircle className="h-5 w-5" />} tone={rejected ? 'red' : 'gray'} />
      </div>

      {pending.length > 0 && (
        <Card className="mb-5 flex items-center justify-between gap-4 border-l-4 !border-l-amber-400 bg-amber-50/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold text-ink-800">{pending.length} payment{pending.length > 1 ? 's' : ''} waiting for verification</p>
              <p className="text-sm text-ink-500">Review receipts and approve to update tenant balances.</p>
            </div>
          </div>
          <Link to="/payments/verification" className="btn-primary whitespace-nowrap">Open verification queue</Link>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}
            {f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((p) => p.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(p) => p.id}
          onRowClick={(p) => setOpenId(p.id)}
          searchable
          searchAccessor={(p) => `${p.code} ${tenantName(p.tenantId)} ${p.reference} ${p.method}`}
          searchPlaceholder="Search by code, tenant, reference…"
          initialSort={{ key: 'code', dir: 'desc' }}
          pageSize={12}
        />
      </Card>

      {openId && <PaymentReviewModal paymentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
