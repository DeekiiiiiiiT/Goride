import { describe, expect, it } from 'vitest';
import { computePayoutSummaryTotals, payoutStatusLabel } from './computePayoutSummaryTotals';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { applyDraftFuelToPayoutRows, rollupWeeklyPayoutRowsToMonthly } from './payoutDraftFuel';

function baseRow(overrides: Partial<PayoutPeriodRow>): PayoutPeriodRow {
  return {
    periodStart: new Date('2026-06-29T00:00:00'),
    periodEnd: new Date('2026-07-05T23:59:59'),
    grossRevenue: 100000,
    driverSharePercent: 33,
    driverShare: 33000,
    tollExpenses: 0,
    tollReconciled: 0,
    tollUnreconciled: 0,
    fuelDeduction: 0,
    fuelCredits: 0,
    totalDeductions: 0,
    expenseDeductions: 0,
    netPayout: 33000,
    isFinalized: false,
    isEstimate: true,
    tripCount: 10,
    tierName: 'Standard',
    cashOwed: 20000,
    cashPaid: 5000,
    cashBalance: 15000,
    passengerCash: 20000,
    bankSettled: 0,
    status: 'Pending',
    ...overrides,
  };
}

describe('computePayoutSummaryTotals', () => {
  it('includes Awaiting Cash (fuel-locked) in Net Take-Home, not only Closed', () => {
    const awaiting = baseRow({
      isFinalized: true,
      isEstimate: false,
      fuelDeduction: 5084.74,
      netPayout: 29673.38,
      status: 'Awaiting Cash',
      fuelCredits: 21415,
    });
    const pending = baseRow({
      periodStart: new Date('2026-04-06T00:00:00'),
      periodEnd: new Date('2026-04-12T23:59:59'),
      isFinalized: false,
      isEstimate: true,
      netPayout: 1000,
      fuelDeduction: 100,
      status: 'Pending',
    });

    const totals = computePayoutSummaryTotals([awaiting, pending]);
    expect(totals.netTakeHome).toBeCloseTo(29673.38, 2);
    expect(totals.fuelDeducted).toBeCloseTo(5084.74, 2);
    expect(totals.fuelLockedCount).toBe(1);
    expect(totals.awaitingCashCount).toBe(1);
    expect(totals.pendingCount).toBe(1);
    // Open balance includes Awaiting Cash settlement + Pending estimate
    expect(totals.openBalance).not.toBe(0);
  });

  it('maps status labels for paycheck UI', () => {
    expect(payoutStatusLabel('Pending')).toBe('Pending Fuel');
    expect(payoutStatusLabel('Awaiting Cash')).toBe('Cash Outstanding');
    expect(payoutStatusLabel('Finalized')).toBe('Closed');
  });
});

describe('applyDraftFuelToPayoutRows', () => {
  it('overlays draft fuel on non-finalized rows without flipping isFinalized', () => {
    const row = baseRow({ fuelDeduction: 0, netPayout: 33000, isFinalized: false });
    const out = applyDraftFuelToPayoutRows(
      [row],
      { '2026-06-29': { deduction: 1000, fleetShare: 2000 } },
      true,
    );
    expect(out[0].isFinalized).toBe(false);
    expect(out[0].isEstimate).toBe(true);
    expect(out[0].fuelDeduction).toBe(1000);
    expect(out[0].netPayout).toBe(32000);
    expect(out[0].status).toBe('Pending');
  });

  it('leaves finalized rows untouched', () => {
    const row = baseRow({
      isFinalized: true,
      isEstimate: false,
      fuelDeduction: 5000,
      netPayout: 28000,
      status: 'Awaiting Cash',
    });
    const out = applyDraftFuelToPayoutRows(
      [row],
      { '2026-06-29': { deduction: 999, fleetShare: 1 } },
      true,
    );
    expect(out[0].fuelDeduction).toBe(5000);
    expect(out[0].netPayout).toBe(28000);
  });
});

describe('rollupWeeklyPayoutRowsToMonthly', () => {
  it('sums weeks in the same calendar month', () => {
    const w1 = baseRow({
      periodStart: new Date('2026-06-01T00:00:00'),
      periodEnd: new Date('2026-06-07T23:59:59'),
      driverShare: 100,
      netPayout: 80,
      fuelDeduction: 20,
      isFinalized: true,
      status: 'Finalized',
    });
    const w2 = baseRow({
      periodStart: new Date('2026-06-08T00:00:00'),
      periodEnd: new Date('2026-06-14T23:59:59'),
      driverShare: 50,
      netPayout: 40,
      fuelDeduction: 10,
      isFinalized: true,
      status: 'Awaiting Cash',
    });
    const months = rollupWeeklyPayoutRowsToMonthly([w1, w2]);
    expect(months).toHaveLength(1);
    expect(months[0].driverShare).toBe(150);
    expect(months[0].netPayout).toBe(120);
    expect(months[0].fuelDeduction).toBe(30);
    expect(months[0].status).toBe('Awaiting Cash');
  });
});
