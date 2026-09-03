import { describe, expect, it } from 'vitest';
import {
  buildFuelPeriodResetInventory,
  deriveFuelReconciliationPeriods,
} from './fuelPeriodStatus';
import type { FuelEntry, FinalizedFuelReport } from '../types/fuel';

describe('fuelPeriodStatus', () => {
  const weekOptions = [
    {
      id: '2026-07-06',
      label: 'Jul 6 – Jul 12, 2026',
      startDate: '2026-07-06',
      endDate: '2026-07-12',
    },
  ];

  it('marks week outstanding when spend not finalized', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 50,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [],
    });
    // Entry-only fast path: unallocated spend counts as unexplained → Outstanding
    expect(periods[0].status).toBe('outstanding');
    expect(periods[0].counts['leakage-gap'].actionable).toBe(1);
    expect(periods[0].counts.finalize.actionable).toBe(1);
    expect(periods[0].counts['data-quality'].informational).toBeGreaterThan(0);
  });

  it('marks week outstanding when exception-tier fills remain', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 50,
          reconciliationStatus: 'Pending',
          metadata: { signalTier: 'exception', anomalyReason: 'Extreme Mid-Cycle Drift' },
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [],
    });
    expect(periods[0].status).toBe('outstanding');
    expect(periods[0].exceptionCount).toBe(1);
    expect(periods[0].counts['data-quality'].actionable).toBeGreaterThan(0);
  });

  it('snapshots alone do not mark week completed or locked (SQL lock SoT)', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 50,
          reconciliationStatus: 'Verified',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [
        {
          vehicleId: 'v1',
          weekStart: '2026-07-06',
          weekEnd: '2026-07-12',
          status: 'Finalized',
          totalGasCardCost: 50,
        } as FinalizedFuelReport,
      ],
      scenarios: [],
      liveReportsByWeek: new Map([
        [
          '2026-07-06',
          [
            {
              vehicleId: 'v1',
              totalGasCardCost: 50,
              companyShare: 20,
              driverShare: 30,
              miscellaneousCost: 0,
              healthStatus: 'Emerald',
              pendingCount: 0,
            },
          ],
        ],
      ]),
    });
    expect(periods[0].locked).toBe(false);
    expect(periods[0].status).not.toBe('completed');
  });

  it('uses finalized snapshot for Unexplained when live reports are omitted', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 34996.6,
          reconciliationStatus: 'Verified',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [
        {
          vehicleId: 'v1',
          weekStart: '2026-07-06',
          weekEnd: '2026-07-12',
          status: 'Finalized',
          totalGasCardCost: 34996.6,
          companyShare: 29211.62,
          driverShare: 5784.98,
          miscellaneousCost: 3063.23,
        } as FinalizedFuelReport,
      ],
      scenarios: [],
    });
    expect(periods).toHaveLength(1);
    expect(periods[0].locked).toBe(false);
    expect(periods[0].status).not.toBe('completed');
    expect(periods[0].netLeakage).toBeCloseTo(3063.23, 1);
    expect(periods[0].totalSpend).toBeCloseTo(34996.6, 1);
    expect(periods[0].companyShare).toBeCloseTo(29211.62, 2);
    expect(periods[0].driverShare).toBeCloseTo(5784.98, 2);
  });

  it('drops empty unlocked weeks so they do not inflate Outstanding / Finalize weeks', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions: [
        {
          id: '2026-08-31',
          label: 'Aug 31 – Sep 6, 2026',
          startDate: '2026-08-31',
          endDate: '2026-09-06',
        },
        {
          id: '2026-07-06',
          label: 'Jul 6 – Jul 12, 2026',
          startDate: '2026-07-06',
          endDate: '2026-07-12',
        },
      ],
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 50,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [],
    });
    expect(periods.map((p) => p.startDate)).toEqual(['2026-07-06']);
    expect(periods.every((p) => p.vehicleCount > 0)).toBe(true);
  });

  it('marks unlocked week outstanding when live misc (unexplained) is open', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [{ id: 'v1', fuelScenarioId: 's1' } as any],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 100,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [],
      liveReportsByWeek: new Map([
        [
          '2026-07-06',
          [
            {
              vehicleId: 'v1',
              totalGasCardCost: 100,
              companyShare: 50,
              driverShare: 20,
              miscellaneousCost: 30,
              healthStatus: 'Amber',
              pendingCount: 1,
            },
          ],
        ],
      ]),
    });
    expect(periods[0].status).toBe('outstanding');
    expect(periods[0].netLeakage).toBeCloseTo(30, 5);
    expect(periods[0].counts['leakage-gap'].actionable).toBe(1);
  });

  it('reset inventory lists snapshots for week', () => {
    const inv = buildFuelPeriodResetInventory(
      '2026-07-06',
      [
        { vehicleId: 'v1', weekStart: '2026-07-06', weekEnd: '2026-07-12' } as FinalizedFuelReport,
        { vehicleId: 'v2', weekStart: '2026-06-29', weekEnd: '2026-07-05' } as FinalizedFuelReport,
      ],
      [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-07',
          amount: 10,
          reconciliationStatus: 'Verified',
        } as FuelEntry,
      ],
    );
    expect(inv.snapshots).toHaveLength(1);
    expect(inv.postedEntryCount).toBe(1);
    expect(inv.canReset).toBe(true);
  });

  it('reset inventory allows reset when posted logs exist without snapshots', () => {
    const inv = buildFuelPeriodResetInventory(
      '2026-06-29',
      [],
      [
        {
          id: 'e1',
          vehicleId: 'v1',
          date: '2026-07-01',
          amount: 10,
          reconciliationStatus: 'Verified',
          metadata: { finalizedByReport: 'v1_2026-06-29' },
        } as FuelEntry,
      ],
    );
    expect(inv.snapshots).toHaveLength(0);
    expect(inv.postedEntryCount).toBe(1);
    expect(inv.weekEntryCount).toBe(1);
    expect(inv.canReset).toBe(true);
    expect(inv.vehicleIds).toEqual(['v1']);
  });

  it('counts shared-car driver-week money once across two vehicles', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions,
      vehicles: [
        { id: 'v1', fuelScenarioId: 's1', currentDriverId: 'd1' } as any,
        { id: 'v2', fuelScenarioId: 's1', currentDriverId: 'd1' } as any,
      ],
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v1',
          driverId: 'd1',
          date: '2026-07-07',
          amount: 60,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
        {
          id: 'e2',
          vehicleId: 'v2',
          driverId: 'd1',
          date: '2026-07-08',
          amount: 40,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [],
      liveReportsByWeek: new Map([
        [
          '2026-07-06',
          [
            // Primary owns full driver-week totals (landing fan-out contract)
            {
              vehicleId: 'v1',
              totalGasCardCost: 100,
              companyShare: 40,
              driverShare: 30,
              miscellaneousCost: 30,
              healthStatus: 'Emerald',
              pendingCount: 2,
            },
            // Secondary presence only
            {
              vehicleId: 'v2',
              totalGasCardCost: 0,
              companyShare: 0,
              driverShare: 0,
              miscellaneousCost: 0,
              pendingCount: 0,
            },
          ],
        ],
      ]),
    });
    expect(periods[0].totalSpend).toBeCloseTo(100, 5);
    expect(periods[0].netLeakage).toBeCloseTo(30, 5);
    expect(periods[0].companyShare).toBeCloseTo(40, 5);
    expect(periods[0].driverShare).toBeCloseTo(30, 5);
    expect(periods[0].counts['leakage-gap'].actionable).toBe(1);
  });
});
