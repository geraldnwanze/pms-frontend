'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Building2, DoorOpen, Wallet, Coins, AlertTriangle, MapPin, Layers, ArrowLeft,
  UserPlus, Trash2, Loader2, MailPlus, Plus, Pencil,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, selectMemberships, propertyPerformance, tenantForUnit, unitBalance } from '@/store/selectors';
import { inviteMember, revokeMember } from '@/store/thunks';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/config/roles';
import { AddBuildingModal, AddUnitModal, EditBuildingModal, EditPropertyModal, EditUnitModal } from '@/components/StructureModals';
import { buildingTypeLabel } from '@/config/buildings';
import { coverImage, imageUrls } from '@/lib/media';
import { Field, Input, Select, Avatar, PhotoStrip, PhotoGallery } from '@/components/ui';
import type { MemberRole, PropertyMember } from '@/types';
import {
  PageHeader, Breadcrumbs, Card, SectionCard, StatCard, Badge, StatusBadge, Money, ProgressBar,
  KeyValue, EmptyState, DataTable, type Column, Tabs, ExportMenu,
} from '@/components/ui';
import {
  propertyStatusMeta, unitStatusMeta, invoiceStatusMeta, expenseStatusMeta, maintenanceStatusMeta, urgencyMeta,
} from '@/lib/status';
import { formatPercent, formatDate, formatNumber, fromNow, classNames } from '@/lib/format';
import type { Unit, Invoice, Expense, MaintenanceRequest } from '@/types';

const CHART_MONTHS = 8;

