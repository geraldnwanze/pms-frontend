'use client';

import { useMemo, useState } from 'react';
import {
  ClipboardCheck, Plus, CalendarClock, CheckCircle2, Home, Wrench, LogIn, LogOut,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, StatusBadge, Money, KeyValue, Chip, DataTable, type Column,
  ExportMenu, Modal, Field, Input, Select, Textarea,
} from '@/components/ui';
import { inspectionStatusMeta } from '@/lib/status';
import { can } from '@/config/roles';
import { formatDate, today, daysUntil, uid, classNames } from '@/lib/format';
import type { Inspection, InspectionType, InspectionStatus, InspectionItem } from '@/types';

const TYPE_META: Record<InspectionType, { label: string; icon: React.ReactNode }> = {
  'move-in': { label: 'Move-in', icon: <LogIn className="h-4 w-4" /> },
  'routine': { label: 'Routine', icon: <Home className="h-4 w-4" /> },
  'maintenance': { label: 'Maintenance', icon: <Wrench className="h-4 w-4" /> },
  'move-out': { label: 'Move-out', icon: <LogOut className="h-4 w-4" /> },
};
const TYPES = Object.keys(TYPE_META) as InspectionType[];
const AREAS = ['Living area', 'Kitchen', 'Bathrooms', 'Bedrooms', 'Fixtures & fittings', 'Walls & ceiling', 'Flooring', 'Exterior'];
const CONDITIONS: InspectionItem['condition'][] = ['good', 'fair', 'poor', 'damaged'];
const CONDITION_TONE: Record<InspectionItem['condition'], string> = { good: 'text-green-600', fair: 'text-blue-600', poor: 'text-amber-600', damaged: 'text-red-600' };

