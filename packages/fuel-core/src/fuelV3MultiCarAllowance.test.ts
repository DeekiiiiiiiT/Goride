/**
 * v3 multi-car Personal Allowance (audit F-22, item 3): earned km worked out on the driver's
 * combined week are shared across the cars by personal km; each car is priced again from its
 * own fills, so each car — and the week — still adds up to the fuel bought.
 */
import { describe, expect, it } from 'vitest';
import {
  applyMultiCarPersonalAllowance,
  combineFuelV3,
  priceFuelWeekV3,
  type FuelV3Input,
} from './fuelEngineV3.ts';

const rule = {
  id: 'r', category: 'Fuel', coverageType: 'Percentage', coverageValue: 80,
  rideShareCoverage: 80, deadheadCoverage: 50, companyUsageCoverage: 100, personalCoverage: 0, miscCoverage: 50,
} as unknown as FuelV3Input['rule'];

const leftover = { mode: 'percentage', driverPct: 50 } as unknown as FuelV3Input['leftover'];

function car(spend: number, odometerKm: number, trips: number, personal: number): FuelV3Input {
  return {
    spendWithOdometer: spend,
    spendNoOdometer: 0,
    odometerKm,
    chainUsable: true,
    km: { trips, pickups: 0, companyErrands: 0, personal, commute: 0 },
    rule,
    commuteCompanyPct: 100,
    leftover,
  };
}

const kmOf = (lines: Array<{ purpose: string; km: number }>, purpose: string) =>
  lines.filter((l) => l.purpose === purpose).reduce((s, l) => s + l.km, 0);

describe('applyMultiCarPersonalAllowance', () => {
  const carA = car(12_000, 600, 400, 60); // personal 60 km
  const carB = car(8_000, 400, 300, 40); // personal 40 km
  const parts = [
    { vehicleId: 'A', result: priceFuelWeekV3(carA) },
    { vehicleId: 'B', result: priceFuelWeekV3(carB) },
  ];

  it('shares 50 earned km as 30 / 20 by personal km, and the company pays them', () => {
    const out = applyMultiCarPersonalAllowance(parts, 50);
    const a = out.find((p) => p.vehicleId === 'A')!.result;
    const b = out.find((p) => p.vehicleId === 'B')!.result;
    expect(kmOf(a.lines, 'personal_allowance')).toBeCloseTo(30, 9);
    expect(kmOf(a.lines, 'personal')).toBeCloseTo(30, 9);
    expect(kmOf(b.lines, 'personal_allowance')).toBeCloseTo(20, 9);
    expect(kmOf(b.lines, 'personal')).toBeCloseTo(20, 9);
    for (const l of [...a.lines, ...b.lines].filter((x) => x.purpose === 'personal_allowance')) {
      expect(l.driverMinor).toBe(0);
      expect(l.companyMinor).toBe(l.costMinor);
      expect(l.vehicleId).toBeTruthy();
    }
  });

  it('each car and the week still add up to the fuel bought, to the cent', () => {
    const out = applyMultiCarPersonalAllowance(parts, 50);
    expect(out[0].result.totalMinor).toBe(1_200_000);
    expect(out[1].result.totalMinor).toBe(800_000);
    const week = combineFuelV3(out);
    expect(week.totalMinor).toBe(2_000_000);
    expect(week.driverMinor + week.companyMinor).toBe(2_000_000);
    expect(week.personalAllowanceNotApplied).toBeUndefined();
  });

  it('the driver pays less than without the allowance, by the earned km', () => {
    const before = combineFuelV3(parts);
    const after = combineFuelV3(applyMultiCarPersonalAllowance(parts, 50));
    // Personal is 100% driver; 30 km at J$20/km + 20 km at J$20/km moves to the company.
    expect(before.driverMinor - after.driverMinor).toBe(100_000);
  });

  it('earned km above the personal km are capped at the personal km', () => {
    const out = applyMultiCarPersonalAllowance(parts, 500);
    expect(kmOf(out[0].result.lines, 'personal_allowance')).toBeCloseTo(60, 9);
    expect(kmOf(out[1].result.lines, 'personal_allowance')).toBeCloseTo(40, 9);
    expect(kmOf(out[0].result.lines, 'personal') + kmOf(out[1].result.lines, 'personal')).toBeCloseTo(0, 9);
  });

  it('no earned km, or no personal km, leaves the cars as priced', () => {
    expect(applyMultiCarPersonalAllowance(parts, 0)).toBe(parts);
    const noPersonal = [{ vehicleId: 'A', result: priceFuelWeekV3(car(12_000, 600, 400, 0)) }];
    expect(applyMultiCarPersonalAllowance(noPersonal, 50)).toBe(noPersonal);
  });

  it('a car priced before inputs were kept is left alone (old snapshot)', () => {
    const old = parts.map((p) => ({ ...p, result: { ...p.result, input: undefined } }));
    expect(applyMultiCarPersonalAllowance(old, 50)).toBe(old);
  });
});

describe('wiring: the multi-car week uses the split', () => {
  it('fuelCalculationService re-prices the cars with the earned km instead of marking it not applied', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./fuelCalculationService.ts', import.meta.url), 'utf8');
    expect(src).toContain('combineFuelV3(applyMultiCarPersonalAllowance(v3Slices, paEarnedKm))');
    expect(src).not.toContain('personalAllowanceNotApplied: true');
    // The cars are priced with the allowance off first, so it is never counted twice.
    expect(src).toMatch(/skipPersonalAllowance: true,[\s\S]{0,400}if \(slice\.metadata\?\.fuelV3\) v3Slices\.push/);
  });
});
