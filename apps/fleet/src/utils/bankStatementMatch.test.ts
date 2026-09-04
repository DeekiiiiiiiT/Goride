import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  parseLooseDateToYmd,
  parseLooseAmount,
  guessColumnMap,
  mapCsvRowsToLines,
  suggestBankMatches,
  findAlreadyConfirmedBankLines,
} from './bankStatementMatch';
import type { FleetBankReceiveRow } from './fleetBankReceive';

function row(
  partial: Partial<FleetBankReceiveRow> & Pick<FleetBankReceiveRow, 'weekStartYmd' | 'expected' | 'status'>,
): FleetBankReceiveRow {
  return {
    amountReceived: null,
    variance: null,
    platform: 'uber',
    confirmMethod: null,
    bankDateYmd: null,
    statementFileName: null,
    ...partial,
  };
}

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
      row({
        weekStartYmd: '2026-06-29',
        expected: 48168.32,
        status: 'unconfirmed',
      }),
    ];
    const suggestions = suggestBankMatches(lines, expected);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].target.weekStartYmd).toBe('2026-06-29');
    expect(suggestions[0].line.amount).toBeCloseTo(48168.32, 2);
    expect(suggestions[0].target.expected).toBe(48168.32);
  });

  it('does not match confirmed expected rows as new suggestions', () => {
    const lines = mapCsvRowsToLines(
      [['2026-07-01', '100']],
      { date: 0, amount: 1, description: null },
      false,
    );
    const suggestions = suggestBankMatches(lines, [
      row({
        weekStartYmd: '2026-06-29',
        expected: 100,
        amountReceived: 100,
        variance: 0,
        status: 'confirmed',
        confirmMethod: 'manual',
      }),
    ]);
    expect(suggestions).toHaveLength(0);
  });

  it('flags June statement lines already confirmed (duplicate guard)', () => {
    // Real june.PDF Uber credits vs fleet_bank_confirmations already accepted
    const lines = [
      { lineIndex: 0, dateYmd: '2026-06-02', amount: 50285.05, description: 'UBER BV', raw: [] },
      { lineIndex: 1, dateYmd: '2026-06-09', amount: 40192.89, description: 'UBER BV', raw: [] },
      { lineIndex: 2, dateYmd: '2026-06-16', amount: 13689.21, description: 'UBER BV', raw: [] },
      { lineIndex: 3, dateYmd: '2026-06-25', amount: 35957.56, description: 'UBER BV', raw: [] },
      { lineIndex: 4, dateYmd: '2026-06-30', amount: 22710.94, description: 'UBER BV', raw: [] },
    ];
    const expected: FleetBankReceiveRow[] = [
      row({
        weekStartYmd: '2026-05-25',
        expected: 50285.05,
        amountReceived: 50285.05,
        variance: 0,
        status: 'confirmed',
        confirmMethod: 'statement',
        bankDateYmd: '2026-06-02',
        statementFileName: 'june.PDF',
      }),
      row({
        weekStartYmd: '2026-06-01',
        expected: 40192.89,
        amountReceived: 40192.89,
        variance: 0,
        status: 'confirmed',
        confirmMethod: 'statement',
        bankDateYmd: '2026-06-09',
        statementFileName: 'june.PDF',
      }),
      row({
        weekStartYmd: '2026-06-22',
        expected: 22710.94,
        amountReceived: 22710.94,
        variance: 0,
        status: 'confirmed',
        confirmMethod: 'statement',
        bankDateYmd: '2026-06-30',
        statementFileName: 'june.PDF',
      }),
      // Unmixed Uber expected (Roam card is a separate row — not summed here)
      row({
        weekStartYmd: '2026-06-08',
        expected: 13689.21,
        status: 'unconfirmed',
      }),
      row({
        weekStartYmd: '2026-06-08',
        expected: 1248.98,
        status: 'unconfirmed',
        platform: 'roam',
      }),
      row({
        weekStartYmd: '2026-06-15',
        expected: 35957.56,
        status: 'unconfirmed',
      }),
      row({
        weekStartYmd: '2026-06-15',
        expected: 4021.67,
        status: 'unconfirmed',
        platform: 'roam',
      }),
    ];

    const already = findAlreadyConfirmedBankLines(lines, expected);
    expect(already.map((h) => [h.line.dateYmd, h.line.amount])).toEqual([
      ['2026-06-02', 50285.05],
      ['2026-06-09', 40192.89],
      ['2026-06-30', 22710.94],
    ]);

    const alreadyIdx = new Set(already.map((h) => h.line.lineIndex));
    const open = lines.filter((l) => !alreadyIdx.has(l.lineIndex));
    const suggestions = suggestBankMatches(open, expected);
    expect(suggestions.map((s) => [s.line.amount, s.target.weekStartYmd, s.target.platform])).toEqual([
      [13689.21, '2026-06-08', 'uber'],
      [35957.56, '2026-06-15', 'uber'],
    ]);
  });
});
