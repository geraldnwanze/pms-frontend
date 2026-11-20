import type { InvoiceLineItem, Meter } from '@/types';

const n = (v: number) => v.toLocaleString('en-NG', { maximumFractionDigits: 3 });

/**
 * The description of an invoice line as it is printed on the PDF. A utility line gets a second line saying which
 * readings were billed ("Read 129 to 137 kg"); "to" rather than an arrow because the PDF's font cannot draw arrows.
 */
export function pdfLineDescription(item: Pick<InvoiceLineItem, 'description' | 'meterId' | 'fromReading' | 'toReading'>, meters: Pick<Meter, 'id' | 'unitOfMeasure'>[]): string {
  if (!item.meterId || item.fromReading == null || item.toReading == null) return item.description;
  const unit = meters.find((m) => m.id === item.meterId)?.unitOfMeasure;
  return `${item.description}\nRead ${n(item.fromReading)} to ${n(item.toReading)}${unit ? ` ${unit}` : ''}`;
}
