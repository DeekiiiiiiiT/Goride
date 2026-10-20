import { describe, expect, it } from 'vitest';
import { classifyFuelImportRow, fuelReceiptKey } from './reconFuelImport.ts';

describe('fuelReceiptKey', () => {
  it('reads jaaReceiptNumber from metadata', () => {
    expect(fuelReceiptKey({ metadata: { jaaReceiptNumber: 'zz123' } })).toBe('ZZ123');
  });
});

describe('classifyFuelImportRow', () => {
  const receipts = new Set(['ZZ1']);

  it('flags duplicate receipt', () => {
    expect(
      classifyFuelImportRow(
        { date: '2026-10-06', metadata: { jaaReceiptNumber: 'ZZ1' } },
        receipts,
        { selectedWeekKey: '2026-10-05' },
      ),
    ).toBe('duplicate_receipt');
  });

  it('flags spill outside selected week', () => {
    expect(
      classifyFuelImportRow({ date: '2026-10-20', metadata: {} }, receipts, {
        selectedWeekKey: '2026-10-05',
      }),
    ).toBe('spill');
  });

  it('accepts new row in week', () => {
    expect(
      classifyFuelImportRow({ date: '2026-10-07', metadata: { jaaReceiptNumber: 'ZZ9' } }, receipts, {
        selectedWeekKey: '2026-10-05',
      }),
    ).toBe('new');
  });
});
