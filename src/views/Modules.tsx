'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, Badge, ConfirmDialog, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectModules } from '@/store/selectors';
import { setModuleEnabled } from '@/store/thunks';
import type { ModuleInfo, ModuleKey } from '@/config/modules';

/** Superadmin only: which platform modules are on. Core features (properties, tenants, leases, invoices, payments, users) are always on. */
export function Modules() {
  const dispatch = useAppDispatch();
  const states = useAppSelector(selectModules);
  const [rows, setRows] = useState<ModuleInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<ModuleKey | null>(null);
  const [confirming, setConfirming] = useState<{ row: ModuleInfo; alsoOff: ModuleInfo[] } | null>(null);

  const load = useCallback(() => {
    api.modules().then((r) => { setRows(r); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  // Reload the descriptions whenever the states change (a switch reloads the store, which reports the new states).
  useEffect(load, [load, states]);

  const label = (key: ModuleKey) => rows?.find((r) => r.key === key)?.label ?? key;

  const apply = async (row: ModuleInfo, enabled: boolean, cascade: boolean) => {
    setBusy(row.key);
    const result = await dispatch(setModuleEnabled(row.key, enabled, cascade));
    setBusy(null);
    if (!result.ok && result.dependents) {
      // The server knows of dependents we did not (a change from elsewhere): ask again with them listed.
      setConfirming({ row, alsoOff: (rows ?? []).filter((r) => r.enabled && row.dependents.includes(r.key)) });
    }
    load();
  };

  const toggle = (row: ModuleInfo) => {
    if (busy) return;
    if (row.enabled) {
      const alsoOff = (rows ?? []).filter((r) => r.enabled && row.dependents.includes(r.key));
      if (alsoOff.length > 0) { setConfirming({ row, alsoOff }); return; }
      void apply(row, false, false);
    } else {
      void apply(row, true, false);
    }
  };

  return (
    <>
      <PageHeader title="Modules" subtitle="Switch features on or off for the whole platform. A module that is off disappears from the app, refuses requests and stops its scheduled work. Nothing is deleted." />

      {failed && <p role="alert" className="mb-4 text-sm text-red-600">Couldn’t load the modules. Try again in a moment.</p>}
      {!rows && !failed && <p className="text-sm text-ink-400">Loading…</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows?.map((row) => {
          const off = !row.enabled;
          const blocked = off && row.requires.some((k) => rows.find((r) => r.key === k)?.enabled === false);
          return (
            <div key={row.key} data-testid="module-card">
            <Card className={off ? 'bg-ink-50' : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink-800">{row.label}</p>
                  {off ? <Badge tone="gray">Off</Badge> : <Badge tone="green" dot>On</Badge>}
                </div>
                <button
                  type="button" role="switch" aria-checked={row.enabled} aria-label={`${row.label} module`}
                  // While a change is going through the switches only *look* disabled: a really-disabled control drops keyboard focus, and the
                  // person using the keyboard would be thrown back to the top of the page after every switch.
                  disabled={blocked}
                  aria-disabled={busy !== null || blocked}
                  onClick={() => toggle(row)}
                  // On a phone the switch is bigger, and its tap area reaches 44px tall without making the card any taller (the extra is invisible).
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60 sm:h-6 sm:w-11 sm:before:hidden ${row.enabled ? 'bg-brand-600' : 'bg-ink-300'}`}
                >
                  <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform sm:h-5 sm:w-5 ${row.enabled ? 'translate-x-[30px] sm:translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <p className="mt-3 text-sm text-ink-500">{row.description}</p>
              {row.requires.length > 0 && <p className="mt-2 text-xs text-ink-400">Needs {row.requires.map(label).join(', ')}{blocked ? ' — turn that on first.' : '.'}</p>}
              {row.dependents.length > 0 && <p className="mt-2 text-xs text-ink-400">Also used by {row.dependents.map(label).join(', ')}.</p>}
            </Card>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => { if (confirming) void apply(confirming.row, false, true); }}
        title={confirming ? `Turn off ${confirming.row.label}?` : ''}
        confirmLabel="Turn off"
        danger
        message={confirming ? <>This also turns off {confirming.alsoOff.map((r) => r.label).join(', ') || 'the modules that need it'}, because {confirming.alsoOff.length === 1 ? 'it needs' : 'they need'} {confirming.row.label}. Their data is kept.</> : ''}
      />
    </>
  );
}
