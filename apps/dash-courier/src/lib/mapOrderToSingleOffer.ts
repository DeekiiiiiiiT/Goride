import type { AvailableOrder } from './courierApi';
import type { SingleOffer } from './mockOffers';
import { estimateEtaMinutes, haversineKm, roundKm } from './geoDistance';

type OrderLike = AvailableOrder & {
  items?: Array<{ name?: string; quantity?: number }>;
  tip?: number;
  delivery_fee?: number;
  delivery_fee_courier_amount?: number;
  courier_base_pay_jmd?: number | null;
  courier_distance_pay_jmd?: number | null;
};

/** Split courier pay when ladder fields exist; else full courier amount as baseFare. */
function resolveOfferFares(order: OrderLike): { baseFare: number; distanceFare: number } {
  const courierAmount = Math.max(
    0,
    Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0),
  );
  const hasBaseSplit =
    order.courier_base_pay_jmd != null && Number.isFinite(Number(order.courier_base_pay_jmd));
  const hasDistanceSplit =
    order.courier_distance_pay_jmd != null &&
    Number.isFinite(Number(order.courier_distance_pay_jmd));

  if (!hasBaseSplit && !hasDistanceSplit) {
    return { baseFare: courierAmount, distanceFare: 0 };
  }

  const distanceFare = hasDistanceSplit
    ? Math.max(0, Number(order.courier_distance_pay_jmd))
    : 0;
  const baseFare = hasBaseSplit
    ? Math.max(0, Number(order.courier_base_pay_jmd))
    : Math.max(0, courierAmount - distanceFare);
  return { baseFare, distanceFare };
}

type Coords = { lat?: number; lng?: number };

function shortDropoffLabel(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return 'Customer';
  const first = trimmed.split(',')[0]?.trim();
  return first || trimmed;
}

/** Map a live pending order into the SingleOffer card shape. */
export function mapOrderToSingleOffer(
  order: OrderLike | null | undefined,
  lastCoords?: Coords | null,
): SingleOffer | null {
  if (!order?.id) return null;

  const storeName = order.merchant?.name || 'Merchant';
  const pickupAddress = order.merchant?.address || '';
  const dropoff = String(order.delivery_address || '');
  const tip = Math.max(0, Number(order.tip || 0));
  const { baseFare, distanceFare } = resolveOfferFares(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const offerItems = items.map((item) => ({
    qty: Math.max(1, Number(item.quantity || 1)),
    name: String(item.name || 'Item'),
  }));
  const itemCount =
    offerItems.reduce((n, i) => n + i.qty, 0) || offerItems.length || 1;

  const pickupLat = order.merchant?.lat != null ? Number(order.merchant.lat) : null;
  const pickupLng = order.merchant?.lng != null ? Number(order.merchant.lng) : null;
  const dropoffLat = order.delivery_lat != null ? Number(order.delivery_lat) : null;
  const dropoffLng = order.delivery_lng != null ? Number(order.delivery_lng) : null;
  const fromLat = lastCoords?.lat != null ? Number(lastCoords.lat) : null;
  const fromLng = lastCoords?.lng != null ? Number(lastCoords.lng) : null;

  let pickupDistanceKm = 0;
  if (fromLat != null && fromLng != null && pickupLat != null && pickupLng != null) {
    pickupDistanceKm = roundKm(haversineKm(fromLat, fromLng, pickupLat, pickupLng));
  }

  let dropoffDistanceKm = 0;
  if (pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null) {
    dropoffDistanceKm = roundKm(haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng));
  }

  const totalDistanceKm = roundKm(pickupDistanceKm + dropoffDistanceKm);
  const estMinutes = estimateEtaMinutes(totalDistanceKm || dropoffDistanceKm || pickupDistanceKm);
  const peakPay = Math.max(0, Number((order as { peak_pay_amount?: number }).peak_pay_amount || 0));
  const earnings = baseFare + tip + distanceFare + peakPay;

  return {
    id: String(order.id),
    restaurant: storeName,
    storeName,
    vertical_type: order.merchant?.vertical_type,
    fulfillment_type: order.merchant?.fulfillment_type,
    pickupAddress,
    pickupDistanceKm,
    dropoffLabel: shortDropoffLabel(dropoff),
    dropoffDistanceKm,
    totalDistanceKm,
    estMinutes,
    earnings,
    tip,
    baseFare,
    distanceFare,
    peakPay: peakPay > 0 ? peakPay : undefined,
    itemCount,
    items: offerItems,
    dropoffNotes: order.delivery_instructions
      ? [String(order.delivery_instructions)]
      : [],
    pickupLat: pickupLat ?? undefined,
    pickupLng: pickupLng ?? undefined,
    dropoffLat: dropoffLat ?? undefined,
    dropoffLng: dropoffLng ?? undefined,
  };
}

/** Safe empty card when no pending offer (never show mock Island Grill). */
export function emptySingleOffer(): SingleOffer {
  return {
    id: '',
    restaurant: '',
    pickupAddress: '',
    pickupDistanceKm: 0,
    dropoffLabel: '',
    dropoffDistanceKm: 0,
    totalDistanceKm: 0,
    estMinutes: 0,
    earnings: 0,
    tip: 0,
    baseFare: 0,
    distanceFare: 0,
    itemCount: 0,
    items: [],
    dropoffNotes: [],
  };
}
