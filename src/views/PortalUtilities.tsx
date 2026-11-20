'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Gauge, Zap, Droplet, Flame, Activity, Home, Info } from 'lucide-react';
import { useNavigate } from '@/lib/router';
import { useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser } from '@/store/selectors';
import { PageHeader, Card, SectionCard, Money, EmptyState } from '@/components/ui';
import { unbilledUnits } from '@/lib/deposit';
import { usagePeriods, unbilledCharge, unbilledChargeTotal } from '@/lib/usage';
import { formatDate, today, classNames } from '@/lib/format';
import type { Meter, MeterType } from '@/types';

const KIND: Record<MeterType, { label: string; icon: React.ReactNode; tone: string; bar: string }> = {
  electricity: { label: 'Electricity', icon: <Zap className="h-5 w-5" />, tone: 'text-amber-600 bg-amber-50', bar: 'bg-amber-400' },
  water: { label: 'Water', icon: <Droplet className="h-5 w-5" />, tone: 'text-blue-600 bg-blue-50', bar: 'bg-blue-400' },
  gas: { label: 'Gas', icon: <Flame className="h-5 w-5" />, tone: 'text-red-600 bg-red-50', bar: 'bg-red-400' },
  other: { label: 'Other', icon: <Activity className="h-5 w-5" />, tone: 'text-ink-600 bg-ink-100', bar: 'bg-ink-400' },
};
const ORDER: MeterType[] = ['electricity', 'water', 'gas', 'other'];

const num = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });

/** The tenant's own water, gas and electricity: what the meters read, what has been used since the last bill, and past use. */
export function PortalUtilities() {
  const navigate = useNavigate();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const highlight = useSearchParams()?.get('meter') ?? null;

  const { unit, meters, hadLease } = useMemo(() => {
    const tid = user?.tenantId ?? '';
    const leases = data.leases.filter((l) => l.tenantId === tid).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    // The unit they hold today: the server only shows a tenant the meters of that one (not of a unit they once rented).
    const now = today();
    const lease = leases.find((l) => ['active', 'expiring', 'renewed'].includes(l.status) && l.startDate <= now && l.endDate >= now);
    const unit = lease ? data.units.find((u) => u.id === lease.unitId) : undefined;
    const meters = unit
      ? data.meters.filter((m) => m.unitId === unit.id).slice().sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.meterNumber.localeCompare(b.meterNumber))
      : [];
    return { unit, meters, hadLease: leases.length > 0 };
  }, [data, user]);

  useEffect(() => {
    if (highlight) document.getElementById(`meter-${highlight}`)?.scrollIntoView?.({ block: 'center' });
  }, [highlight, meters.length]);

  if (!unit) {
    return (
      <div>
        <PageHeader title="Utilities" />
        <Card>
          {hadLease
            ? <EmptyState icon={<Home className="h-6 w-6" />} title="No current tenancy" description="Your lease has ended, so there are no meters to show. If that is a mistake, please contact your property manager." />
            : <EmptyState icon={<Home className="h-6 w-6" />} title="No tenancy linked" description="Your account isn't linked to a unit yet. Please contact your property manager." />}
        </Card>
      </div>
    );
  }

  const total = unbilledChargeTotal(meters);

  return (
    <div>
      <PageHeader title="Utilities" subtitle={`Your meters · Unit ${unit.code}`} />

      {meters.length === 0 ? (
        <Card><EmptyState icon={<Gauge className="h-6 w-6" />} title="No meters on your unit" description="There are no utility meters recorded for your unit." /></Card>
      ) : (
        <>
          <Card className="mb-5 bg-gradient-to-br from-brand-600 to-brand-700 text-white">
            <p className="text-sm font-medium text-white/80">Used since your last utility bill</p>
            <Money value={total} className="mt-1 text-3xl font-extrabold" />
            <p className="mt-1 text-xs text-white/70">An estimate at today&apos;s rates. It is added to your bills when your property manager bills the meters.</p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {meters.map((m) => <div key={m.id} id={`meter-${m.id}`}><MeterCard meter={m} charge={unbilledCharge(m)} highlighted={m.id === highlight} /></div>)}
          </div>

          <div className="mt-5 flex gap-3 rounded-xl border border-ink-200 p-4 text-sm text-ink-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Charges you have already been billed appear on <button className="font-medium text-brand-600 hover:underline" onClick={() => navigate('/portal/bills')}>Bills &amp; Invoices</button>. If a reading looks wrong, message your property manager.</p>
          </div>
        </>
      )}
    </div>
  );
}

function MeterCard({ meter: m, charge, highlighted }: { meter: Meter; charge: number; highlighted?: boolean }) {
  const kind = KIND[m.type];
  const used = unbilledUnits(m);
  const periods = usagePeriods(m);
  const peak = Math.max(1, ...periods.map((p) => p.units));

  return (
    <SectionCard
      className={highlighted ? 'ring-2 ring-brand-500' : undefined}
      title={<span className="flex items-center gap-2.5"><span className={classNames('flex h-9 w-9 items-center justify-center rounded-lg', kind.tone)}>{kind.icon}</span>{kind.label}</span>}
      subtitle={m.meterNumber}
    >
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-ink-400">Current reading</dt><dd className="font-semibold text-ink-800">{num(m.currentReading)} {m.unitOfMeasure}</dd></div>
        <div><dt className="text-xs text-ink-400">Rate</dt><dd className="font-semibold text-ink-800">₦{num(m.ratePerUnit)} per {m.unitOfMeasure}</dd></div>
        <div><dt className="text-xs text-ink-400">Used since last bill</dt><dd className="font-semibold text-ink-800">{num(used)} {m.unitOfMeasure}</dd></div>
        <div><dt className="text-xs text-ink-400">Not yet billed</dt><dd className="font-semibold text-ink-800"><Money value={charge} /></dd></div>
      </dl>
      <p className="mt-2 text-xs text-ink-400">{m.billedReading != null ? `Billed up to ${num(m.billedReading)} ${m.unitOfMeasure}${m.billedAt ? ` on ${formatDate(m.billedAt)}` : ''}` : 'Not billed yet'}</p>

      {periods.length > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Past use</p>
          <ul className="space-y-1.5">
            {periods.map((p, i) => (
              <li key={`${p.endDate ?? 'latest'}-${i}`} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-ink-500">{p.endDate ? formatDate(p.endDate) : 'Latest'}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><span className={classNames('block h-full rounded-full', kind.bar)} style={{ width: `${Math.max(4, (p.units / peak) * 100)}%` }} /></span>
                <span className="w-20 shrink-0 text-right font-medium text-ink-700">{num(p.units)} {m.unitOfMeasure}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
