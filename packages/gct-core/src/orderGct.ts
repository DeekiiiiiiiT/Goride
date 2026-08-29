/** Multi-supply GCT — food (merchant) + platform fees (Roam). */

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type OrderGctInput = {
  discountedSubtotal: number;
  serviceFee: number;
  /** Platform share of delivery fee (>= 0 for GCT base; negatives ignored) */
  deliveryFeePlatformAmount: number;
  smallOrderFee?: number;
  foodRatePercent: number;
  platformRatePercent: number;
  platformGctEnabled?: boolean;
};

export type OrderGctBreakdown = {
  taxFoodJmd: number;
  taxPlatformJmd: number;
  tax: number;
  taxRateFoodPercent: number;
  taxRatePlatformPercent: number;
};

/** Resolve GCT on food + platform service/delivery/small-order supplies. */
export function resolveOrderGct(input: OrderGctInput): OrderGctBreakdown {
  const foodRate = Math.max(0, input.foodRatePercent) / 100;
  const platformRate =
    input.platformGctEnabled === false ? 0 : Math.max(0, input.platformRatePercent) / 100;

  const taxFoodJmd = roundMoney(Math.max(0, input.discountedSubtotal) * foodRate);
  const platformBase =
    Math.max(0, input.serviceFee) +
    Math.max(0, input.deliveryFeePlatformAmount) +
    Math.max(0, input.smallOrderFee ?? 0);
  const taxPlatformJmd = roundMoney(platformBase * platformRate);

  return {
    taxFoodJmd,
    taxPlatformJmd,
    tax: roundMoney(taxFoodJmd + taxPlatformJmd),
    taxRateFoodPercent: input.foodRatePercent,
    taxRatePlatformPercent: input.platformGctEnabled === false ? 0 : input.platformRatePercent,
  };
}
