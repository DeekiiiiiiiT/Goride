import { describe, expect, it } from 'vitest';
import { clusterPayoutCashC1 } from './payoutCashC1.ts';

describe('clusterPayoutCashC1', () => {
  it('flags same-driver same-day same-amount rows from different keys', () => {
    const clusters = clusterPayoutCashC1([
      {
        driverId: 'd1',
        effectiveAt: '2026-08-04T12:00:00Z',
        amountMinor: 10000,
        idempotencyKey: 'file:aaa|payout|cash|d1',
      },
      {
        driverId: 'd1',
        effectiveAt: '2026-08-04T18:00:00Z',
        amountMinor: 10000,
        idempotencyKey: 'batch-2|payout|cash|d1',
      },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].copies).toBe(2);
    expect(clusters[0].posted).toBe(200);
  });

  it('ignores two drivers with the same day and amount', () => {
    const clusters = clusterPayoutCashC1([
      {
        driverId: 'd1',
        effectiveAt: '2026-08-04',
        amountMinor: 10000,
        idempotencyKey: 'k1',
      },
      {
        driverId: 'd2',
        effectiveAt: '2026-08-04',
        amountMinor: 10000,
        idempotencyKey: 'k2',
      },
    ]);
    expect(clusters).toHaveLength(0);
  });

  it('ignores retries that reuse the same idempotency key', () => {
    const clusters = clusterPayoutCashC1([
      {
        driverId: 'd1',
        effectiveAt: '2026-08-04',
        amountMinor: 10000,
        idempotencyKey: 'same',
      },
      {
        driverId: 'd1',
        effectiveAt: '2026-08-04',
        amountMinor: 10000,
        idempotencyKey: 'same',
      },
    ]);
    expect(clusters).toHaveLength(0);
  });
});
