import { describe, expect, it } from 'vitest';
import { buildWeeklyCashRisk } from './buildWeeklyCashRisk';
import { computeWeeklyCashSettlement } from './cashSettlementCalc';
import type { DriverMetrics, Trip } from '../types/data';

/**
 * Kenny-style week: Uber statement cash + InDrive trip cash + bank settled.
 * Cash risk must NOT include bank or inflate to gross trip amounts when statement cash exists.
 */
describe('buildWeeklyCashRisk', () => {
  const weekStart = new Date('2026-06-29T00:00:00');
  const weekEnd = new Date('2026-07-05T23:59:59');

  const metrics: DriverMetrics[] = [
    {
      id: 'dm1',
      driverId: 'kenny',
      periodStart: '2026-06-29',
      periodEnd: '2026-07-05',
      cashCollected: 34051.85,
      bankTransferred: 58668.5,
      dataSources: ['payment'],
    } as DriverMetrics,
  ];

  const trips: Trip[] = [
    {
      id: 'u1',
      date: '2026-07-01',
      platform: 'Uber',
      status: 'Completed',
      amount: 500,
      cashCollected: 500,
      paymentMethod: 'Cash',
      driverId: 'kenny',
    } as Trip,
    {
      id: 'i1',
      date: '2026-07-02',
      platform: 'InDrive',
      status: 'Completed',
      amount: 15350,
      paymentMethod: 'Cash',
      cashCollected: 15350,
      driverId: 'kenny',
    } as Trip,
  ];

  it('uses PERIOD Uber cash + InDrive cash; bank is separate and excluded from cashRisk', () => {
    const r = buildWeeklyCashRisk({
      weekStart,
      weekEnd,
      trips,
      csvMetrics: metrics,
      floatIssued: 0,
      tollCharges: 0,
    });

    expect(r.breakdown.uberFromStatement).toBe(true);
    expect(r.breakdown.uberCash).toBeCloseTo(34051.85, 2);
    expect(r.breakdown.nonUberTripCash).toBeCloseTo(15350, 2);
    expect(r.cashCollected).toBeCloseTo(34051.85 + 15350, 2);
    expect(r.cashRisk).toBeCloseTo(49401.85, 2);
    expect(r.bankSettled).toBeCloseTo(58668.5, 2);
    // Uber trip cash must not stack on top of statement cash
    expect(r.breakdown.uberTripCashFallback).toBe(0);
  });

  it('prefers ledger payout_cash over inflated metrics Uber cash', () => {
    const inflated: DriverMetrics[] = [
      {
        ...metrics[0],
        cashCollected: 49246.85,
        uberPaymentsTransactionCashColumnSum: 49246.85,
      } as DriverMetrics,
    ];
    const r = buildWeeklyCashRisk({
      weekStart,
      weekEnd,
      trips,
      csvMetrics: inflated,
      floatIssued: 0,
      tollCharges: 0,
      ledgerUberCash: 34051.85,
    });
    expect(r.breakdown.uberCash).toBeCloseTo(34051.85, 2);
    expect(r.cashRisk).toBeCloseTo(49401.85, 2);
    expect(r.cashRisk).toBeLessThan(64596);
  });

  it('prefers ledger payout_bank over empty DriverMetrics bank (no re-import)', () => {
    const metricsNoBank: DriverMetrics[] = [
      {
        id: 'dm1',
        driverId: 'kenny',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        cashCollected: 34051.85,
        dataSources: ['payment'],
      } as DriverMetrics,
    ];
    const r = buildWeeklyCashRisk({
      weekStart,
      weekEnd,
      trips,
      csvMetrics: metricsNoBank,
      floatIssued: 0,
      tollCharges: 0,
      ledgerBankSettled: 58668.5,
    });
    expect(r.bankSettled).toBeCloseTo(58668.5, 2);
    expect(r.cashRisk).toBeCloseTo(49401.85, 2);
  });

  it('computeWeeklyCashSettlement amountOwed matches passenger cash collected (not inflated trip sum)', () => {
    const weeks = computeWeeklyCashSettlement({
      trips,
      transactions: [],
      csvMetrics: metrics,
      timezone: 'America/Jamaica',
    });
    const week = weeks.find(
      (w) => w.start.getTime() <= weekStart.getTime() && w.end.getTime() >= weekStart.getTime(),
    );
    expect(week).toBeDefined();
    expect(week!.amountOwed).toBeCloseTo(49401.85, 2);
    expect(week!.bankSettled).toBeCloseTo(58668.5, 2);
    expect(week!.amountOwed).toBeLessThan(64596);
  });
});
