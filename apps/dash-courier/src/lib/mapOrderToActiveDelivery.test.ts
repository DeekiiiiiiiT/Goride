import { describe, expect, it } from 'vitest';
import { estimateEtaMinutes, haversineKm, roundKm } from './geoDistance';
import { mapOrderToActiveDelivery } from './mapOrderToActiveDelivery';

describe('geoDistance', () => {
  it('computes Kingston-area haversine in a sane range', () => {
    const km = haversineKm(18.0179, -76.8099, 18.03, -76.79);
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(5);
  });

  it('estimates ETA as ~3 min/km + 5 base', () => {
    expect(estimateEtaMinutes(0)).toBe(5);
    expect(estimateEtaMinutes(2)).toBe(11);
    expect(estimateEtaMinutes(5)).toBe(20);
  });
});

describe('mapOrderToActiveDelivery', () => {
  const baseOrder = {
    id: 'ord-1',
    order_number: '1042',
    status: 'ready',
    delivery_fee: 350,
    tip: 70,
    delivery_address: '45 Constant Spring Rd, Kingston',
    delivery_lat: 18.03,
    delivery_lng: -76.79,
    delivery_instructions: 'Leave at door',
    merchant: {
      id: 'm1',
      name: 'Island Grill',
      address: '78 Knutsford Blvd',
      lat: 18.0179,
      lng: -76.8099,
      phone: '+18765550100',
    },
    customer: { name: 'Sarah M.', phone: '+18765550200' },
    items: [{ name: 'Jerk Chicken', quantity: 2 }],
  };

  it('uses haversine from last known coords to pickup for eta/distance', () => {
    const delivery = mapOrderToActiveDelivery(baseOrder, {
      lat: 18.01,
      lng: -76.82,
    });
    expect(delivery.distanceKm).toBeGreaterThan(0);
    expect(delivery.etaMinutes).toBe(estimateEtaMinutes(delivery.distanceKm));
    expect(delivery.dropoffLat).toBe(18.03);
    expect(delivery.dropoffLng).toBe(-76.79);
    expect(delivery.customerPhone).toBe('+18765550200');
    expect(delivery.storePhone).toBe('+18765550100');
  });

  it('falls back to pickup→dropoff when courier coords missing', () => {
    const delivery = mapOrderToActiveDelivery(baseOrder);
    const expected = roundKm(haversineKm(18.0179, -76.8099, 18.03, -76.79));
    expect(delivery.distanceKm).toBe(expected);
    expect(delivery.dropoffDistanceKm).toBe(expected);
    expect(delivery.dropoffEtaMinutes).toBe(estimateEtaMinutes(expected));
  });

  it('returns empty delivery for missing order id', () => {
    const delivery = mapOrderToActiveDelivery(null);
    expect(delivery.orderId).toBe('');
    expect(delivery.etaMinutes).toBe(0);
    expect(delivery.distanceKm).toBe(0);
  });

  it('ignores null dropoff coords so distance is not Earth-scale', () => {
    const delivery = mapOrderToActiveDelivery(
      {
        ...baseOrder,
        delivery_lat: null,
        delivery_lng: null,
      },
      { lat: 18.01, lng: -76.82 },
    );
    expect(delivery.dropoffDistanceKm).toBeLessThan(50);
    expect(delivery.dropoffLat).toBeUndefined();
    expect(delivery.dropoffLng).toBeUndefined();
  });
});
