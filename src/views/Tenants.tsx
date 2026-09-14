'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Users, Plus, Wallet } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Badge, StatusBadge, Money, Avatar, DataTable, type Column, ExportMenu,
  Modal, Field, Input, Select,
} from '@/components/ui';
import { leaseStatusMeta } from '@/lib/status';
import { can } from '@/config/roles';
import { uid } from '@/lib/format';
import type { Tenant, Lease } from '@/types';

interface TenantRow {
  tenant: Tenant;
  lease?: Lease;
  unitCode?: string;
  propertyName?: string;
  balance: number;
}

export function Tenants() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [creating, setCreating] = useState(false);

  const rows = useMemo<TenantRow[]>(() => {
    const ids = new Set<string>();
    data.leases.forEach((l) => scoped.has(l.propertyId) && ids.add(l.tenantId));
    data.invoices.forEach((i) => scoped.has(i.propertyId) && ids.add(i.tenantId));
    return data.tenants
      .filter((t) => ids.has(t.id))
      .map((t) => {
        const lease = data.leases.find((l) => l.tenantId === t.id && ['active', 'expiring', 'renewed'].includes(l.status));
        const unit = lease ? data.units.find((u) => u.id === lease.unitId) : undefined;
        const property = lease ? data.properties.find((p) => p.id === lease.propertyId) : undefined;
        const balance = data.invoices
          .filter((i) => i.tenantId === t.id && i.status !== 'cancelled')
          .reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
        return { tenant: t, lease, unitCode: unit?.code, propertyName: property?.name, balance };
      });
  }, [data, scoped]);

  const active = rows.filter((r) => r.lease).length;
  const withDebt = rows.filter((r) => r.balance > 0).length;
  const totalDebt = rows.reduce((s, r) => s + r.balance, 0);

  const exportRows = rows.map((r) => ({
    Name: r.tenant.name, Phone: r.tenant.phone, Email: r.tenant.email,
    Property: r.propertyName ?? '—', Unit: r.unitCode ?? '—',
    Lease: r.lease?.status ?? 'none', Balance: r.balance,
  }));

  const columns: Column<TenantRow>[] = [
    { key: 'name', header: 'Tenant', sortValue: (r) => r.tenant.name, render: (r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.tenant.name} color={r.tenant.avatarColor} size={34} />
        <div><p className="font-semibold text-ink-800">{r.tenant.name}</p><p className="text-xs text-ink-400">{r.tenant.email}</p></div>
      </div>
    ) },
    { key: 'phone', header: 'Phone', render: (r) => <span className="text-ink-600">{r.tenant.phone}</span> },
    { key: 'unit', header: 'Unit', sortValue: (r) => r.unitCode ?? '', render: (r) => r.unitCode ? <div><p className="font-medium text-ink-700">{r.unitCode}</p><p className="text-xs text-ink-400">{r.propertyName}</p></div> : <span className="text-ink-400">No active lease</span> },
    { key: 'lease', header: 'Lease', sortValue: (r) => r.lease?.status ?? 'z', render: (r) => r.lease ? <StatusBadge meta={leaseStatusMeta(r.lease.status)} /> : <Badge tone="gray">None</Badge> },
    { key: 'balance', header: 'Balance', align: 'right', sortValue: (r) => r.balance, render: (r) => <Money value={r.balance} className={r.balance > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle={`${rows.length} tenants across your portfolio`}
        actions={<>
          <ExportMenu filename="tenants" title="Tenants" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add tenant</button>}
        </>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total tenants" value={rows.length} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Active leases" value={active} icon={<Users className="h-5 w-5" />} tone="green" />
        <StatCard label="With balance" value={withDebt} icon={<Wallet className="h-5 w-5" />} tone={withDebt ? 'amber' : 'gray'} />
        <StatCard label="Total outstanding" value={<Money value={totalDebt} compact />} icon={<Wallet className="h-5 w-5" />} tone={totalDebt ? 'red' : 'gray'} />
      </div>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.tenant.id}
          onRowClick={(r) => navigate(`/tenants/${r.tenant.id}`)}
          searchable
          searchAccessor={(r) => `${r.tenant.name} ${r.tenant.email} ${r.tenant.phone} ${r.unitCode ?? ''}`}
          searchPlaceholder="Search tenants…"
          initialSort={{ key: 'balance', dir: 'desc' }}
        />
      </Card>

      {creating && <AddTenantModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function AddTenantModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const owners = data.users.filter((u) => u.role === 'owner');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', identityType: 'National ID', identityNumber: '',
    emergencyContactName: '', emergencyContactPhone: '',
    ownerId: user?.ownerId ?? user?.id ?? owners[0]?.id ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const COLORS = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

  const submit = () => {
    if (!form.name.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Tenant name is required.' })); return; }
    const action = dispatch(dataActions.createTenant({
      ...form,
      avatarColor: COLORS[form.name.length % COLORS.length],
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${form.name} added.` }));
    onClose();
    navigate(`/tenants/${(action.payload as { id: string }).id}`);
  };

  return (
    <Modal open onClose={onClose} title="Add tenant" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Add tenant</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chidi Okafor" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+234…" /></Field>
        <Field label="ID type"><Select value={form.identityType} onChange={(e) => set('identityType', e.target.value)}><option>National ID</option><option>Driver's License</option><option>Passport</option><option>Voter's Card</option></Select></Field>
        <Field label="ID number"><Input value={form.identityNumber} onChange={(e) => set('identityNumber', e.target.value)} /></Field>
        <Field label="Emergency contact"><Input value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></Field>
        <Field label="Emergency phone"><Input value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></Field>
        {owners.length > 0 && <Field label="Owner portfolio" className="sm:col-span-2"><Select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
      </div>
    </Modal>
  );
}
