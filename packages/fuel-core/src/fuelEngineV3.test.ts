/**
 * Fuel engine v3 — done-tests 1, 8 and 13 (docs/fuel-enterprise-audit.md Part F), the chainless
 * fallback (F-01 detail) and the identity company + driver = spend, to the cent.
 * Sample week = the Stitch prompt's week of 16 Nov 2026 (FOR CLAUDE arithmetic).
 */
import { describe, expect, it } from 'vitest';
import {
  allocateByWeight,
  applyFuelV3ToReport,
  fuelV3PreviewRows,
  priceFuelWeekV3,
  type FuelV3Input,
} from './fuelEngineV3';
import type { FuelCoverageRule } from './fuelCoverageSplit';

const kennyRule: FuelCoverageRule = {
  coverageType: 'Percentage',
  coverageValue: 80,
  rideShareCoverage: 80,
  deadheadCoverage: 50,
  companyUsageCoverage: 100,
  personalCoverage: 0,
};
const leftover50 = { mode: 'percentage' as const, driverPercent: 50, appliesTo: ['unattributedKm' as const, 'noOdometerFills' as const] };

function week16Nov(over: Partial<FuelV3Input> = {}): FuelV3Input {
  return {
    spendWithOdometer: 24_500,
    spendNoOdometer: 0,
    odometerKm: 1_503,
    chainUsable: true,
    km: { trips: 1_320, pickups: 150, companyErrands: 0, personal: 0, commute: 18 },
    rule: kennyRule,
    commuteCompanyPct: 100,
    leftover: leftover50,
    ...over,
  };
}

const line = (r: ReturnType<typeof priceFuelWeekV3>, p: string) => r.lines.find((l) => l.purpose === p)!;

describe('fuel engine v3 — done-test 1 (week of 16 Nov sample)', () => {
  const r = priceFuelWeekV3(week16Nov());

  it('cost per km = fuel bought ÷ odometer km', () => {
    expect(r.pricing).toBe('odometer');
    expect(r.costPerKm!).toBeCloseTo(24_500 / 1_503, 10);
  });

  it('each line is km × cost per km, and the km add up to the odometer', () => {
    expect(line(r, 'uber_trips').costMinor).toBe(2_151_697);
    expect(line(r, 'to_pickups').costMinor).toBe(244_511);
    expect(line(r, 'commute').costMinor).toBe(29_341);
    expect(line(r, 'unexplained_km').km).toBe(15);
    expect(line(r, 'unexplained_km').costMinor).toBe(24_451);
    expect(r.lines.reduce((s, l) => s + l.km, 0)).toBe(1_503);
  });

  it("the driver's charge is the sum of the lines at the rule's driver %", () => {
    expect(line(r, 'uber_trips').driverMinor).toBe(430_339);
    expect(line(r, 'to_pickups').driverMinor).toBe(122_255);
    expect(line(r, 'commute').driverMinor).toBe(0);
    expect(line(r, 'unexplained_km').driverMinor).toBe(12_226);
    expect(r.driverShare).toBe(5_648.2);
    expect(r.companyShare).toBe(18_851.8);
  });

  it('company + driver = fuel bought, to the cent, commute and unexplained inside (F-23)', () => {
    expect(r.driverMinor + r.companyMinor).toBe(2_450_000);
    expect(r.totalSpend).toBe(24_500);
    expect(r.cap).toBeNull();
  });
});

describe('fuel engine v3 — done-test 13 (Personal Allowance)', () => {
  it('60 personal km, 40 earned: company line 40 km, driver line 20 km, still = fuel bought', () => {
    const r = priceFuelWeekV3(week16Nov({
      km: { trips: 1_260, pickups: 150, companyErrands: 0, personal: 60, commute: 18 },
      personalAllowanceEarnedKm: 40,
    }));
    const earned = line(r, 'personal_allowance');
    const over = line(r, 'personal');
    expect(earned.km).toBe(40);
    expect(earned.driverMinor).toBe(0);
    expect(over.km).toBe(20);
    expect(over.driverMinor).toBe(over.costMinor);
    expect(r.driverMinor + r.companyMinor).toBe(2_450_000);
  });

  it('the identity holds with and without Personal Allowance moving money (F-23)', () => {
    const base = { km: { trips: 1_260, pickups: 150, companyErrands: 0, personal: 60, commute: 18 } };
    for (const earned of [0, 40]) {
      const r = priceFuelWeekV3(week16Nov({ ...base, personalAllowanceEarnedKm: earned }));
      expect(r.driverMinor + r.companyMinor).toBe(2_450_000);
    }
  });
});

