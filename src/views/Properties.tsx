'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Building2, Plus, MapPin, DoorOpen, LayoutGrid, List } from 'lucide-react';
import type { PropertyType, PropertyStatus, OwnershipStake } from '@/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, visiblePropertyIds, propertyPerformance } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, Badge, StatusBadge, Money, ProgressBar, Chip, ExportMenu, EmptyState,
  DataTable, type Column, Modal, Field, Input, Select, Textarea, PhotoPicker, LocationFields,
} from '@/components/ui';
import { propertyStatusMeta } from '@/lib/status';
import { coverImage } from '@/lib/media';
import { canRegisterProperty } from '@/config/roles';
import { formatPercent, classNames, uid } from '@/lib/format';
import type { PropertyPerformance } from '@/store/selectors';

const TYPES: PropertyType[] = ['residential', 'commercial', 'industrial', 'mixed-use', 'estate'];
const STATUSES: PropertyStatus[] = ['active', 'construction', 'renovation', 'inactive', 'sold', 'archived'];

const GRADIENTS = [
  'from-emerald-500 to-teal-600', 'from-blue-500 to-indigo-600', 'from-amber-500 to-orange-600',
  'from-purple-500 to-fuchsia-600', 'from-cyan-500 to-sky-600', 'from-rose-500 to-pink-600',
  'from-slate-600 to-slate-800',
];
function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function Properties() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [status, setStatus] = useState<PropertyStatus | 'all'>('all');
  const [type, setType] = useState<PropertyType | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const perf = useMemo(() => {
    const ids = visiblePropertyIds(data, user);
    return data.properties
      .filter((p) => ids.has(p.id))
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => type === 'all' || p.type === type)
      .map((p) => propertyPerformance(data, p));
  }, [data, user, status, type]);

  const ownerName = (owners: OwnershipStake[]) =>
    owners.map((o) => data.users.find((u) => u.id === o.ownerId)?.name ?? 'Owner').join(', ');

  const exportRows = perf.map((p) => ({
    Code: p.property.code,
    Name: p.property.name,
    Type: p.property.type,
    Status: p.property.status,
    City: p.property.city,
    Units: p.units,
    Occupancy: formatPercent(p.occupancyRate),
    'Annual Rent Roll': p.annualRentRoll,
    Collected: p.collected,
    Outstanding: p.outstanding,
  }));

  const columns: Column<PropertyPerformance>[] = [
    { key: 'name', header: 'Property', sortValue: (r) => r.property.name, render: (r) => (
      <div className="flex items-center gap-2.5">
        {coverImage(r.property.photos) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage(r.property.photos)} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <span className={classNames('flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white', gradientFor(r.property.id))}><Building2 className="h-4 w-4" /></span>
        )}
        <div><p className="font-semibold text-ink-800">{r.property.name}</p><p className="text-xs text-ink-500">{r.property.code}</p></div>
      </div>
    ) },
    { key: 'type', header: 'Type', sortValue: (r) => r.property.type, render: (r) => <Badge tone="gray" className="capitalize">{r.property.type}</Badge> },
    { key: 'city', header: 'Location', sortValue: (r) => r.property.city, render: (r) => <span className="text-ink-600">{r.property.city}, {r.property.state}</span> },
    { key: 'units', header: 'Units', align: 'center', sortValue: (r) => r.units, render: (r) => r.units },
    { key: 'occ', header: 'Occupancy', sortValue: (r) => r.occupancyRate, render: (r) => (
      <div className="flex items-center gap-2"><span className="w-9 text-xs font-semibold text-ink-600">{formatPercent(r.occupancyRate)}</span><ProgressBar value={r.occupancyRate} className="w-16" tone={r.occupancyRate >= 80 ? 'green' : r.occupancyRate >= 50 ? 'amber' : 'red'} /></div>
    ) },
    { key: 'out', header: 'Outstanding', align: 'right', sortValue: (r) => r.outstanding, render: (r) => <Money value={r.outstanding} compact /> },
    { key: 'status', header: 'Status', sortValue: (r) => r.property.status, render: (r) => <StatusBadge meta={propertyStatusMeta(r.property.status)} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={`${perf.length} propert${perf.length === 1 ? 'y' : 'ies'} in your portfolio`}
        actions={
          <>
            <ExportMenu filename="properties" title="Properties" rows={exportRows} size="md" />
            {canRegisterProperty(user?.role) && (
              <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Register property</button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={status === 'all'} onClick={() => setStatus('all')}>All status</Chip>
          {STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{propertyStatusMeta(s).label}</Chip>)}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={type} onChange={(e) => setType(e.target.value as PropertyType | 'all')} className="h-9 w-auto text-sm">
            <option value="all">All types</option>
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </Select>
          <div className="flex overflow-hidden rounded-lg border border-ink-200">
            <button onClick={() => setView('grid')} className={classNames('flex h-9 w-9 items-center justify-center', view === 'grid' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500')}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setView('table')} className={classNames('flex h-9 w-9 items-center justify-center', view === 'table' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500')}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {perf.length === 0 ? (
        <Card><EmptyState icon={<Building2 className="h-6 w-6" />} title="No properties match your filters" description="Adjust the filters or register a new property." /></Card>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {perf.map((p) => (
            <button key={p.property.id} onClick={() => navigate(`/properties/${p.property.id}`)} className="card group overflow-hidden p-0 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className={classNames('relative h-28 overflow-hidden bg-gradient-to-br', gradientFor(p.property.id))}>
                {coverImage(p.property.photos) ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverImage(p.property.photos)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center opacity-30"><Building2 className="h-14 w-14 text-white" /></div>
                )}
                <div className="absolute right-3 top-3"><StatusBadge meta={propertyStatusMeta(p.property.status)} /></div>
                <div className="absolute bottom-3 left-4 text-white"><p className="text-xs font-medium opacity-90">{p.property.code}</p></div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="truncate font-bold text-ink-900">{p.property.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3 w-3" />{p.property.city}, {p.property.state}</p>
                  </div>
                  <Badge tone="gray" className="shrink-0 capitalize">{p.property.type}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-ink-600"><DoorOpen className="h-4 w-4 text-ink-400" />{p.occupied}/{p.units} occupied</span>
                  <span className="font-semibold text-ink-700">{formatPercent(p.occupancyRate)}</span>
                </div>
                <ProgressBar value={p.occupancyRate} className="mt-1.5" tone={p.occupancyRate >= 80 ? 'green' : p.occupancyRate >= 50 ? 'amber' : 'red'} />
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
                  <div><p className="text-[11px] uppercase tracking-wide text-ink-400">Rent roll / yr</p><Money value={p.annualRentRoll} compact className="text-sm font-bold text-ink-800" /></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-ink-400">Outstanding</p><Money value={p.outstanding} compact className={classNames('text-sm font-bold', p.outstanding > 0 ? 'text-amber-600' : 'text-ink-800')} /></div>
                </div>
                <p className="mt-3 truncate text-xs text-ink-400">Owner: {ownerName(p.property.owners)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <DataTable
            columns={columns}
            rows={perf}
            keyOf={(r) => r.property.id}
            onRowClick={(r) => navigate(`/properties/${r.property.id}`)}
            searchable
            searchAccessor={(r) => `${r.property.name} ${r.property.code} ${r.property.city}`}
            searchPlaceholder="Search properties…"
            initialSort={{ key: 'out', dir: 'desc' }}
          />
        </Card>
      )}

      {creating && <CreatePropertyModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreatePropertyModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', type: 'residential' as PropertyType, status: 'active' as PropertyStatus,
    address: '', city: '', state: '', country: 'Nigeria', yearBuilt: 2018, description: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Property name is required.' })); return; }
    if (!form.country || !form.state.trim() || !form.city.trim()) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select the property’s country, state and city.' })); return; }
    // The API assigns the creator as the sole owner and generates the code.
    const action = dispatch(dataActions.createProperty({
      name: form.name.trim(), type: form.type, status: form.status,
      owners: [], managerId: undefined, assignedStaffIds: [],
      address: form.address || `${form.city}, ${form.state}`,
      city: form.city, state: form.state, country: form.country, lat: 0, lng: 0,
      description: form.description, landSizeSqm: 0, builtUpAreaSqm: 0, yearBuilt: Number(form.yearBuilt),
      amenities: [], photos: photos.length ? photos : ['#059669'],
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${form.name} registered — you're its owner.` }));
    onClose();
    const id = (action.payload as { id: string }).id;
    navigate(`/properties/${id}`);
  };

  return (
    <Modal open onClose={onClose} title="Register property" subtitle="You'll be its owner — invite a team once it's created" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Register property</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Marina Heights" /></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => set('type', e.target.value as PropertyType)} className="capitalize">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value as PropertyStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{propertyStatusMeta(s).label}</option>)}</Select></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street address" /></Field>
        <LocationFields value={{ country: form.country, state: form.state, city: form.city }} onChange={(l) => setForm((f) => ({ ...f, ...l }))} />
        <Field label="Year built"><Input type="number" value={form.yearBuilt} onChange={(e) => set('yearBuilt', Number(e.target.value))} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short description of the property" /></Field>
        <Field label="Photos" className="sm:col-span-2"><PhotoPicker value={photos} onChange={setPhotos} /></Field>
      </div>
    </Modal>
  );
}
