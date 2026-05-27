import { describe, expect, it } from 'vitest';
import { buildPaymentLedgerCanonicalEvents } from './buildPaymentLedgerCanonicalEvents';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';

describe('buildPaymentLedgerCanonicalEvents', () => {
  it('creates payment_line event for trip completed order', () => {
    const line: PaymentLedgerLine = {
      id: 'tx-1',
      platform: 'Uber',
      tripId: 'trip-a',
      driverId: 'driver-1',
      description: 'trip completed order',
      reportingAt: '2026-03-16T12:15:57.000Z',
      paidToYou: 843.37,
      earningsGross: 843.37,
      cashCollected: 0,
      bankTransferred: 0,
      fareBreakdown: {
        base: 785.53,
        surge: 0,
        waitPickup: 0,
        timeAtStop: 57.84,
        cancellation: 0,
        taxes: 0,
        tip: 0,
        tollRefund: 0,
      },
      sourceType: 'uber_import',
      lineKind: 'fare_earning',
      idempotencyKey: 'uber_tx:tx-1',
      externalTransactionId: 'tx-1',
    };

    const events = buildPaymentLedgerCanonicalEvents([line], 'batch-1');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('payment_line');
    expect(events[0].netAmount).toBe(843.37);
    expect(events[0].externalTransactionId).toBe('tx-1');
    expect(events[0].idempotencyKey).toBe('payment_line:uber_tx:tx-1');
  });

  it('maps so.payout to payout_bank', () => {
    const line: PaymentLedgerLine = {
      id: 'tx-payout',
      platform: 'Uber',
      driverId: '00000000-0000-0000-0000-000000000000',
      description: 'so.payout',
      reportingAt: '2026-03-16T04:29:28.000Z',
      paidToYou: -24484.34,
      earningsGross: 0,
      cashCollected: 0,
      bankTransferred: -24484.34,
      fareBreakdown: {
        base: 0,
        surge: 0,
        waitPickup: 0,
        timeAtStop: 0,
        cancellation: 0,
        taxes: 0,
        tip: 0,
        tollRefund: 0,
      },
      sourceType: 'uber_import',
      lineKind: 'payout',
      idempotencyKey: 'uber_tx:tx-payout',
    };

    const events = buildPaymentLedgerCanonicalEvents([line], 'batch-1');
    expect(events.some((e) => e.eventType === 'payout_bank')).toBe(true);
  });
});
