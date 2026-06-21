export type PromoCode = {
  code: string;
  type: 'percentage' | 'fixed' | 'free_delivery';
  value: number;
  minOrder: number;
};

export const PROMO_CODES: Record<string, PromoCode> = {
  WELCOME: { code: 'WELCOME', type: 'free_delivery', value: 0, minOrder: 0 },
  WELCOME10: { code: 'WELCOME10', type: 'percentage', value: 10, minOrder: 500 },
  ISLAND20: { code: 'ISLAND20', type: 'percentage', value: 20, minOrder: 1000 },
};

export type OrderTotals = {
  discount: number;
  discountedSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  tip: number;
  total: number;
};

export function calculateOrderTotals(
  subtotal: number,
  appliedPromo: PromoCode | null,
  tip = 0
): OrderTotals {
  const discount =
    appliedPromo?.type === 'percentage' ? Math.round(subtotal * (appliedPromo.value / 100)) : 0;
  const discountedSubtotal = subtotal - discount;
  const deliveryFee = appliedPromo?.type === 'free_delivery' ? 0 : 150;
  const serviceFee = Math.round(discountedSubtotal * 0.0208);
  const tax = Math.round(discountedSubtotal * 0.05);
  const total = discountedSubtotal + deliveryFee + serviceFee + tax + tip;

  return { discount, discountedSubtotal, deliveryFee, serviceFee, tax, tip, total };
}
