import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService.ts';
import { fleetCalendarDay, fleetLocalHour, isPeakLocalHour } from './fleetTime.ts';
import { splitLeftoverFuel } from './leftoverSplit.ts';
import { litreVariance } from './referenceEfficiency.ts';
import { FUEL_ENGINE_VERSION } from './fuelEngine.ts';
import type { FuelEntry, Vehicle } from './fuelTypes.ts';

describe('who pays', () => {
  it('keeps a Sunday 9:18pm Jamaica trip on Sunday, and 11pm is off-peak', () => {
    const sundayNight = new Date('2026-10-05T02:18:00.000Z');
    expect(fleetCalendarDay(sundayNight)).toBe('2026-10-04');
    expect(fleetLocalHour(sundayNight)).toBe(21);
    const elevenPm = new Date('2026-10-05T04:00:00.000Z');
    expect(fleetLocalHour(elevenPm)).toBe(23);
    expect(isPeakLocalHour(23, 6, 22)).toBe(false);
    expect(isPeakLocalHour(21, 6, 22)).toBe(true);
  });

  it('prices a continuous chain with no timing carve and about 4,500 JMD for 20 extra litres', () => {
    const vehicle = {
      id: 'v1',
      licensePlate: '5179KZ',
      currentDriverId: 'd1',
      fuelSettings: { efficiencyCity: 10, tankCapacity: 36 },
    } as Vehicle;
    const entries: FuelEntry[] = [
      {
        id: 'prior',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-10-04T07:07:00',
        amount: 5000,
        liters: 22,
        odometer: 1000,
        type: 'Fuel_Manual_Entry',
        paymentSource: 'Personal',
      } as FuelEntry,
      {
        id: 'inweek',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-10-06T08:00:00',
        amount: 9000,
        liters: 40,
        odometer: 1200,
        type: 'Fuel_Manual_Entry',
        paymentSource: 'Personal',
      } as FuelEntry,
    ];
    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      [],
      entries,
      [],
      [],
      undefined,
      {
        priorFill: { odometer: 1000, at: '2026-10-04T07:07:00' },
        referenceKmPerLiter: 10,
        referenceDegraded: false,
      },
    );
    expect(report.windowTimingCost || 0).toBe(0);
    expect(report.metadata?.engineVersion).toBe(FUEL_ENGINE_VERSION);
    expect(report.metadata?.spanStartOdometer).toBe(1000);
    expect(report.metadata?.spanEndOdometer).toBe(1200);
    const variance = litreVariance({ spanKm: 200, actualLiters: 40, referenceKmPerLiter: 10 });
    expect(variance.liters).toBeCloseTo(20, 5);
    expect(Math.abs((report.miscellaneousCost || 0) - 20 * 225)).toBeLessThan(50);
  });

  it('splits leftover 0 / 50 / 100 and caps a fixed amount, and never bills a negative variance', () => {
    const bucket = { variance: 1000, unattributedKmCost: 0, noOdometerFillCost: 0 };
    expect(splitLeftoverFuel({ ...bucket, split: { mode: 'percentage', driverPercent: 0, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] } }).driver).toBe(0);
    expect(splitLeftoverFuel({ ...bucket, split: { mode: 'percentage', driverPercent: 50, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] } }).driver).toBe(500);
    expect(splitLeftoverFuel({ ...bucket, split: { mode: 'percentage', driverPercent: 100, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] } }).driver).toBe(1000);
    expect(splitLeftoverFuel({
      ...bucket,
      split: { mode: 'fixed', driverFixedAmount: 1500, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] },
    }).driver).toBe(1000);
    expect(splitLeftoverFuel({
      variance: -4500,
      unattributedKmCost: 0,
      noOdometerFillCost: 0,
      split: { mode: 'percentage', driverPercent: 100, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] },
    }).driver).toBe(0);
    expect(splitLeftoverFuel({
      ...bucket,
      split: { mode: 'percentage', driverPercent: 100, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] },
      blockDriver: true,
    }).driver).toBe(0);
  });
});
