import { describe, it, expect } from 'vitest';
import {
  applyDeadheadFloor,
  resolveDeadheadHintForBrain,
  DEFAULT_INDUSTRY_FALLBACK_PCT,
} from './deadheadHintForBrain';
import { classifyFuelWeek } from './fuelBrainClassify';

describe('applyDeadheadFloor', () => {
  it('raises under-claimed hints to Available × 35%', () => {
    // Kenny-like leftover ~650 km, gap hint ~20
    expect(applyDeadheadFloor(20, 650, 35)).toBeCloseTo(227.5, 1);
  });

  it('keeps hints above the floor', () => {
    expect(applyDeadheadFloor(300, 650, 35)).toBe(300);
  });

  it('never exceeds Available', () => {
    expect(applyDeadheadFloor(900, 650, 35)).toBe(650);
  });
});

describe('resolveDeadheadHintForBrain', () => {
  it('floors healthy but under-claimed server hints', () => {
    // Available = 1581 - 1300 = 281; floor = 98.35; hint 80 → 98.35
    expect(
      resolveDeadheadHintForBrain({
        server: {
          deadheadKm: 80,
          tripKm: 1300,
          totalOdometerKm: 1581,
          method: 'C',
          confidenceLevel: 'high',
        },
        clientTripRideshareKm: 1300,
        industryFallbackPct: DEFAULT_INDUSTRY_FALLBACK_PCT,
      }),
    ).toBeCloseTo(98.35, 1);
  });

  it('passes through hints already above the floor', () => {
    expect(
      resolveDeadheadHintForBrain({
        server: {
          deadheadKm: 150,
          tripKm: 1300,
          totalOdometerKm: 1581,
          method: 'C',
          confidenceLevel: 'high',
        },
        clientTripRideshareKm: 1300,
      }),
    ).toBe(150);
  });

  it('corrects trip-blind industry fallback so Personal is not starved', () => {
    // Kenny-like: server tripKm=0 → 35% of full 1581 = 553; client has ~1320 trip km
    const hint = resolveDeadheadHintForBrain({
      server: {
        deadheadKm: 553.35,
        tripKm: 0,
        totalOdometerKm: 1581,
        method: 'fallback',
        confidenceLevel: 'low',
      },
      clientTripRideshareKm: 1319,
      industryFallbackPct: 35,
    });
    // Available ≈ 262; hygiene + floor = 0.35 * 262 ≈ 91.7
    expect(hint).toBeCloseTo(91.7, 0);
    expect(hint).toBeLessThan(200);

    const brain = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: '5179KZ',
      weekStart: '2026-06-29',
      weekEnd: '2026-07-05',
      totalOdometerKm: 1581,
      tripRideshareKm: 1319,
      companyOpsKm: 0,
      deadheadHintKm: hint,
      industryFallbackPct: 35,
    });
    expect(brain.personalKm).toBeGreaterThan(100);
    expect(brain.deadheadKm + brain.personalKm).toBeCloseTo(262, 0);
    expect(
      brain.rideShareKm + brain.companyOpsKm + brain.deadheadKm + brain.personalKm,
    ).toBeCloseTo(1581, 0);
  });

  it('Fuel Brain still caps an overstated hint (brain itself is not the bug)', () => {
    const brain = classifyFuelWeek({
      driverId: 'd1',
      vehicleId: 'v1',
      weekStart: '2026-06-29',
      weekEnd: '2026-07-05',
      totalOdometerKm: 1581,
      tripRideshareKm: 1319,
      companyOpsKm: 0,
      deadheadHintKm: 553,
    });
    expect(brain.deadheadKm).toBeCloseTo(262, 0);
    expect(brain.personalKm).toBe(0);
  });
});
