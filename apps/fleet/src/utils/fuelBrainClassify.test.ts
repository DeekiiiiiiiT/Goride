import { describe, it, expect } from 'vitest';
import { classifyFuelWeek } from './fuelBrainClassify';
import { evaluateUnknownFinalizeGate } from './fuelBrainUnknownGate';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { Vehicle } from '../types/vehicle';
import type { Trip } from '../types/data';
import type { FuelEntry } from '../types/fuel';

describe('classifyFuelWeek', () => {
  it('puts declared personal from odo sessions into Personal, not residual dump', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 500,
      tripRideshareKm: 300,
      companyOpsKm: 20,
      sessions: [
        {
          mode: 'personal',
          startAt: '2026-07-07T10:00:00Z',
          endAt: '2026-07-07T12:00:00Z',
          startOdo: 1000,
          endOdo: 1080,
        },
      ],
      deadheadHintKm: 50,
    });
    expect(result.personalKm).toBe(80);
    expect(result.rideShareKm).toBe(300);
    expect(result.companyOpsKm).toBe(20);
    // residual after known = 500-300-20-80 = 100; deadhead 50; unknown 50
    expect(result.deadheadKm).toBe(50);
    expect(result.unknownKm).toBe(50);
  });

  it('never auto-Personal: no sessions → leftover is Unknown', () => {
    const result = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      totalOdometerKm: 400,
      tripRideshareKm: 200,
      companyOpsKm: 0,
      sessions: [],
      deadheadHintKm: 40,
    });
    expect(result.personalKm).toBe(0);
    expect(result.deadheadKm).toBe(40);
    expect(result.unknownKm).toBe(160);
  });
});

describe('evaluateUnknownFinalizeGate', () => {
  it('blocks when unknown km above threshold unless acknowledged', () => {
    const reports = [{ unknownDistance: 40, totalTripDistance: 100 }];
    const blocked = evaluateUnknownFinalizeGate(reports, {
      unknownFinalizeThresholdKm: 25,
      unknownFinalizeThresholdPct: 10,
    });
    expect(blocked.blocked).toBe(true);
    const acked = evaluateUnknownFinalizeGate(
      reports,
      { unknownFinalizeThresholdKm: 25, unknownFinalizeThresholdPct: 10 },
      { acknowledge: true },
    );
    expect(acked.blocked).toBe(false);
    expect(acked.warnOnly).toBe(true);
  });
});

describe('flag-off recon parity (legacy residual)', () => {
  const vehicle = {
    id: 'v1',
    licensePlate: 'ABC',
    currentDriverId: 'd1',
    fuelSettings: { efficiencyCity: 10 },
  } as unknown as Vehicle;

  const weekStart = new Date(2026, 6, 6); // Jul 6 2026 local Monday-ish
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
          personalKm: 0,
          companyOpsKm: 0,
          deadheadKm: 50,
          unknownKm: 240,
        },
      },
    );

    expect(withIgnoredBrain.personalDistance).toBeCloseTo(legacy.personalDistance, 5);
    expect(withIgnoredBrain.deadheadDistance).toBeCloseTo(legacy.deadheadDistance, 5);
    expect(withIgnoredBrain.rideShareCost).toBeCloseTo(legacy.rideShareCost, 5);
    expect(withIgnoredBrain.miscellaneousCost).toBeCloseTo(legacy.miscellaneousCost, 5);
    expect(withIgnoredBrain.unknownDistance).toBeUndefined();
  });

  it('with brainClassification routes residual to Unknown instead of Personal', () => {
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
          personalKm: 0,
          companyOpsKm: 0,
          deadheadKm: 50,
          unknownKm: 240,
          method: 'fuel_brain_v1',
        },
      },
    );
    expect(brain.personalDistance).toBe(0);
    expect(brain.unknownDistance).toBeGreaterThan(0);
    expect(brain.metadata?.fuelBrain?.unknownKm).toBeGreaterThan(0);
  });
});
