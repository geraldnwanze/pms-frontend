'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Gauge, Plus, Zap, Droplet, Flame, Activity, TrendingUp, Receipt } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Money, Chip, DataTable, type Column, ExportMenu,
  Modal, Field, Input,
} from '@/components/ui';
import { unbilledUnits } from '@/lib/deposit';
import { billPreview, canManageMeters } from '@/lib/usage';
import { BulkBillModal } from '@/components/BulkBillModal';
import { RecentBulkRuns } from '@/components/RecentBulkRuns';
import { formatDate, today, uid, classNames } from '@/lib/format';
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

// What has been read since the tenant was last billed (a never-billed meter starts from its previous reading).
const consumption = (m: Meter) => unbilledUnits(m);
const billable = (m: Meter) => Math.round(consumption(m) * m.ratePerUnit);

export function Utilities() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const [type, setType] = useState<MeterType | 'all'>('all');
  const [bulk, setBulk] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  // An invoice's "See readings" link arrives as ?meter=<id> and opens that meter.
  const wanted = useSearchParams()?.get('meter') ?? null;
  const [readingFor, setReadingFor] = useState<string | null>(wanted && data.meters.some((m) => m.id === wanted) ? wanted : null);

  const all = useMemo(
    () => data.meters.filter((m) => scoped.has(m.propertyId)).slice().sort((a, b) => a.meterNumber.localeCompare(b.meterNumber)),
    [data.meters, scoped],
  );
  const rows = type === 'all' ? all : all.filter((m) => m.type === type);

  // The server decides who may bill meters; the button mirrors that, and the count is a hint.
  const canManage = canManageMeters(user?.role);
  // A meter is ready when it could be billed to someone today: priced, with use since the last bill and a tenant in the unit.
  const readyCount = all.filter((m) => billPreview(m, data.leases, data.tenants, today()).ok).length;

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
    { key: 'reading', header: 'Current reading', align: 'right', sortValue: (m) => m.currentReading, render: (m) => <div><p className="font-medium text-ink-800">{m.currentReading.toLocaleString()} <span className="text-xs text-ink-400">{m.unitOfMeasure}</span></p><p className="text-xs text-ink-400">billed to {(m.billedReading ?? m.previousReading).toLocaleString()}</p></div> },
    { key: 'cons', header: 'Unbilled use', align: 'right', sortValue: (m) => consumption(m), render: (m) => <span className="font-semibold text-ink-700">{consumption(m).toLocaleString()} {m.unitOfMeasure}</span> },
    { key: 'bill', header: 'Billable', align: 'right', sortValue: (m) => billable(m), render: (m) => <Money value={billable(m)} className="font-semibold" /> },
  ];

  return (
    <div>
      <PageHeader title="Utilities & Meters" subtitle="Track consumption and bill tenants accurately"
        actions={<>
          {canManage && readyCount > 0 && <button className="btn-primary" onClick={() => setBulk(true)}><Receipt className="h-4 w-4" /> Bill all ready ({readyCount})</button>}
          <ExportMenu filename="meters" title="Utility meters" rows={exportRows} size="md" />
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Meters" value={all.length} icon={<Gauge className="h-5 w-5" />} tone="blue" />
        <StatCard label="Unbilled electricity" value={`${totalConsumption.toLocaleString()} kWh`} icon={<Zap className="h-5 w-5" />} tone="amber" />
        <StatCard label="Waiting to be billed" value={<Money value={totalBillable} compact />} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <StatCard label="Meter types" value={new Set(all.map((m) => m.type)).size} icon={<Activity className="h-5 w-5" />} tone="purple" />
      </div>

      {canManage && <RecentBulkRuns propertyIds={Array.from(scoped)} refreshKey={runsKey} />}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TYPE_FILTERS.map((f) => (
          <Chip key={f.key} active={type === f.key} onClick={() => setType(f.key)}>
            {f.label}{f.key !== 'all' && <span className={classNames('ml-1', type === f.key ? 'text-white/80' : 'text-ink-400')}>{all.filter((m) => m.type === f.key).length}</span>}
          </Chip>
        ))}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(m) => m.id}
          onRowClick={(m) => setReadingFor(m.id)}
          searchable searchAccessor={(m) => `${m.meterNumber} ${METER_META[m.type].label} ${propName(m.propertyId)}`} searchPlaceholder="Search meters…"
          initialSort={{ key: 'meter', dir: 'asc' }}
          toolbar={<span className="text-xs text-ink-400">{canManage ? 'Click a meter to log a reading or bill the tenant' : 'Click a meter to see its readings'}</span>} />
      </Card>

      {bulk && <BulkBillModal propertyIds={Array.from(scoped)} onClose={() => setBulk(false)} onBilled={() => setRunsKey((k) => k + 1)} />}
      {readingFor && <ReadingModal meterId={readingFor} onClose={() => setReadingFor(null)} />}
    </div>
  );
}

