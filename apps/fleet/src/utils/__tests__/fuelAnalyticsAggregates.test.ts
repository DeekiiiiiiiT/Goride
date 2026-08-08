import { describe, expect, it } from 'vitest';
import {
  buildVehicleFuelStats,
  buildFuelComposition,
  pctDelta,
  isAnomalyEntry,
  normalizeFuelTypeLabel,
  buildDailyConsumption,
} from '../fuelAnalyticsAggregates';
import {
  countsInFuelLogSpend,
  fuelOpsSpendAmount,
  isFuelOpsLogEntry,
} from '../fuelOpsEligibility';
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
    // Velocity / frequency warnings are not Potential Loss
    expect(
      isAnomalyEntry(
        entry({
          id: 'z',
          metadata: {
            anomalyReason: ' High Transaction Frequency; High Fuel Velocity ($/km);',
            integrityStatus: 'warning',
          },
        }),
      ),
    ).toBe(false);
  });

  it('excludes JAA statement ledger from spend (no fee/decline/duplicate)', () => {
    const driverFill = entry({
      id: 'driver',
      vehicleId: 'v1',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      liters: 19.565,
      amount: 4500,
      date: '2026-08-05',
      odometer: 1200,
    });
    const matchedStmt = entry({
      id: 'stmt-approved',
      vehicleId: 'v1',
      entrySource: 'fuel-card',
      paymentSource: 'Gas_Card',
      liters: 19.57,
      amount: 4500,
      date: '2026-08-05',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'approved_fuel' },
    });
    const fee = entry({
      id: 'stmt-fee',
      vehicleId: 'v1',
      entrySource: 'fuel-card',
      amount: 404.8,
      liters: 0,
      date: '2026-08-06',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'fee', countsInFuelSpend: false },
    });
    const declined = entry({
      id: 'stmt-declined',
      vehicleId: 'v1',
      entrySource: 'fuel-card',
      amount: 4500,
      liters: 0,
      date: '2026-08-06',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'declined', countsInFuelSpend: false },
    });
    const cashFill = entry({
      id: 'cash',
      vehicleId: 'v1',
      type: 'Manual_Entry',
      entrySource: 'driver-portal',
      paymentSource: 'RideShare_Cash',
      liters: 10,
      amount: 2000,
      date: '2026-08-07',
      odometer: 1300,
    });

    expect(isFuelOpsLogEntry(matchedStmt)).toBe(false);
    expect(isFuelOpsLogEntry(fee)).toBe(false);
    expect(isFuelOpsLogEntry(driverFill)).toBe(true);
    expect(countsInFuelLogSpend(fee)).toBe(false);
    expect(fuelOpsSpendAmount(matchedStmt)).toBe(0);

    const all = [driverFill, matchedStmt, fee, declined, cashFill];
    const stats = buildVehicleFuelStats(all, vehicles);
    const v1 = stats.find((s) => s.vehicleId === 'v1')!;
    expect(v1.totalCost).toBe(6500); // 4500 + 2000 — not double-counted statement rows
    expect(v1.totalLiters).toBeCloseTo(29.565);
    expect(v1.refuelCount).toBe(2); // driver + cash only

    const daily = buildDailyConsumption(all, {
      preset: 'custom',
      startYmd: '2026-08-05',
      endYmd: '2026-08-07',
    });
    const weekCost = daily.reduce((s, d) => s + d.cost, 0);
    expect(weekCost).toBe(6500);
  });
});
