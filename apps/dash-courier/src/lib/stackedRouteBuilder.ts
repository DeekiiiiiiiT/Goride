import type { AvailableOrder, StackLeg } from './courierApi';
import type { StackedRouteStop, StackedStopId } from './mockStackedRoute';

const PICKUP_IDS: StackedStopId[] = ['p1', 'p2'];
const DROP_IDS: StackedStopId[] = ['d1', 'd2'];

function orderEarnings(order: AvailableOrder): number {
  const fee = Math.max(0, Number(order.delivery_fee || 0));
  const tip = Math.max(0, Number(order.tip || 0));
  const peak = Math.max(0, Number((order as { peak_pay_amount?: number }).peak_pay_amount || 0));
  return fee + tip + peak;
}

/** Build interleaved pickup→pickup→drop→drop route from active stack legs. */
export function buildStackedRouteFromLegs(legs: StackLeg[]): StackedRouteStop[] {
  const orders = legs
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((leg) => leg.order)
    .filter((o): o is AvailableOrder => Boolean(o?.id));

  if (orders.length === 0) return [];

  const stops: StackedRouteStop[] = [];

  orders.forEach((order, i) => {
    stops.push({
      id: PICKUP_IDS[i] ?? (`p${i + 1}` as StackedStopId),
      type: 'pickup',
      name: order.merchant?.name || 'Merchant',
      address: order.merchant?.address || '',
      orderId: String(order.order_number || order.id),
      expectedBy: order.ready_at ? new Date(String(order.ready_at)).toLocaleTimeString() : undefined,
      earnings: 0,
    });
  });

  orders.forEach((order, i) => {
    const customerName = String(order.customer_name || order.customer?.name || 'Customer');
    const items = Array.isArray(order.items) ? order.items : [];
    stops.push({
      id: DROP_IDS[i] ?? (`d${i + 1}` as StackedStopId),
      type: 'delivery',
      name: `${customerName.split(/\s+/)[0]}'s Order`,
      address: String(order.delivery_address || ''),
      orderId: String(order.order_number || order.id),
      customerName: customerName.split(/\s+/)[0],
      itemCount: items.reduce((n, item) => n + Number(item.quantity || 1), 0) || items.length || 1,
      instructions: String(order.delivery_instructions || ''),
      earnings: orderEarnings(order),
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
