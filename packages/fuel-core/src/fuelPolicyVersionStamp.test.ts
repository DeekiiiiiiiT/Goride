/**
 * F-11: every week records the rule and version it was priced with, chosen exactly as the
 * engine chooses its rules (driver assignment → rule id → default → first).
 */
import { describe, expect, it } from 'vitest';
import { resolveAppliedFuelPolicyVersion } from './fuelPolicyVersion.ts';
import { FuelCalculationService } from './fuelCalculationService.ts';
import type { FuelEntry, FuelScenario, Vehicle } from './fuelTypes.ts';

const rule = (pct: number) => [
  { id: `r${pct}`, category: 'Fuel', coverageType: 'Percentage', coverageValue: pct, rideShareCoverage: pct },
] as unknown as FuelScenario['rules'];

// Shapes copied from production (22 Nov 2026): a default rule with one open window, and a
// rule whose window names Kenny from 6 Apr.
const standard: FuelScenario = {
  id: 'std',
  name: 'Standard Fleet Rule',
  isDefault: true,
  rules: rule(80),
  versions: [{ id: 'ca2be8ca-e406-4198-b02d-4052acee178b', effectiveFrom: '2000-01-03', rules: rule(80), createdAt: '2026-01-01' }],
} as FuelScenario;
const high: FuelScenario = {
  id: 'high',
  name: 'High Performer',
  isDefault: false,
  rules: rule(90),
  versions: [{
    id: '24299961-554f-45a0-bba9-f4ac52f1a701', effectiveFrom: '2026-04-06', rules: rule(90),
    driverIds: ['kenny'], createdAt: '2026-04-01',
  }],
} as FuelScenario;
const noSchedule: FuelScenario = { id: 'plain', name: 'Plain', isDefault: true, rules: rule(70), versions: [] } as FuelScenario;

describe('resolveAppliedFuelPolicyVersion', () => {
  it("a driver's version assignment wins", () => {
    expect(resolveAppliedFuelPolicyVersion([standard, high], 'kenny', undefined, '2026-11-16')).toEqual({
      scenarioId: 'high',
      versionId: '24299961-554f-45a0-bba9-f4ac52f1a701',
      effectiveFrom: '2026-04-06',
    });
  });

  it('a driver with no assignment that week falls back to the default rule, as the engine does', () => {
    expect(resolveAppliedFuelPolicyVersion([standard, high], 'kenny', undefined, '2026-03-30')).toEqual({
      scenarioId: 'std',
      versionId: 'ca2be8ca-e406-4198-b02d-4052acee178b',
      effectiveFrom: '2000-01-03',
    });
  });

  it('without a driver: rule id, then default, resolved for the week', () => {
    expect(resolveAppliedFuelPolicyVersion([standard, high], null, undefined, '2026-11-16')?.versionId)
      .toBe('ca2be8ca-e406-4198-b02d-4052acee178b');
    expect(resolveAppliedFuelPolicyVersion([standard, high], null, 'high', '2026-11-16')?.scenarioId).toBe('high');
  });

  it('a rule with no schedule records its template window', () => {
    expect(resolveAppliedFuelPolicyVersion([noSchedule], null, undefined, '2026-11-16')?.versionId).toBe('template-plain');
  });

  it('the week report carries the stamp', () => {
    const vehicle = { id: 'v1', licensePlate: '5179KZ', currentDriverId: 'kenny', fuelSettings: { efficiencyCity: 12, tankCapacity: 36 } } as Vehicle;
    const entries = [
      { id: 'a', vehicleId: 'v1', driverId: 'kenny', date: '2026-11-17T08:00:00', amount: 5000, liters: 22, odometer: 197250, type: 'Fuel_Manual_Entry', paymentSource: 'Personal' },
      { id: 'b', vehicleId: 'v1', driverId: 'kenny', date: '2026-11-19T08:00:00', amount: 5000, liters: 22, odometer: 197500, type: 'Fuel_Manual_Entry', paymentSource: 'Personal' },
    ] as FuelEntry[];
    const report = FuelCalculationService.calculateReconciliation(
      vehicle, new Date(2026, 10, 16), new Date(2026, 10, 22), [], entries, [], [standard, high], undefined,
      { priorFill: { odometer: 197000, at: '2026-11-15T08:00:00' }, referenceKmPerLiter: 12, referenceDegraded: false, driverId: 'kenny' } as never,
    );
    expect((report.metadata as Record<string, unknown>)?.fuelPolicyVersion).toEqual({
      scenarioId: 'high',
      versionId: '24299961-554f-45a0-bba9-f4ac52f1a701',
      effectiveFrom: '2026-04-06',
    });
  });
});
