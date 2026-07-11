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
    expect(periods[0].status).toBe('outstanding');
    expect(periods[0].counts.finalize.actionable).toBe(1);
    expect(periods[0].counts['data-quality'].actionable).toBeGreaterThan(0);
  });

  it('marks week completed when finalized and clear', () => {
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
    expect(periods[0].status).toBe('completed');
    expect(periods[0].locked).toBe(true);
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
  });
});
