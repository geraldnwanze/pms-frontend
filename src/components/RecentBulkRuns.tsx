'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Card, Money } from '@/components/ui';
import { api } from '@/lib/api';
import { fromNow, formatDateTime } from '@/lib/format';
import type { BulkBillRun } from '@/types';

const SHOWN = 5;

/**
 * The latest "Bill all ready" runs, for the people who may bill. Managers cannot open the audit trail, so this is where
 * they can see what was billed, by whom and when. Shows nothing until there has been a run (or if it cannot be loaded).
 */
export function RecentBulkRuns({ propertyIds, refreshKey = 0 }: { propertyIds: string[]; refreshKey?: number }) {
  const [runs, setRuns] = useState<BulkBillRun[]>([]);

  useEffect(() => {
    let live = true;
    api.billRuns(20).then((r) => live && setRuns(r)).catch(() => live && setRuns([]));
    return () => { live = false; };
  }, [refreshKey]);

  const rows = runs.filter((r) => propertyIds.includes(r.propertyId)).slice(0, SHOWN);
  if (rows.length === 0) return null;

  return (
    <div data-testid="recent-bulk-runs">
    <Card className="mb-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400"><History className="h-3.5 w-3.5" /> Recent bulk bills</p>
      <ul className="divide-y divide-ink-100 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2">
            <div>
              <p className="font-medium text-ink-800">{r.propertyName ?? 'Property'} · {r.invoices} invoice{r.invoices === 1 ? '' : 's'}{r.unitsSkipped > 0 && <span className="font-normal text-ink-500"> · {r.unitsSkipped} unit{r.unitsSkipped === 1 ? '' : 's'} skipped</span>}</p>
              <p className="text-xs text-ink-500" title={formatDateTime(r.createdAt)}>{r.userName ?? 'Someone'} · {fromNow(r.createdAt)}</p>
            </div>
            <Money value={r.total} className="font-semibold text-ink-800" />
          </li>
        ))}
      </ul>
    </Card>
    </div>
  );
}
