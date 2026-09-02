/**
 * Close-out smoke contracts (M15) — no jsdom required; guards wiring regressions.
 */
import { describe, expect, it } from 'vitest';
import { interpretFuelFinalizeJobResult } from './fuelFinalizeJobResult';
import { buildFuelEvidenceCsvRows } from './fuelEvidencePack';
import { shouldAutoClosePeriod } from './fuelAutoClose';
import { serverComputedWeekStarts } from './fuelPeriodServerMerge';
import type { FuelDisputesStepProps } from '../components/fuel/reconciliation/FuelDisputesStep';
import type { FuelLeakageStepProps } from '../components/fuel/reconciliation/FuelLeakageStep';
import type { FuelFinalizeStepProps } from '../components/fuel/reconciliation/FuelFinalizeStep';

describe('recon close-out smoke contracts', () => {
  it('NEW-7 toast path: partial job never looks like success', () => {
    const r = interpretFuelFinalizeJobResult({
      state: 'failed',
      ok: false,
      error: 'partial_finalize_failure',
      failures: [{ driverId: 'd2', error: 'x' }],
      driversDone: ['d1'],
    });
    expect(r.incomplete).toBe(true);
    expect(r.toastMessage).not.toMatch(/locked/i);
    expect(r.toastMessage).toMatch(/stays open|incomplete/i);
  });

  it('evidence pack CSV has summary + settlement sections', () => {
    const rows = buildFuelEvidenceCsvRows({
      weekLabel: 'Jul 6',
      weekStart: '2026-07-06',
      weekEnd: '2026-07-12',
      strip: {
        totalSpend: 100,
        gasCard: 80,
        cashFromEarnings: 20,
        company: 40,
        driver: 50,
        leakage: 10,
      },
      settlementRows: [
        { plate: 'ABC', cashFromEarnings: 20, driverShare: 50, netPay: -30, status: 'locked' },
      ],
      openDisputeCount: 0,
      leakageReviewed: true,
      stepNotes: [{ step: 'leakage-gap', note: 'ok', at: '2026-07-10T00:00:00Z' }],
    });
    expect(rows.some((r) => r.section === 'summary')).toBe(true);
    expect(rows.some((r) => r.section === 'settlement')).toBe(true);
    expect(rows.some((r) => r.section === 'note')).toBe(true);
  });

  it('auto-close allows reviewed gaps above eps', () => {
    expect(
      shouldAutoClosePeriod({
        locked: false,
        actionableTotal: 0,
        netLeakage: 50,
        leakageReviewed: true,
      }),
    ).toBe(true);
  });

  it('M1/M2: computed weeks are skipped for live engines', () => {
    expect(
      [
        ...serverComputedWeekStarts([
          {
            id: '1',
            orgId: 'o',
            weekStart: '2026-07-06',
            weekEnd: '2026-07-12',
            status: 'open',
            version: 1,
            vehicleCount: 1,
            driverCount: 1,
            totalSpend: 1,
            gasCardSpend: 1,
            cashFromEarnings: 0,
            companyShare: 0,
            driverShare: 0,
            unexplained: 0,
            computedAt: '2026-07-07T00:00:00Z',
          },
        ]),
      ],
    ).toEqual(['2026-07-06']);
  });

  it('extracted step prop contracts stay stable', () => {
    const disputes: FuelDisputesStepProps = {
      openDisputes: [],
      periodLocked: false,
      onResolveDispute: () => undefined,
      onAddAdjustment: () => undefined,
    };
    expect(disputes.openDisputes).toEqual([]);

    const leakageKeys: Array<keyof FuelLeakageStepProps> = [
      'leakage',
      'leakageRows',
      'queueIndex',
      'onToggleGapDetail',
    ];
    expect(leakageKeys.length).toBe(4);

    const finalizeKeys: Array<keyof FuelFinalizeStepProps> = [
      'onDownloadEvidencePack',
      'needsSecondApprover',
      'settlementRows',
    ];
    expect(finalizeKeys.length).toBe(3);
  });
});
