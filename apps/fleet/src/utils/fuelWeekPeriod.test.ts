import { describe, expect, it } from 'vitest';
import {
  isEntryInInclusiveYmdRange,
  reportWeekYmdBounds,
  toEntryYmd,
  entriesInFuelWeek,
  isSameFuelStatement,
  resolveFuelActivityEarliestMonday,
  buildFuelReconciliationWeekOptions,
} from './fuelWeekPeriod';
import {
  entriesBelongingToDriverWeekReport,
  sumPaidByDriverForReport,
} from './fuelPaidByDriver';
import { resolveActiveFuelPolicyForDriverWeek } from './fuelPolicyVersion';
import { FuelEntry, FuelScenario, UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';

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
    expect(
      isEntryInInclusiveYmdRange('2026-01-18T22:00:00.000Z', '2026-01-12', '2026-01-18'),
    ).toBe(true);
  });

  it('entriesInFuelWeek keeps ISO Sunday fills', () => {
    const items = [
      { id: 'a', date: '2026-01-12' },
      { id: 'b', date: '2026-01-18T22:00:00.000Z' },
      { id: 'c', date: '2026-01-19' },
    ];
    const inWeek = entriesInFuelWeek(items, '2026-01-12', '2026-01-18');
    expect(inWeek.map((x) => x.id)).toEqual(['a', 'b']);
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

  it('isSameFuelStatement keys on driverId + Monday only', () => {
    expect(
      isSameFuelStatement(
        { driverId: 'd1', weekStart: '2026-01-12', weekEnd: '2026-01-18' },
        { driverId: 'd1', weekStart: '2026-01-12T05:00:00.000Z' },
      ),
    ).toBe(true);
    expect(
      isSameFuelStatement(
        { driverId: 'd1', weekStart: '2026-01-12' },
        { driverId: 'd2', weekStart: '2026-01-12' },
      ),
    ).toBe(false);
  });

  it('resolveFuelActivityEarliestMonday uses first fill week, not a hard-coded launch date', () => {
    expect(
      resolveFuelActivityEarliestMonday(['2026-01-17', '2026-02-01'], [], undefined, new Date(2026, 6, 17)),
    ).toBe('2026-01-12');
  });

  it('resolveFuelActivityEarliestMonday falls back to current Monday when empty', () => {
    expect(resolveFuelActivityEarliestMonday([], [], undefined, new Date(2026, 6, 17))).toBe(
      '2026-07-13',
    );
  });

  it('buildFuelReconciliationWeekOptions excludes pre-activity Dec weeks', () => {
    const opts = buildFuelReconciliationWeekOptions('2026-01-12', undefined, new Date(2026, 0, 20));
    expect(opts.some((o) => o.startDate === '2025-12-01')).toBe(false);
    expect(opts.some((o) => o.startDate === '2025-12-08')).toBe(false);
    expect(opts.some((o) => o.startDate === '2026-01-12')).toBe(true);
  });
});

describe('enterprise fill attribution', () => {
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

  it('attributes untagged fill via trip proximity to the trip driver', () => {
    const entries = [baseEntry({ id: 'u', driverId: undefined, amount: 600, time: '14:00' })];
    const trips = [
      {
        id: 't1',
        vehicleId: 'v1',
        driverId: 'd2',
        date: '2026-01-15',
        requestTime: '2026-01-15T13:00:00',
        dropoffTime: '2026-01-15T15:00:00',
        status: 'Completed',
        distance: 10,
      } as Trip,
    ];
    const ctx = { vehicles: [vehicle], trips };
    const forD2 = entriesBelongingToDriverWeekReport(entries, { ...report, driverId: 'd2' }, ctx);
    const forD1 = entriesBelongingToDriverWeekReport(entries, report, ctx);
    expect(forD2).toHaveLength(1);
    expect(forD1).toHaveLength(0);
    expect(sumPaidByDriverForReport(entries, { ...report, driverId: 'd2' }, [vehicle], ctx)).toBe(600);
  });

  it('does not pull another driver cash via vehicle-only', () => {
    const entries = [baseEntry({ id: 'x', driverId: 'd2', amount: 9000 })];
    expect(sumPaidByDriverForReport(entries, report, [vehicle])).toBe(0);
  });

  it('ISO Sunday OOP fill still counts in Paid by Driver', () => {
    const entries = [
      baseEntry({
        id: 'sun',
        date: '2026-01-18T20:00:00.000Z',
        amount: 250,
        type: 'Manual_Entry',
      }),
    ];
    expect(sumPaidByDriverForReport(entries, report, [vehicle])).toBe(250);
  });

  it('attributes unassigned report only to fills resolved as unassigned', () => {
    const unassignedReport = { ...report, driverId: UNASSIGNED_FUEL_DRIVER_ID };
    const entries = [
      baseEntry({ id: 'u1', driverId: undefined, amount: 400 }),
      baseEntry({ id: 'u2', driverId: 'd1', amount: 400 }),
    ];
    // Without trips/cards, untagged falls to currentDriverId (d1) — not unassigned
    const ctx = { vehicles: [{ ...vehicle, currentDriverId: undefined } as Vehicle] };
    expect(sumPaidByDriverForReport(entries, unassignedReport, ctx.vehicles, ctx)).toBe(400);
  });
});

describe('resolveActiveFuelPolicyForDriverWeek', () => {
  const scenarios: FuelScenario[] = [
    {
      id: 'default',
      name: 'Default Policy',
      isDefault: true,
      rules: [
        {
          id: 'r1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 50,
          rideShareCoverage: 100,
          companyUsageCoverage: 100,
          deadheadCoverage: 50,
          personalCoverage: 0,
          miscCoverage: 50,
        } as any,
      ],
      versions: [],
    },
    {
      id: 'premium',
      name: 'Premium',
      isDefault: false,
      rules: [
        {
          id: 'r2',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 80,
          rideShareCoverage: 100,
          companyUsageCoverage: 100,
          deadheadCoverage: 80,
          personalCoverage: 0,
          miscCoverage: 50,
        } as any,
      ],
      versions: [
        {
          id: 'v1',
          effectiveFrom: '2026-01-05',
          rules: [
            {
              id: 'r2v',
              category: 'Fuel',
              coverageType: 'Percentage',
              coverageValue: 80,
              rideShareCoverage: 100,
              companyUsageCoverage: 100,
              deadheadCoverage: 80,
              personalCoverage: 0,
              miscCoverage: 50,
            } as any,
          ],
          driverIds: ['d1'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  ];

  it('returns Premium for scheduled driver-week and Default otherwise', () => {
    const forD1 = resolveActiveFuelPolicyForDriverWeek(scenarios, 'd1', '2026-01-12');
    const forD2 = resolveActiveFuelPolicyForDriverWeek(scenarios, 'd2', '2026-01-12');
    expect(forD1?.scenario.name).toBe('Premium');
    expect(forD2?.scenario.name).toBe('Default Policy');
  });
});
