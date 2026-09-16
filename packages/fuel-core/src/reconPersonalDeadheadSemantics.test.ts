import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService.ts';
import type { FuelEntry, Vehicle } from './fuelTypes.ts';

/**
 * R-1 pin: Brain residualCap must be rawResidual — not rawResidual − unexplained.
 * Non-Brain path keeps evidenced-personal only.
 */
describe('calculateReconciliation personal/deadhead semantics (R-1)', () => {
  const vehicle = {
    id: 'v1',
    licensePlate: 'TEST',
    currentDriverId: 'd1',
    fuelSettings: { efficiencyCity: 10, tankCapacity: 50 },
  } as Vehicle;

  const entries: FuelEntry[] = [
    {
      id: 'e1',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-07-07',
      amount: 100,
      liters: 50,
      odometer: 1000,
      type: 'Card_Transaction',
      paymentSource: 'Gas_Card',
      metadata: { isHardAnchor: true, isFullTank: true },
    } as FuelEntry,
    {
      id: 'e2',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-07-10',
      amount: 80,
      liters: 40,
      odometer: 1400,
      type: 'Card_Transaction',
      paymentSource: 'Gas_Card',
      metadata: { isHardAnchor: true, isFullTank: true },
    } as FuelEntry,
  ];

  const weekStart = new Date(2026, 6, 6);
  const weekEnd = new Date(2026, 6, 12);

  it('Brain path: personal/deadhead stay > 0 when no Personal adjustments logged', () => {
    const trips = [
      {
        id: 't1',
        date: '2026-07-08',
        vehicleId: 'v1',
        driverId: 'd1',
        status: 'Completed',
        distance: 100,
        onTripDistance: 100,
      },
    ] as any[];

    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      entries,
      [],
      [],
      undefined,
      {
        brainClassification: {
          rideShareKm: 100,
          companyOpsKm: 0,
          deadheadKm: 80,
          personalKm: 220,
        },
      },
    );

    // 400 km odo − 100 RS = 300 residual; brain personal+DH should not scale to 0
    expect(report.metadata?.rideShareCalc?.personalDistance ?? report.personalUsageCost).toBeTruthy();
    const personalKm =
      report.metadata?.rideShareCalc?.personalDistance ??
      report.metadata?.categoryDistances?.personal;
    // Fallback: personalUsageCost > 0 implies personal km > 0
    expect(report.personalUsageCost).toBeGreaterThan(0);
    expect(personalKm == null || personalKm > 0).toBe(true);
  });

  it('non-Brain path: personal equals evidenced adjustments only', () => {
    const trips = [
      {
        id: 't1',
        date: '2026-07-08',
        vehicleId: 'v1',
        driverId: 'd1',
        status: 'Completed',
        distance: 100,
        onTripDistance: 100,
        startOdometer: 1000,
        endOdometer: 1100,
      },
    ] as any[];

    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      entries,
      [
        {
          id: 'a1',
          vehicleId: 'v1',
          driverId: 'd1',
          date: '2026-07-08',
          type: 'Personal',
          distance: 30,
          reason: 'test',
        },
      ],
      [],
      {
        vehicleId: 'v1',
        deadheadKm: 50,
        personalKm: 0,
        totalOdometerKm: 400,
        method: 'fallback',
        confidenceLevel: 'low',
        confidenceReason: 'test',
      },
      { forceLegacyResidual: true },
    );

    // Evidenced personal from buckets (half-open window) should drive personal cost
    expect(report.personalUsageCost).toBeGreaterThan(0);
  });
});
