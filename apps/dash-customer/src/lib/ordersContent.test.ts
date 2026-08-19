import { describe, expect, it } from 'vitest';
import { buildOrderReceiptText, buildReorderFromOrder, isLiveOrderStatus, type OrderHistoryEntry } from './ordersContent';

const baseOrder: OrderHistoryEntry = {
  id: '868174d8-bf7f-4afc-9d63-ea34d3d5320a',
  orderNumber: 'RD-2026-000002',
  merchantId: 'e31e6d88-ae1d-4ad2-a1ae-d14001f5d372',
  merchantName: 'Island Grill',
  merchantLogo: '',
  status: 'delivered',
  items: [],
  itemSummary: '1x Jerk Chicken Meal',
  total: 1828,
  placedAt: '2026-08-17T21:28:11.793277+00:00',
};

describe('buildReorderFromOrder', () => {
  it('uses menu item UUIDs from order items, not order id suffixes', () => {
    const menuItemId = '30d77535-496b-40f4-aff0-5875e3c9574a';
    const lines = buildReorderFromOrder(baseOrder, [
      {
        id: menuItemId,
        menuItemId,
        name: 'Jerk Chicken Meal',
        price: 1200,
        quantity: 1,
      },
    ]);

    expect(lines).toEqual([
      {
        itemId: menuItemId,
        name: 'Jerk Chicken Meal',
        price: 1200,
        quantity: 1,
        imageUrl: undefined,
      },
    ]);
  });

  it('returns empty when raw items lack menu ids', () => {
    expect(buildReorderFromOrder(baseOrder, [{ name: 'Mystery item', quantity: 1 }])).toEqual([]);
  });
});

describe('buildOrderReceiptText', () => {
  it('includes order number, merchant, and total', () => {
    const text = buildOrderReceiptText({
      ...baseOrder,
      items: [{ quantity: 1, name: 'Jerk Chicken Meal', price: 1200 }],
      subtotal: 1200,
      deliveryFee: 150,
      serviceFee: 60,
      tip: 100,
      total: 1510,
    });
    expect(text).toContain('RD-2026-000002');
    expect(text).toContain('Island Grill');
    expect(text).toContain('Jerk Chicken Meal');
    expect(text).toContain('Total  J$1,510');
  });
});

describe('isLiveOrderStatus', () => {
  it('treats in-progress deliveries as live', () => {
    expect(isLiveOrderStatus('preparing')).toBe(true);
    expect(isLiveOrderStatus('out_for_delivery')).toBe(true);
    expect(isLiveOrderStatus('delivered')).toBe(false);
    expect(isLiveOrderStatus('cancelled')).toBe(false);
  });
});
