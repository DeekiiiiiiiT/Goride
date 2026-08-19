import { orderEarnings, type AvailableOrder, type StackLeg } from './courierApi';
import { estimateEtaMinutes, haversineKm, roundKm } from './geoDistance';
import type { StackedOffer, StackedStop } from './mockOffers';
import type { StackedRouteStop, StackedStopId } from './mockStackedRoute';

type Coords = { lat?: number; lng?: number };

function toVertical(v?: string | null): StackedStop['vertical'] {
  if (v === 'grocery' || v === 'restaurant') return v;
  return undefined;
}

function formatDistanceKm(km: number): string {
  const rounded = roundKm(km);
  return rounded > 0 ? `${rounded} km` : '—';
}

function pickupDetail(order: AvailableOrder): { detail?: string; shopItems?: number } {
  const vertical = order.merchant?.vertical_type;
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((n, item) => n + Number(item.quantity || 1), 0) || items.length;
  if (vertical === 'grocery' && itemCount > 0) {
    return { detail: `Shop ${itemCount} item${itemCount === 1 ? '' : 's'}`, shopItems: itemCount };
  }
  if (order.ready_at) {
    return { detail: 'Ready pickup' };
  }
  return {};
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

/** Map pending stack offers into the StackedOffer card shape (pickup stops only). */
export function buildStackedOfferFromPending(
  offers: Array<{ id: string; order?: AvailableOrder | null }>,
  lastCoords?: Coords | null,
): StackedOffer | null {
  if (offers.length < 2) return null;
  const slice = offers.slice(0, 2);
  const orders = slice.map((o) => o.order).filter((o): o is AvailableOrder => Boolean(o?.id));
  if (orders.length < 2) return null;

  const fromLat = lastCoords?.lat != null ? Number(lastCoords.lat) : null;
  const fromLng = lastCoords?.lng != null ? Number(lastCoords.lng) : null;

  let totalEarnings = 0;
  let totalDistanceKm = 0;
  let prevLat = fromLat;
  let prevLng = fromLng;

  const stops: StackedStop[] = orders.map((order, index) => {
    totalEarnings += orderEarnings(order);
    const pickupLat = order.merchant?.lat != null ? Number(order.merchant.lat) : null;
    const pickupLng = order.merchant?.lng != null ? Number(order.merchant.lng) : null;

    let distanceKm = 0;
    if (prevLat != null && prevLng != null && pickupLat != null && pickupLng != null) {
      distanceKm = roundKm(haversineKm(prevLat, prevLng, pickupLat, pickupLng));
    }
    totalDistanceKm += distanceKm;
    if (pickupLat != null && pickupLng != null) {
      prevLat = pickupLat;
      prevLng = pickupLng;
    }

    const meta = pickupDetail(order);
    return {
      id: `p-${order.id}`,
      label: String(index + 1),
      restaurant: order.merchant?.name || 'Merchant',
      distanceLabel: formatDistanceKm(distanceKm),
      earnings: orderEarnings(order),
      vertical: toVertical(order.merchant?.vertical_type),
      ...meta,
    };
  });

  const lastOrder = orders[orders.length - 1];
  const customerFull = String(
    lastOrder.customer_name || lastOrder.customer?.name || 'Customer',
  );
  const customerFirst = customerFull.split(/\s+/)[0] || 'Customer';
  const dropLat = lastOrder.delivery_lat != null ? Number(lastOrder.delivery_lat) : null;
  const dropLng = lastOrder.delivery_lng != null ? Number(lastOrder.delivery_lng) : null;

  let customerDistanceKm = 0;
  if (prevLat != null && prevLng != null && dropLat != null && dropLng != null) {
    customerDistanceKm = roundKm(haversineKm(prevLat, prevLng, dropLat, dropLng));
    totalDistanceKm += customerDistanceKm;
  }

  totalDistanceKm = roundKm(totalDistanceKm);
  const estMinutes = estimateEtaMinutes(totalDistanceKm || 5);

  return {
    id: slice.map((o) => o.id).join('-'),
    totalEarnings,
    totalDistanceKm,
    estMinutes,
    stops,
    customerName: customerFirst,
    customerDistanceKm: customerDistanceKm > 0 ? customerDistanceKm : undefined,
  };
}
