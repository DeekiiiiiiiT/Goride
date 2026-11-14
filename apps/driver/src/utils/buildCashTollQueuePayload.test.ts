import { describe, expect, it } from 'vitest';
import { buildCashTollQueuePayload } from './buildCashTollQueuePayload';

describe('buildCashTollQueuePayload', () => {
  it('includes receiptBlobKey and the amount for addToQueue (no old-system copy)', () => {
    const payload = buildCashTollQueuePayload({
      occurredAt: '2024-06-10T12:00:00-05:00',
      amountMinor: 37000,
      plaza: 'Main',
      receiptNumber: 'R-1',
      receiptBlobKey: 'toll-receipt-abc',
      receiptFileName: 'receipt.jpg',
      receiptMimeType: 'image/jpeg',
      listDateLabel: 'Jun 10',
    });
    expect(payload.receiptBlobKey).toBe('toll-receipt-abc');
    expect(payload.amountMinor).toBe(37000);
    expect('legacyTransaction' in payload).toBe(false);
  });
});
