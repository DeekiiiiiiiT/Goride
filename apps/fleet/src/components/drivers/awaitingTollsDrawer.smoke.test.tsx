/**
 * @vitest-environment jsdom
 *
 * R6 money-path smoke: Awaiting Tolls drawers must resolve status chrome (no crash).
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PayoutPeriodDetail } from './PayoutPeriodDetail';
import { SettlementPeriodDetail } from './SettlementPeriodDetail';
import type { PayoutPeriodRow } from '../../types/driverPayoutPeriod';
import type { SettlementRow } from './SettlementSummaryView';

const basePayout: PayoutPeriodRow = {
  periodStart: new Date('2026-08-31T00:00:00'),
  periodEnd: new Date('2026-09-06T23:59:59'),
  status: 'Awaiting Tolls',
  isFinalized: true,
  isEstimate: false,
  tripCount: 2,
  grossRevenue: 1000,
  driverSharePercent: 70,
  driverShare: 700,
  fleetShare: 300,
  tollExpenses: 100,
  tollReconciled: 50,
  tollUnreconciled: 50,
  disputeRefundMatched: 0,
  disputeRefundUnmatched: 0,
  fuelDeduction: 80,
  fuelCredits: 0,
  totalDeductions: 130,
  expenseDeductions: 130,
  netPayout: 450,
  tierName: 'Standard',
  cashOwed: 200,
  cashPaid: 0,
  cashBalance: 200,
  passengerCash: 200,
  cashTollWash: 0,
  personalTollCharge: 50,
  bankSettled: 0,
};

const baseSettlement: SettlementRow = {
  periodStart: new Date('2026-08-31T00:00:00'),
  periodEnd: new Date('2026-09-06T23:59:59'),
  settlementStatus: 'Awaiting Tolls',
  isFinalized: true,
  tripCount: 2,
  grossRevenue: 1000,
  netPayout: 450,
  bankSettled: 0,
  driverShare: 700,
  tollExpenses: 100,
  fuelDeduction: 80,
  expenseDeductions: 130,
  chargedToDriver: 50,
  totalDeductions: 130,
  passengerCash: 200,
  cashHandbacks: 0,
  fuelCreditsApplied: 0,
  cashTollCredits: 0,
  cashPaid: 0,
  cashStillHeld: 200,
  cashStatus: 'Open',
  settlement: -250,
};

describe('Awaiting Tolls drawer smoke (R4-1 / R6)', () => {
  it('PayoutPeriodDetail renders without throwing for Awaiting Tolls', () => {
    render(
      <PayoutPeriodDetail row={basePayout} open onOpenChange={() => {}} showCash />,
    );
    expect(screen.getByText(/Payout Detail/i)).toBeTruthy();
    expect(screen.getByText(/toll reconciliation still open/i)).toBeTruthy();
  });

  it('SettlementPeriodDetail renders without throwing for Awaiting Tolls', () => {
    render(
      <SettlementPeriodDetail row={baseSettlement} open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Settlement Detail/i)).toBeTruthy();
    expect(screen.getAllByText(/Awaiting Tolls/i).length).toBeGreaterThan(0);
  });
});
