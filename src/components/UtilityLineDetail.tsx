'use client';

import { Gauge } from 'lucide-react';
import { Link } from '@/lib/router';
import { useAppSelector } from '@/store/hooks';
import { selectData } from '@/store/selectors';
import type { InvoiceLineItem } from '@/types';

/**
 * Under a utility line on an invoice: the readings that were billed and a link to the meter they came from
 * (the tenant's Utilities page, or the meter itself for staff). Nothing for other lines, or if the meter is gone.
 */
export function UtilityLineDetail({ item, staff }: { item: InvoiceLineItem; staff: boolean }) {
  const meter = useAppSelector(selectData).meters.find((m) => m.id === item.meterId);
  if (!item.meterId) return null;
  const n = (v: number) => v.toLocaleString('en-NG', { maximumFractionDigits: 3 });
  const to = `${staff ? '/utilities' : '/portal/utilities'}?meter=${encodeURIComponent(item.meterId)}`;
  const range = item.fromReading != null && item.toReading != null;
  // A tenant who has moved out can no longer see the meter, but their final bill still shows the readings it was based on.
  if (!meter && !range) return null;

  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
      {range && <span>Read {n(item.fromReading!)} → {n(item.toReading!)}{meter ? ` ${meter.unitOfMeasure}` : ''}</span>}
      {meter && <Link to={to} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"><Gauge className="h-3 w-3" />See readings</Link>}
    </p>
  );
}
