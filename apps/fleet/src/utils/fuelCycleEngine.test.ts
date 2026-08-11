import { describe, expect, it } from 'vitest';
import { calculateFuelCycles } from './fuelCycleEngine';
import type { FuelEntry } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

function entry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-08-04',
    amount: 2000,
    liters: 10,
    vehicleId: '5179KZ',
    paymentSource: 'RideShare_Cash',
    entrySource: 'driver-portal',
    type: 'Card_Transaction',
    ...partial,
  } as FuelEntry;
}

const vehicle = {
  id: '5179KZ',
  specifications: { tankCapacity: 36 },
} as Vehicle;

describe('calculateFuelCycles — statement ledger isolation', () => {
  it('ignores jaa_raw statement rows so distance is not inflated to raw odometer', () => {
    const entries: FuelEntry[] = [
      entry({
        id: 'anchor-a',
        date: '2026-08-04T10:00:00',
        odometer: 174753,
        liters: 8.83,
        amount: 2000,
        metadata: {
          isSoftAnchor: true,
          isFullTank: true,
          isCapacityClose: true,
          volumeContributed: 6.99,
        },
      }),
      // Statement fill with liters but no odo — previously reset lastAnchor to 0
      entry({
        id: 'stmt-approved',
        date: '2026-08-05',
        odometer: null as any,
        liters: 19.57,
        amount: 4500,
        paymentSource: 'Gas_Card',
        entrySource: 'fuel-card',
        metadata: {
          importSource: 'jaa_raw',
          jaaRowKind: 'approved_fuel',
        },
      }),
      entry({
        id: 'stmt-fee',
        date: '2026-08-04',
        odometer: null as any,
        liters: 0,
        amount: 404.8,
        paymentSource: 'Gas_Card',
        entrySource: 'fuel-card',
        metadata: {
          importSource: 'jaa_raw',
          jaaRowKind: 'fee',
          countsInFuelSpend: false,
        },
      }),
      entry({
        id: 'jampet',
        date: '2026-08-05T20:25:00',
        odometer: 175238,
        liters: 19.565,
        amount: 4500,
        paymentSource: 'Gas_Card',
        entrySource: 'driver-portal',
        metadata: {
          volumeContributed: 19.57,
          cumulativeLitersAtEntry: 33.27,
        },
      }),
      entry({
        id: 'anchor-b',
        date: '2026-08-07T15:03:00',
        odometer: 175421,
        liters: 13.575,
        amount: 3000,
        metadata: {
          isSoftAnchor: true,
          isFullTank: true,
          isCapacityClose: true,
          volumeContributed: 2.73,
        },
      }),
    ];

    const cycles = calculateFuelCycles(entries, [vehicle]).filter((c) => c.status !== 'Active');
    expect(cycles.some((c) => c.distance >= 100000)).toBe(false);

    const closingAtMichael = cycles.find((c) => c.endOdometer === 175421);
    expect(closingAtMichael).toBeTruthy();
    // Prior real anchor is 174753 (statement rows ignored)
    expect(closingAtMichael!.distance).toBe(175421 - 174753);
    expect(closingAtMichael!.distance).toBeLessThan(1000);
  });
});
