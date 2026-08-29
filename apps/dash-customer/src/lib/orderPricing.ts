/** Client totals must match server formula in customerOrderRoutes.ts */

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
  pricingModel: 'legacy' | 'v2';
  platformFeeRate: number;
  deliveryFee: number;
  serviceFee: number;
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
  minOrderSubtotalJmd?: number;
  cardProcessingFeePercent?: number;
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

function clampFeeRate(rate: number | null | undefined): number {
  if (rate == null) return PLATFORM_FEE_RATE;
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 1) return PLATFORM_FEE_RATE;
  return n;
}

function isCardPayment(method?: string | null): boolean {
  return method === 'wipay';
}

export type CalculateOrderTotalsOptions = {
  v2Quote?: CheckoutPricing | null;
  paymentMethod?: string | null;
  tip?: number;
  /** Used for legacy path when v2 quote unavailable */
  taxRatePercent?: number;
};

/**
 * Mirrors server: tax on (subtotal - discount), platform fee on subtotal,
 * delivery fee from merchant (passed in — never trust a hardcoded client constant).
 * When v2 quote includes customer total + breakdown, use server figures verbatim.
 */
export function calculateOrderTotals(
  subtotal: number,
  appliedPromo: PromoCode | null,
  tip = 0,
  deliveryFee = 0,
  platformFeeRate: number = PLATFORM_FEE_RATE,
  serviceFeeFlat?: number,
  options?: CalculateOrderTotalsOptions,
): OrderTotals {
  const discount = computeDiscount(subtotal, appliedPromo);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const safeTip = Math.max(0, options?.tip ?? tip);
  const freeDelivery =
    isFreeDeliveryPromo(appliedPromo) || Boolean(options?.v2Quote?.freeDeliveryApplied);
  const safeDeliveryFee = freeDelivery ? 0 : Math.max(0, deliveryFee);

  if (options?.v2Quote?.pricingModel === 'v2') {
    const q = options.v2Quote;
    const hasServerTotal = Number.isFinite(q.total);
    const hasBreakdown =
      Number.isFinite(q.serviceFee) ||
      Number.isFinite(q.tax) ||
      Number.isFinite(q.processingFee) ||
      Number.isFinite(q.smallOrderFee ?? NaN) ||
      Number.isFinite(q.deliveryFee);

    if (hasServerTotal && hasBreakdown) {
      // Server already priced customer total — do not recompute fee lines.
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

    const serviceFee = roundMoney(Math.max(0, q.serviceFee));
    const tax = roundMoney(Math.max(0, q.tax));
    const orderTotal = roundMoney(Math.max(0, q.orderTotal));
    const processingFee = roundMoney(Math.max(0, q.processingFee));
    const smallOrderFee = roundMoney(Math.max(0, q.smallOrderFee ?? 0));
    const total = roundMoney(Math.max(0, q.total));
    return {
      discount,
      discountedSubtotal,
      deliveryFee: safeDeliveryFee,
      serviceFee,
      tax,
      taxFoodJmd: q.taxFoodJmd,
      taxPlatformJmd: q.taxPlatformJmd,
      tip: safeTip,
      orderTotal,
      processingFee,
      smallOrderFee,
      total,
    };
  }

  const serviceFee =
    serviceFeeFlat != null && Number.isFinite(serviceFeeFlat)
      ? roundMoney(Math.max(0, serviceFeeFlat))
      : roundMoney(subtotal * clampFeeRate(platformFeeRate));
  const gctRate = options?.taxRatePercent;
  if (gctRate == null || !Number.isFinite(gctRate)) {
    // Fail visibly — do not invent a statutory rate on the client
    const tax = 0;
    const orderTotal = roundMoney(discountedSubtotal + safeDeliveryFee + serviceFee + tax + safeTip);
    return {
      discount,
      discountedSubtotal,
      deliveryFee: safeDeliveryFee,
      serviceFee,
      tax,
      tip: safeTip,
      orderTotal,
      processingFee: 0,
      smallOrderFee: 0,
      total: orderTotal,
    };
  }
  const tax = roundMoney(discountedSubtotal * (gctRate / 100));
  const orderTotal = roundMoney(discountedSubtotal + safeDeliveryFee + serviceFee + tax + safeTip);
  const processingFee = 0;
  const total = orderTotal;

  return {
    discount,
    discountedSubtotal,
    deliveryFee: safeDeliveryFee,
    serviceFee,
    tax,
    tip: safeTip,
    orderTotal,
    processingFee,
    smallOrderFee: 0,
    total,
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
    pricing_model?: string;
    platform_fee_rate?: number | null;
    delivery_fee?: number;
    service_fee?: number;
    processing_fee?: number;
    order_total?: number;
    tax?: number;
    tax_food_jmd?: number;
    tax_platform_jmd?: number;
    tax_rate_percent?: number;
    gct_registered?: boolean;
    processing_fee_order?: number;
    small_order_fee?: number;
    total?: number;
    distance_km?: number | null;
    tier?: string;
    free_delivery_applied?: boolean;
    min_order_subtotal_jmd?: number;
    card_processing_fee_percent?: number;
  };

  const resolvedMerchantId =
    typeof data.merchant_id === 'string' && data.merchant_id.trim()
      ? data.merchant_id.trim()
      : undefined;

  if (data.pricing_model === 'v2') {
    const deliveryFee = Math.max(0, Number(data.delivery_fee ?? 0));
    const serviceFee = Math.max(0, Number(data.service_fee ?? 0));
    const tax = Math.max(0, Number(data.tax ?? 0));
    const taxFoodJmd = Math.max(0, Number(data.tax_food_jmd ?? 0));
    const taxPlatformJmd = Math.max(0, Number(data.tax_platform_jmd ?? 0));
    const taxRatePercent = Math.max(0, Number(data.tax_rate_percent ?? 0));
    const orderTotal = Math.max(0, Number(data.order_total ?? 0));
    const processingFee = Math.max(0, Number(data.processing_fee ?? 0));
    const smallOrderFee = Math.max(0, Number(data.small_order_fee ?? 0));
    const total = Math.max(0, Number(data.total ?? 0));
    return {
      merchantId: resolvedMerchantId,
      pricingModel: 'v2',
      platformFeeRate: 0,
      deliveryFee,
      serviceFee,
      tax,
      taxFoodJmd,
      taxPlatformJmd,
      taxRatePercent,
      gctRegistered: data.gct_registered,
      orderTotal,
      processingFee,
      smallOrderFee,
      total,
      distanceKm: data.distance_km,
      tier: data.tier,
      freeDeliveryApplied: data.free_delivery_applied,
      minOrderSubtotalJmd: data.min_order_subtotal_jmd,
      cardProcessingFeePercent: data.card_processing_fee_percent,
    };
  }

  if (typeof data.platform_fee_rate !== 'number' || !Number.isFinite(data.platform_fee_rate)) {
    throw new Error('Pricing quote incomplete');
  }
  const deliveryFee =
    typeof data.delivery_fee === 'number' && Number.isFinite(data.delivery_fee)
      ? Math.max(0, data.delivery_fee)
      : 0;
  const taxRatePercent =
    typeof data.tax_rate_percent === 'number' && Number.isFinite(data.tax_rate_percent)
      ? Math.max(0, data.tax_rate_percent)
      : data.gct_registered === false
      ? 0
      : Number.NaN;
  if (!Number.isFinite(taxRatePercent) && data.gct_registered !== false) {
    throw new Error('GCT rate unavailable — refresh pricing before checkout');
  }
  return {
    merchantId: resolvedMerchantId,
    pricingModel: 'legacy',
    platformFeeRate: data.platform_fee_rate,
    deliveryFee,
    serviceFee: 0,
    tax: 0,
    taxRatePercent,
    gctRegistered: data.gct_registered,
    orderTotal: 0,
    processingFee: 0,
    total: 0,
    minOrderSubtotalJmd: data.min_order_subtotal_jmd,
  };
}
