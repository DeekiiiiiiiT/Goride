import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

const mocks = vi.hoisted(() => ({
  getFinalizedReports: vi.fn(),
  saveFinalizedReports: vi.fn(),
  closeFuelWeekCycles: vi.fn(),
  commitWeeklyStatement: vi.fn(),
  reverseEnterpriseFuelSyncForReport: vi.fn(),
  loadSettlementDeps: vi.fn(),
  setPersonalAllowanceBonusKm: vi.fn(),
}));

vi.mock('./api', () => ({
  api: {
    getFinalizedReports: mocks.getFinalizedReports,
    saveFinalizedReports: mocks.saveFinalizedReports,
    closeFuelWeekCycles: mocks.closeFuelWeekCycles,
  },
}));

vi.mock('./settlementService', () => ({
  settlementService: {
    commitWeeklyStatement: mocks.commitWeeklyStatement,
    reverseEnterpriseFuelSyncForReport: mocks.reverseEnterpriseFuelSyncForReport,
    loadSettlementDeps: mocks.loadSettlementDeps,
  },
}));

vi.mock('./tierService', () => ({
  tierService: {
    setPersonalAllowanceBonusKm: mocks.setPersonalAllowanceBonusKm,
  },
}));

import { finalizeFuelWeekReports } from './fuelFinalizeService';

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
    pendingCount: 1,
    ...partial,
  };
}

const pendingEntry = {
  id: 'e1',
  vehicleId: 'v1',
  driverId: 'd1',
  date: '2026-08-11',
  amount: 100,
  type: 'Card_Transaction',
  entryMode: 'Anchor',
  paymentSource: 'Gas_Card',
  reconciliationStatus: 'Pending',
} as FuelEntry;

const vehicle = { id: 'v1', licensePlate: '5179KZ', currentDriverId: 'd1' } as Vehicle;

const deps = {
  vehicles: [vehicle],
  drivers: [{ id: 'd1', name: 'Driver One' }],
  fuelCards: [],
  fuelEntries: [pendingEntry],
  scenarios: [],
  trips: [],
};

describe('finalizeFuelWeekReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFinalizedReports.mockResolvedValue([]);
    mocks.saveFinalizedReports.mockResolvedValue({ success: true, saved: 1, failures: [] });
    mocks.closeFuelWeekCycles.mockResolvedValue(undefined);
    mocks.commitWeeklyStatement.mockResolvedValue(undefined);
    mocks.reverseEnterpriseFuelSyncForReport.mockResolvedValue(0);
    mocks.loadSettlementDeps.mockResolvedValue({ vehicles: [vehicle], drivers: deps.drivers, scenarios: [] });
    mocks.setPersonalAllowanceBonusKm.mockResolvedValue(undefined);
  });

  it('saves a snapshot after each successful settlement', async () => {
    const result = await finalizeFuelWeekReports([report()], deps);
    expect(mocks.commitWeeklyStatement).toHaveBeenCalledTimes(1);
    expect(mocks.saveFinalizedReports).toHaveBeenCalledTimes(1);
    expect(mocks.saveFinalizedReports.mock.calls[0][0]).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.successCount).toBe(1);
    expect(result.snapshotCount).toBe(1);
  });

  it('reverses a prior settlement before re-posting', async () => {
    mocks.getFinalizedReports.mockResolvedValue([
      { ...report({ status: 'Finalized' }), finalizedAt: '2026-08-16T12:00:00.000Z' },
    ]);
    await finalizeFuelWeekReports([report()], deps, { priorReports: undefined });
    expect(mocks.reverseEnterpriseFuelSyncForReport).toHaveBeenCalled();
    expect(mocks.commitWeeklyStatement).toHaveBeenCalled();
  });

  // C2: Archived fills without finalizedByReport must not reverse-then-skip
  it('does not reverse prior settlement when no entries are re-postable', async () => {
    const archivedOnly = {
      ...pendingEntry,
      reconciliationStatus: 'Archived' as const,
      metadata: {},
    };
    const prior = { ...report({ status: 'Finalized' }), finalizedAt: '2026-08-16T12:00:00.000Z' };
    const result = await finalizeFuelWeekReports([report({ pendingCount: 0 })], {
      ...deps,
      fuelEntries: [archivedOnly],
    }, { priorReports: [prior as any] });

    expect(mocks.reverseEnterpriseFuelSyncForReport).not.toHaveBeenCalled();
    expect(mocks.commitWeeklyStatement).not.toHaveBeenCalled();
    expect(mocks.saveFinalizedReports).not.toHaveBeenCalled();
    expect(result.snapshotCount).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/nothing to finalize/i);
  });

  it('compensates settlement when snapshot save fails', async () => {
    mocks.saveFinalizedReports.mockRejectedValue(new Error('KV write failed'));
    const result = await finalizeFuelWeekReports([report()], deps);
    expect(mocks.commitWeeklyStatement).toHaveBeenCalled();
    expect(mocks.reverseEnterpriseFuelSyncForReport).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.phase === 'snapshot')).toBe(true);
  });

  it('does not fail the week when PA bonus write throws', async () => {
    mocks.setPersonalAllowanceBonusKm.mockRejectedValue(new Error('prefs down'));
    const withPa = report({
      metadata: {
        personalAllowance: { hitTopBand: true, configSnapshot: { nextWeekBonusKm: 20 } },
      },
    });
    const result = await finalizeFuelWeekReports([withPa], deps);
    expect(result.ok).toBe(true);
    expect(result.snapshotCount).toBe(1);
  });
});
