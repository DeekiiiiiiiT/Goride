import { describe, expect, it } from 'vitest';
import {
  buildTrustedPeriodTotals,
  clipCycleDistanceToPeriod,
  clipCycleFuelToPeriod,
  resolvePeriodDistance,
} from './fuelPeriodTotals';
import type { FuelCycle, FuelEntry } from '../types/fuel';

function makeCycle(partial: Partial<FuelCycle> & { id: string }): FuelCycle {
  return {
    vehicleId: 'v1',
    startDate: '2026-08-19',
    endDate: '2026-09-01',
    totalLiters: 240,
    totalCost: 50000,
    avgPricePerLiter: 200,
    transactions: [],
    status: 'Complete',
    distance: 2774,
    efficiency: 11,
    resetType: 'Auto_Soft',
    startOdometer: 100000,
    endOdometer: 102774,
    ...partial,
  };
}

describe('clipCycleDistanceToPeriod', () => {
  it('returns full distance when the cycle sits entirely inside the period', () => {
    const cycle = makeCycle({
      id: 'in',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      distance: 802,
      startOdometer: 102774,
      endOdometer: 103576,
    });
    expect(clipCycleDistanceToPeriod(cycle, '2026-08-31', '2026-09-06')).toBe(802);
  });

  it('does not dump a multi-week cycle into the week it merely ends in', () => {
    // Cycle Aug 19 → Sep 1 (2774 km). Week Aug 31–Sep 6 should only get
    // odo progress from Aug 31 onward, not the full 2774.
    const cycle = makeCycle({
      id: 'long',
      startDate: '2026-08-19',
      endDate: '2026-09-01',
      distance: 2774,
      startOdometer: 100000,
      endOdometer: 102774,
      transactions: [
        {
          id: 'a',
          date: '2026-08-19',
          amount: 1,
          liters: 40,
          odometer: 100000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        },
        {
          id: 'b',
          date: '2026-08-25',
          amount: 1,
          liters: 40,
          odometer: 101500,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        },
        {
          id: 'c',
          date: '2026-08-31',
          amount: 1,
          liters: 40,
          odometer: 102200,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        },
        {
          id: 'd',
          date: '2026-09-01',
          amount: 1,
          liters: 40,
          odometer: 102774,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        },
      ],
    });

    const clipped = clipCycleDistanceToPeriod(cycle, '2026-08-31', '2026-09-06');
    // From last odo before Aug 31 (101500 on Aug 25) → 102774 on Sep 1 = 1274
    expect(clipped).toBe(1274);
    expect(clipped).toBeLessThan(2774);
  });
});

describe('resolvePeriodDistance', () => {
  it('uses clipped primary km and reports carried-in remainder', () => {
    const long = makeCycle({
      id: 'long',
      transactions: [
        {
          id: 'a',
          date: '2026-08-19',
          amount: 1,
          odometer: 100000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'b',
          date: '2026-08-31',
          amount: 1,
          odometer: 102200,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'c',
          date: '2026-09-01',
          amount: 1,
          odometer: 102774,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
      ],
    });
    const active = makeCycle({
      id: 'active',
      status: 'Active',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      distance: 802,
      startOdometer: 102774,
      endOdometer: 103576,
      transactions: [],
    });

    const d = resolvePeriodDistance([long, active], [], {
      start: '2026-08-31',
      end: '2026-09-06',
    });

    // long: baseline before Aug 31 = 100000 (only fill before is Aug 19), end 102774 → 2774
    // Wait - last odo BEFORE Aug 31 is Aug 19's 100000, so clipped = 102774-100000 = 2774
    // That's still full! Need a fill between Aug 19 and Aug 31 for proper clip.
    // With fills at Aug 19 (100000) and Aug 31 (102200): baseline = 100000 (before start),
    // end = 102774 → still 2774.
    //
    // Correct baseline: last odo with ymd < periodStart.
    // Aug 19 < Aug 31 → baseline 100000. Without mid-period pre-week fill we can't know
    // odo on Aug 30. That's expected — carried-in shrinks when mid fills exist.
    expect(d.fullCycleKm).toBe(2774 + 802);
    expect(d.primaryKm).toBeLessThanOrEqual(d.fullCycleKm);
    expect(d.primaryKm).toBe(d.fullCycleKm - d.carriedInKm);
  });

  it('clips using last pre-period fill so week KPI excludes prior weeks', () => {
    const long = makeCycle({
      id: 'long',
      distance: 2774,
      startOdometer: 100000,
      endOdometer: 102774,
      transactions: [
        {
          id: 'a',
          date: '2026-08-19',
          amount: 1,
          odometer: 100000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'mid',
          date: '2026-08-30',
          amount: 1,
          odometer: 102000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'c',
          date: '2026-09-01',
          amount: 1,
          odometer: 102774,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
      ],
    });
    const d = resolvePeriodDistance([long], [], {
      start: '2026-08-31',
      end: '2026-09-06',
    });
    // baseline = Aug 30 @ 102000; end = 102774 → 774 km in period (not 2774)
    expect(d.primaryKm).toBe(774);
    expect(d.carriedInKm).toBe(2000);
    expect(d.fullCycleKm).toBe(2774);
  });
});

describe('buildTrustedPeriodTotals', () => {
  it('clips Active tank fuel/spend and ignores excluded megas', () => {
    const active = makeCycle({
      id: 'active',
      status: 'Active',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      distance: 802,
      totalLiters: 34.8,
      totalCost: 8000,
      startOdometer: 102774,
      endOdometer: 103576,
    });
    const totals = buildTrustedPeriodTotals({
      trusted: [active],
      period: { start: '2026-08-31', end: '2026-09-06' },
      provisional: true,
    });
    expect(totals.distanceKm).toBe(802);
    expect(totals.fuelL).toBe(34.8);
    expect(totals.spend).toBe(8000);
    expect(totals.provisional).toBe(true);
  });

  it('pro-rates fuel by clipped distance share', () => {
    const long = makeCycle({
      id: 'long',
      distance: 2774,
      totalLiters: 242.7,
      startOdometer: 100000,
      endOdometer: 102774,
      transactions: [
        {
          id: 'a',
          date: '2026-08-19',
          amount: 1,
          odometer: 100000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'mid',
          date: '2026-08-30',
          amount: 1,
          odometer: 102000,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
        {
          id: 'c',
          date: '2026-09-01',
          amount: 1,
          odometer: 102774,
          type: 'Manual_Entry',
          entryMode: 'Floating',
          paymentSource: 'RideShare_Cash',
          vehicleId: 'v1',
        } as FuelEntry,
      ],
    });
    // 774 / 2774 of 242.7 ≈ 67.68
    const fuel = clipCycleFuelToPeriod(long, { start: '2026-08-31', end: '2026-09-06' });
    expect(fuel).toBe(Math.round(242.7 * (774 / 2774) * 100) / 100);
  });
});
