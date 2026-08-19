import { describe, expect, it } from 'vitest';
import {
  courierPhoneHref,
  destinationPinLabel,
  formatArrivalEta,
  formatPrepEta,
  mapApiOrderToTracking,
  parseDeliveryHandoff,
  remainingDeliveryMinutes,
  remainingPrepMinutes,
} from './trackingContent';

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
    expect(mapped.deliveryAddress).toBe('');
  });

  it('maps courier display name and phone from the order payload', () => {
    const mapped = mapApiOrderToTracking({
      id: 'o1',
      order_number: 'RD-1',
      status: 'in_transit',
      courier: { display_name: 'Marcus', phone: '+18765550100', rating: 4.9 },
      merchant: { name: 'Island Grill', avg_prep_time_mins: 25 },
      items: [],
    });
    expect(mapped.courier.name).toBe('Marcus');
    expect(mapped.courier.phone).toBe('+18765550100');
    expect(mapped.merchantAvgPrepMins).toBe(25);
  });
});

describe('parseDeliveryHandoff', () => {
  it('does not invent a gate code when instructions are empty', () => {
    expect(parseDeliveryHandoff('')).toEqual({ mode: 'door', notes: '' });
    expect(parseDeliveryHandoff(null)).toEqual({ mode: 'door', notes: '' });
  });

  it('treats Hand it to me as meet-the-customer', () => {
    expect(parseDeliveryHandoff('Hand it to me')).toEqual({ mode: 'hand', notes: '' });
  });

  it('keeps the customer door notes as written', () => {
    expect(parseDeliveryHandoff('Leave at door. Gate on left.')).toEqual({
      mode: 'door',
      notes: 'Leave at door. Gate on left.',
    });
  });
});

describe('tracking ETAs', () => {
  it('counts down prep time from placed_at instead of a hardcoded 15', () => {
    const placed = '2026-08-18T18:00:00.000Z';
    const now = Date.parse('2026-08-18T18:10:00.000Z');
    expect(
      remainingPrepMinutes({
        nowMs: now,
        placedAt: placed,
        estimatedPrepMins: 25,
      }),
    ).toBe(15);
    expect(formatPrepEta(null)).toBe('Restaurant is preparing');
    expect(formatPrepEta(0)).toBe('Almost ready');
  });

  it('uses estimated_delivery_at when present', () => {
    const now = Date.parse('2026-08-18T18:00:00.000Z');
    expect(
      remainingDeliveryMinutes({
        nowMs: now,
        estimatedDeliveryAt: '2026-08-18T18:12:00.000Z',
      }),
    ).toBe(12);
    expect(formatArrivalEta(null)).toBe('On the way');
  });

  it('returns null for delivery ETA when there is no timestamp or GPS', () => {
    expect(remainingDeliveryMinutes({ nowMs: Date.now() })).toBeNull();
  });
});

describe('destinationPinLabel', () => {
  const saved = [
    { label: 'home', line1: '45 Constant Spring Rd, Apt 12B' },
    { label: 'work', line1: '123 Business Park, Suite 4' },
  ];

  it('uses Work when the order street matches a saved work place', () => {
    expect(destinationPinLabel('123 Business Park, Suite 4', saved)).toBe('Work');
  });

  it('falls back to Drop-off instead of inventing Home', () => {
    expect(destinationPinLabel('99 Unknown Lane', saved)).toBe('Drop-off');
    expect(destinationPinLabel('', saved)).toBe('Drop-off');
  });
});

describe('courierPhoneHref', () => {
  it('builds tel and sms links from a real number', () => {
    expect(courierPhoneHref('+1 (876) 555-0100', 'tel')).toBe('tel:+18765550100');
    expect(courierPhoneHref('+18765550100', 'sms')).toBe('sms:+18765550100');
  });

  it('rejects missing or tiny values', () => {
    expect(courierPhoneHref(undefined, 'tel')).toBeNull();
    expect(courierPhoneHref('123', 'tel')).toBeNull();
  });
});
