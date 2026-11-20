import { describe, expect, it } from 'vitest';
import { pdfSafe } from './export';

describe('pdfSafe', () => {
  it('spells the naira sign out where the PDF fonts cannot draw it', () => {
    expect(pdfSafe('Amount (₦)')).toBe('Amount (NGN)');
    expect(pdfSafe('Rent (₦) per year')).toBe('Rent (NGN) per year');
  });

  it('puts a space between the currency and a figure', () => {
    expect(pdfSafe('₦1,520,000')).toBe('NGN 1,520,000');
    expect(pdfSafe('Total: ₦ 737,000')).toBe('Total: NGN  737,000');
    expect(pdfSafe('Paid ₦1,000 of ₦5,000')).toBe('Paid NGN 1,000 of NGN 5,000');
  });

  it('leaves everything else — text, numbers, other symbols — alone', () => {
    expect(pdfSafe('Harmony Gardens · Unit B06')).toBe('Harmony Gardens · Unit B06');
    expect(pdfSafe(1900000)).toBe(1900000);
    expect(pdfSafe('')).toBe('');
  });
});
