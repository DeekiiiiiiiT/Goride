import { describe, expect, it } from 'vitest';
import { walletCallOutstandingFromPeriod } from './walletCallOutstanding';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';

function row(partial: Partial<PayoutPeriodRow> & { periodStart: Date }): PayoutPeriodRow {
  return {
    periodEnd: new Date(partial.periodStart.getTime() + 6 * 86400000),
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
    ...partial,
  };
}

describe('walletCallOutstandingFromPeriod', () => {
  it('an open week with corrections shows the saved balance as money the fleet owes', () => {
    const o = walletCallOutstandingFromPeriod(
      row({
        periodStart: new Date('2026-10-19T12:00:00'),
        isFinalized: false,
        passengerCash: 7313,
        cashOwed: 7313,
        settlementAmount: 37397.13,
        postedAdjustments: 44710.13,
      }),
    );
    expect(o.finalized).toBe(false);
    expect(o.callDirection).toBe('fleet_owes');
    expect(o.callLabel).toBe('Fleet owes you');
    expect(o.callAmount).toBeCloseTo(37397.13, 2);
  });

  it('a finished week shows the saved balance as money the fleet owes', () => {
    const o = walletCallOutstandingFromPeriod(
      row({
        periodStart: new Date('2026-10-19T12:00:00'),
        isFinalized: true,
        passengerCash: 7313,
        cashOwed: 7313,
        settlementAmount: 37397.13,
        postedAdjustments: 44710.13,
      }),
    );
    expect(o.callDirection).toBe('fleet_owes');
    expect(o.callLabel).toBe('Fleet owes you');
    expect(o.callAmount).toBeCloseTo(37397.13, 2);
  });
});
