/** Client totals must match server formula in customerOrderRoutes.ts */

export const TAX_RATE_PERCENT = 16.5;
/** Fallback only — prefer resolved rate from merchant pricing API. */
export const PLATFORM_FEE_RATE = 0.05;

export type PromoCode = {
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery' | 'percent_off' | 'amount_off';
  value: number;
  minOrder: number;
  title?: string;
};

/** Local cache of last server-validated promo — empty until redeem succeeds */
export const PROMO_CODES: Record<string, PromoCode> = {};

export function cacheValidatedPromo(promo: PromoCode): void {
  PROMO_CODES[promo.code.toUpperCase()] = {
    ...promo,
    code: promo.code.toUpperCase(),
  };
}

export type OrderTotals = {
  discount: number;
  discountedSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  tip: number;
  total: number;
};

export type CheckoutPricing = {
  pricingModel: 'legacy' | 'v2';
  platformFeeRate: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  distanceKm?: number | null;
  tier?: string;
  freeDeliveryApplied?: boolean;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function computeDiscount(subtotal: number, promo: PromoCode | null): number {
  if (!promo) return 0;
  if (subtotal < (promo.minOrder || 0)) return 0;
  const type = promo.type;
  if (type === 'percentage' || type === 'percent_off') {
    return roundMoney(subtotal * (promo.value / 100));
  }
  if (type === 'fixed' || type === 'amount_off') {
    return roundMoney(Math.min(subtotal, promo.value));
  }
  return 0;
}

/** Parse "J$150 delivery fee" / "Free delivery" labels from restaurant profiles. */
export function parseDeliveryFeeLabel(label: string | null | undefined): number {
  if (!label) return 0;
  if (/free/i.test(label)) return 0;
  const match = label.match(/J\$\s*([\d,]+)/i);
  if (!match) return 0;
  return Number(match[1].replace(/,/g, '')) || 0;
}

function clampFeeRate(rate: number | null | undefined): number {
  if (rate == null) return PLATFORM_FEE_RATE;
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 1) return PLATFORM_FEE_RATE;
  return n;
}

/**
 * Mirrors server: tax on (subtotal - discount), platform fee on subtotal,
 * delivery fee from merchant (passed in — never trust a hardcoded client constant).
 */
export function calculateOrderTotals(
  subtotal: number,
  appliedPromo: PromoCode | null,
  tip = 0,
  deliveryFee = 0,
  platformFeeRate: number = PLATFORM_FEE_RATE,
  serviceFeeFlat?: number,
): OrderTotals {
  const discount = computeDiscount(subtotal, appliedPromo);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const safeDeliveryFee = Math.max(0, deliveryFee);
  const serviceFee =
    serviceFeeFlat != null && Number.isFinite(serviceFeeFlat)
      ? roundMoney(Math.max(0, serviceFeeFlat))
      : roundMoney(subtotal * clampFeeRate(platformFeeRate));
  const tax = roundMoney(discountedSubtotal * (TAX_RATE_PERCENT / 100));
  const safeTip = Math.max(0, tip);
  const total = roundMoney(discountedSubtotal + safeDeliveryFee + serviceFee + tax + safeTip);

  return {
    discount,
    discountedSubtotal,
    deliveryFee: safeDeliveryFee,
    serviceFee,
    tax,
    tip: safeTip,
    total,
  };
}

export type FetchPricingOptions = {
  merchantId: string;
  accessToken?: string | null;
  subtotal?: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
};

/** Live merchant fee + delivery for cart/checkout display. */
export async function fetchMerchantCheckoutPricing(
  merchantIdOrOptions: string | FetchPricingOptions,
  accessToken?: string | null,
): Promise<CheckoutPricing | null> {
  const opts: FetchPricingOptions =
    typeof merchantIdOrOptions === 'string'
      ? { merchantId: merchantIdOrOptions, accessToken }
      : merchantIdOrOptions;

  const { API_ENDPOINTS, supabaseAnonFunctionHeaders } = await import('@roam/api-client');
  const headers = supabaseAnonFunctionHeaders(
    opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : undefined,
  );

  const params = new URLSearchParams();
  if (opts.subtotal != null && opts.subtotal > 0) {
    params.set('subtotal', String(opts.subtotal));
  }
  if (opts.dropoffLat != null && opts.dropoffLng != null) {
    params.set('dropoff_lat', String(opts.dropoffLat));
    params.set('dropoff_lng', String(opts.dropoffLng));
  }

  const qs = params.toString();
  const url = `${API_ENDPOINTS.delivery}/merchants/${opts.merchantId}/pricing${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => ({}))) as {
    pricing_model?: string;
    platform_fee_rate?: number | null;
    delivery_fee?: number;
    service_fee?: number;
    tax?: number;
    total?: number;
    distance_km?: number | null;
    tier?: string;
    free_delivery_applied?: boolean;
  };

  if (data.pricing_model === 'v2') {
    const deliveryFee = Math.max(0, Number(data.delivery_fee ?? 0));
    const serviceFee = Math.max(0, Number(data.service_fee ?? 0));
    const tax = Math.max(0, Number(data.tax ?? 0));
    const total = Math.max(0, Number(data.total ?? 0));
    return {
      pricingModel: 'v2',
      platformFeeRate: 0,
      deliveryFee,
      serviceFee,
      tax,
      total,
      distanceKm: data.distance_km,
      tier: data.tier,
      freeDeliveryApplied: data.free_delivery_applied,
    };
  }

  if (typeof data.platform_fee_rate !== 'number' || !Number.isFinite(data.platform_fee_rate)) {
    return null;
  }
  const deliveryFee =
    typeof data.delivery_fee === 'number' && Number.isFinite(data.delivery_fee)
      ? Math.max(0, data.delivery_fee)
      : 0;
  return {
    pricingModel: 'legacy',
    platformFeeRate: data.platform_fee_rate,
    deliveryFee,
    serviceFee: 0,
    tax: 0,
    total: 0,
  };
}
