/**
 * R-1 / R-2 client closable gate — dedicated reviews; no leakage fallback.
 */
import { describe, expect, it } from 'vitest';
import {
  buildFuelWeekClosableInput,
  evaluateFuelWeekClosableClient,
  reportsHaveOdometerChainUnusable,
} from './fuelWeekClosableGate';
import type { WeeklyFuelReport } from '../types/fuel';

function report(partial: Partial<WeeklyFuelReport> & { id?: string }): WeeklyFuelReport {
  return {
    id: partial.id || 'r1',
    driverId: 'd1',
    vehicleId: 'v1',
    weekStart: '2026-09-08',
    weekEnd: '2026-09-14',
    totalGasCardCost: 27000,
    miscellaneousCost: 0,
    windowTimingCost: 0,
    unattributedFillCost: 0,
    metadata: {},
    ...partial,
  } as WeeklyFuelReport;
}

const emptyGate = {
  hasExceptionBlockers: false,
  exceptionBlockers: [],
  hasUnapprovedFuelTxBlockers: false,
  hasOverExplainedBlockers: false,
  hasUnderExplainedBlockers: false,
};

describe('fuelWeekClosableGate R-1 / R-2', () => {
  it('R-2: thin chain blocks until odometerChainReviewed', () => {
    const reports = [
      report({
        metadata: { rideShareCalc: { efficiencySource: 'default_fallback' } },
      }),
    ];
    expect(reportsHaveOdometerChainUnusable(reports)).toBe(true);
    expect(
      evaluateFuelWeekClosableClient({
        gateResult: emptyGate,
        reports,
        scenarios: [],
        leakageReviewed: true,
        odometerChainReviewed: false,
      }).map((b) => b.code),
    ).toContain('odometer_chain_unusable');
    expect(
      evaluateFuelWeekClosableClient({
        gateResult: emptyGate,
        reports,
        scenarios: [],
        leakageReviewed: true,
        odometerChainReviewed: true,
      }).map((b) => b.code),
    ).not.toContain('odometer_chain_unusable');
  });

  it('R-1: unattributed beyond gate blocks; leakage alone does not clear', () => {
    const reports = [
      report({
        unattributedFillCost: 13500,
        metadata: { rideShareCalc: { efficiencySource: 'odometer' } },
      }),
    ];
    const blocked = buildFuelWeekClosableInput({
      gateResult: emptyGate,
      reports,
      scenarios: [],
      leakageReviewed: true,
      unattributedReviewed: false,
    });
    expect(blocked.unattributedUnreviewed).toBe(true);
    const cleared = buildFuelWeekClosableInput({
      gateResult: emptyGate,
      reports,
      scenarios: [],
      leakageReviewed: false,
      unattributedReviewed: true,
    });
    expect(cleared.unattributedUnreviewed).toBe(false);
    expect(cleared.underExplainedUnreviewed).toBe(false);
  });
});
