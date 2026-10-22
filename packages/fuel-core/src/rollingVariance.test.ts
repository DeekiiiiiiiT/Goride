import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService.ts';
import { splitLeftoverFuel } from './leftoverSplit.ts';
import { rollingVarianceBill } from './rollingVariance.ts';
import type { FuelEntry, Vehicle } from './fuelTypes.ts';

const split = {
  mode: 'percentage' as const,
  driverPercent: 100,
  appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] as const,
};

describe('rolling variance', () => {
  it('carries unused negative weeks and does not bill a noisy up-week', () => {
    const bill = rollingVarianceBill({
      thisWeek: 982.66,
      priorSigned: [-3848.77, 0, -4342.91],
      weekSpend: 28000,
    });
    expect(bill.billable).toBe(0);
    expect(bill.creditIn).toBeLessThan(0);
    expect(splitLeftoverFuel({
      variance: bill.billable,
      unattributedKmCost: 0,
      noOdometerFillCost: 0,
      split: { ...split, driverPercent: 30 },
    }).driver).toBe(0);
  });

  it('never bills a negative week', () => {
    const bill = rollingVarianceBill({ thisWeek: -4500, priorSigned: [1000], weekSpend: 28000 });
    expect(bill.billable).toBe(0);
    expect(splitLeftoverFuel({
      variance: -4500,
      unattributedKmCost: 0,
      noOdometerFillCost: 0,
      split,
    }).driver).toBe(0);
  });

  it('bills only the amount above 10% of spend after credit', () => {
    const bill = rollingVarianceBill({
      thisWeek: 8000,
      priorSigned: [-500],
      weekSpend: 28000,
    });
    expect(bill.runningBalance).toBe(7500);
    expect(bill.billable).toBe(4700);
  });

  it('drops a positive week from the driver when recent credit covers it, and company plus driver still equals spend', () => {
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
    const shared = {
      priorFill: { odometer: 1000, at: '2026-10-04T07:07:00' },
      referenceKmPerLiter: 10,
      referenceDegraded: false,
      leftoverOverride: { ...split },
    };
    const covered = FuelCalculationService.calculateReconciliation(
      vehicle,
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      [],
      entries,
      [],
      [],
      undefined,
      { ...shared, priorWeekVariances: [-20000] },
    );
    expect(covered.miscellaneousCost).toBeGreaterThan(0);
    expect(covered.metadata?.varianceBalance?.billable).toBe(0);
    expect(covered.metadata?.varianceBalance?.driverAdded).toBe(0);
    expect(covered.companyShare + covered.driverShare).toBeCloseTo(covered.totalGasCardCost, 0);

    const open = FuelCalculationService.calculateReconciliation(
      vehicle,
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      [],
      entries,
      [],
      [],
      undefined,
      shared,
    );
    const raw = open.miscellaneousCost;
    const materiality = 9000 * 0.1;
    expect(open.metadata?.varianceBalance?.billable).toBeCloseTo(Math.max(0, raw - materiality), 1);
    expect(open.metadata?.varianceBalance?.driverAdded).toBeCloseTo(Math.max(0, raw - materiality), 1);
    expect(open.companyShare + open.driverShare).toBeCloseTo(open.totalGasCardCost, 0);
  });
});
