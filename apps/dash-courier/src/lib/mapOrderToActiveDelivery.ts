import type { ActiveDelivery } from './mockActiveDelivery';
import type { AvailableOrder } from './courierApi';

type OrderLike = AvailableOrder & {
  items?: Array<{ name?: string; quantity?: number; note?: string }>;
  customer_name?: string;
  delivery_instructions?: string;
  delivery_fee?: number;
  tip?: number;
  total?: number;
};

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

/** Map a real accepted order into ActiveDelivery — never seed from mock. */
export function mapOrderToActiveDelivery(order: OrderLike | null | undefined): ActiveDelivery {
  if (!order?.id) return emptyActiveDelivery();

  const storeName = order.merchant?.name || 'Merchant';
  const pickup = order.merchant?.address || '';
  const dropoff = String(order.delivery_address || '');
  const tip = Math.max(0, Number(order.tip || 0));
  const basePay = Math.max(0, Number(order.delivery_fee || 0));
  const customerName = String(order.customer_name || 'Customer');
  const items = Array.isArray(order.items) ? order.items : [];
  const checklist = items.map((item, i) => ({
    id: String(i + 1),
    label: `${item.name || 'Item'}${item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}`,
    note: item.note,
  }));

  return {
    orderId: String(order.id),
    displayOrderId: String(order.order_number || String(order.id).slice(-4)),
    restaurant: storeName,
    storeName,
    pickupAddress: pickup,
    pickupAddressFull: pickup,
    pickupLat: order.merchant?.lat != null ? Number(order.merchant.lat) : undefined,
    pickupLng: order.merchant?.lng != null ? Number(order.merchant.lng) : undefined,
    customerName,
    customerFirstName: customerName.split(/\s+/)[0] || customerName,
    dropoffAddress: dropoff,
    gateCode: '',
    unit: '',
    deliveryInstructions: String(order.delivery_instructions || ''),
    etaMinutes: 10,
    distanceKm: 0,
    dropoffEtaMinutes: 15,
    dropoffDistanceKm: 0,
    dropoffTurnDistance: '',
    dropoffTurnInstruction: '',
    turnInstruction: '',
    itemCount: checklist.length || items.reduce((n, i) => n + Number(i.quantity || 1), 0),
    checklist,
    earnings: {
      basePay,
      distanceBonus: 0,
      tip,
      peakPay: 0,
      total: basePay + tip,
    },
    tripDistanceKm: 0,
    tripMinutes: 0,
  };
}

export { emptyActiveDelivery };
