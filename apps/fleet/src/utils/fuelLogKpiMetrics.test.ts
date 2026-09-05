import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import type { FuelCycle } from '../types/fuel';
import {
  buildCycleKpis,
  buildTransactionKpis,
  sumOdometerDeltasBetweenFills,
} from './fuelLogKpiMetrics';

function makeEntry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-08-24',
    amount: 100,
    liters: 10,
    type: 'Manual_Entry',
    entryMode: 'Floating',
    paymentSource: 'RideShare_Cash',
    ...partial,
  } as FuelEntry;
}

describe('sumOdometerDeltasBetweenFills', () => {
  it('sums positive consecutive odo deltas per vehicle', () => {
    const entries: FuelEntry[] = [
      makeEntry({
        id: 'a',
        vehicleId: 'v1',
        date: '2026-08-20',
        odometer: 1000,
      }),
      makeEntry({
        id: 'b',
        vehicleId: 'v1',
        date: '2026-08-21',
        odometer: 1100,
      }),
      makeEntry({
        id: 'c',
        vehicleId: 'v1',
        date: '2026-08-22',
        odometer: 1250,
      }),
    ];
    expect(sumOdometerDeltasBetweenFills(entries)).toBe(250);
  });

  it('ignores JAA statement rows and backwards odo', () => {
    const entries: FuelEntry[] = [
      makeEntry({
        id: 'a',
        vehicleId: 'v1',
        date: '2026-08-20',
        odometer: 1000,
      }),
      makeEntry({
        id: 'b',
        vehicleId: 'v1',
        date: '2026-08-21',
        odometer: 900,
      }),
    ];
    expect(sumOdometerDeltasBetweenFills(entries)).toBe(0);
  });
});

describe('buildTransactionKpis', () => {
  it('returns total fills, spend, volume, and total km', () => {
    const entries: FuelEntry[] = [
      makeEntry({
        id: '1',
        vehicleId: 'v1',
        date: '2026-08-20',
        amount: 100,
        liters: 10,
        odometer: 1000,
      }),
      makeEntry({
        id: '2',
        vehicleId: 'v1',
        date: '2026-08-21',
        amount: 50,
        liters: 5,
        odometer: 1100,
      }),
      makeEntry({
        id: '3',
        vehicleId: 'v2',
        date: '2026-08-22',
        amount: 25,
        liters: 2,
        odometer: 50,
      }),
    ];
    const kpis = buildTransactionKpis(entries, {
      dateRange: { from: new Date('2026-08-01'), to: new Date('2026-08-31') },
    });
    expect(kpis.totalFills).toBe(3);
    expect(kpis.totalSpend).toBe(175);
    expect(kpis.totalVolume).toBe(17);
    // v1: 1100-1000 = 100; v2 has only one fill so no delta
    expect(kpis.totalKm).toBe(100);
  });

  it('excludes JAA fee/declines from spend and volume', () => {
    const entries: FuelEntry[] = [
      makeEntry({
        id: '1',
        vehicleId: 'v1',
        date: '2026-08-20',
        amount: 100,
        liters: 10,
      }),
      makeEntry({
        id: '2',
        vehicleId: 'v1',
        date: '2026-08-21',
        amount: 5,
        liters: 0,
        metadata: { jaaRowKind: 'fee' } as any,
      }),
    ];
    const kpis = buildTransactionKpis(entries);
    // JAA fee rows are not in Transaction Logs (filtered out entirely)
    expect(kpis.totalFills).toBe(1);
    expect(kpis.totalSpend).toBe(100);
    expect(kpis.totalVolume).toBe(10);
  });

  it('applies vehicle filter', () => {
    const entries: FuelEntry[] = [
      makeEntry({
        id: '1',
        vehicleId: 'v1',
        date: '2026-08-20',
        amount: 100,
      }),
      makeEntry({
        id: '2',
        vehicleId: 'v2',
        date: '2026-08-21',
        amount: 50,
      }),
    ];
    const kpis = buildTransactionKpis(entries, { vehicleId: 'v2' });
    expect(kpis.totalFills).toBe(1);
    expect(kpis.totalSpend).toBe(50);
  });
});

describe('buildCycleKpis', () => {
  it('aggregates cycle status, distance, fuel, spend, efficiency', () => {
    const cycles: FuelCycle[] = [
      {
        id: 'c1',
        vehicleId: 'v1',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        totalLiters: 20,
        totalCost: 100,
        avgPricePerLiter: 5,
        transactions: [],
        status: 'Complete',
        distance: 200,
        efficiency: 10,
      },
      {
        id: 'c2',
        vehicleId: 'v1',
        startDate: '2026-08-11',
        endDate: '2026-08-15',
        totalLiters: 10,
        totalCost: 50,
        avgPricePerLiter: 5,
        transactions: [],
        status: 'Active',
        distance: 80,
        efficiency: 8,
      },
      {
        id: 'c3',
        vehicleId: 'v2',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        totalLiters: 5,
        totalCost: 25,
        avgPricePerLiter: 5,
        transactions: [],
        status: 'Anomaly',
        distance: 40,
        efficiency: 8,
        signalTier: 'exception',
      },
    ];

    const kpis = buildCycleKpis(cycles, {
      dateRange: { from: new Date('2026-08-01'), to: new Date('2026-08-31') },
    });
    expect(kpis.totalCycles).toBe(3);
    expect(kpis.completed).toBe(1);
    expect(kpis.active).toBe(1);
    expect(kpis.exceptions).toBe(1);
    expect(kpis.totalDistance).toBe(320);
    expect(kpis.totalFuel).toBe(35);
    expect(kpis.totalSpend).toBe(175);
    expect(kpis.avgEfficiency).toBe(9.14);
  });

  it('filters by vehicle', () => {
    const cycles: FuelCycle[] = [
      {
        id: 'c1',
        vehicleId: 'v1',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        totalLiters: 20,
        totalCost: 100,
        avgPricePerLiter: 5,
        transactions: [],
        status: 'Complete',
        distance: 200,
        efficiency: 10,
      },
      {
        id: 'c2',
        vehicleId: 'v2',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        totalLiters: 5,
        totalCost: 25,
        avgPricePerLiter: 5,
        transactions: [],
        status: 'Complete',
        distance: 40,
        efficiency: 8,
      },
    ];
    const kpis = buildCycleKpis(cycles, { vehicleId: 'v2' });
    expect(kpis.totalCycles).toBe(1);
    expect(kpis.totalDistance).toBe(40);
  });
});
