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
  /**
   * NOTE: As of the "Uber Computed Statement Summary" update, buildCanonicalImportEvents
   * NO LONGER emits fare-related statement_line events (TOTAL_EARNINGS, NET_FARE, PROMOTIONS, TIPS, etc.).
   * Fare data now comes from trip-level fare_earning/tip/promotion events via buildCanonicalTripFareEventsFromTrip.
   * 
   * This test verifies the events that ARE still emitted:
   * - promotion (payments_driver total per driver)
   * - payout_cash / payout_bank (org-level cash/bank totals)
   * - REFUNDS_TOLL statement_line (org-level toll refunds)
   * - toll_support_adjustment / dispute_refund (support case refunds)
   */
  it('emits payouts, toll_support_adjustment, and org toll line with stable keys (no fare statement lines)', () => {
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
    
    // Fare-related statement lines are NO LONGER emitted (fares come from trip events now)
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|TOTAL_EARNINGS`);
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|NET_FARE`);
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|FARE_COMPONENTS`);
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|PROMOTIONS`);
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|TIPS`);
    expect(keys).not.toContain(`${batchId}|stmt|${driverId}|REFUNDS_EXPENSES`);
    
    // Payout events ARE still emitted
    expect(keys).toContain(`${batchId}|payout|CASH`);
    expect(keys).toContain(`${batchId}|payout|BANK`);
    
    // Toll support adjustment IS still emitted
    expect(keys).toContain(`${batchId}|toll_support|${dispute.id}`);
    
    // Org-level toll refund line IS still emitted
    expect(keys).toContain(`${batchId}|stmt|${driverId}|REFUNDS_TOLL`);

    // Verify toll refund line details
    const tollLine = events.find(
      (e) => e.eventType === 'statement_line' && e.metadata?.lineCode === 'REFUNDS_TOLL',
    );
    expect(tollLine?.direction).toBe('inflow');
    expect(tollLine?.netAmount).toBe(4);

    // Verify toll support adjustment details
    const tollSupport = events.find((e) => e.eventType === 'toll_support_adjustment');
    expect(tollSupport?.idempotencyKey).toBe(`${batchId}|toll_support|${dispute.id}`);

    // Verify common event properties
    expect(events[0].sourceType).toBe('import_batch');
    expect(events.every((e) => e.sourceId === batchId)).toBe(true);
    
    // REFUNDS_TOLL, promotion, payout_cash, payout_bank, toll_support_adjustment
    expect(events.length).toBe(5);
    const promoEv = events.find((e) => e.eventType === 'promotion');
    expect(promoEv?.netAmount).toBe(5);
    expect(promoEv?.idempotencyKey).toBe(`${batchId}|driver_promotion|${driverId.toLowerCase()}`);
    expect(promoEv?.date).toBe('2026-03-01');
  });

  it('posts import_batch promotion on earliest trip date when org period starts earlier than trips', () => {
    const batchId = 'batch-22222222-2222-2222-2222-222222222222';
    const driverId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const ssot: Record<string, UberSsotTotals> = {
      [driverId]: {
        periodEarningsGross: 0,
        fareComponents: 0,
        statementNetFare: 0,
        promotions: 197.23,
        tips: 0,
        refundsAndExpenses: 0,
      },
    };
    const org: OrganizationMetrics = {
      periodStart: '2026-03-17T00:00:00.000Z',
      periodEnd: '2026-03-23T23:59:59.999Z',
      totalEarnings: 0,
      netFare: 0,
      balanceStart: 0,
      balanceEnd: 0,
      periodChange: 0,
      fleetProfitMargin: 0,
      cashPosition: 0,
    };
    const trips = [baseTrip({ driverId, date: '2026-03-23' })];
    const events = buildCanonicalImportEvents({
      batchId,
      trips,
      organizationMetrics: org,
      uberStatementsByDriverId: ssot,
      disputeRefunds: [],
    });
    const promoEv = events.find((e) => e.eventType === 'promotion');
    expect(promoEv?.date).toBe('2026-03-23');
    expect(promoEv?.periodStart).toBe('2026-03-17');
    expect(promoEv?.periodEnd).toBe('2026-03-23');
  });
});
