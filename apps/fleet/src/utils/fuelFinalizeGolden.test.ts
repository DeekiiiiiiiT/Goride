import { describe, expect, it, vi } from 'vitest';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';

const mocks = vi.hoisted(() => ({
  getFinalizedReports: vi.fn(),
  saveFinalizedReports: vi.fn(),
  closeFuelWeekCycles: vi.fn(),
  commitWeeklyStatement: vi.fn(),
  reverseEnterpriseFuelSyncForReport: vi.fn(),
  loadSettlementDeps: vi.fn(),
  setPersonalAllowanceBonusKm: vi.fn(),
}));

vi.mock('../services/api', () => ({
  api: {
    getFinalizedReports: mocks.getFinalizedReports,
    saveFinalizedReports: mocks.saveFinalizedReports,
    closeFuelWeekCycles: mocks.closeFuelWeekCycles,
  },
}));

vi.mock('../services/settlementService', () => ({
  settlementService: {
    commitWeeklyStatement: mocks.commitWeeklyStatement,
    reverseEnterpriseFuelSyncForReport: mocks.reverseEnterpriseFuelSyncForReport,
    loadSettlementDeps: mocks.loadSettlementDeps,
  },
}));

vi.mock('../services/tierService', () => ({
  tierService: {
    setPersonalAllowanceBonusKm: mocks.setPersonalAllowanceBonusKm,
  },
}));

import { finalizeFuelWeekReports } from '../services/fuelFinalizeService';

describe('fuel finalize golden week', () => {
  it('posts one settlement and one snapshot for a single pending fill', async () => {
    mocks.getFinalizedReports.mockResolvedValue([]);
    mocks.saveFinalizedReports.mockResolvedValue({ success: true, saved: 1 });
    mocks.closeFuelWeekCycles.mockResolvedValue(undefined);
    mocks.commitWeeklyStatement.mockResolvedValue(undefined);
    mocks.reverseEnterpriseFuelSyncForReport.mockResolvedValue(0);
    mocks.loadSettlementDeps.mockResolvedValue({ vehicles: [], drivers: [], scenarios: [] });

    const report = {
      id: 'd1_2026-08-10',
      weekStart: '2026-08-10',
      weekEnd: '2026-08-16',
      vehicleId: 'v1',
      driverId: 'd1',
      totalGasCardCost: 80,
      totalTripDistance: 0,
      rideShareCost: 40,
      companyMiscDistance: 0,
      companyUsageCost: 0,
      personalDistance: 0,
      personalUsageCost: 0,
      deadheadDistance: 0,
      deadheadCost: 0,
      miscellaneousCost: 40,
      companyShare: 40,
      driverShare: 40,
      status: 'Draft',
    } as WeeklyFuelReport;

    const entry = {
      id: 'e1',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-08-11',
      amount: 80,
      type: 'Card_Transaction',
      entryMode: 'Anchor',
      paymentSource: 'Gas_Card',
      reconciliationStatus: 'Pending',
    } as FuelEntry;

    const result = await finalizeFuelWeekReports(
      [report],
      {
        vehicles: [{ id: 'v1', licensePlate: '5179KZ' } as any],
        drivers: [{ id: 'd1' }],
        fuelCards: [],
        fuelEntries: [entry],
        scenarios: [],
        trips: [],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.snapshotCount).toBe(1);
    expect(mocks.commitWeeklyStatement).toHaveBeenCalledTimes(1);
    expect(mocks.saveFinalizedReports).toHaveBeenCalledTimes(1);
  });
});
