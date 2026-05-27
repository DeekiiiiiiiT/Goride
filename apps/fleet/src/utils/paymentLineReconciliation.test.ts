import { describe, expect, it } from 'vitest';
import { applyPaymentLineRollupsToTrips } from './extractPaymentLedgerLines';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';

describe('payment line trip reconciliation', () => {
  it('rollup paidToYouNet matches sum of lines per trip', () => {
    const tripId = 'trip-abc';
    const lines: PaymentLedgerLine[] = [
      {
        id: 'tx-1',
        platform: 'Uber',
        tripId,
        driverId: 'driver-1',
        description: 'trip completed order',
        reportingAt: '2026-03-16T12:00:00.000Z',
        paidToYou: 100,
        earningsGross: 100,
        cashCollected: 0,
        bankTransferred: 100,
        fareBreakdown: {
          base: 90,
          surge: 10,
          waitPickup: 0,
          timeAtStop: 0,
          cancellation: 0,
          taxes: 0,
          tip: 0,
          tollRefund: 0,
        },
        sourceType: 'uber_import',
        idempotencyKey: 'uber_tx:tx-1',
        externalTransactionId: 'tx-1',
      },
      {
        id: 'tx-2',
        platform: 'Uber',
        tripId,
        driverId: 'driver-1',
        description: 'trip completed order',
        reportingAt: '2026-03-16T12:05:00.000Z',
        paidToYou: 5,
        earningsGross: 0,
        cashCollected: 0,
        bankTransferred: 0,
        fareBreakdown: {
          base: 0,
          surge: 0,
          waitPickup: 0,
          timeAtStop: 0,
          cancellation: 0,
          taxes: 0,
          tip: 5,
          tollRefund: 0,
        },
        sourceType: 'uber_import',
        lineKind: 'tip',
        idempotencyKey: 'uber_tx:tx-2',
        externalTransactionId: 'tx-2',
      },
    ];

    const [rolled] = applyPaymentLineRollupsToTrips(
      [{ id: tripId, amount: 105 }],
      lines,
    );

    expect(rolled.paymentRowCount).toBe(2);
    expect(rolled.paidToYouNet).toBe(105);
    expect(rolled.bankTransferred).toBe(100);
    expect(rolled.externalTransactionIds).toEqual(['tx-1', 'tx-2']);
  });
});