const STATUS_FILTERS: { key: InspectionStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function Inspections() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [status, setStatus] = useState<InspectionStatus | 'all'>('all');
  const [scheduling, setScheduling] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(
    () => data.inspections.filter((i) => scoped.has(i.propertyId)).slice().sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
    [data.inspections, scoped],
  );
  const rows = status === 'all' ? all : all.filter((i) => i.status === status);

  const scheduled = all.filter((i) => i.status === 'scheduled');
  const upcoming = scheduled.filter((i) => daysUntil(i.scheduledDate) >= 0 && daysUntil(i.scheduledDate) <= 7).length;
  const completed = all.filter((i) => i.status === 'completed').length;

  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const unitCode = (id: string) => data.units.find((u) => u.id === id)?.code ?? '—';
  const inspectorName = (id?: string) => id ? data.users.find((u) => u.id === id)?.name : undefined;

  const exportRows = rows.map((i) => ({
    Code: i.code, Type: TYPE_META[i.type].label, Property: propName(i.propertyId), Unit: unitCode(i.unitId),
    Scheduled: i.scheduledDate, Inspector: inspectorName(i.inspectorId) ?? '', Status: i.status,
  }));

  const columns: Column<Inspection>[] = [
    { key: 'type', header: 'Inspection', sortValue: (i) => i.type, render: (i) => <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{TYPE_META[i.type].icon}</span><div><p className="font-semibold text-ink-800">{TYPE_META[i.type].label}</p><p className="text-xs text-ink-400">{i.code}</p></div></div> },
    { key: 'loc', header: 'Location', sortValue: (i) => propName(i.propertyId), render: (i) => <div><p className="text-sm text-ink-700">Unit {unitCode(i.unitId)}</p><p className="text-xs text-ink-400">{propName(i.propertyId)}</p></div> },
    { key: 'date', header: 'Scheduled', sortValue: (i) => i.scheduledDate, render: (i) => <div><p className="text-ink-600">{formatDate(i.scheduledDate)}</p>{i.status === 'scheduled' && daysUntil(i.scheduledDate) >= 0 && <p className="text-xs text-ink-400">in {daysUntil(i.scheduledDate)}d</p>}</div> },
    { key: 'inspector', header: 'Inspector', sortValue: (i) => inspectorName(i.inspectorId) ?? 'z', render: (i) => { const n = inspectorName(i.inspectorId); return n ? <span className="text-ink-600">{n}</span> : <span className="text-ink-300">Unassigned</span>; } },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge meta={inspectionStatusMeta(i.status)} /> },
  ];

  return (
    <div>
      <PageHeader title="Inspections" subtitle="Move-in, routine and move-out condition checks"
        actions={<>
          <ExportMenu filename="inspections" title="Inspections" rows={exportRows} size="md" />
          {can(user?.role, 'create') && <button className="btn-primary" onClick={() => setScheduling(true)}><Plus className="h-4 w-4" /> Schedule</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Scheduled" value={scheduled.length} icon={<CalendarClock className="h-5 w-5" />} tone="blue" />
        <StatCard label="Next 7 days" value={upcoming} icon={<CalendarClock className="h-5 w-5" />} tone={upcoming ? 'amber' : 'gray'} />
        <StatCard label="Completed" value={completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Total" value={all.length} icon={<ClipboardCheck className="h-5 w-5" />} tone="gray" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', status === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((i) => i.status === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(i) => i.id} onRowClick={(i) => setOpenId(i.id)}
          searchable searchAccessor={(i) => `${i.code} ${TYPE_META[i.type].label} ${propName(i.propertyId)} ${unitCode(i.unitId)}`} searchPlaceholder="Search inspections…"
          initialSort={{ key: 'date', dir: 'desc' }} />
      </Card>

      {scheduling && <ScheduleModal onClose={() => setScheduling(false)} />}
      {openId && <InspectionModal inspectionId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ScheduleModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const scoped = useAppSelector(scopedPropertyIds);
  const units = useMemo(() => data.units.filter((u) => scoped.has(u.propertyId)), [data.units, scoped]);
  const inspectors = useMemo(() => data.users.filter((u) => ['manager', 'maintenance', 'agent'].includes(u.role)), [data.users]);

  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [type, setType] = useState<InspectionType>('routine');
  const [scheduledDate, setScheduledDate] = useState(today());
  const [inspectorId, setInspectorId] = useState(inspectors[0]?.id ?? '');

  const submit = () => {
    const unit = data.units.find((u) => u.id === unitId);
    if (!unit) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Select a unit.' })); return; }
    const lease = data.leases.find((l) => l.unitId === unit.id && ['active', 'expiring', 'renewed'].includes(l.status));
    dispatch(dataActions.createInspection({ propertyId: unit.propertyId, unitId: unit.id, tenantId: lease?.tenantId, type, status: 'scheduled', scheduledDate, inspectorId, items: [] }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Inspection scheduled.' }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Schedule inspection" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Schedule</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unit" className="sm:col-span-2"><Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => { const p = data.properties.find((x) => x.id === u.propertyId); return <option key={u.id} value={u.id}>Unit {u.code} · {p?.name}</option>; })}</Select></Field>
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value as InspectionType)}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></Field>
        <Field label="Inspector" className="sm:col-span-2"><Select value={inspectorId} onChange={(e) => setInspectorId(e.target.value)}>{inspectors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

function InspectionModal({ inspectionId, onClose }: { inspectionId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const insp = data.inspections.find((i) => i.id === inspectionId);
  const [completing, setCompleting] = useState(false);
  const [conditions, setConditions] = useState<Record<string, InspectionItem['condition']>>(() => Object.fromEntries(AREAS.map((a) => [a, 'good'])));
  const [notes, setNotes] = useState('');
  const [deductions, setDeductions] = useState(0);

  if (!insp) return null;
  const property = data.properties.find((p) => p.id === insp.propertyId);
  const unit = data.units.find((u) => u.id === insp.unitId);
  const inspector = insp.inspectorId ? data.users.find((u) => u.id === insp.inspectorId) : undefined;
  const canComplete = can(user?.role, 'edit') && insp.status === 'scheduled';

  const complete = () => {
    const items: InspectionItem[] = AREAS.map((a) => ({ area: a, condition: conditions[a] }));
    dispatch(dataActions.updateInspection({ id: insp.id, status: 'completed', completedDate: today(), items, notes: notes || undefined, depositDeductions: deductions || undefined }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${insp.code} marked complete.` }));
    onClose();
  };

  const cancel = () => {
    dispatch(dataActions.updateInspection({ id: insp.id, status: 'cancelled' }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${insp.code} cancelled.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${TYPE_META[insp.type].label} inspection`} subtitle={`${insp.code} · Unit ${unit?.code ?? ''}`} size="lg"
      footer={completing ? (
        <><button className="btn-secondary" onClick={() => setCompleting(false)}>Back</button><button className="btn-primary" onClick={complete}><CheckCircle2 className="h-4 w-4" /> Save & complete</button></>
      ) : (
        <div className="flex w-full items-center justify-between">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <div className="flex gap-2">
            {canComplete && <button className="btn-secondary text-red-600 hover:bg-red-50" onClick={cancel}>Cancel inspection</button>}
            {canComplete && <button className="btn-primary" onClick={() => setCompleting(true)}><ClipboardCheck className="h-4 w-4" /> Record findings</button>}
          </div>
        </div>
      )}>
      {!completing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-ink-50 p-4">
            <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">{TYPE_META[insp.type].icon}</span><StatusBadge meta={inspectionStatusMeta(insp.status)} /></div>
            <p className="text-sm text-ink-500">{formatDate(insp.scheduledDate)}</p>
          </div>
          <dl>
            <KeyValue label="Property">{property?.name ?? '—'}</KeyValue>
            <KeyValue label="Unit">Unit {unit?.code ?? '—'}</KeyValue>
            <KeyValue label="Inspector">{inspector?.name ?? 'Unassigned'}</KeyValue>
            {insp.completedDate && <KeyValue label="Completed">{formatDate(insp.completedDate)}</KeyValue>}
            {insp.depositDeductions ? <KeyValue label="Deposit deductions"><Money value={insp.depositDeductions} className="font-semibold text-red-600" /></KeyValue> : null}
          </dl>
          {insp.items.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-700">Condition report</p>
              <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                {insp.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-ink-600">{it.area}</span>
                    <span className={classNames('font-semibold capitalize', CONDITION_TONE[it.condition])}>{it.condition}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {insp.notes && <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">{insp.notes}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-500">Record the condition of each area, then complete the inspection.</p>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {AREAS.map((a) => (
              <div key={a} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-ink-700">{a}</span>
                <div className="flex gap-1">
                  {CONDITIONS.map((c) => (
                    <button key={c} onClick={() => setConditions((prev) => ({ ...prev, [a]: c }))}
                      className={classNames('rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors', conditions[a] === c ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-500 hover:bg-ink-100')}>{c}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deposit deductions (₦)" hint="For move-out damage"><Input type="number" value={deductions} onChange={(e) => setDeductions(Number(e.target.value))} /></Field>
          </div>
          <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        </div>
      )}
    </Modal>
  );
}
