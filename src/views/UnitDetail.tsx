'use client';

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  DoorClosed, ArrowLeft, Wallet, CalendarClock, FileText, User, Wrench, BedDouble,
  Bath, Ruler, Car, Plus, Pencil,
} from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, selectMemberships, unitContext, invoiceOutstanding } from '@/store/selectors';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatCard, Badge, StatusBadge, Money, KeyValue,
  EmptyState, DataTable, type Column, PhotoGallery,
} from '@/components/ui';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { EditUnitModal } from '@/components/StructureModals';
import { unitStatusMeta, invoiceStatusMeta, leaseStatusMeta, maintenanceStatusMeta, urgencyMeta } from '@/lib/status';
import { formatDate, formatNumber, daysUntil } from '@/lib/format';
import { can, isAdminRole } from '@/config/roles';
import type { Invoice, MaintenanceRequest } from '@/types';

export function UnitDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const memberships = useAppSelector(selectMemberships);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);

  const ctx = useMemo(() => unitContext(data, id), [data, id]);
  const maintenance = useMemo(
    () => data.maintenance.filter((m) => m.unitId === id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.maintenance, id],
  );

  if (!ctx) {
    return (
      <div>
        <PageHeader title="Unit not found" />
        <Card><EmptyState icon={<DoorClosed className="h-6 w-6" />} title="This unit doesn't exist" action={<button className="btn-primary" onClick={() => navigate('/units')}><ArrowLeft className="h-4 w-4" /> Back to units</button>} /></Card>
      </div>
    );
  }

  const { unit, property, building, lease, tenant, invoices, balance } = ctx;
  const roleHere = isAdminRole(user?.role)
    ? 'admin'
    : memberships.find((m) => m.propertyId === property?.id && m.status === 'active')?.role;
  const canEditUnit = roleHere === 'admin' || roleHere === 'owner' || roleHere === 'manager';
  const charges = [
    { label: 'Base rent', value: unit.rent },
    { label: 'Service charge', value: unit.serviceCharge },
    { label: 'Utility charge', value: unit.utilityCharge },
    { label: 'Other charges', value: unit.otherCharges },
  ].filter((c) => c.value > 0);
  const totalCharge = charges.reduce((s, c) => s + c.value, 0);
  const sortedInvoices = invoices.slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const leaseDaysLeft = lease ? daysUntil(lease.endDate) : 0;

  const invoiceColumns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <span className="font-semibold text-ink-800">{i.code}</span> },
    { key: 'issue', header: 'Issued', sortValue: (i) => i.issueDate, render: (i) => <span className="text-ink-600">{formatDate(i.issueDate)}</span> },
    { key: 'due', header: 'Due', sortValue: (i) => i.dueDate, render: (i) => <span className="text-ink-600">{formatDate(i.dueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <Money value={i.total} /> },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (i) => invoiceOutstanding(i), render: (i) => <Money value={invoiceOutstanding(i)} className={invoiceOutstanding(i) > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[
          { label: 'Properties', to: '/properties' },
          { label: property?.name ?? 'Property', to: property ? `/properties/${property.id}` : undefined },
          { label: building?.name ?? 'Building' },
          { label: `Unit ${unit.code}` },
        ]} />}
        title={<span className="flex items-center gap-2.5">Unit {unit.code}<StatusBadge meta={unitStatusMeta(unit.status)} /></span>}
        subtitle={`${unit.type} · ${building?.name ?? ''}`}
        actions={<>
          {canEditUnit && <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit unit</button>}
          {can(user?.role, 'manage_payments') && lease && <button className="btn-primary" onClick={() => setPaying(true)}><Plus className="h-4 w-4" /> Record payment</button>}
        </>}
      />

      <PhotoGallery photos={unit.photos} name={`Unit ${unit.code}`} className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rent / year" value={<Money value={unit.rent} compact />} icon={<Wallet className="h-5 w-5" />} tone="green" />
        <StatCard label="Outstanding" value={<Money value={balance} compact />} icon={<Wallet className="h-5 w-5" />} tone={balance > 0 ? 'amber' : 'gray'} />
        <StatCard label="Lease ends" value={lease ? formatDate(lease.endDate) : '—'} icon={<CalendarClock className="h-5 w-5" />} tone={lease && leaseDaysLeft < 60 ? 'red' : 'blue'} hint={lease ? `${leaseDaysLeft}d left` : 'Vacant'} />
        <StatCard label="Open jobs" value={maintenance.filter((m) => !['verified', 'closed'].includes(m.status)).length} icon={<Wrench className="h-5 w-5" />} tone="cyan" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Invoices" subtitle={`${sortedInvoices.length} invoices on this unit`} bodyClassName="p-0">
            <DataTable columns={invoiceColumns} rows={sortedInvoices} keyOf={(i) => i.id} onRowClick={(i) => navigate(`/invoices/${i.id}`)} pageSize={8} initialSort={{ key: 'issue', dir: 'desc' }} emptyTitle="No invoices yet" />
          </SectionCard>

          <SectionCard title="Maintenance history" bodyClassName="p-0">
            <MaintTable requests={maintenance} onOpen={(m) => navigate(`/maintenance/${m.id}`)} />
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Current occupancy">
            {tenant && lease ? (
              <div className="space-y-3">
                <button onClick={() => navigate(`/tenants/${tenant.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-ink-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white" style={{ background: tenant.avatarColor }}>{tenant.name.charAt(0)}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink-800">{tenant.name}</p><p className="text-xs text-ink-500">{tenant.phone}</p></div>
                  <User className="h-4 w-4 text-ink-300" />
                </button>
                <button onClick={() => navigate(`/leases/${lease.id}`)} className="flex w-full items-center justify-between rounded-lg border border-ink-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-ink-400" /><div><p className="text-sm font-semibold text-ink-800">{lease.code}</p><p className="text-xs text-ink-500">{formatDate(lease.startDate)} – {formatDate(lease.endDate)}</p></div></div>
                  <StatusBadge meta={leaseStatusMeta(lease.status)} />
                </button>
              </div>
            ) : (
              <EmptyState title="Vacant unit" description="No active lease on this unit." />
            )}
          </SectionCard>

          <SectionCard title="Specifications">
            <div className="grid grid-cols-2 gap-3">
              <Spec icon={<BedDouble className="h-4 w-4" />} label="Bedrooms" value={unit.bedrooms} />
              <Spec icon={<Bath className="h-4 w-4" />} label="Bathrooms" value={unit.bathrooms} />
              <Spec icon={<Ruler className="h-4 w-4" />} label="Size" value={`${formatNumber(unit.sizeSqm)} m²`} />
              <Spec icon={<Car className="h-4 w-4" />} label="Parking" value={unit.parkingSpaces} />
            </div>
            <dl className="mt-3 border-t border-ink-100 pt-2">
              <KeyValue label="Floor">{unit.floor}</KeyValue>
              <KeyValue label="Furnishing"><span className="capitalize">{unit.furnishing}</span></KeyValue>
            </dl>
          </SectionCard>

          <SectionCard title="Recurring charges">
            <div className="space-y-2 text-sm">
              {charges.map((c) => (
                <div key={c.label} className="flex items-center justify-between"><span className="text-ink-600">{c.label}</span><Money value={c.value} className="font-medium text-ink-800" /></div>
              ))}
              <div className="flex items-center justify-between border-t border-ink-100 pt-2"><span className="font-semibold text-ink-700">Total / year</span><Money value={totalCharge} className="font-bold text-brand-700" /></div>
              <div className="flex items-center justify-between text-xs text-ink-400"><span>Security deposit</span><Money value={unit.securityDeposit} /></div>
            </div>
          </SectionCard>
        </div>
      </div>

      {paying && lease && <RecordPaymentModal tenantId={tenant?.id} onClose={() => setPaying(false)} title={`Record payment · Unit ${unit.code}`} />}
      {editing && <EditUnitModal unit={unit} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-ink-50 p-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-ink-500">{icon}</span>
      <div><p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p><p className="text-sm font-bold text-ink-800">{value}</p></div>
    </div>
  );
}

function MaintTable({ requests, onOpen }: { requests: MaintenanceRequest[]; onOpen: (m: MaintenanceRequest) => void }) {
  const columns: Column<MaintenanceRequest>[] = [
    { key: 'title', header: 'Issue', render: (m) => <div><p className="font-medium text-ink-700">{m.title}</p><p className="text-xs text-ink-400">{m.code} · {m.category}</p></div> },
    { key: 'urgency', header: 'Urgency', sortValue: (m) => m.urgency, render: (m) => <StatusBadge meta={urgencyMeta(m.urgency)} /> },
    { key: 'date', header: 'Reported', sortValue: (m) => m.createdAt, render: (m) => <span className="text-ink-600">{formatDate(m.createdAt)}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusBadge meta={maintenanceStatusMeta(m.status)} /> },
  ];
  return <DataTable columns={columns} rows={requests} keyOf={(m) => m.id} onRowClick={onOpen} pageSize={5} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No maintenance history" />;
}