describe('fuel engine v3 — done-test 8 (km longer than the odometer)', () => {
  it('Uber km 2,079 vs odometer 1,821 → trips priced at the odometer, cap recorded', () => {
    const r = priceFuelWeekV3(week16Nov({
      spendWithOdometer: 28_800,
      odometerKm: 1_821,
      km: { trips: 2_079, tripsReported: 2_079, pickups: 0, companyErrands: 0, personal: 0, commute: 0 },
    }));
    expect(line(r, 'uber_trips').km).toBe(1_821);
    expect(r.lines.find((l) => l.purpose === 'unexplained_km')).toBeUndefined();
    expect(r.cap).toMatchObject({ beforeKm: 2_079, afterKm: 1_821, tripsReportedKm: 2_079, tripsPricedKm: 1_821 });
    expect(r.driverMinor + r.companyMinor).toBe(2_880_000);
  });

  it('never charges more than was bought when every purpose is too long', () => {
    const r = priceFuelWeekV3(week16Nov({
      km: { trips: 1_617, pickups: 212, companyErrands: 0, personal: 0, commute: 30 },
      odometerKm: 1_821,
      spendWithOdometer: 28_800,
    }));
    expect(r.totalMinor).toBe(2_880_000);
    expect(r.lines.reduce((s, l) => s + l.km, 0)).toBeCloseTo(1_821, 6);
  });
});

describe('fuel engine v3 — chainless week (F-01 detail, Stitch screen 9)', () => {
  const chainless = (over: Partial<FuelV3Input> = {}) => priceFuelWeekV3(week16Nov({
    chainUsable: false,
    spendWithOdometer: 9_000,
    odometerKm: 0,
    km: { trips: 610, pickups: 60, companyErrands: 0, personal: 0, commute: 0 },
    ...over,
  }));

  it('priced by share of km: J$9,000 ÷ 670 km; driver J$2,041.80, company J$6,958.20', () => {
    const r = chainless({ chainReviewed: true });
    expect(r.pricing).toBe('km_share_fallback');
    expect(r.previewOnly).toBe(false);
    expect(line(r, 'uber_trips').costMinor).toBe(819_403);
    expect(line(r, 'to_pickups').costMinor).toBe(80_597);
    expect(r.driverShare).toBe(2_041.8);
    expect(r.companyShare).toBe(6_958.2);
  });

  it('is preview only until the readings are reviewed', () => {
    expect(chainless().previewOnly).toBe(true);
  });

  it('with no km at all, the whole spend is unexplained and follows the leftover rule (F-12)', () => {
    const r = chainless({
      chainReviewed: true,
      km: { trips: 0, pickups: 0, companyErrands: 0, personal: 0, commute: 0 },
    });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].purpose).toBe('unexplained_km');
    expect(r.lines[0].driverMinor).toBe(450_000);
    expect(r.driverMinor + r.companyMinor).toBe(900_000);
  });
});

