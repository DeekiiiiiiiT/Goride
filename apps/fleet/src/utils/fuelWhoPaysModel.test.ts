import { describe, expect, it } from 'vitest';
import { combineFuelV3, priceFuelWeekV3, type FuelV3Input, type WeeklyFuelReport } from '@roam/fuel-core';
import { buildWhoPaysWeek, ruleFromLabel } from './fuelWhoPaysModel';

const rule = {
  id: 'r', category: 'Fuel', coverageType: 'Percentage', coverageValue: 80,
  rideShareCoverage: 80, deadheadCoverage: 50, companyUsageCoverage: 100, personalCoverage: 0, miscCoverage: 50,
  commuteCoverage: 100,
} as unknown as FuelV3Input['rule'];
const leftover = { mode: 'percentage', driverPct: 50 } as unknown as FuelV3Input['leftover'];

// The Stitch sample week: J$24,500 bought, 1,503 odometer km, Kenny's rule.
const input: FuelV3Input = {
  spendWithOdometer: 24_500,
  spendNoOdometer: 0,
  odometerKm: 1_503,
  chainUsable: true,
  km: { trips: 1_320, pickups: 150, companyErrands: 0, personal: 0, commute: 18 },
  rule,
  commuteCompanyPct: 100,
  leftover,
};
const v3 = priceFuelWeekV3(input);

function report(meta: Record<string, unknown>, extra: Partial<WeeklyFuelReport> = {}): WeeklyFuelReport {
  return {
    id: 'kenny_2026-11-16',
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    vehicleId: 'v1',
    driverId: 'kenny',
    totalGasCardCost: 24_500,
    totalTripDistance: 1_320,
    rideShareCost: 23_621.4,
    companyMiscDistance: 0,
    companyUsageCost: 0,
    personalDistance: 0,
    personalUsageCost: 0,
    deadheadDistance: 150,
    deadheadCost: 2_684.21,
    commuteCost: 322.11,
    miscellaneousCost: 0,
    companyShare: 18_433.59,
    driverShare: 6_066.41,
    status: 'Draft',
    metadata: {
      scenarioName: 'Standard Fleet Rule',
      fuelPolicyVersion: { scenarioId: 's', versionId: 'aaaaaaaa-0000-4000-8000-000000000001', effectiveFrom: '2026-08-03' },
      spanStartOdometer: 198_250,
      spanEndOdometer: 199_753,
      spanKm: 1_503,
      referenceKmPerLiter: 12,
      engineVersion: 'fuel-chain-v2.2',
      ...meta,
    },
    ...extra,
  } as WeeklyFuelReport;
}

const vehicles = [{ id: 'v1', licensePlate: '5179KZ', make: 'Toyota', model: 'Roomy' }];
const fills = [
  { vehicleId: 'v1', driverId: 'kenny', amount: 14_500, gasCard: false },
  { vehicleId: 'v1', driverId: 'kenny', amount: 10_000, gasCard: true },
];

