import { describe, expect, it } from 'vitest';
import { sumLedgerBankSettledForWeek } from './ledgerBankSettled';

describe('sumLedgerBankSettledForWeek', () => {
  it('sums payout_bank events whose statement week starts in the week (PERIOD window rules)', () => {
    const events = [
      {
        eventType: 'payout_bank',
        driverId: 'kenny',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 58668.5,
      },
      {
        eventType: 'payout_bank',
        driverId: 'kenny',
        date: '2026-06-22',
        periodStart: '2026-06-22',
        periodEnd: '2026-06-28',
        netAmount: 1000,
      },
      {
        eventType: 'payout_cash',
        driverId: 'kenny',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 34051.85,
      },
    ];
    const sum = sumLedgerBankSettledForWeek(
      events,
      new Date('2026-06-29T00:00:00'),
      new Date('2026-07-05T23:59:59'),
    );
    expect(sum).toBeCloseTo(58668.5, 2);
  });
});
