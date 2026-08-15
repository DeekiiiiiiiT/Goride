import type { ActiveDelivery } from './mockActiveDelivery';
import type { AvailableOrder } from './courierApi';
import { estimateEtaMinutes, haversineKm, roundKm } from './geoDistance';

type OrderLike = AvailableOrder & {
  items?: Array<{ name?: string; quantity?: number; note?: string }>;
  customer_name?: string;
  delivery_instructions?: string;
  delivery_fee?: number;
  tip?: number;
  total?: number;
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
    gateCode: '',
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
  };
}

function finiteCoord(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
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
  const basePay = Math.max(0, Number(order.delivery_fee || 0));
  const customerName = String(
    order.customer_name || order.customer?.name || 'Customer',
  );
  const items = Array.isArray(order.items) ? order.items : [];
  const checklist = items.map((item, i) => ({
    id: String(i + 1),
    label: `${item.name || 'Item'}${item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}`,
    note: item.note,
  }));

  const pickupLat = finiteCoord(order.merchant?.lat);
  const pickupLng = finiteCoord(order.merchant?.lng);
  const dropoffLat = finiteCoord(order.delivery_lat);
  const dropoffLng = finiteCoord(order.delivery_lng);
  const fromLat = finiteCoord(lastCoords?.lat);
  const fromLng = finiteCoord(lastCoords?.lng);

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
    gateCode: '',
    unit: '',
    deliveryInstructions: String(order.delivery_instructions || ''),
    etaMinutes,
    distanceKm,
    dropoffEtaMinutes,
    dropoffDistanceKm,
    dropoffTurnDistance: dropoffDistanceKm > 0 ? `${Math.round(dropoffDistanceKm * 1000)}m` : '',
    dropoffTurnInstruction: dropoff ? `Head to ${dropoff.split(',')[0]?.trim() || 'customer'}` : '',
    turnInstruction: pickup ? `Head to ${storeName}` : '',
    itemCount: checklist.length || items.reduce((n, i) => n + Number(i.quantity || 1), 0),
    checklist,
    earnings: {
      basePay,
      distanceBonus: 0,
      tip,
      peakPay: 0,
      total: basePay + tip,
    },
    tripDistanceKm,
    tripMinutes,
  };
}

export { emptyActiveDelivery };
