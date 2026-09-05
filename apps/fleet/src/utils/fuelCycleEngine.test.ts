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

describe('calculateFuelCycles — tank capacity guard', () => {
  it('skips legacy (unstamped) cycle math when tank capacity is unknown — no silent 40L', () => {
    const noCapVehicle = { id: 'NOCAP' } as Vehicle;
    const entries: FuelEntry[] = [
      entry({ id: 'a', vehicleId: 'NOCAP', odometer: 1000, liters: 35 }),
      entry({ id: 'b', vehicleId: 'NOCAP', odometer: 1500, liters: 35 }),
    ];
    expect(calculateFuelCycles(entries, [noCapVehicle])).toEqual([]);
  });

  it('still builds cycles from server capacity-close stamps when tank capacity is unknown', () => {
    const noCapVehicle = { id: 'NOCAP' } as Vehicle;
    const entries: FuelEntry[] = [
      entry({
        id: 'a',
        vehicleId: 'NOCAP',
        odometer: 1000,
        liters: 35,
        metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true, volumeContributed: 35 },
      }),
      entry({
        id: 'b',
        vehicleId: 'NOCAP',
        odometer: 1500,
        liters: 35,
        metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true, volumeContributed: 35 },
      }),
    ];
    const closed = calculateFuelCycles(entries, [noCapVehicle]).filter((c) => c.status !== 'Active');
    expect(closed.length).toBeGreaterThanOrEqual(1);
    expect(closed[0].distance).toBe(500);
  });
});

describe('calculateFuelCycles — chain origin + odometer regression', () => {
  it('marks the first cycle after the chain origin and preserves opening spillover', () => {
    const entries: FuelEntry[] = [
      // Chain origin: over-capacity first anchor (8.83L, only 6.99 fits → 1.84 spillover)
      entry({ id: 'origin', date: '2026-08-04T10:00:00', odometer: 100000, liters: 8.83, metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true, volumeContributed: 6.99 } }),
      entry({ id: 'mid', date: '2026-08-05T10:00:00', odometer: 100200, liters: 20 }),
      entry({ id: 'close', date: '2026-08-06T10:00:00', odometer: 100450, liters: 13.5, metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true, volumeContributed: 2.73 } }),
    ];
    const closed = calculateFuelCycles(entries, [vehicle]).filter((c) => c.status !== 'Active');
    const first = closed.find((c) => c.endOdometer === 100450);
    expect(first).toBeTruthy();
    expect(first!.isChainOrigin).toBe(true);
    // Opening spillover (1.84) must be folded into the first cycle's liters, not dropped.
    expect(first!.totalLiters).toBeGreaterThan(20);
  });

  it('does not double-count liters into the next cycle when the odometer regresses at a close', () => {
    const entries: FuelEntry[] = [
      entry({ id: 'anchor-1', date: '2026-08-04T10:00:00', odometer: 100000, liters: 35, metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true } }),
      // Regression close — odometer LOWER than prior anchor (bad reading)
      entry({ id: 'regress', date: '2026-08-05T10:00:00', odometer: 99000, liters: 30, metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true } }),
      entry({ id: 'anchor-2', date: '2026-08-06T10:00:00', odometer: 99500, liters: 34, metadata: { isSoftAnchor: true, isFullTank: true, isCapacityClose: true } }),
    ];
    const closed = calculateFuelCycles(entries, [vehicle]).filter((c) => c.status !== 'Active');
    // The cycle closing at anchor-2 must NOT carry the regressed fill's 30L forward.
    const afterRegress = closed.find((c) => c.endOdometer === 99500);
    expect(afterRegress).toBeTruthy();
    expect(afterRegress!.startOdometer).toBe(99000);
    expect(afterRegress!.distance).toBe(500);
    expect(afterRegress!.totalLiters).toBeLessThanOrEqual(34);
  });
});
