import { describe, expect, it } from 'vitest';
import { computeUberImportReconciliation } from './uberImportReconciliation';
import type { DisputeRefund, OrganizationMetrics } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

describe('computeUberImportReconciliation', () => {
  it('splits tolls vs toll support when org Refunds:Toll repeats total refunds (1,395 = 1,385 + 10)', () => {
    const org = {
      totalEarnings: 83478.73,
      netFare: 81361.5,
      refundsToll: 1395,
      totalCashExposure: 33013.2,
      bankTransfer: -51860.53,
      periodStart: '2026-03-23',
      periodEnd: '2026-03-30',
    } as OrganizationMetrics;

    const ssot: Record<string, UberSsotTotals> = {
      d1: {
        periodEarningsGross: 83478.73,
        fareComponents: 0,
        statementNetFare: 81361.5,
        promotions: 197.23,
        tips: 1920,
        refundsAndExpenses: 1395,
      },
    };

    const dr: DisputeRefund = {
      id: '1',
      supportCaseId: 'x',
      amount: 10,
      date: '2026-03-24T12:00:00.000Z',
      driverId: 'd1',
      driverName: 'T',
      platform: 'Uber',
      source: 'platform_import',
      status: 'auto_resolved',
      matchedTollId: null,
      matchedClaimId: null,
      importedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      rawDescription: '',
    };

    const r = computeUberImportReconciliation({
      organizationMetrics: org,
      uberStatementsByDriverId: ssot,
      trips: [],
      disputeRefunds: [dr],
    });

    expect(r.refundsTotal).toBe(1395);
    expect(r.tollSupport).toBe(10);
    expect(r.tolls).toBe(1385);
  });
});
