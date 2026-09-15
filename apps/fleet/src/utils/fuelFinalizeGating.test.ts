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
    // Within the C-2 gate by default (20% of spend < 25% ratio).
    miscellaneousCost: 20,
    companyShare: 50,
    driverShare: 50,
    status: 'Draft',
    healthStatus: 'Emerald',
    pendingCount: 0,
    ...partial,
  };
}

describe('evaluateFuelFinalizeGating', () => {
  it('hard-blocks exception-tier entries and lists the exact fill', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-08-11',
        amount: 1500,
        location: 'Blaize Old Harbour Road',
        paymentSource: 'RideShare_Cash',
        reconciliationStatus: 'Pending',
        metadata: {
          signalTier: 'exception',
          anomalyReason: 'Predictive Leakage Alert: Extreme Mid-Cycle Drift',
        },
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
    expect(gate.exceptionBlockers).toHaveLength(1);
    expect(gate.exceptionBlockers[0]).toMatchObject({
      id: 'e1',
      dateYmd: '2026-08-11',
      amount: 1500,
      paymentLabel: 'RideShare Cash',
      location: 'Blaize Old Harbour Road',
      reason: 'Predictive Leakage Alert: Extreme Mid-Cycle Drift',
    });
  });

  it('does not block after recon exception acknowledgment', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-08-11',
        amount: 1500,
        paymentSource: 'RideShare_Cash',
        reconciliationStatus: 'Pending',
        metadata: {
          signalTier: 'exception',
          anomalyReason: 'Predictive Leakage Alert: Extreme Mid-Cycle Drift',
          exceptionResolvedAt: '2026-08-25T12:00:00.000Z',
          reconExceptionAck: true,
        },
      } as FuelEntry,
    ];
    const gate = evaluateFuelFinalizeGating({
      reports: [report()],
      fuelEntries: entries,
      weekStartYmd: '2026-08-10',
      weekEndYmd: '2026-08-16',
    });
    expect(gate.hasExceptionBlockers).toBe(false);
    expect(gate.exceptionBlockers).toEqual([]);
  });

  it('treats string reconExceptionAck as acknowledged', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-08-11',
        amount: 1500,
        paymentSource: 'RideShare_Cash',
        reconciliationStatus: 'Pending',
        metadata: {
          signalTier: 'exception',
          anomalyReason: 'Predictive Leakage Alert: Extreme Mid-Cycle Drift',
          reconExceptionAck: 'true',
        },
      } as FuelEntry,
    ];
    const gate = evaluateFuelFinalizeGating({
      reports: [report()],
      fuelEntries: entries,
      weekStartYmd: '2026-08-10',
      weekEndYmd: '2026-08-16',
    });
    expect(gate.hasExceptionBlockers).toBe(false);
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
    expect(gate.hasUnapprovedFuelTxBlockers).toBe(false);
    expect(gate.hasOverExplainedBlockers).toBe(false);
    expect(gate.hasBlockingWarnings).toBe(false);
    expect(gate.exceptionBlockers).toEqual([]);
    expect(gate.unapprovedFuelTxBlockers).toEqual([]);
  });

  it('C-7: under-explained (positive misc > 25%) is reviewable, not over-explained', () => {
    const gate = evaluateFuelFinalizeGating({
      reports: [report({ totalGasCardCost: 100, miscellaneousCost: 60 })],
    });
    expect(gate.hasOverExplainedBlockers).toBe(false);
    expect(gate.hasUnderExplainedBlockers).toBe(true);
    expect(gate.hasBlockingWarnings).toBe(true);
    expect(gate.underExplainedBlockers).toHaveLength(1);
    expect(gate.underExplainedBlockers[0]).toMatchObject({
      vehicleId: 'v1',
      driverId: 'd1',
      totalSpend: 100,
      miscellaneousCost: 60,
      pctOfSpend: 60,
      kind: 'under_explained',
    });
  });

  it('C-7: hard-blocks a NEGATIVE (fleet-owes) over-explained residual', () => {
    const gate = evaluateFuelFinalizeGating({
      reports: [report({ totalGasCardCost: 100, miscellaneousCost: -40 })],
    });
    expect(gate.hasOverExplainedBlockers).toBe(true);
    expect(gate.hasUnderExplainedBlockers).toBe(false);
    expect(gate.overExplainedBlockers[0].pctOfSpend).toBe(40);
  });

  it('F3: hard-blocks Pending fuel reimbursements in the statement window', () => {
    const gate = evaluateFuelFinalizeGating({
      reports: [report()],
      weekStartYmd: '2026-08-10',
      weekEndYmd: '2026-08-16',
      transactions: [
        {
          id: 'tx1',
          date: '2026-08-12',
          status: 'Pending',
          type: 'Expense',
          category: 'Fuel',
          paymentMethod: 'Cash',
          amount: -2500,
          driverName: 'Alex',
        },
        {
          id: 'tx-out',
          date: '2026-08-01',
          status: 'Pending',
          type: 'Expense',
          category: 'Fuel',
          paymentMethod: 'Cash',
          amount: -100,
        },
      ],
    });
    expect(gate.hasUnapprovedFuelTxBlockers).toBe(true);
    expect(gate.unapprovedFuelTxBlockers).toHaveLength(1);
    expect(gate.unapprovedFuelTxBlockers[0].id).toBe('tx1');
  });
});
