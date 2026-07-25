import { describe, expect, it } from 'vitest';
import {
  buildVehicleFuelStats,
  buildFuelComposition,
  pctDelta,
  isAnomalyEntry,
  normalizeFuelTypeLabel,
} from '../fuelAnalyticsAggregates';
import type { FuelEntry } from '../../types/fuel';
import type { Vehicle } from '../../types/vehicle';

const vehicles: Vehicle[] = [
  {
    id: 'v1',
    licensePlate: '5179KZ',
    model: 'Corolla',
    status: 'Active',
    fuelSettings: { fuelType: 'Gasoline_87', efficiencyCity: 8, efficiencyHighway: 6, tankCapacity: 50 },
  } as Vehicle,
  {
    id: 'v2',
    licensePlate: '1505LM',
    model: 'Hilux',
    status: 'Active',
    fuelSettings: { fuelType: 'Diesel', efficiencyCity: 10, efficiencyHighway: 8, tankCapacity: 80 },
  } as Vehicle,
];

function entry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-07-20',
    amount: 0,
    type: 'Card_Transaction',
    entryMode: 'Anchor',
    paymentSource: 'Gas_Card',
    ...partial,
  } as FuelEntry;
}

describe('fuelAnalyticsAggregates', () => {
  it('pctDelta handles zero baseline', () => {
    expect(pctDelta(10, 0)).toBeNull();
    expect(pctDelta(110, 100)).toBeCloseTo(10);
  });

  it('builds per-vehicle efficiency from odo span', () => {
    const entries = [
      entry({ id: 'a', vehicleId: 'v1', liters: 40, amount: 8000, odometer: 1000 }),
      entry({ id: 'b', vehicleId: 'v1', liters: 40, amount: 8000, odometer: 1500, date: '2026-07-22' }),
      entry({ id: 'c', vehicleId: 'v2', liters: 50, amount: 9000, odometer: 2000, date: '2026-07-21' }),
    ];
    const stats = buildVehicleFuelStats(entries, vehicles);
    const v1 = stats.find((s) => s.vehicleId === 'v1')!;
    expect(v1.distanceKm).toBe(500);
    expect(v1.totalLiters).toBe(80);
    expect(v1.efficiencyKmL).toBeCloseTo(6.25);
    expect(v1.label).toBe('5179KZ');
  });

  it('composition groups petrol vs diesel', () => {
    const entries = [
      entry({ id: 'a', vehicleId: 'v1', amount: 100 }),
      entry({ id: 'b', vehicleId: 'v2', amount: 300 }),
    ];
    const slices = buildFuelComposition(entries, vehicles);
    expect(normalizeFuelTypeLabel('Gasoline_87')).toBe('Petrol');
    const diesel = slices.find((s) => s.name === 'Diesel');
    const petrol = slices.find((s) => s.name === 'Petrol');
    expect(diesel?.pct).toBe(75);
    expect(petrol?.pct).toBe(25);
  });

  it('flags overfill / critical metadata as anomaly', () => {
    expect(
      isAnomalyEntry(
        entry({
          id: 'x',
          metadata: { anomalyReason: 'Tank Overfill Anomaly', integrityStatus: 'critical' },
        }),
      ),
    ).toBe(true);
    expect(isAnomalyEntry(entry({ id: 'y' }))).toBe(false);
  });
});
