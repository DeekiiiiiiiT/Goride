import { describe, expect, it } from 'vitest';
import { resolvePeriodDistance } from './fuelPeriodTotals';
import type { FuelCycle, FuelEntry } from '../types/fuel';

describe('resolvePeriodDistance', () => {
  it('uses cycle distance as primary and fill-to-fill as secondary', () => {
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
        resetType: 'Auto_Soft',
      },
    ];
    const entries: FuelEntry[] = [
      {
        id: 'a',
        date: '2026-08-01',
        amount: 50,
        liters: 10,
        odometer: 1000,
        vehicleId: 'v1',
        type: 'Manual_Entry',
        entryMode: 'Floating',
        paymentSource: 'RideShare_Cash',
      },
      {
        id: 'b',
        date: '2026-08-05',
        amount: 50,
        liters: 10,
        odometer: 1100,
        vehicleId: 'v1',
        type: 'Manual_Entry',
        entryMode: 'Floating',
        paymentSource: 'RideShare_Cash',
      },
    ];
    const d = resolvePeriodDistance(cycles, entries);
    expect(d.primaryKm).toBe(200);
    expect(d.fillToFillKm).toBe(100);
  });
});
