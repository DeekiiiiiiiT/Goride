import { describe, expect, it } from 'vitest';
import { mapApiOrderToTracking } from './trackingContent';

describe('mapApiOrderToTracking', () => {
  it('keeps the order UUID separate from the display order number', () => {
    const mapped = mapApiOrderToTracking({
      id: 'bb6d6321-0789-47a2-8d93-c26ae69c1aa3',
      order_number: 'RD-2026-000005',
      status: 'delivered',
      merchant_id: 'e31e6d88-ae1d-4ad2-a1ae-d14001f5d372',
      total: 2288.25,
      subtotal: 1550,
      delivery_fee: 150,
      platform_fee: 77.5,
      tax: 255.75,
      tip: 100,
      delivery_photo_url: 'https://example.com/pod.png',
      delivered_at: '2026-08-18T21:10:37.918Z',
      merchant: { name: 'Island Grill' },
      items: [],
    });

    expect(mapped.id).toBe('bb6d6321-0789-47a2-8d93-c26ae69c1aa3');
    expect(mapped.orderNumber).toBe('RD-2026-000005');
    expect(mapped.merchantName).toBe('Island Grill');
    expect(mapped.deliveryPhotoUrl).toBe('https://example.com/pod.png');
    expect(mapped.deliveredLabel).toBeTruthy();
  });
});
