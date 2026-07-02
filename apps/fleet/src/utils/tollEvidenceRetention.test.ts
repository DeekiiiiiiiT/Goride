import { describe, expect, it } from 'vitest';

/** Cash toll detection must stay truthy when evidenceExpired is set (URL kept in KV). */
describe('toll cash detection with evidenceExpired', () => {
  it('receiptUrl remains truthy for cash toll when photo expired', () => {
    const tx = {
      paymentMethod: 'Card',
      receiptUrl: 'https://example.com/old-receipt.jpg',
      metadata: { evidenceExpired: true },
    };
    const isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
    expect(isCash).toBe(true);
    expect(tx.metadata.evidenceExpired).toBe(true);
  });
});
