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
      industryFallbackPct: 35,
    });
    expect(result.rideShareKm).toBe(300);
    expect(result.companyOpsKm).toBe(20);
    // Available = 180; floor = 63; hint 50 → Deadhead 63
    expect(result.deadheadKm).toBeCloseTo(63, 5);
    expect(result.personalKm).toBeCloseTo(117, 5);
    expect(
      result.rideShareKm + result.companyOpsKm + result.deadheadKm + result.personalKm,
    ).toBeCloseTo(500, 5);
  });

  it('leftover after deadhead is Personal (no Unknown); floor raises under-claimed DH', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 400,
      tripRideshareKm: 200,
      companyOpsKm: 0,
      deadheadHintKm: 40,
      industryFallbackPct: 35,
    });
    // Available = 200; floor = 70; hint 40 → Deadhead 70; Personal 130
    expect(result.deadheadKm).toBeCloseTo(70, 5);
    expect(result.personalKm).toBeCloseTo(130, 5);
    expect(result.method).toBe('fuel_brain_v2');
  });

  it('Kenny-like under-claim: gap hint 20 on Available 650 → floor ~227.5', () => {
    const result = classifyFuelWeek({
      driverId: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
      vehicleId: '5179KZ',
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26',
      totalOdometerKm: 1819,
      tripRideshareKm: 1169,
      companyOpsKm: 0,
      deadheadHintKm: 20,
      industryFallbackPct: 35,
    });
    expect(result.availableKm).toBe(650);
    expect(result.deadheadKm).toBeCloseTo(227.5, 1);
    expect(result.personalKm).toBeCloseTo(422.5, 1);
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

  it('keeps hint when already above industry floor', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 500,
      tripRideshareKm: 300,
      companyOpsKm: 0,
      deadheadHintKm: 120,
      industryFallbackPct: 35,
    });
    // Available = 200; floor = 70; hint 120 stays
    expect(result.deadheadKm).toBe(120);
    expect(result.personalKm).toBe(80);
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
