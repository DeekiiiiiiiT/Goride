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
): OrderTotals {
  const discount = computeDiscount(subtotal, appliedPromo);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const safeDeliveryFee = Math.max(0, deliveryFee);
  const serviceFee = roundMoney(subtotal * clampFeeRate(platformFeeRate));
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

/** Live merchant fee + delivery for cart/checkout display. */
export async function fetchMerchantCheckoutPricing(
  merchantId: string,
  accessToken?: string | null,
): Promise<{ platformFeeRate: number; deliveryFee: number } | null> {
  const { API_ENDPOINTS, supabaseAnonFunctionHeaders } = await import('@roam/api-client');
  const headers = supabaseAnonFunctionHeaders(
    accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  );
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchantId}/pricing`, { headers });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    platform_fee_rate?: number;
    delivery_fee?: number;
  };
  if (typeof data.platform_fee_rate !== 'number' || !Number.isFinite(data.platform_fee_rate)) {
    return null;
  }
  return {
    platformFeeRate: data.platform_fee_rate,
    deliveryFee:
      typeof data.delivery_fee === 'number' && Number.isFinite(data.delivery_fee)
        ? Math.max(0, data.delivery_fee)
        : 0,
  };
}
