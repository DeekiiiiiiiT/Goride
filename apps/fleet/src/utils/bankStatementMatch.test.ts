import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  parseLooseDateToYmd,
  parseLooseAmount,
  guessColumnMap,
  mapCsvRowsToLines,
  suggestBankMatches,
} from './bankStatementMatch';
import type { FleetBankReceiveRow } from './fleetBankReceive';

describe('bankStatementMatch', () => {
  it('parses CSV with quoted commas', () => {
    const rows = parseCsvText('Date,Amount,Description\n2026-07-01,1000.50,"Pay, Kenny"\n');
    expect(rows[1][2]).toBe('Pay, Kenny');
    expect(parseLooseAmount('1,000.50')).toBe(1000.5);
    expect(parseLooseDateToYmd('07/01/2026')).toBe('2026-07-01');
  });

  it('maps columns and suggests match without confirming', () => {
    const csv = parseCsvText(
      'Posted,Credit,Narrative\n2026-07-01,48168.32,UBER KENNY\n2026-07-02,50.00,COFFEE\n',
    );
    const map = guessColumnMap(csv[0]);
    const lines = mapCsvRowsToLines(csv, map, true);
    expect(lines).toHaveLength(2);

    const expected: FleetBankReceiveRow[] = [
      {
        driverId: 'kenny',
        driverName: 'Kenny',
        weekStartYmd: '2026-06-29',
        expected: 48168.32,
        amountReceived: null,
        variance: null,
        status: 'unconfirmed',
      },
    ];
    const suggestions = suggestBankMatches(lines, expected);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].target.driverId).toBe('kenny');
    expect(suggestions[0].line.amount).toBeCloseTo(48168.32, 2);
    // Matching only suggests — Cash Returned untouched by design (no cash fields here)
    expect(suggestions[0].target.expected).toBe(48168.32);
  });

  it('does not match confirmed expected rows', () => {
    const lines = mapCsvRowsToLines(
      [['2026-07-01', '100']],
      { date: 0, amount: 1, description: null },
      false,
    );
    const suggestions = suggestBankMatches(lines, [
      {
        driverId: 'd1',
        driverName: 'D',
        weekStartYmd: '2026-06-29',
        expected: 100,
        amountReceived: 100,
        variance: 0,
        status: 'confirmed',
      },
    ]);
    expect(suggestions).toHaveLength(0);
  });
});
