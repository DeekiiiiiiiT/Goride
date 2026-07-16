import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectSagicorFormat,
  isUberVisaAchDeposit,
  parseDmYToYmd,
  parseDayMonToYmd,
  parseSagicorStatementText,
} from './sagicorBankPdf';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('sagicorBankPdf', () => {
  it('detects Uber VISA ACH fingerprint with split U BER', () => {
    expect(
      isUberVisaAchDeposit(
        'ACH Clearing Deposit VISA PAYMENTS LI 075DCOO26153 2683 U BER BV CREDIT',
      ),
    ).toBe(true);
    expect(isUberVisaAchDeposit('ACH Clearing Deposit JMMB ADMIN')).toBe(false);
    expect(isUberVisaAchDeposit('ACH Clearing Deposit JN Bank Sender KERON')).toBe(false);
  });

  it('parses Jamaica DD/MM and DD-MON dates', () => {
    expect(parseDmYToYmd('25/06/2026')).toBe('2026-06-25');
    expect(parseDmYToYmd('02/06/2026')).toBe('2026-06-02');
    expect(parseDayMonToYmd('13-MAY', 2026)).toBe('2026-05-13');
  });

  it('extracts Uber credits from online history (June)', () => {
    const text = fixture('sagicor-june-online.txt');
    expect(detectSagicorFormat(text)).toBe('online_history');
    const { lines } = parseSagicorStatementText(text);
    expect(lines.map((l) => [l.dateYmd, l.amount])).toEqual([
      ['2026-06-02', 50285.05],
      ['2026-06-09', 40192.89],
      ['2026-06-16', 13689.21],
      ['2026-06-25', 35957.56],
      ['2026-06-30', 22710.94],
    ]);
  });

  it('extracts Uber credits from official statement (May)', () => {
    const text = fixture('sagicor-may-official.txt');
    expect(detectSagicorFormat(text)).toBe('official_statement');
    const { lines } = parseSagicorStatementText(text);
    expect(lines.map((l) => [l.dateYmd, l.amount])).toEqual([
      ['2026-05-13', 32803.46],
      ['2026-05-19', 30637.08],
      ['2026-05-26', 16622.7],
    ]);
  });

  it('does not treat non-Uber ACH as Uber', () => {
    const text = fixture('sagicor-june-online.txt');
    const { lines } = parseSagicorStatementText(text);
    expect(lines.some((l) => l.amount === 305712.32)).toBe(false);
    expect(lines.some((l) => l.amount === 328326.64)).toBe(false);
  });
});
