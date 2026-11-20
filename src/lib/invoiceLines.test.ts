import { describe, expect, it } from 'vitest';
import { pdfLineDescription } from './invoiceLines';

const meters = [{ id: 'm1', unitOfMeasure: 'm³' }];

describe('pdfLineDescription', () => {
  it('adds the billed readings under a utility line', () => {
    expect(pdfLineDescription({ description: 'Water W1: 14 m³ × ₦350.00', meterId: 'm1', fromReading: 200.5, toReading: 214.5 }, meters))
      .toBe('Water W1: 14 m³ × ₦350.00\nRead 200.5 to 214.5 m³');
  });

  it('uses plain words, since the PDF font cannot draw an arrow', () => {
    expect(pdfLineDescription({ description: 'x', meterId: 'm1', fromReading: 1, toReading: 2 }, meters)).not.toContain('→');
  });

  it('still shows the readings when the meter is gone, just without a unit', () => {
    expect(pdfLineDescription({ description: 'Gas', meterId: 'gone', fromReading: 129, toReading: 1137 }, meters)).toBe('Gas\nRead 129 to 1,137');
  });

  it('leaves every other line as it was', () => {
    expect(pdfLineDescription({ description: 'Rent' }, meters)).toBe('Rent');
    expect(pdfLineDescription({ description: 'Water', meterId: 'm1' }, meters)).toBe('Water');
  });
});
