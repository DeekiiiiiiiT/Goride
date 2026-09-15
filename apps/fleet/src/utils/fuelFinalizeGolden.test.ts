import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FuelEntry, FuelScenario, WeeklyFuelReport } from '../types/fuel';
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

const percentageScenario = {
  id: 'fuel-scenario-1',
  name: 'Standard',
  effectiveFrom: '2020-01-01',
  rules: [
    {
      id: 'fr1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 50,
    },
  ],
  versions: [
    {
      id: 'v1',
      effectiveFrom: '2020-01-01',
      rules: [
        {
          id: 'fr1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 50,
        },
      ],
      driverIds: ['d1'],
      createdAt: '2020-01-01T00:00:00Z',
    },
  ],
} as FuelScenario;

function baseReport(partial: Partial<WeeklyFuelReport> = {}): WeeklyFuelReport {
  return {
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
    miscellaneousCost: 10,
    companyShare: 40,
    driverShare: 40,
    status: 'Draft',
    healthStatus: 'Emerald',
    pendingCount: 1,
    ...partial,
  } as WeeklyFuelReport;
}

const pendingEntry = {
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

const vehicle = { id: 'v1', licensePlate: '5179KZ', currentDriverId: 'd1' } as Vehicle;

describe('fuel finalize golden week', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFinalizedReports.mockResolvedValue([]);
    mocks.saveFinalizedReports.mockResolvedValue({ success: true, saved: 1, failures: [] });
    mocks.closeFuelWeekCycles.mockResolvedValue(undefined);
    mocks.commitWeeklyStatement.mockResolvedValue(undefined);
    mocks.reverseEnterpriseFuelSyncForReport.mockResolvedValue(0);
    mocks.loadSettlementDeps.mockResolvedValue({
      vehicles: [vehicle],
      drivers: [{ id: 'd1', fuelScenarioId: 'fuel-scenario-1' }],
      scenarios: [percentageScenario],
    });
    mocks.setPersonalAllowanceBonusKm.mockResolvedValue(undefined);
  });

  it('posts one settlement and one snapshot when coverage is resolved and residual is in band', async () => {
    const result = await finalizeFuelWeekReports(
      [
        baseReport({
          // Categories + misc must tie spend (C-4 / missing_category_costs gate).
          rideShareCost: 70,
          companyUsageCost: 0,
          deadheadCost: 0,
          personalUsageCost: 0,
          miscellaneousCost: 10,
          totalGasCardCost: 80,
          companyShare: 40,
          driverShare: 40,
        }),
      ],
      {
        vehicles: [vehicle],
        drivers: [{ id: 'd1', name: 'Driver One', fuelScenarioId: 'fuel-scenario-1' }],
        fuelCards: [],
        fuelEntries: [pendingEntry],
        scenarios: [percentageScenario],
        trips: [],
        leakageReviewed: true,
        periodCounts: {
          'data-quality': { actionable: 0 },
          finalize: { actionable: 0 },
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.snapshotCount).toBe(1);
    expect(mocks.commitWeeklyStatement).toHaveBeenCalledTimes(1);
    expect(mocks.saveFinalizedReports).toHaveBeenCalledTimes(1);
  });

  it('refuses when coverage is unresolved and residual is under-explained unreviewed', async () => {
    const result = await finalizeFuelWeekReports(
      [
        baseReport({
          miscellaneousCost: 40,
          totalGasCardCost: 80,
        }),
      ],
      {
        vehicles: [vehicle],
        drivers: [{ id: 'd1' }],
        fuelCards: [],
        fuelEntries: [pendingEntry],
        scenarios: [],
        trips: [],
        leakageReviewed: false,
        periodCounts: {
          'data-quality': { actionable: 0 },
        },
      },
    );

    expect(result.ok).toBe(false);
    const joined = `${result.message || ''} ${result.failures.map((f) => f.error).join(' ')}`;
    expect(
      /under_explained_unreviewed|unresolved_coverage_rule/.test(joined),
    ).toBe(true);
    expect(mocks.commitWeeklyStatement).not.toHaveBeenCalled();
    expect(mocks.saveFinalizedReports).not.toHaveBeenCalled();
  });
});