describe('buildWhoPaysWeek', () => {
  it('a preview week: real lines, muted 0 km rows, the old/new comparison', () => {
    const week = buildWhoPaysWeek({ report: report({ fuelV3: v3 }), vehicles, fills, driverName: 'Kenny Gregory Rattray' });
    expect(week.state).toBe('preview');
    const car = week.cars[0];
    expect(car.plate).toBe('5179KZ');
    expect(car.makeModel).toBe('Toyota Roomy');
    expect(car.ruleFrom).toBe('3 Aug 2026');
    expect(car.gasCard).toBe(10_000);
    expect(car.cash).toBe(14_500);
    expect([car.odoFrom, car.odoTo]).toEqual([198_250, 199_753]);
    expect(car.costPerKm).toBeCloseTo(24_500 / 1_503, 9);
    expect(car.rows.map((r) => r.label)).toEqual(['Uber trips', 'To pickups', 'Commute', 'Unexplained km']);
    expect(car.mutedRows).toEqual(['Company errands', 'Personal']);
    expect(Math.round(car.driver * 100) + Math.round(car.company * 100)).toBe(2_450_000);
    expect(car.difference).toBe(0);
    expect(week.comparison?.oldDriver).toBe(6_066.41);
    expect(week.comparison?.newDriver).toBe(car.driver);
    expect(week.comparison?.usualKmPerLiter).toBe(12);
    expect(week.comparison?.movedMost?.label).toBe('Uber trips');
  });

  it('a charged week has no comparison', () => {
    const week = buildWhoPaysWeek({ report: report({ fuelV3: v3, chargedBy: 'fuel-chain-v3' }), vehicles, fills });
    expect(week.state).toBe('charged');
    expect(week.comparison).toBeNull();
  });

  it('a week locked the old way shows its saved totals and engine', () => {
    const week = buildWhoPaysWeek({ report: report({}), vehicles, fills });
    expect(week.state).toBe('old_way');
    expect(week.cars[0].driver).toBe(6_066.41);
    expect(week.cars[0].rows).toEqual([]);
    expect(week.cars[0].engineVersion).toBe('fuel-chain-v2.2');
  });

  it('the gas card / cash split is left out when the fills do not add up to the car total', () => {
    const week = buildWhoPaysWeek({ report: report({ fuelV3: v3 }), vehicles, fills: [fills[0]] });
    expect(week.cars[0].gasCard).toBeNull();
  });

  it('a chainless week is priced by share of km and is a preview until reviewed', () => {
    const chainless = priceFuelWeekV3({ ...input, chainUsable: false, chainReviewed: false });
    const car = buildWhoPaysWeek({ report: report({ fuelV3: chainless }), vehicles, fills }).cars[0];
    expect(car.pricing).toBe('km_share_fallback');
    expect(car.previewOnly).toBe(true);
  });

  it('capped Uber km give the plain-words note', () => {
    const capped = priceFuelWeekV3({ ...input, km: { ...input.km, trips: 1_600, tripsReported: 1_600 } });
    const car = buildWhoPaysWeek({ report: report({ fuelV3: capped }), vehicles, fills }).cars[0];
    expect(car.capNote).toMatch(/^Uber's km were \d+ km more than the odometer; trip km capped at [\d,]+\.$/);
  });

  it('a driver with two cars gets a card per car', () => {
    const combined = combineFuelV3([
      { vehicleId: 'v1', result: v3 },
      { vehicleId: 'v2', result: priceFuelWeekV3({ ...input, spendWithOdometer: 5_000, odometerKm: 300, km: { ...input.km, trips: 250, pickups: 20, commute: 0 } }) },
    ]);
    const week = buildWhoPaysWeek({ report: report({ fuelV3: combined }), vehicles, fills });
    expect(week.cars.map((c) => c.vehicleId)).toEqual(['v1', 'v2']);
    expect(week.cars[1].plate).toBe('v2');
    expect(week.cars[0].odoFrom).toBeNull();
  });

  it('the legacy open window has no "from" date', () => {
    expect(ruleFromLabel('2000-01-03')).toBeNull();
    expect(ruleFromLabel('2026-04-06')).toBe('6 Apr 2026');
  });
});

describe('old way km', () => {
  it('falls back to odometer end − start when the saved week has no span km', () => {
    const r = {
      id: 'x', weekStart: '2026-11-09', weekEnd: '2026-11-15', vehicleId: 'v1', driverId: 'kenny',
      totalGasCardCost: 28_800, driverShare: 4_081.36, companyShare: 27_430.7,
      metadata: { spanStartOdometer: 196_000, spanEndOdometer: 197_821 },
    } as unknown as WeeklyFuelReport;
    expect(buildWhoPaysWeek({ report: r, vehicles: [], fills: [] }).cars[0].km).toBe(1_821);
  });
});
