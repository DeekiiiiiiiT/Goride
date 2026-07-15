import { describe, it, expect } from 'vitest';
import {
  aggregateExpectedBankByDriverWeek,
  buildFleetBankConfirmLookup,
  mergeBankReceiveConfirms,
  resolveBankSettledDisplay,
} from './fleetBankReceive';

describe('fleetBankReceive', () => {
  it('aggregates payout_bank by driver + settlement week', () => {
    const rows = aggregateExpectedBankByDriverWeek(
      [
        {
          eventType: 'payout_bank',
          driverId: 'kenny',
          date: '2026-07-01',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 1000,
        },
        {
          eventType: 'payout_bank',
          driverId: 'kenny',
          date: '2026-07-02',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 250.5,
        },
        {
          eventType: 'payout_cash',
          driverId: 'kenny',
          date: '2026-07-01',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 9999,
        },
      ],
      { kenny: 'Kenny' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStartYmd).toBe('2026-06-29');
    expect(rows[0].expected).toBeCloseTo(1250.5, 2);
    expect(rows[0].driverName).toBe('Kenny');
  });

  it('merges confirms without inventing expected amounts', () => {
    const expected = aggregateExpectedBankByDriverWeek(
      [
        {
          eventType: 'payout_bank',
          driverId: 'd1',
          date: '2026-06-30',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 500,
        },
      ],
      { d1: 'Driver One' },
    );
    const unconfirmed = mergeBankReceiveConfirms(expected, []);
    expect(unconfirmed[0].status).toBe('unconfirmed');
    expect(unconfirmed[0].amountReceived).toBeNull();
    expect(unconfirmed[0].variance).toBeNull();

    const confirmed = mergeBankReceiveConfirms(expected, [
      {
        driverId: 'd1',
        weekStartYmd: '2026-06-29',
        status: 'confirmed',
        amountReceived: 480,
        confirmedBy: 'ops',
      },
    ]);
    expect(confirmed[0].status).toBe('confirmed');
    expect(confirmed[0].amountReceived).toBe(480);
    expect(confirmed[0].variance).toBeCloseTo(-20, 2);
    // Expected unchanged by confirm — confirm must not pad Cash Returned side
    expect(confirmed[0].expected).toBe(500);
  });

  it('keeps Bank Settled pending until Fleet Financials confirms', () => {
    const lookup = buildFleetBankConfirmLookup([
      {
        driverId: 'd1',
        weekStartYmd: '2026-06-29',
        status: 'confirmed',
        amountReceived: 48168.32,
      },
    ]);

    expect(
      resolveBankSettledDisplay({
        driverId: 'd1',
        weekStartYmd: '2026-06-29',
        ledgerBankSettled: 48168.32,
        confirmsByKey: lookup,
      }),
    ).toEqual({ kind: 'confirmed', amount: 48168.32 });

    expect(
      resolveBankSettledDisplay({
        driverId: 'd1',
        weekStartYmd: '2026-07-06',
        ledgerBankSettled: 1200,
        confirmsByKey: lookup,
      }),
    ).toEqual({ kind: 'pending' });

    expect(
      resolveBankSettledDisplay({
        driverId: 'd1',
        weekStartYmd: '2026-07-13',
        ledgerBankSettled: 0,
        confirmsByKey: lookup,
      }),
    ).toEqual({ kind: 'none' });
  });
});
