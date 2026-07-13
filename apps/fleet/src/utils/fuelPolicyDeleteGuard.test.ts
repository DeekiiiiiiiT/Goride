import { describe, expect, it } from 'vitest';
import { evaluateFuelPolicyDeleteGuard } from './fuelPolicyDeleteGuard';
import type { FinalizedFuelReport, FuelEntry } from '../types/fuel';

const weeks = [
  { id: '2026-06-29', startDate: '2026-06-29', endDate: '2026-07-05', label: 'Jun 29 – Jul 5' },
  { id: '2026-07-06', startDate: '2026-07-06', endDate: '2026-07-12', label: 'Jul 6 – Jul 12' },
];

describe('evaluateFuelPolicyDeleteGuard', () => {
  it('blocks when drivers are assigned', () => {
    const r = evaluateFuelPolicyDeleteGuard({
      policyId: 'quota',
      drivers: [{ id: 'd1', fuelScenarioId: 'quota', name: 'Kenny' }],
      fuelEntries: [],
      finalizedReports: [],
      weekOptions: weeks,
    });
    expect(r.canHardDelete).toBe(false);
    expect(r.blockingDrivers).toHaveLength(1);
    expect(r.warnOnly).toBe(false);
  });

  it('blocks when assigned drivers have unfinalized week spend', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        date: '2026-06-30',
        driverId: 'd1',
        amount: 50,
        type: 'Card_Transaction',
        entryMode: 'Floating',
        paymentSource: 'Gas_Card',
        reconciliationStatus: 'Pending',
      },
    ];
    const r = evaluateFuelPolicyDeleteGuard({
      policyId: 'quota',
      drivers: [{ id: 'd1', fuelScenarioId: 'quota', name: 'Kenny' }],
      fuelEntries: entries,
      finalizedReports: [],
      weekOptions: weeks,
    });
    expect(r.canHardDelete).toBe(false);
    expect(r.openWeeks.map((w) => w.startDate)).toContain('2026-06-29');
  });

  it('does not open-block weeks already finalized for that driver', () => {
    const entries: FuelEntry[] = [
      {
        id: 'e1',
        date: '2026-06-30',
        driverId: 'd1',
        amount: 50,
        type: 'Card_Transaction',
        entryMode: 'Floating',
        paymentSource: 'Gas_Card',
        reconciliationStatus: 'Pending',
      },
    ];
    const finalized: FinalizedFuelReport[] = [
      {
        id: 'd1_2026-06-29',
        weekStart: '2026-06-29',
        weekEnd: '2026-07-05',
        vehicleId: 'v1',
        driverId: 'd1',
        totalGasCardCost: 50,
        totalTripDistance: 0,
        rideShareCost: 0,
        companyMiscDistance: 0,
        companyUsageCost: 0,
        deadheadDistance: 0,
        deadheadCost: 0,
        personalDistance: 0,
        personalUsageCost: 0,
        miscellaneousCost: 0,
        companyShare: 40,
        driverShare: 10,
        status: 'Finalized',
        finalizedAt: '2026-07-01T00:00:00.000Z',
        driverSpend: 0,
        netPay: -10,
      },
    ];
    const r = evaluateFuelPolicyDeleteGuard({
      policyId: 'quota',
      drivers: [{ id: 'd1', fuelScenarioId: 'quota', name: 'Kenny' }],
      fuelEntries: entries,
      finalizedReports: finalized,
      weekOptions: weeks,
    });
    // Still blocked by assigned driver, but openWeeks should be empty for that week
    expect(r.blockingDrivers).toHaveLength(1);
    expect(r.openWeeks).toHaveLength(0);
  });

  it('warns when only finalized snapshots reference the policy', () => {
    const finalized: FinalizedFuelReport[] = [
      {
        id: 'd1_2026-06-29',
        weekStart: '2026-06-29',
        weekEnd: '2026-07-05',
        vehicleId: 'v1',
        driverId: 'd1',
        totalGasCardCost: 50,
        totalTripDistance: 0,
        rideShareCost: 0,
        companyMiscDistance: 0,
        companyUsageCost: 0,
        deadheadDistance: 0,
        deadheadCost: 0,
        personalDistance: 0,
        personalUsageCost: 0,
        miscellaneousCost: 0,
        companyShare: 40,
        driverShare: 10,
        status: 'Finalized',
        finalizedAt: '2026-07-01T00:00:00.000Z',
        driverSpend: 0,
        netPay: -10,
        metadata: { scenarioId: 'quota', appliedScenario: { id: 'quota', name: 'Quota Met' } },
      },
    ];
    const r = evaluateFuelPolicyDeleteGuard({
      policyId: 'quota',
      drivers: [{ id: 'd1', fuelScenarioId: undefined, name: 'Kenny' }],
      fuelEntries: [],
      finalizedReports: finalized,
      weekOptions: weeks,
    });
    expect(r.canHardDelete).toBe(true);
    expect(r.warnOnly).toBe(true);
    expect(r.finalizedWeeks).toHaveLength(1);
  });

  it('allows clean delete with no refs', () => {
    const r = evaluateFuelPolicyDeleteGuard({
      policyId: 'copy',
      drivers: [],
      fuelEntries: [],
      finalizedReports: [],
      weekOptions: weeks,
    });
    expect(r.canHardDelete).toBe(true);
    expect(r.warnOnly).toBe(false);
  });
});
