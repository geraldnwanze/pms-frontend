'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { bootstrap } from '@/store/thunks';
import { pushToast } from '@/store/uiSlice';
import { Modal, Money } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { uid } from '@/lib/format';
import type { BulkBillResult } from '@/types';

const n = (v: number) => v.toLocaleString('en-NG', { maximumFractionDigits: 3 });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * "Bill all ready meters": asks the server what is ready (a dry run, so nothing changes), shows who would be billed
 * for what, and raises the invoices only when the person confirms.
 */
export function BulkBillModal({ propertyIds, onClose, onBilled }: { propertyIds: string[]; onClose: () => void; onBilled?: () => void }) {
  const dispatch = useAppDispatch();
  const [preview, setPreview] = useState<BulkBillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);

  useEffect(() => {
    let live = true;
    api.billAllMeters({ propertyIds, dryRun: true })
      .then((r) => live && setPreview(r))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Could not check what is ready to bill.'));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    setBilling(true);
    try {
      const r = await api.billAllMeters({ propertyIds });
      dispatch(pushToast({
        id: uid('t'),
        kind: r.invoices === 0 ? 'info' : 'success',
        message: r.invoices === 0 ? 'Nothing was ready to bill.' : `${plural(r.invoices, 'utility invoice')} issued, ₦${r.total.toLocaleString('en-NG')} in all.`,
      }));
      void dispatch(bootstrap());
      onBilled?.();
      onClose();
    } catch (e) {
      setBilling(false);
      dispatch(pushToast({ id: uid('t'), kind: 'error', message: e instanceof ApiError ? e.message : 'Could not issue the bills.' }));
    }
  };

  const ready = preview && preview.units.length > 0;

  return (
    <Modal open onClose={onClose} title="Bill all ready meters" subtitle="One utility invoice per unit, to the tenant who holds it now" size="lg"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={billing}>Cancel</button>
        {ready && <button className="btn-primary" onClick={confirm} disabled={billing}>{billing ? 'Billing…' : `Bill ${plural(preview.invoices || preview.units.length, 'invoice')} · ₦${preview.total.toLocaleString('en-NG')}`}</button>}
      </>}>
      {!preview && !error && <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking what is ready…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="space-y-4">
          {ready ? (
            <>
              <div data-testid="bulk-summary" className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
                <span className="text-ink-600">{plural(preview.units.length, 'invoice')} · {plural(preview.meters, 'meter')}</span>
                <Money value={preview.total} className="font-bold text-emerald-700" />
              </div>
              <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                {preview.units.map((u) => (
                  <li key={u.unitId} data-testid="bulk-unit" className="p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold text-ink-800">Unit {u.unitCode ?? u.unitId}{u.propertyName && <span className="font-normal text-ink-500"> · {u.propertyName}</span>}</p><p className="text-xs text-ink-500">{u.tenantName ?? 'Tenant'}{u.leaseCode ? ` · ${u.leaseCode}` : ''}{u.final && <span data-testid="final-chip" className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Final bill · moved out</span>}</p></div>
                      <Money value={u.total} className="font-semibold text-ink-800" />
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-ink-500">
                      {u.meters.map((m) => (
                        <li key={m.meterId} className="flex justify-between gap-3">
                          <span>{m.meterNumber} · {n(m.from)} → {n(m.to)} {m.unitOfMeasure} · {n(m.units)} × ₦{n(m.rate)}</span>
                          <span className="text-ink-700">₦{m.amount.toLocaleString('en-NG')}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p data-testid="bulk-empty" className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm text-ink-500">{preview.skipped.length > 0 ? 'Nothing can be billed right now. See below for why.' : 'Nothing is ready to bill: every meter has been billed up to its latest reading.'}</p>
          )}

          {preview.skipped.length > 0 && (
            <div data-testid="bulk-skipped" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Not billed</p>
              <ul className="space-y-0.5 text-xs text-ink-600">
                {preview.skipped.map((s, i) => <li key={i}>{s.unitCode ? `Unit ${s.unitCode}${s.propertyName ? ` (${s.propertyName})` : ''}: ` : ''}{s.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
