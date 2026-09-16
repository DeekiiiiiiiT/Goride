import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService.ts';
import type { MileageAdjustment } from './fuelTypes.ts';
import type { Vehicle } from './fuelTypes.ts';

const vehicle = {
  id: 'v1',
  licensePlate: 'TEST',
  fuelSettings: { tankCapacity: 50, efficiencyCity: 10 },
} as Vehicle;

function bucket(
  start: number,
  end: number,
  trips: Parameters<typeof FuelCalculationService.calculateOdometerBuckets>[2],
  adjustments: MileageAdjustment[] = [],
) {
  const entries = [
    {
      id: 'open',
      vehicleId: 'v1',
      date: '2026-01-01',
      odometer: start,
      liters: 0,
      amount: 0,
      type: 'Manual_Entry',
      metadata: { isAnchor: true, isHardAnchor: true },
    },
    {
      id: 'close',
      vehicleId: 'v1',
      date: '2026-01-02',
      odometer: end,
      liters: 20,
      amount: 2000,
      type: 'Card_Transaction',
      paymentSource: 'Gas_Card',
      metadata: { isHardAnchor: true, isFullTank: true },
    },
  ] as any[];
  return FuelCalculationService.calculateOdometerBuckets(vehicle, entries, trips, adjustments)[0];
}

describe('N-6 odometer bucket gap semantics', () => {
  it('unexplained fills residual; personal is evidenced-only; over-log ~0', () => {
    const b = bucket(1000, 1100, []);
    expect(b.rideShareDistance).toBe(0);
    expect(b.personalDistance).toBe(0);
    expect(b.unexplainedDistance).toBe(100);
    expect(b.unaccountedDistance).toBe(0);
    expect(b.status).toBe('Complete');
  });

  it('logged personal is evidence; unexplained shrinks; over-log still ~0', () => {
    const b = bucket(1000, 1100, [], [
      { id: 'a1', vehicleId: 'v1', date: '2026-01-01', type: 'Personal', distance: 30 } as MileageAdjustment,
    ]);
    expect(b.personalDistance).toBe(30);
    expect(b.unexplainedDistance).toBe(70);
    expect(b.unaccountedDistance).toBe(0);
  });

  it('over-explained logged categories yield true over-log gap (not inferred personal)', () => {
    const b = bucket(1000, 1100, [], [
      { id: 'a1', vehicleId: 'v1', date: '2026-01-01', type: 'Personal', distance: 60 } as MileageAdjustment,
      {
        id: 'a2',
        vehicleId: 'v1',
        date: '2026-01-01',
        type: 'Company_Misc',
        distance: 50,
      } as MileageAdjustment,
    ]);
    expect(b.personalDistance).toBe(60);
    expect(b.unexplainedDistance).toBe(0);
    expect(b.unaccountedDistance).toBe(10);
  });
});
