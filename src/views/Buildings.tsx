'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Building, Plus, Layers, DoorOpen, ArrowRight, Pencil } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectData, scopedPropertyIds } from '@/store/selectors';
import { selectCurrentUser } from '@/store/selectors';
import {
  PageHeader, Card, StatCard, EmptyState, ExportMenu, Badge,
} from '@/components/ui';
import { AddBuildingModal, EditBuildingModal } from '@/components/StructureModals';
import { canManageStructure } from '@/config/roles';
import { buildingTypeLabel } from '@/config/buildings';
import type { Building as BuildingT } from '@/types';

export function Buildings() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BuildingT | null>(null);
  const canEdit = canManageStructure(user?.role);

  const buildings = useMemo(
    () => data.buildings.filter((b) => scoped.has(b.propertyId)).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [data.buildings, scoped],
  );

  const unitsIn = (bId: string) => data.units.filter((u) => u.buildingId === bId);
  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const totalUnits = buildings.reduce((s, b) => s + unitsIn(b.id).length, 0);
  const totalFloors = buildings.reduce((s, b) => s + b.floors, 0);

  const exportRows = buildings.map((b) => ({ Building: b.name, Code: b.code, Type: buildingTypeLabel(b.buildingType) ?? '', Property: propName(b.propertyId), Floors: b.floors, Units: unitsIn(b.id).length }));

  return (
    <div>
      <PageHeader title="Buildings" subtitle="Blocks and structures within your properties"
        actions={<>
          <ExportMenu filename="buildings" title="Buildings" rows={exportRows} size="md" />
          {canManageStructure(user?.role) && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add building</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Buildings" value={buildings.length} icon={<Building className="h-5 w-5" />} tone="blue" />
        <StatCard label="Total floors" value={totalFloors} icon={<Layers className="h-5 w-5" />} tone="purple" />
        <StatCard label="Total units" value={totalUnits} icon={<DoorOpen className="h-5 w-5" />} tone="green" />
      </div>

      {buildings.length === 0 ? (
        <Card><EmptyState icon={<Building className="h-6 w-6" />} title="No buildings yet" description="Add a building to organise units under a property." action={canManageStructure(user?.role) ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add building</button> : undefined} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => {
            const units = unitsIn(b.id);
            const occupied = units.filter((u) => u.status === 'occupied').length;
            return (
              <Card key={b.id} className="group cursor-pointer transition-shadow hover:shadow-card-hover" onClick={() => navigate(`/properties/${b.propertyId}`)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building className="h-5 w-5" /></span>
                    <div><p className="font-semibold text-ink-800">{b.name}</p><p className="text-xs text-ink-400">{b.code} · {propName(b.propertyId)}</p></div>
                  </div>
                  {canEdit ? (
                    <button
                      className="btn-ghost -mr-1 -mt-1 p-1.5 text-ink-400 hover:text-ink-700"
                      aria-label={`Edit ${b.name}`}
                      onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : (
                    <ArrowRight className="h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  )}
                </div>
                {buildingTypeLabel(b.buildingType) && <Badge tone="indigo" className="mt-3">{buildingTypeLabel(b.buildingType)}</Badge>}
                {b.description && <p className="mt-3 line-clamp-2 text-sm text-ink-500">{b.description}</p>}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                  <div><p className="text-lg font-bold text-ink-800">{b.floors}</p><p className="text-[11px] uppercase tracking-wide text-ink-400">Floors</p></div>
                  <div><p className="text-lg font-bold text-ink-800">{units.length}</p><p className="text-[11px] uppercase tracking-wide text-ink-400">Units</p></div>
                  <div><p className="text-lg font-bold text-brand-600">{occupied}</p><p className="text-[11px] uppercase tracking-wide text-ink-400">Occupied</p></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && <AddBuildingModal onClose={() => setCreating(false)} />}
      {editing && <EditBuildingModal building={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
