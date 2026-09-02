/**
 * Product helpers + settlement table contract tests (M15 without jsdom).
 */
import { describe, expect, it } from 'vitest';
import { shouldAutoClosePeriod } from './fuelAutoClose';
import { needsSecondApprover, FUEL_SECOND_APPROVER_THRESHOLD } from './fuelDualApproval';
import { unexplainedLabel } from './fuelReconGlossary';
import type { FuelSettlementRow } from '../components/fuel/reconciliation/FuelSettlementTable';

describe('fuel recon product helpers', () => {
  it('auto-close eligibility', () => {
    expect(shouldAutoClosePeriod({ locked: false, actionableTotal: 0, netLeakage: 0 })).toBe(true);
    expect(shouldAutoClosePeriod({ locked: true, actionableTotal: 0, netLeakage: 0 })).toBe(false);
    expect(shouldAutoClosePeriod({ locked: false, actionableTotal: 2, netLeakage: 0 })).toBe(false);
  });

  it('second approver threshold + glossary', () => {
    expect(needsSecondApprover(FUEL_SECOND_APPROVER_THRESHOLD - 1)).toBe(false);
    expect(needsSecondApprover(FUEL_SECOND_APPROVER_THRESHOLD + 1)).toBe(true);
    expect(unexplainedLabel(10)).toBe('Unexplained');
    expect(unexplainedLabel(-10)).toBe('Over-explained');
  });

  it('settlement row shape stays exportable', () => {
    const row: FuelSettlementRow = {
      id: '1',
      plate: 'ABC123',
      cashFromEarnings: 100,
      driverShare: 40,
      netPay: 60,
      status: 'Draft',
    };
    expect(row.netPay).toBe(row.cashFromEarnings - row.driverShare);
  });
});
