/**
 * F-07 / done-test 14 (engine half): a gas-card fill is stored as the driver's scan plus the
 * card statement row (Card Inventory ledger, metadata.importSource "jaa_raw"). The week must
 * count it once. Shapes copied from production pairs (22 Nov 2026): 33 statement rows carry
 * the scan's odometer as an "Anchor", 6 carry none ("Floating").
 */
import { describe, expect, it } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService.ts';
import type { FuelV3Result } from './fuelEngineV3.ts';
import type { FuelEntry, Vehicle } from './fuelTypes.ts';

const vehicle = {
  id: 'v1',
  licensePlate: '5179KZ',
  currentDriverId: 'd1',
  fuelSettings: { efficiencyCity: 12, tankCapacity: 36 },
} as Vehicle;

const scans: FuelEntry[] = [
  { id: 'prior', vehicleId: 'v1', driverId: 'd1', date: '2026-11-15T08:00:00', amount: 5000, liters: 22, odometer: 197000, type: 'Fuel_Manual_Entry', paymentSource: 'Personal' } as FuelEntry,
  { id: 'cash1', vehicleId: 'v1', driverId: 'd1', date: '2026-11-17T08:00:00', amount: 5000, liters: 22, odometer: 197250, type: 'Fuel_Manual_Entry', paymentSource: 'Personal' } as FuelEntry,
  {
    id: 'scanCard', vehicleId: 'v1', driverId: 'd1', date: '2026-11-18T08:00:00', amount: 5000, liters: 22, odometer: 197500,
    type: 'Manual_Entry', paymentSource: 'Gas_Card', entryMode: 'Anchor',
    metadata: { jaaMatchedStatementId: 'stmtA', countsInFuelSpend: true, awaitingCardStatement: false },
  } as unknown as FuelEntry,
  {
    id: 'scanCard2', vehicleId: 'v1', driverId: 'd1', date: '2026-11-20T08:00:00', amount: 4000, liters: 18, odometer: 197700,
    type: 'Manual_Entry', paymentSource: 'Gas_Card', entryMode: 'Anchor',
    metadata: { jaaMatchedStatementId: 'stmtB', countsInFuelSpend: true, awaitingCardStatement: false },
  } as unknown as FuelEntry,
];

const statementTwins: FuelEntry[] = [
  {
    id: 'stmtA', vehicleId: 'v1', driverId: 'd1', date: '2026-11-18T08:00:00', amount: 5000, liters: 22, odometer: 197500,
    type: 'Card_Transaction', paymentSource: 'Gas_Card', entryMode: 'Anchor', entrySource: 'fuel-card',
    metadata: { importSource: 'jaa_raw', jaaRowKind: 'fuel', jaaMatchedDriverEntryId: 'scanCard' },
  } as unknown as FuelEntry,
  {
    id: 'stmtB', vehicleId: 'v1', driverId: 'd1', date: '2026-11-20T08:00:00', amount: 4000, liters: 18,
    type: 'Card_Transaction', paymentSource: 'Gas_Card', entryMode: 'Floating', entrySource: 'fuel-card',
    metadata: { importSource: 'jaa_raw', jaaRowKind: 'fuel', jaaMatchedDriverEntryId: 'scanCard2' },
  } as unknown as FuelEntry,
];

function week(entries: FuelEntry[]) {
  return FuelCalculationService.calculateReconciliation(
    vehicle,
    new Date(2026, 10, 16),
    new Date(2026, 10, 22),
    [],
    entries,
    [],
    [],
    undefined,
    {
      priorFill: { odometer: 197000, at: '2026-11-15T08:00:00' },
      referenceKmPerLiter: 12,
      referenceDegraded: false,
    },
  );
}

describe('F-07: a gas-card fill and its statement row count once', () => {
  it('v3 prices the week the same with or without the statement rows', () => {
    const without = week(scans);
    const withTwins = week([...scans, ...statementTwins]);
    const v3a = without.metadata?.fuelV3 as FuelV3Result;
    const v3b = withTwins.metadata?.fuelV3 as FuelV3Result;
    expect(v3a).toBeTruthy();
    // In-week fills: cash1 5,000 + scanCard 5,000 + scanCard2 4,000 = 14,000 (prior fill is last week).
    expect(v3b.totalSpend).toBeCloseTo(14000, 2);
    expect(v3b.totalSpend).toBeCloseTo(v3a.totalSpend, 2);
    expect(v3b.odometerKm).toBe(v3a.odometerKm);
    expect(v3b.costPerKm).toBe(v3a.costPerKm);
    expect(v3b.driverMinor).toBe(v3a.driverMinor);
    expect(v3b.companyMinor).toBe(v3a.companyMinor);
    expect(withTwins.totalGasCardCost).toBeCloseTo(without.totalGasCardCost, 2);
  });
});
