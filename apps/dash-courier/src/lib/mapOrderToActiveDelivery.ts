import type { ActiveDelivery } from './mockActiveDelivery';
import type { AvailableOrder } from './courierApi';
import { estimateEtaMinutes, haversineKm, roundKm } from './geoDistance';

type OrderLike = AvailableOrder & {
  items?: Array<{ name?: string; quantity?: number; note?: string }>;
  customer_name?: string;
  delivery_instructions?: string;
  delivery_address_line2?: string;
  delivery_fee?: number;
  tip?: number;
  peak_pay_amount?: number;
  total?: number;
  status?: string;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
};

export type MapOrderCoords = { lat?: number; lng?: number };

function emptyActiveDelivery(): ActiveDelivery {
  return {
    orderId: '',
    displayOrderId: '',
    restaurant: '',
    storeName: '',
    pickupAddress: '',
    pickupAddressFull: '',
    customerName: '',
    customerFirstName: '',
    dropoffAddress: '',
    unit: '',
    deliveryInstructions: '',
    etaMinutes: 0,
    distanceKm: 0,
    dropoffEtaMinutes: 0,
    dropoffDistanceKm: 0,
    dropoffTurnDistance: '',
    dropoffTurnInstruction: '',
    turnInstruction: '',
    itemCount: 0,
    checklist: [],
    earnings: { basePay: 0, distanceBonus: 0, tip: 0, peakPay: 0, total: 0 },
    tripDistanceKm: 0,
    tripMinutes: 0,
    orderStatus: '',
    pickedUpAt: null,
    deliveredAt: null,
  };
}

function finiteCoord(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pinFrom(lat: unknown, lng: unknown): { lat: number; lng: number } | undefined {
  const resolvedLat = finiteCoord(lat);
  const resolvedLng = finiteCoord(lng);
  if (resolvedLat == null || resolvedLng == null) return undefined;
  if (resolvedLat === 0 && resolvedLng === 0) return undefined;
  return { lat: resolvedLat, lng: resolvedLng };
}

/** Map a real accepted order into ActiveDelivery — never seed from mock. */
export function mapOrderToActiveDelivery(
  order: OrderLike | null | undefined,
  lastCoords?: MapOrderCoords | null,
): ActiveDelivery {
  if (!order?.id) return emptyActiveDelivery();

  const storeName = order.merchant?.name || 'Merchant';
  const pickup = order.merchant?.address || '';
  const dropoff = String(order.delivery_address || '');
  const tip = Math.max(0, Number(order.tip || 0));
  const basePay = Math.max(
    0,
    Number(
      (order as { delivery_fee_courier_amount?: number }).delivery_fee_courier_amount ??
        order.delivery_fee ??
        0,
    ),
  );
  const peakPay = Math.max(0, Number(order.peak_pay_amount || 0));
  const customerName = String(
    order.customer_name || order.customer?.name || 'Customer',
  );
  const items = Array.isArray(order.items) ? order.items : [];
  const checklist = items.map((item, i) => ({
    id: String(i + 1),
    label: `${item.name || 'Item'}${item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}`,
    note: item.note,
    confirmed: Boolean((item as { confirmed?: boolean }).confirmed),
  }));

  const pickupPin = pinFrom(order.merchant?.lat, order.merchant?.lng);
  const dropoffPin = pinFrom(order.delivery_lat, order.delivery_lng);
  const fromPin = pinFrom(lastCoords?.lat, lastCoords?.lng);
  const pickupLat = pickupPin?.lat;
  const pickupLng = pickupPin?.lng;
  const dropoffLat = dropoffPin?.lat;
  const dropoffLng = dropoffPin?.lng;
  const fromLat = fromPin?.lat;
  const fromLng = fromPin?.lng;

  // Prefer courier→pickup when GPS known; otherwise pickup→dropoff for both legs' baseline.
  let distanceKm = 0;
  if (fromLat != null && fromLng != null && pickupLat != null && pickupLng != null) {
    distanceKm = roundKm(haversineKm(fromLat, fromLng, pickupLat, pickupLng));
  } else if (pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null) {
    distanceKm = roundKm(haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng));
  }

  let dropoffDistanceKm = 0;
  if (fromLat != null && fromLng != null && dropoffLat != null && dropoffLng != null) {
    // En-route phase: estimate remaining from last known coords → dropoff when available.
    dropoffDistanceKm = roundKm(haversineKm(fromLat, fromLng, dropoffLat, dropoffLng));
  } else if (pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null) {
    dropoffDistanceKm = roundKm(haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng));
  }

  // If we only have one segment, mirror it so UI doesn't show zeros.
  if (distanceKm <= 0 && dropoffDistanceKm > 0) distanceKm = dropoffDistanceKm;
  if (dropoffDistanceKm <= 0 && distanceKm > 0) dropoffDistanceKm = distanceKm;

  const etaMinutes = estimateEtaMinutes(distanceKm);
  const dropoffEtaMinutes = estimateEtaMinutes(dropoffDistanceKm);
  const tripDistanceKm = roundKm(
    fromLat != null && fromLng != null
      ? distanceKm + dropoffDistanceKm
      : dropoffDistanceKm || distanceKm,
  );
  const tripMinutes = estimateEtaMinutes(tripDistanceKm);

  const storePhone =
    order.merchant?.phone != null && String(order.merchant.phone).trim()
      ? String(order.merchant.phone).trim()
      : undefined;
  const customerPhone =
    (order.customer_phone != null && String(order.customer_phone).trim()) ||
    (order.customer?.phone != null && String(order.customer.phone).trim()) ||
    undefined;

  return {
    orderId: String(order.id),
    displayOrderId: String(order.order_number || String(order.id).slice(-4)),
    restaurant: storeName,
    storeName,
    vertical_type: order.merchant?.vertical_type,
    fulfillment_type: order.merchant?.fulfillment_type,
    pickupAddress: pickup,
    pickupAddressFull: pickup,
    pickupLat,
    pickupLng,
    customerName,
    customerFirstName: customerName.split(/\s+/)[0] || customerName,
    customerPhone: customerPhone || undefined,
    storePhone,
    dropoffAddress: dropoff,
    dropoffLat,
    dropoffLng,
    unit: String(order.delivery_address_line2 || '').trim(),
    deliveryInstructions: String(order.delivery_instructions || ''),
    etaMinutes,
    distanceKm,
    dropoffEtaMinutes,
    dropoffDistanceKm,
    dropoffTurnDistance: dropoffDistanceKm > 0 ? `${dropoffDistanceKm} km` : '',
    dropoffTurnInstruction: `Heading to ${customerName.split(/\s+/)[0] || 'customer'}`,
    turnInstruction: `Heading to ${storeName}`,
    itemCount: checklist.length || items.reduce((n, i) => n + Number(i.quantity || 1), 0),
    checklist,
    earnings: {
      basePay,
      distanceBonus: 0,
      tip,
      peakPay,
      total: basePay + tip + peakPay,
    },
    tripDistanceKm,
    tripMinutes,
    orderStatus: String(order.status || ''),
    pickedUpAt: order.picked_up_at ? String(order.picked_up_at) : null,
    deliveredAt: order.delivered_at ? String(order.delivered_at) : null,
  };
}

export { emptyActiveDelivery };
