import { describe, it, expect } from 'vitest';
import { getPeriodSettlementComponents, getAdjCashBalance, aggregateFinalizedNetSettlement, countPendingEarningsPeriods } from './driverSettlementMath';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';

/**
 * Pins locked settlement: passenger − cash returned − fleet fuel − cash tolls.
 * Positive settlement = company owes the driver.
 */
function makeRow(overrides: Partial<PayoutPeriodRow>): PayoutPeriodRow {
  return {
    periodStart: new Date('2026-07-06'),
    periodEnd: new Date('2026-07-12'),
    grossRevenue: 0,
    driverSharePercent: 0,
    driverShare: 0,
    tollExpenses: 0,
    tollReconciled: 0,
    tollUnreconciled: 0,
    disputeRefundMatched: 0,
    disputeRefundUnmatched: 0,
    fuelDeduction: 0,
    fuelCredits: 0,
    totalDeductions: 0,
    expenseDeductions: 0,
    netPayout: 0,
    isFinalized: false,
    tripCount: 0,
    tierName: 'Default',
    cashOwed: 0,
    cashPaid: 0,
    cashBalance: 0,
    bankSettled: 0,
    status: 'Pending',
    ...overrides,
  };
}

describe('getAdjCashBalance', () => {
  it('subtracts fuel credits from the cash balance', () => {
    expect(getAdjCashBalance(90, 20)).toBe(70);
  });

  it('treats a missing fuelCredits as 0', () => {
    expect(getAdjCashBalance(90, undefined as unknown as number)).toBe(90);
  });
});

describe('getPeriodSettlementComponents', () => {
  it('positive settlement = company owes the driver (driver holds less cash than they are owed)', () => {
    const row = makeRow({ isFinalized: true, netPayout: 100, cashBalance: 10, cashOwed: 10, cashPaid: 0, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(10);
    expect(r.netPayoutApplied).toBe(100);
    expect(r.settlement).toBe(90); // 100 - 10, company owes $90
  });

  it('negative settlement = driver owes the company (driver holds more cash than they are owed)', () => {
    const row = makeRow({ isFinalized: true, netPayout: 25, cashBalance: 90, cashOwed: 90, cashPaid: 0, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.settlement).toBe(-65); // 25 - 90, driver owes $65
  });

  it('nets fuelCredits out of the cash balance before computing settlement', () => {
    const row = makeRow({ isFinalized: true, netPayout: 25, cashOwed: 90, cashPaid: 0, cashBalance: 90, fuelCredits: 20 });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(70); // 90 - 20
    expect(r.settlement).toBe(-45);    // 25 - 70
  });

  it('Cash Returned is tagged cash only; fleet fuel + cash tolls apply separately', () => {
    const row = makeRow({
      isFinalized: true,
      netPayout: 29673.38,
      passengerCash: 62497.45,
      cashOwed: 62497.45,
      cashPaid: 7500,
      cashBalance: 62497.45 - 7500,
      fuelCredits: 21415.26,
      cashTollWash: 1710,
      personalTollCharge: 0,
      cashPaidBreakdown: {
        allocatedPayments: 7500,
        tollCredits: 0,
        fuelCreditsInCashPaid: 0,
        fifoPayments: 0,
        surplusPayments: 0,
      },
    });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBeCloseTo(31872.19, 2);
    expect(r.settlement).toBeCloseTo(-2198.81, 2);
  });

  it('personal toll from Toll Reconciliation bills the driver (raises still held)', () => {
    const row = makeRow({
      isFinalized: true,
      netPayout: 100,
      passengerCash: 100,
      cashOwed: 100,
      cashPaid: 0,
      cashBalance: 100,
      fuelCredits: 0,
      cashTollWash: 0,
      personalTollCharge: 10,
    });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(110);
    expect(r.settlement).toBe(-10); // 100 − 110
  });

  it('treats netPayout as 0 until the period is finalized', () => {
    const row = makeRow({ isFinalized: false, netPayout: 500, cashOwed: 10, cashPaid: 0, cashBalance: 10, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.netPayoutApplied).toBe(0);
    expect(r.settlement).toBe(-10); // 0 - 10, not 500 - 10
  });
});

describe('aggregateFinalizedNetSettlement / countPendingEarningsPeriods', () => {
  it('sums settlement across finalized rows only, and counts the rest as pending', () => {
    const rows: PayoutPeriodRow[] = [
      makeRow({ isFinalized: true, netPayout: 100, cashOwed: 10, cashPaid: 0, cashBalance: 10 }),  // +90
      makeRow({ isFinalized: true, netPayout: 25, cashOwed: 90, cashPaid: 0, cashBalance: 90 }),   // -65
      makeRow({ isFinalized: false, netPayout: 500, cashOwed: 0, cashPaid: 0, cashBalance: 0 }),  // excluded
    ];
    expect(aggregateFinalizedNetSettlement(rows)).toBe(25); // 90 + (-65)
    expect(countPendingEarningsPeriods(rows)).toBe(1);
  });
});
