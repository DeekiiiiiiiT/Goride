import { describe, it, expect } from 'vitest';
import { classifyFuelWeek } from './fuelBrainClassify';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { Vehicle } from '../types/vehicle';
import type { Trip } from '../types/data';
import type { FuelEntry } from '../types/fuel';

describe('classifyFuelWeek residual Personal', () => {
  it('RS + CO + DH + Personal closes odo', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 500,
      tripRideshareKm: 300,
      companyOpsKm: 20,
      deadheadHintKm: 50,
    });
    expect(result.rideShareKm).toBe(300);
    expect(result.companyOpsKm).toBe(20);
    expect(result.deadheadKm).toBe(50);
    expect(result.personalKm).toBe(130);
    expect(
      result.rideShareKm + result.companyOpsKm + result.deadheadKm + result.personalKm,
    ).toBeCloseTo(500, 5);
  });

  it('leftover after deadhead is Personal (no Unknown)', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 400,
      tripRideshareKm: 200,
      companyOpsKm: 0,
      deadheadHintKm: 40,
    });
    expect(result.personalKm).toBe(160);
    expect(result.deadheadKm).toBe(40);
    expect(result.method).toBe('fuel_brain_v2');
  });

  it('caps deadhead so it cannot exceed Available', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 100,
      tripRideshareKm: 80,
      companyOpsKm: 10,
      deadheadHintKm: 50,
    });
    expect(result.availableKm).toBe(10);
    expect(result.deadheadKm).toBe(10);
    expect(result.personalKm).toBe(0);
  });
});

describe('flag-off recon parity (legacy residual)', () => {
  const vehicle = {
    id: 'v1',
    licensePlate: 'ABC',
    currentDriverId: 'd1',
    fuelSettings: { efficiencyCity: 10 },
  } as unknown as Vehicle;

  const weekStart = new Date(2026, 6, 6);
  const weekEnd = new Date(2026, 6, 12);

  const entries: FuelEntry[] = [
    {
      id: 'e1',
      date: '2026-07-07',
      vehicleId: 'v1',
      driverId: 'd1',
      amount: 100,
      liters: 50,
      odometer: 1000,
      type: 'Card_Transaction',
      entryMode: 'Anchor',
      paymentSource: 'Gas_Card',
      reconciliationStatus: 'Pending',
    } as FuelEntry,
    {
      id: 'e2',
      date: '2026-07-10',
      vehicleId: 'v1',
      driverId: 'd1',
      amount: 80,
      liters: 40,
      odometer: 1400,
      type: 'Card_Transaction',
      entryMode: 'Anchor',
      paymentSource: 'Gas_Card',
      reconciliationStatus: 'Pending',
    } as FuelEntry,
  ];

  const trips: Trip[] = [
    {
      id: 't1',
      date: '2026-07-08',
      vehicleId: 'v1',
      driverId: 'd1',
      status: 'Completed',
      distance: 100,
      normalizedEnrouteDistance: 10,
    } as Trip,
  ];

  it('without brainClassification matches legacy personal = residual - deadhead', () => {
    const legacy = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      entries,
      [],
      [],
      {
        vehicleId: 'v1',
        deadheadKm: 50,
        personalKm: 240,
        totalOdometerKm: 400,
        method: 'fallback',
        confidenceLevel: 'low',
        confidenceReason: 'test',
      },
    );

    const withIgnoredBrain = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      entries,
      [],
      [],
      {
        vehicleId: 'v1',
        deadheadKm: 50,
        personalKm: 240,
        totalOdometerKm: 400,
        method: 'fallback',
        confidenceLevel: 'low',
        confidenceReason: 'test',
      },
      {
        forceLegacyResidual: true,
        brainClassification: {
          rideShareKm: 110,
          personalKm: 240,
          companyOpsKm: 0,
          deadheadKm: 50,
        },
      },
    );

    expect(withIgnoredBrain.personalDistance).toBeCloseTo(legacy.personalDistance, 5);
    expect(withIgnoredBrain.deadheadDistance).toBeCloseTo(legacy.deadheadDistance, 5);
    expect(withIgnoredBrain.rideShareCost).toBeCloseTo(legacy.rideShareCost, 5);
    expect(withIgnoredBrain.miscellaneousCost).toBeCloseTo(legacy.miscellaneousCost, 5);
  });

  it('with brainClassification puts residual in Personal', () => {
    const brain = FuelCalculationService.calculateReconciliation(
      vehicle,
      weekStart,
      weekEnd,
      trips,
      entries,
      [],
      [],
      {
        vehicleId: 'v1',
        deadheadKm: 50,
        personalKm: 240,
        totalOdometerKm: 400,
        method: 'fallback',
        confidenceLevel: 'low',
        confidenceReason: 'test',
      },
      {
        brainClassification: {
          rideShareKm: 110,
          personalKm: 240,
          companyOpsKm: 0,
          deadheadKm: 50,
          method: 'fuel_brain_v2',
        },
      },
    );
    expect(brain.personalDistance).toBeGreaterThan(0);
    expect(brain.unknownDistance).toBeUndefined();
  });
});
