import { describe, it, expect } from 'vitest';
import { walletCallOutstandingFromPeriod } from './walletCallOutstanding';
import { getPeriodSettlementComponents } from './driverSettlementMath';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';

function row(partial: Partial<PayoutPeriodRow> & { periodStart: Date }): PayoutPeriodRow {
  return {
    periodEnd: new Date(partial.periodStart.getTime() + 6 * 86400000),
    driverShare: 0,
    fuelDeduction: 0,
    netPayout: 0,
    cashOwed: 0,
    cashPaid: 0,
    cashBalance: 0,
    fuelCredits: 0,
    isFinalized: false,
    status: 'Pending',
    ...partial,
  } as PayoutPeriodRow;
}

describe('walletCallOutstandingFromPeriod', () => {
  it('finalized negative settlement → driver owes fleet (call amount), not collection gap', () => {
    const r = row({
      periodStart: new Date('2026-06-29T12:00:00'),
      isFinalized: true,
      netPayout: 29673.38,
      passengerCash: 62497.45,
      cashOwed: 62497.45,
      cashPaid: 7500,
      cashTollWash: 1710,
      fuelCredits: 21415.26,
      personalTollCharge: 0,
    });
    const o = walletCallOutstandingFromPeriod(r);
    const { settlement } = getPeriodSettlementComponents(r);
    expect(o.callDirection).toBe('driver_owes');
    expect(o.callLabel).toBe('Driver owes fleet');
    // Call amount = |settlement|, never passenger − returned (~$55k)
    expect(o.callAmount).toBeCloseTo(Math.abs(settlement), 2);
    expect(o.callAmount).toBeLessThan(20000);
    expect(62497.45 - 7500).toBeGreaterThan(50000);
    // Overlay arithmetic: passenger − returned − fuel − toll = still held; still held − net = owed
    expect(o.breakdown.passengerCash).toBeCloseTo(62497.45, 2);
    expect(o.breakdown.cashReturned).toBeCloseTo(7500, 2);
    expect(o.breakdown.fuelCredit).toBeCloseTo(21415.26, 2);
    expect(o.breakdown.cashTollCredit).toBeCloseTo(1710, 2);
    expect(o.breakdown.stillHeld).toBeCloseTo(o.stillHeld, 2);
    expect(o.breakdown.netPayoutApplied).toBeCloseTo(29673.38, 2);
    expect(o.breakdown.stillHeld - o.breakdown.netPayoutApplied).toBeCloseTo(o.callAmount, 2);
  });

  it('unfinalized → cash still with driver = still held after credits', () => {
    const o = walletCallOutstandingFromPeriod(
      row({
        periodStart: new Date('2026-07-06T12:00:00'),
        isFinalized: false,
        passengerCash: 1000,
        cashOwed: 1000,
        cashPaid: 100,
        fuelCredits: 200,
        cashTollWash: 50,
      }),
    );
    expect(o.callDirection).toBe('cash_with_driver');
    expect(o.callAmount).toBeCloseTo(650, 2); // 1000-100-200-50
    expect(o.settlement).toBeNull();
  });
});
