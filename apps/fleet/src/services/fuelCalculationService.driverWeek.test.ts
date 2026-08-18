import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { FuelScenario } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

const defaultPolicy: FuelScenario = {
  id: 'def',
  name: 'Standard',
  isDefault: true,
  rules: [
    {
      id: 'r1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 0,
      rideShareCoverage: 80,
      companyUsageCoverage: 100,
      deadheadCoverage: 50,
      personalCoverage: 0,
      miscCoverage: 50,
    },
  ],
  versions: [
    {
      id: 'vd',
      effectiveFrom: '2000-01-03',
      rules: [
        {
          id: 'r1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 0,
          rideShareCoverage: 80,
          companyUsageCoverage: 100,
          deadheadCoverage: 50,
          personalCoverage: 0,
          miscCoverage: 50,
        },
      ],
      driverIds: ['d1'],
      createdAt: 'x',
    },
  ],
};

const quotaPolicy: FuelScenario = {
  id: 'quota',
  name: 'Quota Met',
  isDefault: false,
  rules: [
    {
      id: 'r2',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 0,
      rideShareCoverage: 100,
      companyUsageCoverage: 100,
      deadheadCoverage: 100,
      personalCoverage: 0,
      miscCoverage: 100,
    },
  ],
  versions: [
    {
      id: 'vq',
      effectiveFrom: '2000-01-03',
      rules: [
        {
          id: 'r2',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 0,
          rideShareCoverage: 100,
          companyUsageCoverage: 100,
          deadheadCoverage: 100,
          personalCoverage: 0,
          miscCoverage: 100,
        },
      ],
      driverIds: ['d2'],
      createdAt: 'x',
    },
  ],
};

