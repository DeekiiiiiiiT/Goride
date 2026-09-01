import { describe, expect, it } from 'vitest';
import { deliveryOrderToFleetTrip } from '../../../../../../supabase/functions/_shared/orderToFleetTrip.ts';

describe('deliveryOrderToFleetTrip', () => {
  it('maps COD cashCollected to order total, not courier earning', () => {
    const trip = deliveryOrderToFleetTrip({
      id: 'ord-1',
      status: 'delivered',
      payment_method: 'cash',
      total: 5000,
      delivery_fee: 800,
      delivery_fee_courier_amount: 600,
      tip: 200,
      courier_id: 'c1',
      courier_fleet_id: 'fleet-1',
      delivered_at: '2026-09-01T18:00:00.000Z',
    });
    expect(trip.cashCollected).toBe(5000);
    expect(trip.amount).toBeGreaterThan(0);
    expect(trip.netPayout).toBe(Number(trip.amount) - 5000);
  });

  it('tags rush delivery service line', () => {
    const trip = deliveryOrderToFleetTrip({
      id: 'ord-2',
      status: 'delivered',
      payment_method: 'card',
      delivery_fee: 500,
      courier_id: 'c1',
    });
    expect(trip.platform).toBe('Roam Rush');
    expect(trip.serviceLine).toBe('rush_delivery');
  });
});
