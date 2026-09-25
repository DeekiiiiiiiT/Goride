import { describe, expect, it } from 'vitest';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';
import {
  entriesToWeekSnapEntries,
  freezeReportMoneyThroughAssembler,
} from './fuelFinalizeWeekSnapAdapter';

const report = {
  id: 'd1_2026-08-10',
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
  vehicleId: 'v1',
  driverId: 'd1',
  // Entry-sum path: report carries no spend, so the assembler total is authoritative.
  totalGasCardCost: 0,
  totalTripDistance: 0,
  rideShareCost: 0,
  companyMiscDistance: 0,
  companyUsageCost: 0,
  personalDistance: 0,
  personalUsageCost: 0,
  deadheadDistance: 0,
  deadheadCost: 0,
  miscellaneousCost: 0,
  companyShare: 0,
  driverShare: 0,
  status: 'Draft',
} as WeeklyFuelReport;

const opsLog = {
  id: 'log-m',
  date: '2026-08-11',
  amount: 6045,
  driverId: 'd1',
  vehicleId: 'v1',
  type: 'Manual_Entry',
  paymentSource: 'Gas_Card',
  entrySource: 'driver-portal',
  reconciliationStatus: 'Verified',
  metadata: { countsInFuelSpend: true, jaaMatchedStatementId: 'stmt-m' },
} as unknown as FuelEntry;

const matchedStatement = {
  id: 'stmt-m',
  date: '2026-08-11',
  amount: 6045,
  driverId: 'd1',
  vehicleId: 'v1',
  type: 'Card_Transaction',
  paymentSource: 'Gas_Card',
  entrySource: 'fuel-card',
  reconciliationStatus: 'Verified',
  metadata: {
    importSource: 'jaa_raw',
    jaaRowKind: 'approved_fuel',
    countsInFuelSpend: true,
    jaaMatchedDriverEntryId: 'log-m',
  },
} as unknown as FuelEntry;

const declinedStatement = {
  ...matchedStatement,
  id: 'stmt-declined',
  metadata: { importSource: 'jaa_raw', jaaRowKind: 'declined', countsInFuelSpend: false },
} as unknown as FuelEntry;

describe('fuelFinalizeWeekSnapAdapter', () => {
  it('carries metadata/entrySource so the assembler can see statement rows', () => {
    const [snap] = entriesToWeekSnapEntries([matchedStatement], report);
    expect(snap.entrySource).toBe('fuel-card');
    expect((snap.metadata as Record<string, unknown>).importSource).toBe('jaa_raw');
  });

  it('Aug-2026 regression: matched statement + declined rows never inflate entry-sum spend', () => {
    const frozen = freezeReportMoneyThroughAssembler({
      report,
      settleEntries: [opsLog, matchedStatement, declinedStatement],
      fuelRule: { coverageType: 'Percentage', rideShareCoverage: 50 },
      orgId: 'org-1',
    });
    expect(frozen.totalGasCardCost).toBe(6045);
  });
});
