import { describe, expect, it } from 'vitest';
import { chargesFromStatementText, parseStatementCsv } from './statementCharges';

describe('statement charges', () => {
  it('reads a bank spreadsheet and skips money coming back', () => {
    const csv = [
      'Posted Date,Description,Amount',
      '11/10/2026,Domino\'s Half Way Tree,"1,410.00"',
      '12/10/2026,Payment thank you,-500.00',
    ].join('\n');
    expect(parseStatementCsv(csv)).toEqual([
      { postedOn: '2026-10-11', amountMinor: 141000, merchantText: "Domino's Half Way Tree" },
    ]);
  });

  it('reads a date and an amount out of statement text', () => {
    const charges = chargesFromStatementText('11/10/2026 DOMINOS J$1,410.00');
    expect(charges).toEqual([
      { postedOn: '2026-10-11', amountMinor: 141000, merchantText: 'DOMINOS' },
    ]);
  });

  it('finds nothing when a statement has no amounts', () => {
    expect(chargesFromStatementText('CIBC statement for October. No transactions.')).toEqual([]);
  });
});