export function ReadingModal({ meterId, onClose }: { meterId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const data = useAppSelector(selectData);
  const m = data.meters.find((x) => x.id === meterId);
  const [value, setValue] = useState(m?.currentReading ?? 0);
  const [date, setDate] = useState(today());
  if (!m) return null;

  const mayManage = canManageMeters(user?.role);
  // A reading typed above the current one is previewed as if it were logged: "Log & bill" does both, in that order.
  const typed = Number(value);
  const ahead = Number.isFinite(typed) && typed > m.currentReading;
  // What the typed reading adds on top of the current one; the invoice card below prices everything since the last bill.
  const added = ahead ? Math.round((typed - m.currentReading) * 1000) / 1000 : 0;
  const preview = billPreview(ahead ? { ...m, currentReading: typed } : m, data.leases, data.tenants, today());
  const canBill = mayManage && preview.ok;
  const bill = () => {
    dispatch(dataActions.billMeter({ meterId: m.id, actorId: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Billing ${m.meterNumber} to the tenant.` }));
    onClose();
  };
  const logAndBill = () => {
    dispatch(dataActions.addMeterReading({ meterId: m.id, value: typed, date }));
    dispatch(dataActions.billMeter({ meterId: m.id, actorId: user!.id }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Reading logged and ${m.meterNumber} billed to the tenant.` }));
    onClose();
  };
  const submit = () => {
    if (value < m.currentReading) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'New reading cannot be below the current reading.' })); return; }
    dispatch(dataActions.addMeterReading({ meterId: m.id, value: Number(value), date }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `Reading logged for ${m.meterNumber}.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${mayManage ? 'Log reading' : 'Readings'} · ${m.meterNumber}`} subtitle={METER_META[m.type].label} size="sm"
      footer={!mayManage ? <button className="btn-secondary" onClick={onClose}>Done</button> : <><button className="btn-secondary" onClick={onClose}>Cancel</button>{canBill && <button className="btn-secondary" onClick={ahead ? logAndBill : bill}>{ahead ? 'Log & bill' : 'Bill'} ₦{preview.ok ? preview.total.toLocaleString('en-NG') : 0}{ahead ? '' : ' to tenant'}</button>}<button className="btn-primary" onClick={submit}>Log reading</button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-ink-50 p-3 text-sm">
          <span className="text-ink-500">Current reading</span>
          <span className="font-semibold text-ink-800">{m.currentReading.toLocaleString()} {m.unitOfMeasure}</span>
        </div>
        {!mayManage && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-ink-50 p-3"><p className="text-xs text-ink-400">Rate</p><p className="font-semibold text-ink-800">₦{m.ratePerUnit.toLocaleString('en-NG')} per {m.unitOfMeasure}</p></div>
            <div className="rounded-lg bg-ink-50 p-3"><p className="text-xs text-ink-400">Not yet billed</p><p className="font-semibold text-ink-800">{consumption(m).toLocaleString()} {m.unitOfMeasure}</p></div>
          </div>
        )}
        {mayManage && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={`New reading (${m.unitOfMeasure})`}><Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} /></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        )}
        {mayManage && ahead && (
          <div data-testid="reading-adds" className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
            <span className="text-ink-600">This reading adds {added.toLocaleString()} {m.unitOfMeasure} × ₦{m.ratePerUnit.toLocaleString('en-NG')}</span>
            <Money value={Math.round(added * m.ratePerUnit)} className="font-bold text-brand-700" />
          </div>
        )}
        {mayManage && <BillPreviewCard meter={m} preview={preview} typed={ahead} />}
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

/** What "Bill to tenant" would raise, shown before it is clicked (or why it cannot be billed). */
export function BillPreviewCard({ meter, preview, typed }: { meter: Meter; preview: ReturnType<typeof billPreview>; typed?: boolean }) {
  if (!preview.ok) {
    return (
      <div data-testid="bill-preview" className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm text-ink-500">
        <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Bill to tenant</p>
        {preview.reason}
        {typed && <span className="mt-1 block text-xs text-ink-400">This is for the reading you typed, not yet logged.</span>}
      </div>
    );
  }
  return (
    <div data-testid="bill-preview" className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">{typed ? 'Invoice if you log this reading and bill' : 'Invoice if billed now'}</p>
      {preview.final && <p data-testid="final-note" className="mb-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Final bill: {preview.tenantName} moved out{preview.endedOn ? ` on ${formatDate(preview.endedOn)}` : ''}. This is their last use.</p>}
      <div className="space-y-1">
        <div className="flex justify-between gap-3"><span className="text-ink-500">To</span><span className="text-right font-medium text-ink-800">{preview.tenantName} · {preview.leaseCode}</span></div>
        <div className="flex justify-between gap-3"><span className="text-ink-500">Due</span><span className="text-ink-800">{formatDate(preview.dueDate)}</span></div>
        <div className="flex justify-between gap-3">
          <span className="text-ink-500">{preview.from.toLocaleString()} → {preview.to.toLocaleString()} {meter.unitOfMeasure} · {preview.units.toLocaleString()} × ₦{preview.rate.toLocaleString('en-NG')}</span>
          <Money value={preview.total} className="font-bold text-emerald-700" />
        </div>
      </div>
    </div>
  );
}
