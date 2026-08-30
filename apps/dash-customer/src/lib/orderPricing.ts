/** Client totals must match server Model B quote from /merchants/:id/pricing */

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
  taxFoodJmd?: number;
  taxPlatformJmd?: number;
  tip: number;
  orderTotal: number;
  processingFee: number;
  smallOrderFee: number;
  total: number;
};

export type CheckoutPricing = {
  /** Resolved merchant UUID from pricing API (cart may still hold a slug). */
  merchantId?: string;
  deliveryFee: number;
  serviceFee: number;
  /** Distance service-fee addon when disclosed by quote. */
  serviceFeeDistanceJmd?: number;
  tax: number;
  taxFoodJmd?: number;
  taxPlatformJmd?: number;
  taxRatePercent: number;
  gctRegistered?: boolean;
  orderTotal: number;
  processingFee: number;
  smallOrderFee?: number;
  total: number;
  distanceKm?: number | null;
  tier?: string;
  freeDeliveryApplied?: boolean;
  rushPassApplied?: boolean;
  minOrderSubtotalJmd?: number;
  cardProcessingFeePercent?: number;
  /** Merchant menu markup 0–1 when disclosed to customers. */
  menuInflationPercent?: number;
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
  // free_delivery: $0 line discount — caller zeros deliveryFee via isFreeDeliveryPromo
  return 0;
}

export function isFreeDeliveryPromo(promo: PromoCode | null | undefined): boolean {
  return promo?.type === 'free_delivery';
}

/** Parse "J$150 delivery fee" / "Free delivery" labels from restaurant profiles. */
export function parseDeliveryFeeLabel(label: string | null | undefined): number {
  if (!label) return 0;
  if (/free/i.test(label)) return 0;
  const match = label.match(/J\$\s*([\d,]+)/i);
  if (!match) return 0;
  return Number(match[1].replace(/,/g, '')) || 0;
}

export type CalculateOrderTotalsOptions = {
  v2Quote: CheckoutPricing;
  tip?: number;
};

/**
 * Apply cart promo discount lines against a live Model B server quote.
 * Fee lines come from the quote — never recompute % platform fee on the client.
 */
export function calculateOrderTotals(
  subtotal: number,
  appliedPromo: PromoCode | null,
  tip = 0,
  _deliveryFeeUnused = 0,
  _platformFeeUnused?: number,
  _serviceFeeUnused?: number,
  options?: CalculateOrderTotalsOptions,
): OrderTotals {
  const discount = computeDiscount(subtotal, appliedPromo);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const safeTip = Math.max(0, options?.tip ?? tip);
  const q = options?.v2Quote;
  if (!q) {
    throw new Error('calculateOrderTotals requires a live pricing quote');
  }

  const freeDelivery =
    isFreeDeliveryPromo(appliedPromo) || Boolean(q.freeDeliveryApplied);

  return {
    discount,
    discountedSubtotal,
    deliveryFee: freeDelivery ? 0 : roundMoney(Math.max(0, q.deliveryFee)),
    serviceFee: roundMoney(Math.max(0, q.serviceFee)),
    tax: roundMoney(Math.max(0, q.tax)),
    taxFoodJmd: q.taxFoodJmd,
    taxPlatformJmd: q.taxPlatformJmd,
    tip: safeTip,
    orderTotal: roundMoney(Math.max(0, q.orderTotal)),
    processingFee: roundMoney(Math.max(0, q.processingFee)),
    smallOrderFee: roundMoney(Math.max(0, q.smallOrderFee ?? 0)),
    total: roundMoney(Math.max(0, q.total)),
  };
}

export type FetchPricingOptions = {
  merchantId: string;
  accessToken?: string | null;
  subtotal?: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  paymentMethod?: 'wipay' | 'cash';
  tip?: number;
};

/** Live merchant fee + delivery for cart/checkout display (Model B only). */
export async function fetchMerchantCheckoutPricing(
  merchantIdOrOptions: string | FetchPricingOptions,
  accessToken?: string | null,
): Promise<CheckoutPricing> {
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
  if (opts.paymentMethod) {
    params.set('payment_method', opts.paymentMethod);
  }
  if (opts.tip != null && opts.tip > 0) {
    params.set('tip', String(opts.tip));
  }

  const qs = params.toString();
  const url = `${API_ENDPOINTS.delivery}/merchants/${opts.merchantId}/pricing${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new Error(errBody.error || `Pricing unavailable (${res.status})`);
  }

  const data = (await res.json().catch(() => ({}))) as {
    merchant_id?: string;
    delivery_fee?: number;
    service_fee?: number;
    service_fee_distance_jmd?: number;
    processing_fee?: number;
    order_total?: number;
    tax?: number;
    tax_food_jmd?: number;
    tax_platform_jmd?: number;
    tax_rate_percent?: number;
    gct_registered?: boolean;
    small_order_fee?: number;
    total?: number;
    distance_km?: number | null;
    tier?: string;
    free_delivery_applied?: boolean;
    rush_pass_applied?: boolean;
    min_order_subtotal_jmd?: number;
    card_processing_fee_percent?: number;
    menu_inflation_percent?: number;
  };

  const resolvedMerchantId =
    typeof data.merchant_id === 'string' && data.merchant_id.trim()
      ? data.merchant_id.trim()
      : undefined;

  return {
    merchantId: resolvedMerchantId,
    deliveryFee: Math.max(0, Number(data.delivery_fee ?? 0)),
    serviceFee: Math.max(0, Number(data.service_fee ?? 0)),
    serviceFeeDistanceJmd: Math.max(0, Number(data.service_fee_distance_jmd ?? 0)),
    tax: Math.max(0, Number(data.tax ?? 0)),
    taxFoodJmd: Math.max(0, Number(data.tax_food_jmd ?? 0)),
    taxPlatformJmd: Math.max(0, Number(data.tax_platform_jmd ?? 0)),
    taxRatePercent: Math.max(0, Number(data.tax_rate_percent ?? 0)),
    gctRegistered: data.gct_registered,
    orderTotal: Math.max(0, Number(data.order_total ?? 0)),
    processingFee: Math.max(0, Number(data.processing_fee ?? 0)),
    smallOrderFee: Math.max(0, Number(data.small_order_fee ?? 0)),
    total: Math.max(0, Number(data.total ?? 0)),
    distanceKm: data.distance_km,
    tier: data.tier,
    freeDeliveryApplied: data.free_delivery_applied,
    rushPassApplied: data.rush_pass_applied === true,
    minOrderSubtotalJmd: data.min_order_subtotal_jmd,
    cardProcessingFeePercent: data.card_processing_fee_percent,
    menuInflationPercent: Math.max(0, Number(data.menu_inflation_percent ?? 0)),
  };
}
