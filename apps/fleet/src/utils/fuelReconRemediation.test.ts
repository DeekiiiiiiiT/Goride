import { describe, expect, it } from 'vitest';
import { buildFuelStepCounts, deriveFuelReconciliationPeriods } from './fuelPeriodStatus';
import {
  buildFuelVehicleSnapshots,
  isFuelDisputeOpenInWeek,
  liveReportsToPrimaryClaimedSlices,
} from './fuelPeriodDerive';
import { serverRowsToLandingPeriods } from './fuelPeriodServerMerge';
import { hashFuelContentSig, fuelEntriesContentSig } from './fuelContentSig';
import type { FuelEntry } from '../types/fuel';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

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

  it('locked weeks clear actionable chips via SQL lock (H1), not snapshots', () => {
    const cards = serverRowsToLandingPeriods([
      {
        id: 'org:2026-07-06',
        orgId: 'org',
        weekStart: '2026-07-06',
        weekEnd: '2026-07-12',
        status: 'locked',
        lockedAt: '2026-07-13T00:00:00Z',
        version: 1,
        vehicleCount: 1,
        driverCount: 1,
        totalSpend: 100,
        gasCardSpend: 100,
        cashFromEarnings: 0,
        companyShare: 60,
        driverShare: 40,
        unexplained: 40,
        counts: {
          'leakage-gap': { actionable: 1, informational: 0 },
          finalize: { actionable: 1, informational: 0 },
        } as any,
      },
    ]);
    expect(cards[0].locked).toBe(true);
    expect(cards[0].status).toBe('completed');
    expect(cards[0].counts['leakage-gap'].actionable).toBe(0);
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

  it('shared-car: primary claim once — landing == Σ snaps (NEW-1/NEW-2/C3)', () => {
    const vehicles = [
      { id: 'v-primary', fuelScenarioId: 's1', currentDriverId: 'd1' },
      { id: 'v-secondary', fuelScenarioId: 's1', currentDriverId: 'd1' },
    ] as any[];
    const report = {
      driverId: 'd1',
      vehicleId: 'v-primary',
      vehicleIds: ['v-primary', 'v-secondary'],
      totalGasCardCost: 1000,
      companyShare: 400,
      driverShare: 500,
      miscellaneousCost: 100,
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
    };
    const liveSlices = liveReportsToPrimaryClaimedSlices([report]);
    const { snapshots } = buildFuelVehicleSnapshots({
      vehicles,
      weekStartYmd: '2026-07-06',
      weekEndYmd: '2026-07-12',
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v-primary',
          date: '2026-07-07',
          amount: 1000,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [
        {
          id: 'disp1',
          status: 'Open',
          vehicleId: 'v-primary',
          weekStart: '2026-07-06T12:00:00.000Z',
        } as any,
      ],
      finalizedReports: [],
      scenarios: [{ id: 's1', isDefault: true } as any],
      liveSlices,
    });

    const withMoney = snapshots.filter((s) => s.totalSpend > FUEL_SPEND_EPS);
    expect(withMoney).toHaveLength(1);
    expect(withMoney[0].vehicleId).toBe('v-primary');
    expect(withMoney[0].totalSpend).toBe(1000);
    expect(withMoney[0].companyShare + withMoney[0].driverShare + withMoney[0].misc).toBe(1000);

    const sumSpend = snapshots.reduce((s, v) => s + v.totalSpend, 0);
    const sumCompany = snapshots.reduce((s, v) => s + v.companyShare, 0);
    const sumDriver = snapshots.reduce((s, v) => s + v.driverShare, 0);
    const sumMisc = snapshots.reduce((s, v) => s + v.misc, 0);
    expect(sumSpend).toBe(1000);
    expect(sumCompany + sumDriver + sumMisc).toBe(sumSpend);

    const secondary = snapshots.find((s) => s.vehicleId === 'v-secondary');
    expect(secondary?.totalSpend).toBe(0);
    expect(secondary?.hasWeekActivity).toBe(true);
    expect(snapshots.find((s) => s.vehicleId === 'v-primary')?.hasOpenDispute).toBe(true);

    const periods = deriveFuelReconciliationPeriods({
      weekOptions: [
        {
          id: '2026-07-06',
          label: 'Jul 6 – Jul 12, 2026',
          startDate: '2026-07-06',
          endDate: '2026-07-12',
        },
      ],
      vehicles,
      fuelEntries: [
        {
          id: 'e1',
          vehicleId: 'v-primary',
          date: '2026-07-07',
          amount: 1000,
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [{ id: 's1', isDefault: true } as any],
      liveReportsByWeek: new Map([['2026-07-06', liveSlices]]),
    });
    expect(periods[0].totalSpend).toBe(1000);
    expect(periods[0].companyShare + periods[0].driverShare + periods[0].netLeakage).toBe(1000);
  });

  it('derive is pure — leakageReviewedWeeks arg only (NEW-3)', () => {
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
          reconciliationStatus: 'Pending',
        } as FuelEntry,
      ],
      disputes: [],
      finalizedReports: [],
      scenarios: [{ id: 's1', isDefault: true } as any],
      liveReportsByWeek: new Map([
        [
          '2026-07-06',
          [
            {
              vehicleId: 'v1',
              totalGasCardCost: 100,
              companyShare: 40,
              driverShare: 40,
              miscellaneousCost: 20,
            },
          ],
        ],
      ]),
      leakageReviewedWeeks: new Set(['2026-07-06']),
    });
    expect(periods[0].counts['leakage-gap'].actionable).toBe(0);
    expect(periods[0].counts['leakage-gap'].informational).toBeGreaterThan(0);
  });
});
