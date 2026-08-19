import { orderEarnings, type AvailableOrder, type StackLeg } from './courierApi';
import type { StackedRouteStop, StackedStopId } from './mockStackedRoute';

/** Build interleaved pickup→pickup→drop→drop route from active stack legs. */
export function buildStackedRouteFromLegs(legs: StackLeg[]): StackedRouteStop[] {
  const orders = legs
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((leg) => leg.order)
    .filter((o): o is AvailableOrder => Boolean(o?.id));

  if (orders.length === 0) return [];

  const stops: StackedRouteStop[] = [];

  orders.forEach((order) => {
    stops.push({
      id: `p-${order.id}`,
      type: 'pickup',
      name: order.merchant?.name || 'Merchant',
      address: order.merchant?.address || '',
      orderId: String(order.order_number || order.id),
      backendOrderId: order.id,
      merchantPhone: order.merchant?.phone,
      lat: order.merchant?.lat,
      lng: order.merchant?.lng,
      expectedBy: order.ready_at ? new Date(String(order.ready_at)).toLocaleTimeString() : undefined,
      earnings: 0,
    });
  });

  orders.forEach((order, i) => {
    const customerName = String(order.customer_name || order.customer?.name || 'Customer');
    const items = Array.isArray(order.items) ? order.items : [];
    const nextOrder = orders[i + 1];
    const nextCustomer = nextOrder
      ? String(nextOrder.customer_name || nextOrder.customer?.name || 'Customer').split(/\s+/)[0]
      : undefined;
    stops.push({
      id: `d-${order.id}`,
      type: 'delivery',
      name: `${customerName.split(/\s+/)[0]}'s Order`,
      address: String(order.delivery_address || ''),
      orderId: String(order.order_number || order.id),
      backendOrderId: order.id,
      customerName: customerName.split(/\s+/)[0],
      customerPhone: order.customer_phone || order.customer?.phone || undefined,
      lat: order.delivery_lat,
      lng: order.delivery_lng,
      itemCount: items.reduce((n, item) => n + Number(item.quantity || 1), 0) || items.length || 1,
      instructions: String(order.delivery_instructions || ''),
      earnings: orderEarnings(order),
      nextPreview: nextCustomer ? `Then deliver to ${nextCustomer}` : undefined,
    });
  });

  return stops;
}

export function getCompletedStopIdsFromRoute(
  route: StackedRouteStop[],
  stopIndex: number,
): StackedStopId[] {
  return route.slice(0, stopIndex).map((s) => s.id);
}

export function buildStackedOfferFromPending(
  offers: Array<{ id: string; order?: AvailableOrder | null }>,
): {
  id: string;
  totalEarnings: number;
  estMinutes: number;
  stops: Array<{
    id: string;
    name: string;
    address: string;
    vertical?: string;
    earnings: number;
  }>;
  offerIds: string[];
} | null {
  if (offers.length < 2) return null;
  const slice = offers.slice(0, 2);
  const orders = slice.map((o) => o.order).filter((o): o is AvailableOrder => Boolean(o?.id));
  if (orders.length < 2) return null;

  let totalEarnings = 0;
  const pickupStops = orders.map((order) => {
    totalEarnings += orderEarnings(order);
    return {
      id: `p-${order.id}`,
      name: order.merchant?.name || 'Merchant',
      address: order.merchant?.address || '',
      vertical: order.merchant?.vertical_type,
      earnings: 0,
    };
  });
  const deliveryStops = orders.map((order) => {
    const customerName = String(order.customer_name || order.customer?.name || 'Customer');
    return {
      id: `d-${order.id}`,
      name: `${customerName.split(/\s+/)[0]}'s Order`,
      address: String(order.delivery_address || ''),
      vertical: order.merchant?.vertical_type,
      earnings: orderEarnings(order),
    };
  });

  return {
    id: slice.map((o) => o.id).join('-'),
    totalEarnings,
    estMinutes: 25 + orders.length * 5,
    stops: [...pickupStops, ...deliveryStops],
    offerIds: slice.map((o) => o.id),
  };
}
