'use client';

import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData } from '@/store/selectors';
import { bootstrap } from '@/store/thunks';
import { pushToast } from '@/store/uiSlice';
import { Modal, Money } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { today, uid } from '@/lib/format';
import type { Lease, Meter } from '@/types';

const RUNNING = ['active', 'expiring', 'renewed'];
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 3 });

/**
 * Ending a tenancy. Staff enter the closing meter readings taken at move-out, see the final utility bill those produce, and
 * confirm: the server saves the readings and ends the lease in one step, then bills the use up to those readings to the leaving
 * tenant. A reading left as it is bills only what has already been read.
 */
export function TerminateLeaseModal({ lease, unitCode, tenantName, onClose }: { lease: Lease; unitCode?: string; tenantName?: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const meters = useMemo(
    () => data.meters.filter((m) => m.unitId === lease.unitId).slice().sort((a, b) => a.meterNumber.localeCompare(b.meterNumber)),
    [data.meters, lease.unitId],
  );
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(meters.map((m) => [m.id, String(m.currentReading)])));
  const [busy, setBusy] = useState(false);

  // Someone else already living in the unit: their use and the leaver's cannot be told apart, so no final bill is raised.
  const now = today();
  const heldByOther = data.leases.some((l) => l.unitId === lease.unitId && l.id !== lease.id && RUNNING.includes(l.status) && l.startDate <= now && l.endDate >= now);

  const lines = meters.map((m: Meter) => {
    const typed = Number(values[m.id]);
    const valid = values[m.id] !== '' && Number.isFinite(typed) && typed >= m.currentReading;
    const closing = valid ? typed : m.currentReading;
    const from = m.billedReading ?? m.previousReading;
    const units = Math.max(0, round3(closing - from));
    const priced = m.ratePerUnit > 0;
    return { meter: m, typed, valid, closing, from, units, priced, amount: valid && priced ? Math.round(units * m.ratePerUnit) : 0, changed: valid && typed > m.currentReading };
  });
  const invalid = lines.some((l) => !l.valid);
  // While a reading is wrong the bill cannot be known, so nothing is totalled until it is fixed.
  const total = heldByOther || invalid ? 0 : lines.reduce((s, l) => s + l.amount, 0);
  const readings = lines.filter((l) => l.changed).map((l) => ({ meterId: l.meter.id, value: l.typed }));

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.terminateLease(lease.id, readings);
      const bill = r.meta?.finalBill;
      dispatch(pushToast({
        id: uid('t'), kind: 'success',
        message: `${lease.code} terminated.${bill ? ` Final utility bill ${bill.code} for ₦${bill.total.toLocaleString('en-NG')} raised.` : ''}`,
      }));
      void dispatch(bootstrap());
      onClose();
    } catch (e) {
      setBusy(false);
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: e instanceof ApiError ? e.message : 'Could not terminate the lease.' }));
    }
  };

  return (
    <Modal open onClose={onClose} title="Terminate this lease?" subtitle={`${lease.code}${unitCode ? ` · Unit ${unitCode}` : ''}`} size="md"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-danger" onClick={confirm} disabled={busy || invalid}>{busy ? 'Terminating…' : total > 0 ? `Terminate & bill ₦${total.toLocaleString('en-NG')}` : 'Terminate lease'}</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">{lease.code} will be ended and the unit released back to available. This can&apos;t be undone.</p>

        {meters.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Closing readings</p>
            <p className="mb-2 text-xs text-ink-500">Enter what each meter reads now. The use from the last bill up to these readings is billed to {tenantName ?? 'the tenant'} as their final utility bill.</p>
            <ul data-testid="closing-meters" className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {lines.map((l) => (
                <li key={l.meter.id} data-testid="closing-meter" className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`closing-${l.meter.id}`} className="font-medium text-ink-800">{l.meter.meterNumber} <span className="font-normal capitalize text-ink-400">· {l.meter.type}</span></label>
                    <div className="flex items-center gap-2">
                      <input id={`closing-${l.meter.id}`} type="number" step="any" min={l.meter.currentReading} value={values[l.meter.id]} aria-invalid={!l.valid}
                        onChange={(e) => setValues((v) => ({ ...v, [l.meter.id]: e.target.value }))}
                        className={`w-28 rounded-lg border bg-white px-2.5 py-1.5 text-right text-sm text-ink-800 ${l.valid ? 'border-ink-200' : 'border-red-400'}`} />
                      <span className="w-8 text-xs text-ink-400">{l.meter.unitOfMeasure}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-ink-500">
                    <span>
                      {!l.valid
                        ? <span className="text-red-600">Not below the current reading ({num(l.meter.currentReading)} {l.meter.unitOfMeasure}).</span>
                        : !l.priced && l.units > 0
                          ? <span className="text-amber-700">No rate is set, so this meter&apos;s use cannot be billed.</span>
                          : <>{num(l.from)} → {num(l.closing)} {l.meter.unitOfMeasure} · {num(l.units)} × ₦{l.meter.ratePerUnit.toLocaleString('en-NG')}</>}
                    </span>
                    <span className="font-medium text-ink-700">{l.valid ? `₦${l.amount.toLocaleString('en-NG')}` : '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div data-testid="final-bill-summary" className={`flex items-center justify-between rounded-lg border p-3 text-sm ${total > 0 ? 'border-amber-200 bg-amber-50/60' : 'border-ink-200 bg-ink-50'}`}>
          {heldByOther
            ? <span className="text-ink-600">Someone else already holds this unit, so no final utility bill is raised.</span>
            : invalid
              ? <span className="text-red-700">Correct the highlighted reading to see the final utility bill.</span>
              : total > 0
              ? <><span className="text-ink-700">Final utility bill to {tenantName ?? 'the tenant'}</span><Money value={total} className="font-bold text-amber-800" /></>
              : <span className="text-ink-600">{meters.length ? 'No utility use is waiting to be billed.' : 'There are no meters on this unit, so no final utility bill.'}</span>}
        </div>
      </div>
    </Modal>
  );
}
