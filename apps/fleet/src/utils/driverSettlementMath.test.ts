import { describe, it, expect } from 'vitest';
import { getPeriodSettlementComponents, getAdjCashBalance, aggregateFinalizedNetSettlement, countPendingEarningsPeriods } from './driverSettlementMath';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';

/**
 * Pins the Step 7 fix: getPeriodSettlementComponents used to compute
 * settlement = adjCashBalance − netPayout (a competing formula with the
 * opposite sign of driverPeriodSettlement.ts's computePeriodSettlement, which
 * SettlementSummaryView and buildLedgerPayoutPeriodRows already use). It now
 * delegates to computePeriodSettlement, so positive settlement = company owes
 * the driver, negative = driver owes the company — matching every other
 * settlement surface.
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
    const row = makeRow({ isFinalized: true, netPayout: 100, cashBalance: 10, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(10);
    expect(r.netPayoutApplied).toBe(100);
    expect(r.settlement).toBe(90); // 100 - 10, company owes $90
  });

  it('negative settlement = driver owes the company (driver holds more cash than they are owed)', () => {
    const row = makeRow({ isFinalized: true, netPayout: 25, cashBalance: 90, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.settlement).toBe(-65); // 25 - 90, driver owes $65
  });

  it('nets fuelCredits out of the cash balance before computing settlement', () => {
    const row = makeRow({ isFinalized: true, netPayout: 25, cashBalance: 90, fuelCredits: 20 });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(70); // 90 - 20
    expect(r.settlement).toBe(-45);    // 25 - 70 (was -65 without the fuel credit)
  });

  it('does not double-subtract fuel already counted in cashPaid', () => {
    const row = makeRow({
      isFinalized: true,
      netPayout: 25,
      cashBalance: 70, // already net of $20 fuel in cashPaid
      fuelCredits: 20,
      cashPaidBreakdown: {
        allocatedPayments: 0,
        tollCredits: 0,
        fuelCreditsInCashPaid: 20,
        fifoPayments: 0,
        surplusPayments: 0,
      },
    });
    const r = getPeriodSettlementComponents(row);
    expect(r.adjCashBalance).toBe(70);
    expect(r.settlement).toBe(-45);
  });

  it('treats netPayout as 0 until the period is finalized', () => {
    const row = makeRow({ isFinalized: false, netPayout: 500, cashBalance: 10, fuelCredits: 0 });
    const r = getPeriodSettlementComponents(row);
    expect(r.netPayoutApplied).toBe(0);
    expect(r.settlement).toBe(-10); // 0 - 10, not 500 - 10
  });
});

describe('aggregateFinalizedNetSettlement / countPendingEarningsPeriods', () => {
  it('sums settlement across finalized rows only, and counts the rest as pending', () => {
    const rows: PayoutPeriodRow[] = [
      makeRow({ isFinalized: true, netPayout: 100, cashBalance: 10 }),  // settlement +90
      makeRow({ isFinalized: true, netPayout: 25, cashBalance: 90 }),   // settlement -65
      makeRow({ isFinalized: false, netPayout: 500, cashBalance: 0 }),  // excluded (pending)
    ];
    expect(aggregateFinalizedNetSettlement(rows)).toBe(25); // 90 + (-65)
    expect(countPendingEarningsPeriods(rows)).toBe(1);
  });
});
