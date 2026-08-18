import { describe, expect, it } from 'vitest';
import { evaluateFuelFinalizeGating } from './fuelFinalizeGating';
import type { FuelDispute, FuelEntry, FinalizedFuelReport, WeeklyFuelReport } from '../types/fuel';

function report(partial: Partial<WeeklyFuelReport> = {}): WeeklyFuelReport {
  return {
    id: 'd1_2026-08-10',
    weekStart: '2026-08-10',
    weekEnd: '2026-08-16',
    vehicleId: 'v1',
    driverId: 'd1',
    totalGasCardCost: 100,
    totalTripDistance: 0,
    rideShareCost: 50,
    companyMiscDistance: 0,
    companyUsageCost: 0,
    personalDistance: 0,
    personalUsageCost: 0,
    deadheadDistance: 0,
    deadheadCost: 0,
    miscellaneousCost: 50,
    companyShare: 50,
    driverShare: 50,
    status: 'Draft',
    healthStatus: 'Emerald',
    pendingCount: 0,
    ...partial,
  };
}

describe('evaluateFuelFinalizeGating', () => {
  it('hard-blocks exception-tier entries', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-08-11',
        amount: 40,
        reconciliationStatus: 'Pending',
        metadata: { signalTier: 'exception' },
      } as FuelEntry,
    ];
    const gate = evaluateFuelFinalizeGating({
      reports: [report()],
      fuelEntries: entries,
      weekStartYmd: '2026-08-10',
      weekEndYmd: '2026-08-16',
    });
    expect(gate.hasExceptionBlockers).toBe(true);
    expect(gate.hasBlockingWarnings).toBe(true);
  });

  it('warns on open disputes and pending logs', () => {
    const disputes: FuelDispute[] = [
      {
        id: 'dp1',
        vehicleId: 'v1',
        driverId: 'd1',
        weekStart: '2026-08-10',
        weekEnd: '2026-08-16',
        status: 'Open',
      } as FuelDispute,
    ];
    const gate = evaluateFuelFinalizeGating({
      reports: [report({ pendingCount: 2, healthStatus: 'Amber' })],
      disputes,
    });
    expect(gate.hasExceptionBlockers).toBe(false);
    expect(gate.dataQualityWarnings).toHaveLength(1);
    expect(gate.dataQualityWarnings[0].openDispute).toBe(true);
    expect(gate.hasBlockingWarnings).toBe(true);
  });

  it('flags re-finalize delta above money epsilon', () => {
    const prior: FinalizedFuelReport[] = [
      {
        ...report({ driverShare: 10, postedDriverShare: 10, status: 'Finalized' }),
      } as FinalizedFuelReport,
    ];
    const gate = evaluateFuelFinalizeGating({
      reports: [report({ driverShare: 50 })],
      finalizedReports: prior,
    });
    expect(gate.reFinalizeWarnings).toHaveLength(1);
    expect(gate.reFinalizeWarnings[0].delta).toBeCloseTo(40);
    expect(gate.hasBlockingWarnings).toBe(true);
  });

  it('is clean when no issues', () => {
    const gate = evaluateFuelFinalizeGating({ reports: [report()] });
    expect(gate.hasExceptionBlockers).toBe(false);
    expect(gate.hasBlockingWarnings).toBe(false);
  });
});
