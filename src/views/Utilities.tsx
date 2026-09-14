'use client';

import { useMemo, useState } from 'react';
import { Gauge, Plus, Zap, Droplet, Flame, Activity, TrendingUp } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Money, Chip, DataTable, type Column, ExportMenu,
  Modal, Field, Input,
} from '@/components/ui';
import { can } from '@/config/roles';
import { formatDate, TODAY, uid, classNames } from '@/lib/format';
import type { Meter, MeterType } from '@/types';

const METER_META: Record<MeterType, { label: string; icon: React.ReactNode; tone: string }> = {
  electricity: { label: 'Electricity', icon: <Zap className="h-4 w-4" />, tone: 'text-amber-600 bg-amber-50' },
  water: { label: 'Water', icon: <Droplet className="h-4 w-4" />, tone: 'text-blue-600 bg-blue-50' },
  gas: { label: 'Gas', icon: <Flame className="h-4 w-4" />, tone: 'text-red-600 bg-red-50' },
  other: { label: 'Other', icon: <Activity className="h-4 w-4" />, tone: 'text-ink-600 bg-ink-100' },
};
const TYPE_FILTERS: { key: MeterType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'electricity', label: 'Electricity' },
  { key: 'water', label: 'Water' },
  { key: 'gas', label: 'Gas' },
  { key: 'other', label: 'Other' },
];

const consumption = (m: Meter) => Math.max(0, m.currentReading - m.previousReading);
const billable = (m: Meter) => consumption(m) * m.ratePerUnit;

export function Utilities() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [type, setType] = useState<MeterType | 'all'>('all');
  const [readingFor, setReadingFor] = useState<string | null>(null);

  const all = useMemo(
    () => data.meters.filter((m) => scoped.has(m.propertyId)).slice().sort((a, b) => a.meterNumber.localeCompare(b.meterNumber)),
    [data.meters, scoped],
  );
  const rows = type === 'all' ? all : all.filter((m) => m.type === type);

  const propName = (id: string) => data.properties.find((p) => p.id === id)?.name ?? '—';
  const unitCode = (id?: string) => id ? (data.units.find((u) => u.id === id)?.code ?? '—') : 'Common';
  const totalBillable = all.reduce((s, m) => s + billable(m), 0);
  const totalConsumption = all.filter((m) => m.type === 'electricity').reduce((s, m) => s + consumption(m), 0);

  const exportRows = rows.map((m) => ({
    Meter: m.meterNumber, Type: METER_META[m.type].label, Property: propName(m.propertyId), Unit: unitCode(m.unitId),
    Previous: m.previousReading, Current: m.currentReading, Consumption: consumption(m), Rate: m.ratePerUnit, Billable: billable(m),
  }));

  const columns: Column<Meter>[] = [
    { key: 'meter', header: 'Meter', sortValue: (m) => m.meterNumber, render: (m) => <div className="flex items-center gap-2.5"><span className={classNames('flex h-8 w-8 items-center justify-center rounded-lg', METER_META[m.type].tone)}>{METER_META[m.type].icon}</span><div><p className="font-semibold text-ink-800">{m.meterNumber}</p><p className="text-xs text-ink-400">{METER_META[m.type].label}</p></div></div> },
    { key: 'loc', header: 'Location', sortValue: (m) => propName(m.propertyId), render: (m) => <div><p className="text-sm text-ink-700">{unitCode(m.unitId) === 'Common' ? 'Common area' : `Unit ${unitCode(m.unitId)}`}</p><p className="text-xs text-ink-400">{propName(m.propertyId)}</p></div> },
    { key: 'reading', header: 'Current reading', align: 'right', sortValue: (m) => m.currentReading, render: (m) => <div><p className="font-medium text-ink-800">{m.currentReading.toLocaleString()} <span className="text-xs text-ink-400">{m.unitOfMeasure}</span></p><p className="text-xs text-ink-400">was {m.previousReading.toLocaleString()}</p></div> },
    { key: 'cons', header: 'Consumption', align: 'right', sortValue: (m) => consumption(m), render: (m) => <span className="font-semibold text-ink-700">{consumption(m).toLocaleString()} {m.unitOfMeasure}</span> },
    { key: 'bill', header: 'Billable', align: 'right', sortValue: (m) => billable(m), render: (m) => <Money value={billable(m)} className="font-semibold" /> },
  ];

  return (
    <div>
      <PageHeader title="Utilities & Meters" subtitle="Track consumption and bill tenants accurately"
        actions={<ExportMenu filename="meters" title="Utility meters" rows={exportRows} size="md" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Meters" value={all.length} icon={<Gauge className="h-5 w-5" />} tone="blue" />
        <StatCard label="Electricity used" value={`${totalConsumption.toLocaleString()} kWh`} icon={<Zap className="h-5 w-5" />} tone="amber" />
        <StatCard label="Billable this cycle" value={<Money value={totalBillable} compact />} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <StatCard label="Meter types" value={new Set(all.map((m) => m.type)).size} icon={<Activity className="h-5 w-5" />} tone="purple" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TYPE_FILTERS.map((f) => (
          <Chip key={f.key} active={type === f.key} onClick={() => setType(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', type === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((m) => m.type === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(m) => m.id}
          onRowClick={can(user?.role, 'edit') ? (m) => setReadingFor(m.id) : undefined}
          searchable searchAccessor={(m) => `${m.meterNumber} ${METER_META[m.type].label} ${propName(m.propertyId)}`} searchPlaceholder="Search meters…"
          initialSort={{ key: 'meter', dir: 'asc' }}
          toolbar={can(user?.role, 'edit') ? <span className="text-xs text-ink-400">Click a meter to log a reading</span> : undefined} />
      </Card>

      {readingFor && <ReadingModal meterId={readingFor} onClose={() => setReadingFor(null)} />}
    </div>
  );
}

function ReadingModal({ meterId, onClose }: { meterId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const m = data.meters.find((x) => x.id === meterId);
  const [value, setValue] = useState(m?.currentReading ?? 0);
  const [date, setDate] = useState(TODAY);
  if (!m) return null;

  const newConsumption = Math.max(0, value - m.currentReading);
  const submit = () => {
    if (value < m.currentReading) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'New reading cannot be below the current reading.' })); return; }
    dispatch(dataActions.addMeterReading({ meterId: m.id, value: Number(value), date }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Reading logged for ${m.meterNumber}.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Log reading · ${m.meterNumber}`} subtitle={METER_META[m.type].label} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Log reading</button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-ink-50 p-3 text-sm">
          <span className="text-ink-500">Current reading</span>
          <span className="font-semibold text-ink-800">{m.currentReading.toLocaleString()} {m.unitOfMeasure}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`New reading (${m.unitOfMeasure})`}><Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <span className="text-ink-600">Consumption · {newConsumption.toLocaleString()} {m.unitOfMeasure} @ ₦{m.ratePerUnit}/{m.unitOfMeasure}</span>
          <Money value={newConsumption * m.ratePerUnit} className="font-bold text-brand-700" />
        </div>
        {m.history.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Recent readings</p>
            <div className="space-y-1">
              {m.history.slice(-4).reverse().map((h, i) => (
                <div key={i} className="flex items-center justify-between text-sm"><span className="text-ink-500">{formatDate(h.date)}</span><span className="text-ink-700">{h.value.toLocaleString()} {m.unitOfMeasure}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
