import { describe, expect, it } from 'vitest';
import {
  isEntryInInclusiveYmdRange,
  reportWeekYmdBounds,
  toEntryYmd,
} from './fuelWeekPeriod';
import {
  entryBelongsToReportDriver,
  sumPaidByDriverForReport,
} from './fuelPaidByDriver';
import { FuelEntry, UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';
import { Vehicle } from '../types/vehicle';

describe('fuelWeekPeriod YMD helpers', () => {
  it('toEntryYmd strips ISO timestamps to calendar day', () => {
    expect(toEntryYmd('2026-01-18T23:59:59.000Z')).toBe('2026-01-18');
    expect(toEntryYmd('2026-01-12')).toBe('2026-01-12');
  });

  it('toEntryYmd uses local calendar day for Date objects', () => {
    expect(toEntryYmd(new Date(2026, 0, 12))).toBe('2026-01-12');
  });

  it('includes Monday week-start fills via YMD (not UTC Date parse)', () => {
    expect(isEntryInInclusiveYmdRange('2026-01-12', '2026-01-12', '2026-01-18')).toBe(true);
    // Historical ISO adjustment on Sunday still counts when compared as YMD
    expect(
      isEntryInInclusiveYmdRange('2026-01-18T22:00:00.000Z', '2026-01-12', '2026-01-18'),
    ).toBe(true);
  });

  it('reportWeekYmdBounds accepts legacy ISO and YMD', () => {
    expect(
      reportWeekYmdBounds({
        weekStart: '2026-01-12T05:00:00.000Z',
        weekEnd: '2026-01-19T04:59:59.999Z',
      }),
    ).toEqual({ start: '2026-01-12', end: '2026-01-19' });

    expect(
      reportWeekYmdBounds({
        weekStart: '2026-01-12',
        weekEnd: '2026-01-18',
      }),
    ).toEqual({ start: '2026-01-12', end: '2026-01-18' });
  });
});

describe('sumPaidByDriverForReport', () => {
  const vehicle: Vehicle = {
    id: 'v1',
    licensePlate: '5179KZ',
    currentDriverId: 'd1',
  } as Vehicle;

  const report = {
    weekStart: '2026-01-12',
    weekEnd: '2026-01-18',
    driverId: 'd1',
    vehicleId: 'v1',
    vehicleIds: ['v1'],
  };

  const baseEntry = (over: Partial<FuelEntry>): FuelEntry =>
    ({
      id: 'e1',
      vehicleId: 'v1',
      driverId: 'd1',
      date: '2026-01-15',
      amount: 1000,
      type: 'Fuel_Manual_Entry',
      ...over,
    }) as FuelEntry;

  it('sums driver-tagged out-of-pocket fills in week', () => {
    const entries = [
      baseEntry({ id: 'a', amount: 1000 }),
      baseEntry({ id: 'b', amount: 500, type: 'Manual_Entry' }),
      baseEntry({ id: 'c', amount: 2000, type: 'Card_Transaction' as any }),
    ];
    expect(sumPaidByDriverForReport(entries, report, [vehicle])).toBe(1500);
  });

  it('includes untagged fills when driver is current assignee', () => {
    const entries = [baseEntry({ id: 'u', driverId: undefined, amount: 600 })];
    expect(sumPaidByDriverForReport(entries, report, [vehicle])).toBe(600);
  });

  it('does not pull another driver cash via vehicle-only', () => {
    const entries = [baseEntry({ id: 'x', driverId: 'd2', amount: 9000 })];
    expect(sumPaidByDriverForReport(entries, report, [vehicle])).toBe(0);
  });

  it('attributes unassigned report only to fills without driverId', () => {
    const unassignedReport = { ...report, driverId: UNASSIGNED_FUEL_DRIVER_ID };
    const entries = [
      baseEntry({ id: 'u1', driverId: undefined, amount: 400 }),
      baseEntry({ id: 'u2', driverId: 'd1', amount: 400 }),
    ];
    expect(sumPaidByDriverForReport(entries, unassignedReport, [vehicle])).toBe(400);
    expect(entryBelongsToReportDriver(entries[0], unassignedReport, vehicle)).toBe(true);
    expect(entryBelongsToReportDriver(entries[1], unassignedReport, vehicle)).toBe(false);
  });
});