describe('fuel engine v3 — no-odometer fills and the leftover rule', () => {
  it('no-odometer fills are their own line; the week adds up to total spend', () => {
    const r = priceFuelWeekV3(week16Nov({ spendNoOdometer: 1_000 }));
    expect(line(r, 'no_odometer_fills').costMinor).toBe(100_000);
    expect(line(r, 'no_odometer_fills').driverMinor).toBe(50_000);
    expect(r.driverMinor + r.companyMinor).toBe(2_550_000);
  });

  it('a fixed leftover amount is capped once across unexplained km and no-odometer fills', () => {
    const r = priceFuelWeekV3(week16Nov({
      spendNoOdometer: 1_000,
      leftover: { mode: 'fixed', driverFixedAmount: 300, appliesTo: ['unattributedKm', 'noOdometerFills'] },
    }));
    const leftoverDriver = line(r, 'unexplained_km').driverMinor + line(r, 'no_odometer_fills').driverMinor;
    expect(leftoverDriver).toBe(30_000);
  });

  it('a leftover rule giving the driver 100% bills the whole line, rounding cent included', () => {
    const r = priceFuelWeekV3(week16Nov({
      leftover: { mode: 'percentage', driverPercent: 100, appliesTo: ['unattributedKm'] },
    }));
    expect(line(r, 'unexplained_km').driverMinor).toBe(line(r, 'unexplained_km').costMinor);
  });

  it('degraded inputs: the leftover rule never bills the driver', () => {
    const r = priceFuelWeekV3(week16Nov({ blockLeftoverDriver: true }));
    expect(line(r, 'unexplained_km').driverMinor).toBe(0);
  });
});

describe('fuel engine v3 — preview and the switch (Part D, Stitch screen 3)', () => {
  const v3 = priceFuelWeekV3(week16Nov());
  // The v2.2 report for the same week: km priced at the usual 12.0 km/L (prompt FOR CLAUDE).
  const oldReport = {
    driverId: 'kenny',
    vehicleId: '5179KZ',
    rideShareCost: 23_621.4,
    deadheadCost: 2_684.25,
    commuteCost: 322.11,
    unattributedKmCost: 268.43,
    miscellaneousCost: -2_396.19,
    companyShare: 18_433.59,
    driverShare: 6_066.41,
    metadata: { fuelV3: v3, engineVersion: 'fuel-chain-v2.2' },
  };

  it('shows old vs new driver charge and the biggest mover', () => {
    const [row] = fuelV3PreviewRows([oldReport]);
    expect(row.oldDriverShare).toBe(6_066.41);
    expect(row.newDriverShare).toBe(5_648.2);
    expect(row.delta).toBe(-418.21);
    // Stitch screen 3: "Uber trips moved most: J$23,621.40 → J$21,516.97".
    expect(row.movedMost).toEqual({ label: 'Uber trips', oldCost: 23_621.4, newCost: 21_516.97 });
  });

  it('with the switch on, the report is charged from v3 and nothing is left as miscellaneous', () => {
    const charged = applyFuelV3ToReport(oldReport);
    expect(charged.driverShare).toBe(5_648.2);
    expect(charged.companyShare).toBe(18_851.8);
    expect(charged.miscellaneousCost).toBe(0);
    expect(charged.rideShareCost).toBe(21_516.97);
    expect(charged.metadata.engineVersion).toBe('fuel-chain-v3');
  });

  it('an unreviewed chainless week is never charged from v3', () => {
    const preview = priceFuelWeekV3(week16Nov({ chainUsable: false }));
    const r = { ...oldReport, metadata: { fuelV3: preview } };
    expect(applyFuelV3ToReport(r)).toBe(r);
  });
});

describe('allocateByWeight — the lines always sum to the spend', () => {
  it('random weeks: company + driver = spend to the cent, every time', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const spend = Math.round(rand() * 5_000_000) / 100;
      const odo = 50 + Math.floor(rand() * 2_500);
      const r = priceFuelWeekV3(week16Nov({
        spendWithOdometer: spend,
        spendNoOdometer: Math.round(rand() * 300_000) / 100,
        odometerKm: odo,
        km: {
          trips: rand() * odo,
          pickups: rand() * 300,
          companyErrands: rand() * 50,
          personal: rand() * 80,
          commute: rand() * 40,
        },
        personalAllowanceEarnedKm: rand() * 40,
      }));
      const expected = Math.round(spend * 100) + r.lines.filter((l) => l.purpose === 'no_odometer_fills').reduce((s, l) => s + l.costMinor, 0);
      expect(r.driverMinor + r.companyMinor).toBe(expected);
      for (const l of r.lines) {
        expect(l.driverMinor).toBeGreaterThanOrEqual(0);
        expect(l.companyMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('allocates cents with no loss', () => {
    expect(allocateByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateByWeight(0, [1, 2])).toEqual([0, 0]);
  });
});
