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
});
