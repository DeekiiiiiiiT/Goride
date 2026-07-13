import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from '../services/fuelCalculationService';
import { DEFAULT_PERSONAL_ALLOWANCE } from './personalAllowance';
import type { Vehicle } from '../types/vehicle';
import type { FuelEntry, FuelScenario } from '../types/fuel';
import type { Trip, QuotaConfig } from '../types/data';

const vehicle = {
  id: 'v1',
  licensePlate: 'TEST',
  currentDriverId: 'd1',
  fuelSettings: { efficiencyCity: 10 },
} as Vehicle;

const quota: QuotaConfig = {
  daily: { enabled: false, amount: 0 },
  weekly: { enabled: true, amount: 100_000 },
  monthly: { enabled: false, amount: 0 },
};

const scenario: FuelScenario = {
  id: 'sc1',
  name: 'Test',
  isDefault: true,
  rules: [
    {
      id: 'fr1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 0,
      rideShareCoverage: 50,
      companyUsageCoverage: 100,
      deadheadCoverage: 50,
      personalCoverage: 0,
      miscCoverage: 0,
    },
  ],
  versions: [
    {
      id: 'v1',
      effectiveFrom: '2000-01-03',
      rules: [
        {
          id: 'fr1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 0,
          rideShareCoverage: 50,
          companyUsageCoverage: 100,
          deadheadCoverage: 50,
          personalCoverage: 0,
          miscCoverage: 0,
        },
      ],
      driverIds: ['d1'],
      createdAt: '2000-01-03',
    },
  ],
};

function makeEntries(): FuelEntry[] {
  return [
    {
      id: 'e1',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-06-29',
      amount: 2000,
      liters: 10,
      odometer: 1000,
      reconciliationStatus: 'Pending',
    } as FuelEntry,
    {
      id: 'e2',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-07-05',
      amount: 2000,
      liters: 10,
      odometer: 1262,
      reconciliationStatus: 'Pending',
    } as FuelEntry,
  ];
}

describe('calculateReconciliation personal allowance', () => {
  const weekStart = new Date(2026, 5, 29);
  const weekEnd = new Date(2026, 6, 5);

  it('flag-off matches legacy personal split', () => {
    const trips: Trip[] = [
      {
        id: 't1',
        driverId: 'd1',
        vehicleId: 'v1',
        date: '2026-07-01',
        status: 'Completed',
        platform: 'Uber',
        amount: 72_000,
        distance: 100,
      } as Trip,
    ];
    const opts = {
      driverId: 'd1',
      brainClassification: {
        rideShareKm: 100,
        companyOpsKm: 0,
        deadheadKm: 0,
        personalKm: 162,
      },
    };
    const off = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      makeEntries(),
      [],
      [scenario],
      undefined,
      {
        ...opts,
        personalAllowance: {
          config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: false },
          quotaConfig: quota,
        },
      },
    );
    const legacy = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      makeEntries(),
      [],
      [scenario],
      undefined,
      opts,
    );
    expect(off.companyShare).toBeCloseTo(legacy.companyShare, 2);
    expect(off.driverShare).toBeCloseTo(legacy.driverShare, 2);
  });

  it('flag-on: company absorbs earned; overage to driver; shares balance', () => {
    const trips: Trip[] = [
      {
        id: 't1',
        driverId: 'd1',
        vehicleId: 'v1',
        date: '2026-07-01',
        status: 'Completed',
        platform: 'Uber',
        amount: 72_000,
        distance: 100,
      } as Trip,
    ];
    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      makeEntries(),
      [],
      [scenario],
      undefined,
      {
        driverId: 'd1',
        brainClassification: {
          rideShareKm: 100,
          companyOpsKm: 0,
          deadheadKm: 0,
          personalKm: 162,
        },
        personalAllowance: {
          config: { ...DEFAULT_PERSONAL_ALLOWANCE, enabled: true },
          quotaConfig: quota,
        },
      },
    );
    expect(report.metadata?.personalAllowance?.earnedKm).toBe(40);
    expect(report.metadata?.personalAllowance?.overageKm).toBe(122);
    expect(report.companyShare + report.driverShare).toBeCloseTo(report.totalGasCardCost, 1);
    expect(report.companyShare).toBeGreaterThanOrEqual(
      report.metadata!.personalAllowance!.earnedCost,
    );
  });
});
