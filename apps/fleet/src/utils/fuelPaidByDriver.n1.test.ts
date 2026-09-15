/**
 * N-1: unassigned fills must not be attributed to every real driver-week.
 */
import { describe, expect, it } from 'vitest';
import {
  entryBelongsToDriverWeekReport,
  sumGasCardSpendForReport,
} from './fuelPaidByDriver';
import { UNASSIGNED_FUEL_DRIVER_ID, type FuelEntry, type WeeklyFuelReport } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

const week = { weekStart: '2026-09-07', weekEnd: '2026-09-13' };

function report(driverId: string): Pick<WeeklyFuelReport, 'driverId' | 'weekStart' | 'weekEnd' | 'vehicleId'> {
  return { driverId, ...week, vehicleId: 'v1' };
}

describe('N-1 unassigned fill attribution', () => {
  const unassignedFill = {
    id: 'e-unassigned',
    date: '2026-09-08',
    amount: 5000,
    type: 'Card_Transaction',
    paymentSource: 'Gas_Card',
    vehicleId: 'v1',
    // no driverId → resolves to UNASSIGNED
  } as FuelEntry;

  const vehicles = [
    { id: 'v1', currentDriverId: undefined },
  ] as Vehicle[];

  it('does not belong to either real driver report', () => {
    const ctx = { vehicles, fuelCards: [], trips: [] };
    expect(entryBelongsToDriverWeekReport(unassignedFill, report('d1'), ctx)).toBe(false);
    expect(entryBelongsToDriverWeekReport(unassignedFill, report('d2'), ctx)).toBe(false);
  });

  it('belongs only to an Unassigned sentinel report', () => {
    const ctx = { vehicles, fuelCards: [], trips: [] };
    expect(
      entryBelongsToDriverWeekReport(unassignedFill, report(UNASSIGNED_FUEL_DRIVER_ID), ctx),
    ).toBe(true);
  });

  it('counts gas-card spend once across two driver reports (zero times each)', () => {
    const entries = [unassignedFill];
    const a = sumGasCardSpendForReport(entries, report('d1'), vehicles, {
      vehicles,
      fuelCards: [],
      trips: [],
    });
    const b = sumGasCardSpendForReport(entries, report('d2'), vehicles, {
      vehicles,
      fuelCards: [],
      trips: [],
    });
    expect(a).toBe(0);
    expect(b).toBe(0);
    expect(a + b).toBe(0);
  });

  it('precomputed map must not reintroduce double-count', () => {
    const ctx = {
      vehicles,
      fuelCards: [],
      trips: [],
      driverByEntryId: new Map([['e-unassigned', UNASSIGNED_FUEL_DRIVER_ID]]),
    };
    expect(entryBelongsToDriverWeekReport(unassignedFill, report('d1'), ctx)).toBe(false);
    expect(entryBelongsToDriverWeekReport(unassignedFill, report('d2'), ctx)).toBe(false);
    expect(
      entryBelongsToDriverWeekReport(unassignedFill, report(UNASSIGNED_FUEL_DRIVER_ID), ctx),
    ).toBe(true);
  });
});
