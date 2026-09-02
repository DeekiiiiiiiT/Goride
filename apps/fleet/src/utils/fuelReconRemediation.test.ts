import { describe, expect, it } from 'vitest';
import { buildFuelStepCounts, deriveFuelReconciliationPeriods } from './fuelPeriodStatus';
import { isFuelDisputeOpenInWeek } from './fuelPeriodDerive';
import { hashFuelContentSig, fuelEntriesContentSig } from './fuelContentSig';
import type { FuelEntry } from '../types/fuel';

describe('fuel recon remediation regressions', () => {
  it('content sig changes when fill amount changes (H7/M8)', () => {
    const a = fuelEntriesContentSig([{ id: 'e1', amount: 10, updatedAt: 't1' }]);
    const b = fuelEntriesContentSig([{ id: 'e1', amount: 99, updatedAt: 't1' }]);
    expect(a).not.toBe(b);
    expect(hashFuelContentSig(['a'])).toBe(hashFuelContentSig(['a']));
  });

  it('dispute week matching uses YMD bounds (M7)', () => {
    expect(
      isFuelDisputeOpenInWeek(
        { status: 'Open', weekStart: '2026-07-06T00:00:00.000Z' } as any,
        '2026-07-06',
        '2026-07-12',
      ),
    ).toBe(true);
    expect(
      isFuelDisputeOpenInWeek(
        { status: 'Open', weekStart: '2026-07-13' } as any,
        '2026-07-06',
        '2026-07-12',
      ),
    ).toBe(false);
  });

  it('locked weeks clear actionable chips after derive (H1)', () => {
    const periods = deriveFuelReconciliationPeriods({
      weekOptions: [
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
          amount: 100,
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
          totalGasCardCost: 100,
          miscellaneousCost: 40,
        } as any,
      ],
      scenarios: [],
    });
    expect(periods[0].status).toBe('completed');
    expect(periods[0].counts['leakage-gap'].actionable).toBe(0);
  });

  it('negative misc raises data-quality actionable (H2)', () => {
    const counts = buildFuelStepCounts({
      vehicles: [
        {
          vehicleId: 'v1',
          totalSpend: 100,
          companyShare: 50,
          driverShare: 80,
          misc: -30,
          pendingCount: 0,
          hasOpenDispute: false,
          hasScenarioAssigned: true,
          isFinalized: false,
        },
      ],
    });
    expect(counts['data-quality'].actionable).toBe(1);
    expect(counts['leakage-gap'].actionable).toBe(0);
  });
});
