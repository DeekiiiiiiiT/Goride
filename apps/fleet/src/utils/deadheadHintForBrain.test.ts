import { describe, it, expect } from 'vitest';
import {
  applyDeadheadFloor,
  resolveDeadheadHintForBrain,
  DEFAULT_INDUSTRY_FALLBACK_PCT,
} from './deadheadHintForBrain';
import { classifyFuelWeek } from './fuelBrainClassify';

describe('applyDeadheadFloor', () => {
  it('keeps an under-claimed hint instead of raising it to 35%', () => {
    expect(applyDeadheadFloor(20, 650, 35)).toBeCloseTo(20, 1);
  });

  it('keeps hints above the floor', () => {
    expect(applyDeadheadFloor(300, 650, 35)).toBe(300);
  });

  it('never exceeds Available', () => {
    expect(applyDeadheadFloor(900, 650, 35)).toBe(650);
  });
});

describe('resolveDeadheadHintForBrain', () => {
  it('keeps a healthy hint that is under the old 35% floor', () => {
    // Available = 1581 - 1300 = 281; hint 80 stays 80
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
    ).toBeCloseTo(80, 1);
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
    expect(hint).toBe(0);

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
    expect(brain.personalKm).toBe(0);
    expect(brain.unattributedKm).toBeGreaterThan(100);
    expect(brain.deadheadKm + brain.unattributedKm).toBeCloseTo(262, 0);
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
