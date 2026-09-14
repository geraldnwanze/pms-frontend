'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { FileText, Plus, CalendarClock, Coins, CheckCircle2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds, currentLeaseForUnit } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, StatusBadge, Money, Avatar, Chip, DataTable, type Column, ExportMenu,
  Modal, Field, Input, Select,
} from '@/components/ui';
import { leaseStatusMeta } from '@/lib/status';
import { can } from '@/config/roles';
import { formatDate, TODAY, addMonths, daysUntil, uid, classNames } from '@/lib/format';
import type { Lease, LeaseStatus, BillingCycle } from '@/types';

const STATUS_FILTERS: { key: LeaseStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'renewed', label: 'Renewed' },
  { key: 'expired', label: 'Expired' },
  { key: 'terminated', label: 'Terminated' },
];

export function Leases() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [status, setStatus] = useState<LeaseStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const all = useMemo(
    () => data.leases.filter((l) => scoped.has(l.propertyId)).slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.leases, scoped],
  );
  const rows = status === 'all' ? all : all.filter((l) => l.status === status);

  const activeLeases = all.filter((l) => ['active', 'expiring', 'renewed'].includes(l.status));
  const expiring = all.filter((l) => l.status === 'expiring').length;
  const rentRoll = activeLeases.reduce((s, l) => s + l.rent, 0);

  const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? '—';
  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';

  const exportRows = rows.map((l) => ({
    Lease: l.code, Tenant: tenantName(l.tenantId), Unit: unitCode(l.unitId),
    Start: l.startDate, End: l.endDate, Rent: l.rent, Cycle: l.billingCycle, Status: l.status,
  }));

  const columns: Column<Lease>[] = [
    { key: 'code', header: 'Lease', sortValue: (l) => l.code, render: (l) => <span className="font-semibold text-ink-800">{l.code}</span> },
    { key: 'tenant', header: 'Tenant', sortValue: (l) => tenantName(l.tenantId), render: (l) => {
      const t = data.tenants.find((x) => x.id === l.tenantId);
      return <div className="flex items-center gap-2"><Avatar name={t?.name ?? '?'} color={t?.avatarColor} size={28} /><div><p className="text-sm font-medium text-ink-700">{t?.name ?? '—'}</p><p className="text-xs text-ink-400">Unit {unitCode(l.unitId)}</p></div></div>;
    } },
    { key: 'term', header: 'Term', sortValue: (l) => l.endDate, render: (l) => <div><p className="text-ink-600">{formatDate(l.startDate)} – {formatDate(l.endDate)}</p>{['active', 'expiring', 'renewed'].includes(l.status) && <p className="text-xs text-ink-400">{Math.max(0, daysUntil(l.endDate))}d left</p>}</div> },
    { key: 'rent', header: 'Rent / yr', align: 'right', sortValue: (l) => l.rent, render: (l) => <Money value={l.rent} /> },
    { key: 'cycle', header: 'Cycle', render: (l) => <span className="capitalize text-ink-500">{l.billingCycle}</span> },
    { key: 'status', header: 'Status', sortValue: (l) => l.status, render: (l) => <StatusBadge meta={leaseStatusMeta(l.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Leases"
        subtitle="Tenancy agreements across your portfolio"
        actions={<>
          <ExportMenu filename="leases" title="Leases" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New lease</button>}
        </>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total leases" value={all.length} icon={<FileText className="h-5 w-5" />} tone="blue" />
        <StatCard label="Active" value={activeLeases.length} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Expiring soon" value={expiring} icon={<CalendarClock className="h-5 w-5" />} tone={expiring ? 'amber' : 'gray'} onClick={expiring ? () => setStatus('expiring') : undefined} />
        <StatCard label="Annual rent roll" value={<Money value={rentRoll} compact />} icon={<Coins className="h-5 w-5" />} tone="green" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}
            {f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((l) => l.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(l) => l.id}
          onRowClick={(l) => navigate(`/leases/${l.id}`)}
          searchable
          searchAccessor={(l) => `${l.code} ${tenantName(l.tenantId)} ${unitCode(l.unitId)}`}
          searchPlaceholder="Search leases…"
          initialSort={{ key: 'term', dir: 'desc' }}
        />
      </Card>

      {creating && <CreateLeaseModal onClose={() => setCreating(false)} />}
    </div>
  );
}

const CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'half-yearly', 'annual', 'custom'];

function CreateLeaseModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);

  // Units in scope without an active lease
  const availableUnits = useMemo(
    () => data.units.filter((u) => scoped.has(u.propertyId) && !currentLeaseForUnit(data, u.id)),
    [data, scoped],
  );
  const [unitId, setUnitId] = useState(availableUnits[0]?.id ?? '');
  const unit = data.units.find((u) => u.id === unitId);
  const property = unit ? data.properties.find((p) => p.id === unit.propertyId) : undefined;

  // Tenants not currently on an active lease
  const freeTenants = useMemo(() => {
    const busy = new Set(data.leases.filter((l) => ['active', 'expiring', 'renewed'].includes(l.status)).map((l) => l.tenantId));
    return data.tenants.filter((t) => !busy.has(t.id));
  }, [data.leases, data.tenants]);

  const [tenantId, setTenantId] = useState(freeTenants[0]?.id ?? '');
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState(addMonths(TODAY, 12).slice(0, 10));
  const [rent, setRent] = useState(unit?.rent ?? 0);
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [deposit, setDeposit] = useState(unit?.securityDeposit ?? 0);
  const [noticeDays, setNoticeDays] = useState(30);

  const onSelectUnit = (id: string) => {
    setUnitId(id);
    const u = data.units.find((x) => x.id === id);
    if (u) { setRent(u.rent); setDeposit(u.securityDeposit); }
  };

  const submit = () => {
    if (!unit || !property) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a unit.' })); return; }
    if (!tenantId) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a tenant.' })); return; }
    const action = dispatch(dataActions.createLease({
      unitId: unit.id, propertyId: property.id, tenantId,
      startDate, endDate, rent: Number(rent), billingCycle: cycle,
      securityDeposit: Number(deposit), noticePeriodDays: Number(noticeDays),
      status: 'active', signed: true,
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Lease created.' }));
    onClose();
    navigate(`/leases/${(action.payload as { id: string }).id}`);
  };

  return (
    <Modal open onClose={onClose} title="Create lease" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Create lease</button></>}>
      {availableUnits.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">No vacant units available to lease.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit" className="sm:col-span-2">
            <Select value={unitId} onChange={(e) => onSelectUnit(e.target.value)}>
              {availableUnits.map((u) => {
                const p = data.properties.find((x) => x.id === u.propertyId);
                return <option key={u.id} value={u.id}>Unit {u.code} · {p?.name} · ₦{u.rent.toLocaleString('en-NG')}/yr</option>;
              })}
            </Select>
          </Field>
          <Field label="Tenant" className="sm:col-span-2">
            {freeTenants.length === 0 ? <p className="text-sm text-amber-600">All tenants are on active leases. Add a tenant first.</p> : (
              <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                {freeTenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.phone}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Start date"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="End date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <Field label="Rent (₦ / year)"><Input type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} /></Field>
          <Field label="Billing cycle"><Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)} className="capitalize">{CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <Field label="Security deposit (₦)"><Input type="number" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} /></Field>
          <Field label="Notice period (days)"><Input type="number" value={noticeDays} onChange={(e) => setNoticeDays(Number(e.target.value))} /></Field>
        </div>
      )}
    </Modal>
  );
}