export function PropertyDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const me = useAppSelector(selectCurrentUser);
  const memberships = useAppSelector(selectMemberships);
  const [tab, setTab] = useState('overview');
  const [structureModal, setStructureModal] = useState<
    | null
    | { kind: 'building' }
    | { kind: 'unit'; buildingId?: string }
    | { kind: 'editProperty' }
    | { kind: 'editBuilding'; buildingId: string }
    | { kind: 'editUnit'; unitId: string }
  >(null);

  const myRoleHere = me?.role === 'admin'
    ? 'admin'
    : memberships.find((m) => m.propertyId === id && m.status === 'active')?.role;
  const canManageTeam = myRoleHere === 'admin' || myRoleHere === 'owner' || myRoleHere === 'manager';
  // Same set: an admin, or an owner/manager of this property, may build out its structure.
  const canEditStructure = canManageTeam;

  const property = data.properties.find((p) => p.id === id);

  const derived = useMemo(() => {
    if (!property) return null;
    const perf = propertyPerformance(data, property);
    const buildings = data.buildings.filter((b) => b.propertyId === id);
    const units = data.units.filter((u) => u.propertyId === id);
    const invoices = data.invoices.filter((i) => i.propertyId === id && i.status !== 'cancelled')
      .slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const expenses = data.expenses.filter((e) => e.propertyId === id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const maintenance = data.maintenance.filter((m) => m.propertyId === id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // monthly billed vs collected
    const byMonth = new Map<string, { billed: number; collected: number }>();
    for (const inv of invoices) {
      const m = inv.issueDate.slice(0, 7);
      const cur = byMonth.get(m) ?? { billed: 0, collected: 0 };
      cur.billed += inv.total;
      cur.collected += inv.amountPaid;
      byMonth.set(m, cur);
    }
    const series = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-CHART_MONTHS)
      .map(([m, v]) => ({ month: m.slice(5), billed: Math.round(v.billed), collected: Math.round(v.collected) }));

    return { perf, buildings, units, invoices, expenses, maintenance, series };
  }, [data, id, property]);

  if (!property || !derived) {
    return (
      <div>
        <PageHeader title="Property not found" />
        <Card><EmptyState icon={<Building2 className="h-6 w-6" />} title="This property doesn't exist" description="It may have been removed." action={<button className="btn-primary" onClick={() => navigate('/properties')}><ArrowLeft className="h-4 w-4" /> Back to properties</button>} /></Card>
      </div>
    );
  }

  const { perf, buildings, units, invoices, expenses, maintenance, series } = derived;
  const owners = property.owners.map((o) => ({ pct: o.percentage, user: data.users.find((u) => u.id === o.ownerId) }));
  const manager = data.users.find((u) => u.id === property.managerId);

  const exportRows = units.map((u) => {
    const t = tenantForUnit(data, u.id);
    return { Unit: u.code, Type: u.type, Floor: u.floor, Status: u.status, Rent: u.rent, Tenant: t?.name ?? '—', Balance: unitBalance(data, u.id) };
  });

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'units', label: 'Buildings & Units', count: units.length },
    { key: 'financials', label: 'Financials', count: invoices.length },
    { key: 'maintenance', label: 'Maintenance', count: maintenance.length },
    ...(canManageTeam ? [{ key: 'team', label: 'Team' }] : []),
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Properties', to: '/properties' }, { label: property.name }]} />}
        title={<span className="flex items-center gap-2.5">{property.name}<StatusBadge meta={propertyStatusMeta(property.status)} /></span>}
        subtitle={<span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{property.address} · {property.code}</span>}
        actions={<>
          <ExportMenu filename={`property-${property.code}`} title={`${property.name} — Units`} rows={exportRows} size="md" />
          {canEditStructure && (
            <button className="btn-secondary" onClick={() => setStructureModal({ kind: 'editProperty' })}>
              <Pencil className="h-4 w-4" /> Edit property
            </button>
          )}
        </>}
      />

      <PhotoGallery photos={property.photos} name={property.name} className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Units" value={`${perf.occupied}/${perf.units}`} icon={<DoorOpen className="h-5 w-5" />} tone="indigo" hint={`${formatPercent(perf.occupancyRate)} occupied`} />
        <StatCard label="Annual rent roll" value={<Money value={perf.annualRentRoll} compact />} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <StatCard label="Collected" value={<Money value={perf.collected} compact />} icon={<Coins className="h-5 w-5" />} tone="green" hint={`${formatPercent(perf.collectionRate)} collection`} />
        <StatCard label="Outstanding" value={<Money value={perf.outstanding} compact />} icon={<AlertTriangle className="h-5 w-5" />} tone={perf.outstanding > 0 ? 'amber' : 'gray'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <SectionCard title="Revenue trend" subtitle="Billed vs collected by month">
              {series.length === 0 ? (
                <EmptyState title="No invoices yet" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pdBilled" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} /><stop offset="95%" stopColor="#0284c7" stopOpacity={0} /></linearGradient>
                        <linearGradient id="pdCollected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.35} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₦${formatNumber(v / 1000)}k`} width={54} />
                      <Tooltip formatter={(v: number) => `₦${formatNumber(v)}`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                      <Area type="monotone" dataKey="billed" name="Billed" stroke="#0284c7" strokeWidth={2} fill="url(#pdBilled)" />
                      <Area type="monotone" dataKey="collected" name="Collected" stroke="#059669" strokeWidth={2} fill="url(#pdCollected)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Property details">
              <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                <KeyValue label="Type"><span className="capitalize">{property.type}</span></KeyValue>
                <KeyValue label="Year built">{property.yearBuilt || '—'}</KeyValue>
                <KeyValue label="Buildings">{buildings.length}</KeyValue>
                <KeyValue label="Land size">{property.landSizeSqm ? `${formatNumber(property.landSizeSqm)} m²` : '—'}</KeyValue>
                <KeyValue label="Built-up area">{property.builtUpAreaSqm ? `${formatNumber(property.builtUpAreaSqm)} m²` : '—'}</KeyValue>
                <KeyValue label="City">{property.city}, {property.state}</KeyValue>
                {property.estimatedValue ? <KeyValue label="Estimated value"><Money value={property.estimatedValue} compact /></KeyValue> : null}
                {property.insuranceProvider ? <KeyValue label="Insurance">{property.insuranceProvider}</KeyValue> : null}
                {property.taxReference ? <KeyValue label="Tax reference">{property.taxReference}</KeyValue> : null}
              </dl>
              {property.description && <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-600">{property.description}</p>}
              {property.amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
                  {property.amenities.map((a) => <Badge key={a} tone="gray">{a}</Badge>)}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard title="Ownership">
              <div className="space-y-3">
                {owners.map((o, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{(o.user?.name ?? '?').charAt(0)}</span>
                      <div><p className="text-sm font-semibold text-ink-800">{o.user?.name ?? 'Unknown'}</p><p className="text-xs text-ink-500">Owner</p></div>
                    </div>
                    <Badge tone="green">{o.pct}%</Badge>
                  </div>
                ))}
                <div className="border-t border-ink-100 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Property manager</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800">{manager?.name ?? 'Unassigned'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Occupancy">
              <div className="space-y-2.5 text-sm">
                <OccRow label="Occupied" value={perf.occupied} total={perf.units} tone="green" />
                <OccRow label="Vacant" value={perf.vacant} total={perf.units} tone="amber" />
                <div className="flex items-center justify-between border-t border-ink-100 pt-2.5"><span className="font-semibold text-ink-700">Occupancy rate</span><span className="font-bold text-brand-700">{formatPercent(perf.occupancyRate)}</span></div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'units' && (
        <div className="space-y-5">
          {canEditStructure && (
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-secondary" onClick={() => setStructureModal({ kind: 'building' })}>
                <Plus className="h-4 w-4" /> Add building
              </button>
              {buildings.length > 0 && (
                <button className="btn-primary" onClick={() => setStructureModal({ kind: 'unit' })}>
                  <Plus className="h-4 w-4" /> Add unit
                </button>
              )}
            </div>
          )}
          {buildings.length === 0 ? (
            <Card><EmptyState icon={<Layers className="h-6 w-6" />} title="No buildings yet"
              description="Add a building, then add units under it."
              action={canEditStructure ? <button className="btn-primary" onClick={() => setStructureModal({ kind: 'building' })}><Plus className="h-4 w-4" /> Add building</button> : undefined} /></Card>
          ) : (
            buildings.map((b) => {
              const bUnits = units.filter((u) => u.buildingId === b.id);
              return (
                <SectionCard key={b.id} title={<span className="flex items-center gap-2"><Layers className="h-4 w-4 text-ink-400" />{b.name}</span>} subtitle={[buildingTypeLabel(b.buildingType), `${b.floors} floors`, `${bUnits.length} units`, b.code].filter(Boolean).join(' · ')} bodyClassName="p-0"
                  action={canEditStructure ? (
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost text-xs" onClick={() => setStructureModal({ kind: 'editBuilding', buildingId: b.id })}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button className="btn-ghost text-xs" onClick={() => setStructureModal({ kind: 'unit', buildingId: b.id })}><Plus className="h-3.5 w-3.5" /> Add unit</button>
                    </div>
                  ) : undefined}>
                  {imageUrls(b.photos).length > 0 && (
                    <div className="border-b border-ink-100 px-5 py-3">
                      <PhotoStrip photos={b.photos} max={6} label={`${b.name} interior`} />
                    </div>
                  )}
                  {bUnits.length === 0
                    ? <div className="px-5 py-6 text-sm text-ink-400">No units in this building yet.</div>
                    : <UnitsTable units={bUnits} onOpen={(u) => navigate(`/units/${u.id}`)}
                        onEdit={canEditStructure ? (u) => setStructureModal({ kind: 'editUnit', unitId: u.id }) : undefined} />}
                </SectionCard>
              );
            })
          )}
        </div>
      )}

      {tab === 'financials' && (
        <div className="space-y-5">
          <SectionCard title="Invoices" subtitle={`${invoices.length} invoices for this property`} bodyClassName="p-0"
            action={<ExportMenu filename={`invoices-${property.code}`} title="Invoices" rows={invoices.map((i) => ({ Invoice: i.code, Issued: i.issueDate, Due: i.dueDate, Total: i.total, Paid: i.amountPaid, Status: i.status }))} />}>
            <InvoicesTable invoices={invoices} onOpen={(i) => navigate(`/invoices/${i.id}`)} />
          </SectionCard>
          <SectionCard title="Expenses" subtitle={`${expenses.length} expense records`} bodyClassName="p-0">
            <ExpensesTable expenses={expenses} vendorName={(vid) => data.vendors.find((v) => v.id === vid)?.name ?? '—'} />
          </SectionCard>
        </div>
      )}

      {tab === 'maintenance' && (
        <SectionCard title="Maintenance requests" subtitle={`${maintenance.length} requests`} bodyClassName="p-0">
          <MaintenanceTable requests={maintenance} unitCode={(uid) => units.find((u) => u.id === uid)?.code ?? '—'} onOpen={(m) => navigate(`/maintenance/${m.id}`)} />
        </SectionCard>
      )}

      {tab === 'team' && canManageTeam && <PropertyTeam propertyId={id} propertyName={property.name} />}

      {structureModal?.kind === 'building' && (
        <AddBuildingModal propertyId={id} onClose={() => setStructureModal(null)} />
      )}
      {structureModal?.kind === 'unit' && (
        <AddUnitModal propertyId={id} buildingId={structureModal.buildingId} onClose={() => setStructureModal(null)} />
      )}
      {structureModal?.kind === 'editProperty' && (
        <EditPropertyModal property={property} onClose={() => setStructureModal(null)} />
      )}
      {structureModal?.kind === 'editBuilding' && (() => {
        const b = buildings.find((x) => x.id === structureModal.buildingId);
        return b ? <EditBuildingModal building={b} onClose={() => setStructureModal(null)} /> : null;
      })()}
      {structureModal?.kind === 'editUnit' && (() => {
        const u = units.find((x) => x.id === structureModal.unitId);
        return u ? <EditUnitModal unit={u} onClose={() => setStructureModal(null)} /> : null;
      })()}
    </div>
  );
}

const INVITE_ROLES: MemberRole[] = ['manager', 'agent', 'finance', 'maintenance', 'tenant', 'owner'];

function PropertyTeam({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const dispatch = useAppDispatch();
  const [members, setMembers] = useState<PropertyMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('manager');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.propertyMembers(propertyId).then((rows) => setMembers(rows as PropertyMember[])).catch(() => setMembers([]));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [propertyId]);

  const send = async () => {
    if (!email.trim()) return;
    setBusy('invite');
    const ok = await dispatch(inviteMember(propertyId, email, role));
    if (ok) { setEmail(''); await load(); }
    setBusy(null);
  };

  const remove = async (m: PropertyMember) => {
    setBusy(m.id);
    const ok = await dispatch(revokeMember(propertyId, m.id));
    if (ok) await load();
    setBusy(null);
  };

  const tone: Record<PropertyMember['status'], string> = {
    active: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
    invited: 'text-amber-700 bg-amber-50 ring-amber-200',
    declined: 'text-ink-500 bg-ink-50 ring-ink-200',
    revoked: 'text-ink-400 bg-ink-50 ring-ink-200',
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Invite a team member" subtitle={`They'll get a pending invitation to join ${propertyName}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Email address" className="flex-1">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
          </Field>
          <Field label="Role" className="sm:w-56">
            <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          <button className="btn-primary" onClick={send} disabled={busy === 'invite' || !email.trim()}>
            {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
            Send invite
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Members" subtitle={members ? `${members.filter((m) => m.status === 'active').length} active · ${members.filter((m) => m.status === 'invited').length} pending` : 'Loading…'} bodyClassName="p-0">
        {members === null ? (
          <div className="flex items-center justify-center py-10 text-sm text-ink-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading team…</div>
        ) : members.length === 0 ? (
          <EmptyState icon={<UserPlus className="h-6 w-6" />} title="No members yet" description="Invite someone above to build your team." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.email} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-800">{m.email}</p>
                  <p className="text-xs text-ink-400">
                    {ROLE_LABELS[m.role]}{m.invitedByName ? ` · invited by ${m.invitedByName}` : ''}{m.invitedAt ? ` · ${fromNow(m.invitedAt)}` : ''}
                  </p>
                </div>
                <span className={classNames('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset', tone[m.status])}>{m.status}</span>
                {(m.status === 'active' || m.status === 'invited') && (
                  <button className="ml-1 rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Remove" disabled={busy === m.id} onClick={() => remove(m)}>
                    {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function OccRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'green' | 'amber' }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-ink-600">{label}</span><span className="font-semibold text-ink-800">{value}</span></div>
      <ProgressBar value={pct} tone={tone} />
    </div>
  );
}

function UnitsTable({ units, onOpen, onEdit }: { units: Unit[]; onOpen: (u: Unit) => void; onEdit?: (u: Unit) => void }) {
  const data = useAppSelector(selectData);
  const columns: Column<Unit>[] = [
    { key: 'code', header: 'Unit', sortValue: (u) => u.code, render: (u) => (
      <span className="flex items-center gap-2">
        {coverImage(u.photos) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage(u.photos)} alt="" className="h-8 w-8 rounded-md object-cover ring-1 ring-ink-200" />
        )}
        <span className="font-semibold text-ink-800">{u.code}</span>
      </span>
    ) },
    { key: 'type', header: 'Type', render: (u) => <span className="text-ink-600">{u.type}</span> },
    { key: 'floor', header: 'Floor', align: 'center', sortValue: (u) => u.floor, render: (u) => u.floor },
    { key: 'config', header: 'Config', render: (u) => <span className="text-ink-500">{u.bedrooms}bd · {u.bathrooms}ba</span> },
    { key: 'rent', header: 'Rent / yr', align: 'right', sortValue: (u) => u.rent, render: (u) => <Money value={u.rent} compact /> },
    { key: 'tenant', header: 'Tenant', render: (u) => { const t = tenantForUnit(data, u.id); return t ? <span className="text-ink-700">{t.name}</span> : <span className="text-ink-400">Vacant</span>; } },
    { key: 'balance', header: 'Balance', align: 'right', sortValue: (u) => unitBalance(data, u.id), render: (u) => { const b = unitBalance(data, u.id); return <Money value={b} compact className={b > 0 ? 'font-semibold text-amber-600' : 'text-ink-400'} />; } },
    { key: 'status', header: 'Status', sortValue: (u) => u.status, render: (u) => <StatusBadge meta={unitStatusMeta(u.status)} /> },
    ...(onEdit ? [{
      key: 'edit', header: '', align: 'right' as const, render: (u: Unit) => (
        <button className="btn-ghost p-1.5 text-ink-400 hover:text-ink-700" aria-label={`Edit unit ${u.code}`}
          onClick={(e) => { e.stopPropagation(); onEdit(u); }}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ),
    }] : []),
  ];
  return <DataTable columns={columns} rows={units} keyOf={(u) => u.id} onRowClick={onOpen} pageSize={8} />;
}

function InvoicesTable({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (i: Invoice) => void }) {
  const columns: Column<Invoice>[] = [
    { key: 'code', header: 'Invoice', sortValue: (i) => i.code, render: (i) => <span className="font-semibold text-ink-800">{i.code}</span> },
    { key: 'issue', header: 'Issued', sortValue: (i) => i.issueDate, render: (i) => <span className="text-ink-600">{formatDate(i.issueDate)}</span> },
    { key: 'due', header: 'Due', sortValue: (i) => i.dueDate, render: (i) => <span className="text-ink-600">{formatDate(i.dueDate)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (i) => i.total, render: (i) => <Money value={i.total} /> },
    { key: 'paid', header: 'Paid', align: 'right', sortValue: (i) => i.amountPaid, render: (i) => <Money value={i.amountPaid} className="text-brand-700" /> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={invoiceStatusMeta(i.status)} /> },
  ];
  return <DataTable columns={columns} rows={invoices} keyOf={(i) => i.id} onRowClick={onOpen} pageSize={8} initialSort={{ key: 'issue', dir: 'desc' }} emptyTitle="No invoices" />;
}

function ExpensesTable({ expenses, vendorName }: { expenses: Expense[]; vendorName: (id?: string) => string }) {
  const columns: Column<Expense>[] = [
    { key: 'code', header: 'Ref', sortValue: (e) => e.code, render: (e) => <span className="font-semibold text-ink-800">{e.code}</span> },
    { key: 'cat', header: 'Category', sortValue: (e) => e.category, render: (e) => <Badge tone="gray" className="capitalize">{e.category}</Badge> },
    { key: 'desc', header: 'Description', render: (e) => <span className="text-ink-600">{e.description}</span> },
    { key: 'vendor', header: 'Vendor', render: (e) => <span className="text-ink-500">{vendorName(e.vendorId)}</span> },
    { key: 'date', header: 'Date', sortValue: (e) => e.date, render: (e) => <span className="text-ink-600">{formatDate(e.date)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (e) => e.amount, render: (e) => <Money value={e.amount} /> },
    { key: 'status', header: 'Status', sortValue: (e) => e.status, render: (e) => <StatusBadge meta={expenseStatusMeta(e.status)} /> },
  ];
  return <DataTable columns={columns} rows={expenses} keyOf={(e) => e.id} pageSize={8} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No expenses" />;
}

function MaintenanceTable({ requests, unitCode, onOpen }: { requests: MaintenanceRequest[]; unitCode: (id: string) => string; onOpen: (m: MaintenanceRequest) => void }) {
  const columns: Column<MaintenanceRequest>[] = [
    { key: 'code', header: 'Ref', sortValue: (m) => m.code, render: (m) => <span className="font-semibold text-ink-800">{m.code}</span> },
    { key: 'title', header: 'Issue', render: (m) => <div><p className="font-medium text-ink-700">{m.title}</p><p className="text-xs text-ink-400">Unit {unitCode(m.unitId)} · {m.category}</p></div> },
    { key: 'urgency', header: 'Urgency', sortValue: (m) => m.urgency, render: (m) => <StatusBadge meta={urgencyMeta(m.urgency)} /> },
    { key: 'date', header: 'Reported', sortValue: (m) => m.createdAt, render: (m) => <span className="text-ink-600">{formatDate(m.createdAt)}</span> },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusBadge meta={maintenanceStatusMeta(m.status)} /> },
  ];
  return <DataTable columns={columns} rows={requests} keyOf={(m) => m.id} onRowClick={onOpen} pageSize={8} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="No maintenance requests" />;
}
