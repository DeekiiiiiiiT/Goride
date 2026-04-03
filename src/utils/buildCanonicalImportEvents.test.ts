import { describe, expect, it } from 'vitest';
import { buildCanonicalImportEvents, pickPrimaryUberDriverId } from './buildCanonicalImportEvents';
import type { Trip, OrganizationMetrics, DisputeRefund } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

const baseTrip = (over: Partial<Trip>): Trip =>
  ({
    id: 't1',
    date: '2026-03-01',
    amount: 10,
    driverId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    platform: 'Uber',
    status: 'Completed',
    ...over,
  }) as Trip;

describe('pickPrimaryUberDriverId', () => {
  it('returns driver with most completed Uber trips', () => {
    const trips = [
      baseTrip({ driverId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' }),
      baseTrip({ driverId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' }),
      baseTrip({ driverId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' }),
    ];
    expect(pickPrimaryUberDriverId(trips)).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
  });
});

describe('buildCanonicalImportEvents', () => {
  it('emits statement lines, payouts, toll_support_adjustment, and org toll line with stable keys', () => {
    const batchId = 'batch-11111111-1111-1111-1111-111111111111';
    const driverId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const ssot: Record<string, UberSsotTotals> = {
      [driverId]: {
        periodEarningsGross: 100,
        fareComponents: 60,
        statementNetFare: 50,
        promotions: 5,
        tips: 10,
        refundsAndExpenses: 3,
      },
    };
    const org: OrganizationMetrics = {
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-07T00:00:00.000Z',
      totalEarnings: 100,
      netFare: 50,
      balanceStart: 0,
      balanceEnd: 0,
      periodChange: 0,
      fleetProfitMargin: 0,
      cashPosition: 0,
      totalCashExposure: 20,
      bankTransfer: 15,
      refundsToll: 4,
    };
    const dispute: DisputeRefund = {
      id: 'refund-uuid-1',
      supportCaseId: 'case-uuid-1',
      amount: 12.5,
      date: '2026-03-05T12:00:00.000Z',
      driverId,
      driverName: 'Test',
      platform: 'Uber',
      source: 'platform_import',
      status: 'unmatched',
      matchedTollId: null,
      matchedClaimId: null,
      importedAt: '2026-03-08T00:00:00.000Z',
      resolvedAt: null,
      resolvedBy: null,
      rawDescription: '',
    };
    const trips = [baseTrip({ driverId })];

    const events = buildCanonicalImportEvents({
      batchId,
      sourceFileHash: 'abc123',
      trips,
      organizationMetrics: org,
      uberStatementsByDriverId: ssot,
      disputeRefunds: [dispute],
    });

    const keys = events.map((e) => e.idempotencyKey);
    expect(keys).toContain(`${batchId}|stmt|${driverId}|TOTAL_EARNINGS`);
    expect(keys).toContain(`${batchId}|stmt|${driverId}|NET_FARE`);
    expect(keys).toContain(`${batchId}|stmt|${driverId}|FARE_COMPONENTS`);
    expect(keys).toContain(`${batchId}|payout|CASH`);
    expect(keys).toContain(`${batchId}|payout|BANK`);
    expect(keys).toContain(`${batchId}|toll_support|${dispute.id}`);
    expect(keys).toContain(`${batchId}|stmt|${driverId}|REFUNDS_TOLL`);

    const tollLine = events.find(
      (e) => e.eventType === 'statement_line' && e.metadata?.lineCode === 'REFUNDS_TOLL',
    );
    expect(tollLine?.direction).toBe('inflow');
    expect(tollLine?.netAmount).toBe(4);

    const refundsLine = events.find(
      (e) => e.eventType === 'statement_line' && e.metadata?.lineCode === 'REFUNDS_EXPENSES',
    );
    expect(refundsLine?.direction).toBe('outflow');
    expect(refundsLine?.netAmount).toBeLessThan(0);

    const tollSupport = events.find((e) => e.eventType === 'toll_support_adjustment');
    expect(tollSupport?.idempotencyKey).toBe(`${batchId}|toll_support|${dispute.id}`);

    expect(events[0].sourceType).toBe('import_batch');
    expect(events.every((e) => e.sourceId === batchId)).toBe(true);
  });
});
