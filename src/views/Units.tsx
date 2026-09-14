'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Building2, DoorOpen, CheckCircle2, Percent, Plus, Pencil } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, scopedPropertyIds, currentLeaseForUnit, selectCurrentUser } from '@/store/selectors';
import {
  PageHeader, Card, StatCard, StatusBadge, Money, Chip, DataTable, type Column, ExportMenu,
} from '@/components/ui';
import { AddUnitModal, EditUnitModal } from '@/components/StructureModals';
import { canManageStructure } from '@/config/roles';
import { unitStatusMeta } from '@/lib/status';
import { classNames } from '@/lib/format';
import type { Unit, UnitStatus } from '@/types';

const STATUS_FILTERS: { key: UnitStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'occupied', label: 'Occupied' },
  { key: 'available', label: 'Available' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'renovation', label: 'Renovation' },
  { key: 'unavailable', label: 'Unavailable' },
];

export function Units() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const user = useAppSelector(selectCurrentUser);
  const [status, setStatus] = useState<UnitStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const canEdit = canManageStructure(user?.role);

  const all = useMemo(
    () => data.units.filter((u) => scoped.has(u.propertyId)).slice().sort((a, b) => a.code.localeCompare(b.code)),
    [data.units, scoped],
  );
  const rows = status === 'all' ? all : all.filter((u) => u.status === status);

  const occupied = all.filter((u) => u.status === 'occupied').length;
  const available = all.filter((u) => u.status === 'available').length;
  const occupancy = all.length ? Math.round((occupied / all.length) * 100) : 0;

  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const buildingName = (id: string) => data.buildings.find((b) => b.id === id)?.name ?? '—';
  const tenantForUnit = (u: Unit) => { const l = currentLeaseForUnit(data, u.id); return l ? data.tenants.find((t) => t.id === l.tenantId)?.name : undefined; };

  const exportRows = rows.map((u) => ({
    Unit: u.code, Type: u.type, Property: propName(u.propertyId), Building: buildingName(u.buildingId),
    Beds: u.bedrooms, Baths: u.bathrooms, Size: u.sizeSqm, Rent: u.rent, Status: u.status, Tenant: tenantForUnit(u) ?? '',
  }));

  const columns: Column<Unit>[] = [
    { key: 'code', header: 'Unit', sortValue: (u) => u.code, render: (u) => <div><p className="font-semibold text-ink-800">Unit {u.code}</p><p className="text-xs text-ink-400">{u.type}</p></div> },
    { key: 'loc', header: 'Location', sortValue: (u) => propName(u.propertyId), render: (u) => <div><p className="text-sm text-ink-700">{propName(u.propertyId)}</p><p className="text-xs text-ink-400">{buildingName(u.buildingId)} · Floor {u.floor}</p></div> },
    { key: 'spec', header: 'Spec', render: (u) => <span className="text-sm text-ink-500">{u.bedrooms} bd · {u.bathrooms} ba · {u.sizeSqm}m²</span> },
    { key: 'tenant', header: 'Tenant', sortValue: (u) => tenantForUnit(u) ?? 'z', render: (u) => { const t = tenantForUnit(u); return t ? <span className="text-ink-600">{t}</span> : <span className="text-ink-300">Vacant</span>; } },
    { key: 'rent', header: 'Rent / yr', align: 'right', sortValue: (u) => u.rent, render: (u) => <Money value={u.rent} /> },
    { key: 'status', header: 'Status', sortValue: (u) => u.status, render: (u) => <StatusBadge meta={unitStatusMeta(u.status)} /> },
    ...(canEdit ? [{
      key: 'edit', header: '', align: 'right' as const, render: (u: Unit) => (
        <button className="btn-ghost p-1.5 text-ink-400 hover:text-ink-700" aria-label={`Edit unit ${u.code}`}
          onClick={(e) => { e.stopPropagation(); setEditing(u); }}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Units" subtitle="Every rentable unit across your portfolio"
        actions={<>
          <ExportMenu filename="units" title="Units" rows={exportRows} size="md" />
          {canManageStructure(user?.role) && (
            <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add unit</button>
          )}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total units" value={all.length} icon={<Building2 className="h-5 w-5" />} tone="blue" />
        <StatCard label="Occupied" value={occupied} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Available" value={available} icon={<DoorOpen className="h-5 w-5" />} tone={available ? 'amber' : 'gray'} onClick={available ? () => setStatus('available') : undefined} />
        <StatCard label="Occupancy" value={`${occupancy}%`} icon={<Percent className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((u) => u.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(u) => u.id} onRowClick={(u) => navigate(`/units/${u.id}`)}
          searchable searchAccessor={(u) => `${u.code} ${u.type} ${propName(u.propertyId)} ${tenantForUnit(u) ?? ''}`} searchPlaceholder="Search units…"
          initialSort={{ key: 'code', dir: 'asc' }} />
      </Card>

      {creating && <AddUnitModal onClose={() => setCreating(false)} />}
      {editing && <EditUnitModal unit={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
