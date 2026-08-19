import { describe, expect, it } from 'vitest';
import { mapCourierOrderDetail } from './courierOrderDetail';

describe('mapCourierOrderDetail', () => {
  it('maps restaurant, pay, items, and timeline from a real order payload', () => {
    const view = mapCourierOrderDetail({
      order: {
        id: 'ord-1',
        status: 'delivered',
        delivery_fee: 350,
        tip: 70,
        delivered_at: '2026-08-18T19:42:00.000Z',
        delivery_photo_url: 'https://example.com/proof.jpg',
        delivery_lat: 18.03,
        delivery_lng: -76.79,
        merchant: { name: 'Island Grill' },
        customer: { name: 'Sarah M.' },
        items: [{ name: 'Jerk Chicken', quantity: 2 }, { name: 'Festival', quantity: 1 }],
      },
      events: [
        { status: 'assigned', created_at: '2026-08-18T19:14:00.000Z' },
        { status: 'picked_up', created_at: '2026-08-18T19:26:00.000Z' },
        { status: 'delivered', created_at: '2026-08-18T19:42:00.000Z' },
      ],
    });

    expect(view.restaurant).toBe('Island Grill');
    expect(view.customerName).toBe('Sarah M.');
    expect(view.statusLabel).toBe('Delivered');
    expect(view.basePay).toBe(350);
    expect(view.tip).toBe(70);
    expect(view.total).toBe(420);
    expect(view.proofUrl).toBe('https://example.com/proof.jpg');
    expect(view.dropoffLat).toBe(18.03);
    expect(view.items).toEqual([
      { quantity: '2x', name: 'Jerk Chicken' },
      { quantity: '1x', name: 'Festival' },
    ]);
    expect(view.timeline.map((t) => t.label)).toEqual([
      'Offer accepted',
      'Order picked up',
      'Delivery complete',
    ]);
  });

  it('falls back to order timestamps when events are missing', () => {
    const view = mapCourierOrderDetail({
      order: {
        id: 'ord-2',
        status: 'delivered',
        assigned_at: '2026-08-18T19:14:00.000Z',
        picked_up_at: '2026-08-18T19:26:00.000Z',
        delivered_at: '2026-08-18T19:42:00.000Z',
        merchant: { name: 'Juici' },
      },
      events: [],
    });
    expect(view.restaurant).toBe('Juici');
    expect(view.timeline.map((t) => t.label)).toEqual([
      'Offer accepted',
      'Order picked up',
      'Delivery complete',
    ]);
  });

  it('does not invent a map pin from zero coords', () => {
    const view = mapCourierOrderDetail({
      order: { id: 'ord-3', delivery_lat: 0, delivery_lng: 0 },
    });
    expect(view.dropoffLat).toBeUndefined();
    expect(view.dropoffLng).toBeUndefined();
  });
});
