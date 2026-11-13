import { describe, expect, it } from 'vitest';
import { buildCashTollQueuePayload } from './buildCashTollQueuePayload';

describe('buildCashTollQueuePayload', () => {
  it('includes receiptBlobKey and legacyTransaction for addToQueue', () => {
    const payload = buildCashTollQueuePayload({
      occurredAt: '2024-06-10T12:00:00-05:00',
      amountMinor: 37000,
      tollAmount: 370,
      ymd: '2024-06-10',
      timeStr: '12:00:00',
      plaza: 'Main',
      receiptNumber: 'R-1',
      receiptBlobKey: 'toll-receipt-abc',
      receiptFileName: 'receipt.jpg',
      receiptMimeType: 'image/jpeg',
      listDateLabel: 'Jun 10',
      canonicalDriverId: 'driver-1',
      canonicalDriverName: 'Driver One',
    });
    expect(payload.receiptBlobKey).toBe('toll-receipt-abc');
    expect(payload.legacyTransaction).toBeDefined();
    expect(payload.legacyTransaction?.category).toBe('Tolls');
    expect(payload.legacyTransaction?.amount).toBe(-370);
    expect(payload.amountMinor).toBe(37000);
  });
});
