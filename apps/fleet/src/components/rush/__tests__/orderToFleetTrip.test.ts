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
    // COD bag is ops-only (codBagTotal in payload_json) — remittance owns customer cash (S-1 / C-6).
    expect(trip.cashCollected).toBe(0);
    expect((trip.payload_json as Record<string, unknown>).codBagTotal).toBe(5000);
    expect(trip.amount).toBeGreaterThan(0);
    expect(trip.netToDriver).toBe(trip.amount);
    expect(trip.netPayout).toBe(trip.amount);
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
