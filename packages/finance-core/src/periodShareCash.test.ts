import { describe, expect, it } from 'vitest';
import { computeWeekCommissionShare, computeWeekCashBase } from './periodShareCash.ts';
import { foldPayoutCashByWeek } from './payoutCashDedupe.ts';
import { computePeriodSettlement } from './driverPeriodSettlement.ts';

describe('computeWeekCommissionShare — D3 tips quota + D4 full week', () => {
  const tiers = [
    { id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: 75000, sharePercentage: 25 },
    { id: 't2', name: 'Silver', minEarnings: 75000, maxEarnings: null, sharePercentage: 30 },
  ];

  it('pays tips only when weekly quota is met', () => {
    const r = computeWeekCommissionShare({
      fareEntries: [{ date: '2026-08-04', eventType: 'fare_earning', grossAmount: 99000 }],
      tipEntries: [{ date: '2026-08-04', eventType: 'tip', netAmount: 2000 }],
      periodAnchor: '2026-08-03',
      periodEnd: '2026-08-09',
      tiers,
      quotaConfig: { weekly: { enabled: true, amount: 100000 } },
    });
    expect(r.quotaMet).toBe(true);
    expect(r.tipsPaidToDriver).toBe(2000);
    expect(r.tipsWithheld).toBe(0);
    expect(r.driverShare).toBe(29700);
  });

  it('withholds tips when quota is missed but still counts them toward quota %', () => {
    const r = computeWeekCommissionShare({
      fareEntries: [{ date: '2026-08-04', eventType: 'fare_earning', grossAmount: 50000 }],
      tipEntries: [{ date: '2026-08-04', eventType: 'tip', netAmount: 500 }],
      periodAnchor: '2026-08-03',
      periodEnd: '2026-08-09',
      tiers,
      quotaConfig: { weekly: { enabled: true, amount: 100000 } },
    });
    expect(r.quotaMet).toBe(false);
    expect(r.tipsPaidToDriver).toBe(0);
    expect(r.tipsWithheld).toBe(500);
    expect(r.quotaPercent).toBe(50.5);
  });

  it('pays tips when quota is disabled', () => {
    const r = computeWeekCommissionShare({
      fareEntries: [{ date: '2026-08-04', eventType: 'fare_earning', grossAmount: 1000 }],
      tipEntries: [{ date: '2026-08-04', eventType: 'tip', netAmount: 80 }],
      periodAnchor: '2026-08-03',
      periodEnd: '2026-08-09',
      tiers,
      quotaConfig: { weekly: { enabled: false, amount: 100000 } },
    });
    expect(r.quotaMet).toBe(true);
    expect(r.tipsPaidToDriver).toBe(80);
  });

  it('includes July days of a Jun 29 week in the tier cumulative (D4)', () => {
    const r = computeWeekCommissionShare({
      fareEntries: [
        { date: '2026-06-01', eventType: 'fare_earning', grossAmount: 70000 },
        { date: '2026-07-02', eventType: 'fare_earning', grossAmount: 10000 },
      ],
      periodAnchor: '2026-06-29',
      periodEnd: '2026-07-05',
      tiers,
    });
    expect(r.grossRevenue).toBe(10000);
    expect(r.driverSharePercent).toBe(30);
  });
});

describe('computeWeekCashBase', () => {
  it('uses payout_cash for Uber and reports trip mismatch', () => {
    const r = computeWeekCashBase({
      periodAnchor: '2026-08-03',
      periodEnd: '2026-08-09',
      uberPayoutCash: 29976.26,
      trips: [
        { date: '2026-08-04', platform: 'Uber', cashCollected: 100, paymentMethod: 'Cash' },
        { date: '2026-08-04', platform: 'InDrive', cashCollected: 800, paymentMethod: 'Cash' },
      ],
      transactions: [],
    });
    expect(r.uberCash).toBe(29976.26);
    expect(r.nonUberTripCash).toBe(800);
    expect(r.passengerCash).toBe(30776.26);
    expect(r.cashSourceMismatch).toBeCloseTo(29876.26, 2);
  });
});

describe('foldPayoutCashByWeek', () => {
  it('collapses duplicate untagged + tagged payout_cash of the same amount', () => {
    const map = foldPayoutCashByWeek(
      [
        { eventType: 'payout_cash', date: '2026-08-04', netAmount: 29976.26, driverId: null },
        {
          eventType: 'payout_cash',
          date: '2026-08-04',
          netAmount: 29976.26,
          driverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
        },
      ],
      'America/Jamaica',
    );
    expect(map.get('2026-08-03')).toBe(29976.26);
  });

  it('keeps two tagged remittances of the same amount on the same day', () => {
    const map = foldPayoutCashByWeek(
      [
        {
          eventType: 'payout_cash',
          date: '2026-08-04',
          netAmount: 100,
          driverId: 'd1',
          idempotencyKey: 'file:aaa|payout|cash|d1',
        },
        {
          eventType: 'payout_cash',
          date: '2026-08-04',
          netAmount: 100,
          driverId: 'd1',
          idempotencyKey: 'file:bbb|payout|cash|d1',
        },
      ],
      'America/Jamaica',
    );
    expect(map.get('2026-08-03')).toBe(200);
  });
});

describe('computePeriodSettlement — tips paid add to net payout', () => {
  it('adds tipsPaidToDriver to net payout', () => {
    const r = computePeriodSettlement({
      driverShare: 25,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      tipsPaidToDriver: 10,
    });
    expect(r.netPayout).toBe(35);
    expect(r.settlement).toBe(-65);
  });
});

describe('Kenny Aug 3–9 2026 expected (D1 de-dupe + D3 tips withheld)', () => {
  it('passenger cash 54196.26 yields fleet-owes 11109.21 before withheld tips', () => {
    const r = computePeriodSettlement({
      driverShare: 23704.69,
      fuelDeduction: 1412.11,
      baseCashOwed: 54196.26,
      baseCashPaid: 16000,
      tollCashWash: 1720,
      tollPersonal: 595,
      fuelCredits: 25887.89,
      tipsPaidToDriver: 0,
    });
    expect(r.adjCashBalance).toBeCloseTo(11183.37, 2);
    expect(r.settlement).toBeCloseTo(11109.21, 2);
  });

  it('over-returned cash vs collected yields negative held (persist floors; settlement stays signed)', () => {
    const r = computePeriodSettlement({
      driverShare: 100,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 200,
      tollCashWash: 0,
      tollPersonal: 0,
    });
    expect(r.adjCashBalance).toBe(-100);
    expect(r.settlement).toBe(200);
  });
});