describe('generateDriverFleetReport shared car', () => {
  const vehicle = {
    id: 'v1',
    licensePlate: '5179KZ',
    currentDriverId: 'd2',
    fuelSettings: { fuelType: 'Gasoline_87', efficiencyCity: 10, efficiencyHighway: 8, tankCapacity: 40 },
  } as Vehicle;

  const weekStart = new Date(2026, 5, 29); // Jun 29 2026 local
  const weekEnd = new Date(2026, 6, 5);

  it('splits one vehicle week into two driver rows with each policy', () => {
    const reports = FuelCalculationService.generateDriverFleetReport(
      [vehicle],
      [
        { id: 'd1', fuelScenarioId: 'def', name: 'Driver A' },
        { id: 'd2', fuelScenarioId: 'quota', name: 'Driver B' },
      ],
      weekStart,
      weekEnd,
      [
        {
          id: 't1',
          driverId: 'd1',
          vehicleId: 'v1',
          date: '2026-06-30',
          status: 'Completed',
          distance: 100,
        } as any,
        {
          id: 't2',
          driverId: 'd2',
          vehicleId: 'v1',
          date: '2026-07-02',
          status: 'Completed',
          distance: 50,
        } as any,
      ],
      [
        {
          id: 'e1',
          date: '2026-06-30',
          vehicleId: 'v1',
          driverId: 'd1',
          amount: 100,
          liters: 50,
          type: 'Card_Transaction',
          entryMode: 'Floating',
          paymentSource: 'Gas_Card',
        },
        {
          id: 'e2',
          date: '2026-07-02',
          vehicleId: 'v1',
          driverId: 'd2',
          amount: 80,
          liters: 40,
          type: 'Card_Transaction',
          entryMode: 'Floating',
          paymentSource: 'Gas_Card',
        },
      ],
      [],
      [defaultPolicy, quotaPolicy],
    );

    expect(reports.length).toBe(2);
    const a = reports.find((r) => r.driverId === 'd1');
    const b = reports.find((r) => r.driverId === 'd2');
    expect(a?.totalGasCardCost).toBe(100);
    expect(b?.totalGasCardCost).toBe(80);
    expect(a?.metadata?.scenarioId).toBe('def');
    expect(b?.metadata?.scenarioId).toBe('quota');
    // Quota policy is more company-friendly — driver share of rideShare should be lower for d2 vs flat ratio
    expect(b!.driverShare).toBeLessThanOrEqual(a!.driverShare + 0.01);
  });

  it('flags odometerIncomplete when fills exist but buckets cannot be built', () => {
    const reports = FuelCalculationService.generateDriverFleetReport(
      [vehicle],
      [{ id: 'd1', name: 'Driver A' }],
      weekStart,
      weekEnd,
      [],
      [
        {
          id: 'e-no-odo',
          vehicleId: 'v1',
          driverId: 'd1',
          date: '2026-06-30',
          amount: 50,
          type: 'Card_Transaction',
          entryMode: 'Floating',
          paymentSource: 'Gas_Card',
          reconciliationStatus: 'Pending',
        } as any,
      ],
      [],
      [defaultPolicy],
    );
    const row = reports.find((r) => r.driverId === 'd1');
    expect(row?.dataQuality?.odometerIncomplete).toBe(true);
  });

  it('multi-vehicle Personal Allowance merge keeps bucket sum equal to total spend', () => {
    const v1 = {
      id: 'v1',
      licensePlate: 'AAA111',
      currentDriverId: 'd1',
      fuelSettings: { fuelType: 'Gasoline_87', efficiencyCity: 10, efficiencyHighway: 8, tankCapacity: 40 },
    } as Vehicle;
    const v2 = {
      id: 'v2',
      licensePlate: 'BBB222',
      currentDriverId: 'd1',
      fuelSettings: { fuelType: 'Gasoline_87', efficiencyCity: 10, efficiencyHighway: 8, tankCapacity: 40 },
    } as Vehicle;
    const pa = {
      config: {
        enabled: true,
        weeklyQuotaOverrideJmd: 100000,
        nextWeekBonusKm: 0,
        bands: [{ minPctInclusive: 0, maxPctExclusive: null, earnedKm: 80 }],
      },
      ledgerGrossByDriverId: new Map([['d1', 120000]]),
    };

    const reports = FuelCalculationService.generateDriverFleetReport(
      [v1, v2],
      [{ id: 'd1', name: 'Driver' }],
      weekStart,
      weekEnd,
      [
        { id: 't1', driverId: 'd1', vehicleId: 'v1', date: '2026-06-30', status: 'Completed', distance: 40 } as any,
        { id: 't2', driverId: 'd1', vehicleId: 'v2', date: '2026-07-02', status: 'Completed', distance: 30 } as any,
      ],
      [
        {
          id: 'e1',
          vehicleId: 'v1',
          driverId: 'd1',
          date: '2026-06-30',
          amount: 60,
          liters: 30,
          odometer: 1000,
          type: 'Card_Transaction',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          reconciliationStatus: 'Pending',
        } as any,
        {
          id: 'e2',
          vehicleId: 'v1',
          driverId: 'd1',
          date: '2026-07-01',
          amount: 40,
          liters: 20,
          odometer: 1300,
          type: 'Card_Transaction',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          reconciliationStatus: 'Pending',
        } as any,
        {
          id: 'e3',
          vehicleId: 'v2',
          driverId: 'd1',
          date: '2026-07-02',
          amount: 50,
          liters: 25,
          odometer: 2000,
          type: 'Card_Transaction',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          reconciliationStatus: 'Pending',
        } as any,
        {
          id: 'e4',
          vehicleId: 'v2',
          driverId: 'd1',
          date: '2026-07-04',
          amount: 50,
          liters: 25,
          odometer: 2250,
          type: 'Card_Transaction',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          reconciliationStatus: 'Pending',
        } as any,
      ],
      [],
      [defaultPolicy],
      undefined,
      [],
      undefined,
      pa,
    );

    const row = reports.find((r) => r.driverId === 'd1');
    expect(row).toBeTruthy();
    const buckets =
      (row!.rideShareCost || 0) +
      (row!.companyUsageCost || 0) +
      (row!.deadheadCost || 0) +
      (row!.personalUsageCost || 0) +
      (row!.miscellaneousCost || 0);
    expect(buckets).toBeCloseTo(row!.totalGasCardCost, 1);
    expect(row!.driverShare + row!.companyShare).toBeCloseTo(row!.totalGasCardCost, 1);
  });
});
