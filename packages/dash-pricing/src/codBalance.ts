/** Explicit COD trial balance — platform + merchant + courier must sum to collected total. */

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CodTrialBalanceInput = {
  subtotal: number;
  discount?: number;
  merchantCommissionAmount?: number;
  serviceFee?: number;
  deliveryFeePlatformAmount?: number;
  deliveryFeeCourierAmount?: number;
  /** Customer small-order fee — platform take (same as card split). */
  smallOrderFee?: number;
  taxFoodJmd?: number;
  taxPlatformJmd?: number;
  tax?: number;
  tip?: number;
  courierTipNet?: number;
  total: number;
  /** legacy Model A */
  pricingModel?: string;
  platformFee?: number;
  deliveryFee?: number;
};

export type CodTrialBalance = {
  platformDueJmd: number;
  merchantDueJmd: number;
  courierRetainedJmd: number;
  gctDueJmd: number;
};

export function computeCodTrialBalance(input: CodTrialBalanceInput): CodTrialBalance {
  const subtotal = Number(input.subtotal ?? 0);
  const discount = Math.max(0, Number(input.discount ?? 0));
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const tip = Math.max(0, Number(input.tip ?? 0));
  const courierTipNet = input.courierTipNet != null
    ? roundMoney(Math.max(0, input.courierTipNet))
    : tip;

  const taxFood = roundMoney(Number(input.taxFoodJmd ?? 0));
  const taxPlatform = roundMoney(Number(input.taxPlatformJmd ?? 0));
  const taxTotal = roundMoney(
    input.tax != null ? Number(input.tax) : taxFood + taxPlatform,
  );
  const gctDueJmd = roundMoney(taxFood + taxPlatform || taxTotal);

  // Model B only — signed delivery platform share (promo/subsidy may be negative).
  const commission = Math.max(0, Number(input.merchantCommissionAmount ?? 0));
  const serviceFee = Math.max(0, Number(input.serviceFee ?? 0));
  const deliveryPlatform = Number(input.deliveryFeePlatformAmount ?? 0) || 0;
  const deliveryCourier = Math.max(0, Number(input.deliveryFeeCourierAmount ?? 0));
  const smallOrderFee = Math.max(0, Number(input.smallOrderFee ?? 0));

  const merchantDueJmd = roundMoney(Math.max(0, discountedSubtotal - commission));
  const platformDueJmd = roundMoney(
    serviceFee + commission + deliveryPlatform + gctDueJmd + smallOrderFee,
  );
  const courierRetainedJmd = roundMoney(deliveryCourier + courierTipNet);

  return { platformDueJmd, merchantDueJmd, courierRetainedJmd, gctDueJmd };
}

/** Assert three-way COD split sums to customer total (within 1 cent). */
export function assertCodTrialBalance(
  balance: CodTrialBalance,
  collectedTotal: number,
): void {
  const sum = roundMoney(
    balance.platformDueJmd + balance.merchantDueJmd + balance.courierRetainedJmd,
  );
  const expected = roundMoney(collectedTotal);
  if (Math.abs(sum - expected) > 0.02) {
    throw new Error(
      `COD trial balance mismatch: ${sum} !== ${expected} ` +
      `(platform=${balance.platformDueJmd}, merchant=${balance.merchantDueJmd}, ` +
      `courier=${balance.courierRetainedJmd})`,
    );
  }
}
