import { describe, expect, it } from 'vitest';
import {
  payoutBankEventWeekKey,
  sumLedgerBankSettledForWeek,
  sumLedgerCashCollectedForWeek,
} from './ledgerBankSettled';

describe('payoutBankEventWeekKey', () => {
  it('uses event date when periodStart===periodEnd (pay-day stamp)', () => {
    // Runtime proof: periodStart Jun 30 pile-up; date Jun 23 is the real batch week
    expect(
      payoutBankEventWeekKey({
        eventType: 'payout_bank',
        date: '2026-06-23',
        periodStart: '2026-06-30',
        periodEnd: '2026-06-30',
        netAmount: 22710.94,
      }),
    ).toBe('2026-06-22');
  });

  it('uses periodStart when period is a real statement week', () => {
    expect(
      payoutBankEventWeekKey({
        eventType: 'payout_bank',
        date: '2026-06-23',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 100,
      }),
    ).toBe('2026-06-29');
  });
});

describe('sumLedgerBankSettledForWeek', () => {
  it('does not pile multiple pay-day-stamped batches into one Settlement week', () => {
    const events = [
      {
        eventType: 'payout_bank',
        date: '2026-03-30',
        periodStart: '2026-04-12',
        periodEnd: '2026-04-12',
        netAmount: 44197.81,
      },
      {
        eventType: 'payout_bank',
        date: '2026-03-23',
        periodStart: '2026-04-09',
        periodEnd: '2026-04-09',
        netAmount: 51860.53,
      },
      {
        eventType: 'payout_bank',
        date: '2026-04-06',
        periodStart: '2026-04-12',
        periodEnd: '2026-04-12',
        netAmount: 10000,
      },
    ];
    const apr6 = sumLedgerBankSettledForWeek(
      events,
      new Date('2026-04-06T00:00:00'),
      new Date('2026-04-12T23:59:59'),
    );
    // Only the event whose trip/import date falls in Apr 6–12
    expect(apr6).toBeCloseTo(10000, 2);
    expect(apr6).toBeLessThan(100000);
  });

  it('places Jun-23-dated bank on Jun 22 week, not Jun 29 pay-day week', () => {
    const events = [
      {
        eventType: 'payout_bank',
        date: '2026-06-23',
        periodStart: '2026-06-30',
        periodEnd: '2026-06-30',
        netAmount: 22710.94,
      },
      {
        eventType: 'payout_bank',
        date: '2026-06-15',
        periodStart: '2026-06-30',
        periodEnd: '2026-06-30',
        netAmount: 35957.56,
      },
      {
        eventType: 'payout_bank',
        date: '2026-06-29',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-06',
        netAmount: 48168.32,
      },
    ];
    const jun22 = sumLedgerBankSettledForWeek(
      events,
      new Date('2026-06-22T00:00:00'),
      new Date('2026-06-28T23:59:59'),
    );
    const jun29 = sumLedgerBankSettledForWeek(
      events,
      new Date('2026-06-29T00:00:00'),
      new Date('2026-07-05T23:59:59'),
    );
    const jun15 = sumLedgerBankSettledForWeek(
      events,
      new Date('2026-06-15T00:00:00'),
      new Date('2026-06-21T23:59:59'),
    );
    expect(jun22).toBeCloseTo(22710.94, 2);
    expect(jun15).toBeCloseTo(35957.56, 2);
    expect(jun29).toBeCloseTo(48168.32, 2);
  });
});

describe('sumLedgerCashCollectedForWeek', () => {
  it('sums payout_cash with the same week-bucketing rules as bank', () => {
    const events = [
      {
        eventType: 'payout_cash',
        date: '2026-06-29',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-06',
        netAmount: 34051.85,
      },
      {
        eventType: 'payout_bank',
        date: '2026-06-29',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-06',
        netAmount: 48168.32,
      },
    ];
    const jun29 = sumLedgerCashCollectedForWeek(
      events,
      new Date('2026-06-29T00:00:00'),
      new Date('2026-07-05T23:59:59'),
    );
    expect(jun29).toBeCloseTo(34051.85, 2);
  });
});
