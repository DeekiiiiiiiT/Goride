import type {
  DeliveryFeeRules,
  MerchantTier,
  PaymentMethod,
  PricingBreakdown,
  PricingInput,
  PricingRules,
  ServiceFeeOverride,
  ServiceFeeRules,
} from './types.ts';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isCardPayment(method: PaymentMethod | undefined): boolean {
  return method === 'wipay' || method === 'paypal';
}

/** Resolve merchant commission rate from tier + optional override. */
export function resolveMerchantCommissionRate(
  tier: MerchantTier | null | undefined,
  override: number | null | undefined,
): number {
  if (override != null && Number.isFinite(override) && override >= 0 && override <= 1) {
    return override;
  }
  if (tier?.commissionRate != null && Number.isFinite(tier.commissionRate)) {
    return tier.commissionRate;
  }
  return 0.20;
}

/** Merchant commission amount deducted from food subtotal (after discount). */
export function resolveMerchantCommission(
  tier: MerchantTier | null | undefined,
  override: number | null | undefined,
  discountedSubtotal: number,
): { rate: number; amount: number } {
  const rate = resolveMerchantCommissionRate(tier, override);
  const amount = roundMoney(Math.max(0, discountedSubtotal) * rate);
  return { rate, amount };
}

/** Marginal (bracketed) service fee — audit Option B. */
export function resolveMarginalServiceFee(
  rules: ServiceFeeRules,
  discountedSubtotal: number,
): number {
  const subtotal = Math.max(0, discountedSubtotal);
  const avgRate = rules.avgRate ?? 0.15;
  const overrideRate = rules.overrideRate ?? 0.09;
  const threshold = Math.max(0, rules.overrideThresholdJmd ?? 0);
  const min = rules.minJmd ?? 0;
  const max = rules.maxJmd ?? 99999;

  let raw = 0;
  if (subtotal <= threshold) {
    raw = subtotal * avgRate;
  } else {
    raw = threshold * avgRate + (subtotal - threshold) * overrideRate;
  }

  return roundMoney(clamp(raw, min, max));
}

/** Legacy flat/percent service fee (merchant override path). */
function resolveLegacyServiceFee(
  rules: ServiceFeeRules,
  discountedSubtotal: number,
  override?: ServiceFeeOverride | null,
): number {
  const effective: ServiceFeeRules = override
    ? {
        mode: override.mode,
        flatJmd: override.mode === 'flat' ? override.amount : undefined,
        percent: override.mode === 'percent' ? override.amount : undefined,
        minJmd: override.min,
        maxJmd: override.max,
      }
    : rules;

  let fee = 0;
  if (effective.mode === 'flat') {
    fee = effective.flatJmd ?? 0;
  } else {
    const pct = effective.percent ?? 0.05;
    fee = discountedSubtotal * pct;
  }

  const min = effective.minJmd ?? 0;
  const max = effective.maxJmd ?? 99999;
  return roundMoney(clamp(fee, min, max));
}

/** Resolve customer-facing service fee. */
export function resolveServiceFee(
  rules: ServiceFeeRules,
  discountedSubtotal: number,
  override?: ServiceFeeOverride | null,
  waived?: boolean,
): number {
  if (waived) return 0;

  if (override) {
    return resolveLegacyServiceFee(rules, discountedSubtotal, override);
  }

  if (rules.mode === 'marginal') {
    return resolveMarginalServiceFee(rules, discountedSubtotal);
  }

  return resolveLegacyServiceFee(rules, discountedSubtotal, null);
}

/** Card processing fee on pre-processing order total. */
export function resolveProcessingFee(
  orderTotal: number,
  cardProcessingFeePercent: number | undefined,
  paymentMethod: PaymentMethod | undefined,
): number {
  if (!isCardPayment(paymentMethod)) return 0;
  const rate = cardProcessingFeePercent ?? 0;
  if (rate <= 0) return 0;
  return roundMoney(Math.max(0, orderTotal) * rate);
}

/** Distance-based delivery fee. */
export function resolveDeliveryFee(
  rules: DeliveryFeeRules,
  distanceKm: number | null | undefined,
): number {
  const base = Math.max(0, rules.baseFeeJmd);
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return base;
  }
  const included = Math.max(0, rules.includedKm);
  const extraKm = Math.max(0, distanceKm - included);
  const extra = Math.ceil(extraKm) * Math.max(0, rules.perExtraKmJmd);
  let fee = base + extra;
  if (rules.maxFeeJmd != null && rules.maxFeeJmd > 0) {
    fee = Math.min(fee, rules.maxFeeJmd);
  }
  return roundMoney(fee);
}

/** Split delivery fee between platform and courier. */
export function resolveDeliverySplit(
  deliveryFee: number,
  courierShareRate: number,
): { platformAmount: number; courierAmount: number } {
  const share = clamp(courierShareRate, 0, 1);
  const courierAmount = roundMoney(deliveryFee * share);
  const platformAmount = roundMoney(deliveryFee - courierAmount);
  return { platformAmount, courierAmount };
}

/** Check if launch promo applies free delivery. */
export function shouldApplyFreeDelivery(
  rules: PricingRules,
  customerOrderCount: number,
  freeDeliveryFlag?: boolean,
): boolean {
  if (freeDeliveryFlag) return true;
  const n = rules.launchPromos?.freeDeliveryFirstNOrders ?? 0;
  return n > 0 && customerOrderCount < n;
}

/** Build full order pricing breakdown (Model B). */
export function buildOrderPricing(input: PricingInput): PricingBreakdown {
  const subtotal = Math.max(0, input.subtotal);
  const discount = Math.max(0, input.discount ?? 0);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const taxRatePercent = input.taxRatePercent;
  if (taxRatePercent == null || !Number.isFinite(taxRatePercent)) {
    throw new Error('buildOrderPricing requires taxRatePercent from GCT resolver');
  }
  const taxRate = taxRatePercent / 100;
  const tip = Math.max(0, input.tip ?? 0);

  const { rate: merchantCommissionRate, amount: merchantCommissionAmount } =
    resolveMerchantCommission(
      input.tier,
      input.merchantCommissionRateOverride,
      discountedSubtotal,
    );

  const serviceFee = resolveServiceFee(
    input.rules.serviceFee,
    discountedSubtotal,
    input.serviceFeeOverride,
    input.serviceFeeWaived,
  );

  const distanceKm =
    input.distanceKm != null && Number.isFinite(input.distanceKm)
      ? roundMoney(input.distanceKm)
      : null;

  let deliveryFee = resolveDeliveryFee(input.rules.delivery, distanceKm);
  const freeDeliveryApplied = shouldApplyFreeDelivery(
    input.rules,
    input.customerOrderCount ?? 0,
    input.freeDelivery,
  );
  if (freeDeliveryApplied) {
    deliveryFee = 0;
  }

  const { platformAmount: deliveryFeePlatformAmount, courierAmount: deliveryFeeCourierAmount } =
    resolveDeliverySplit(deliveryFee, input.rules.courierDeliveryShare);

  const tax = roundMoney(discountedSubtotal * taxRate);
  const orderTotal = roundMoney(
    discountedSubtotal + serviceFee + deliveryFee + tax + tip,
  );
  const processingFee = resolveProcessingFee(
    orderTotal,
    input.rules.cardProcessingFeePercent,
    input.paymentMethod,
  );
  const customerTotal = roundMoney(orderTotal + processingFee);

  return {
    subtotal,
    discount,
    discountedSubtotal,
    merchantCommissionRate,
    merchantCommissionAmount,
    serviceFee,
    deliveryFee,
    deliveryFeePlatformAmount,
    deliveryFeeCourierAmount,
    distanceKm,
    tax,
    tip,
    orderTotal,
    processingFee,
    customerTotal,
    total: customerTotal,
    tierSlug: input.tier?.slug,
    freeDeliveryApplied,
    pricingModel: 'v2',
  };
}

/** Parse DB rules JSON (snake_case) into PricingRules. */
export function parsePricingRules(raw: Record<string, unknown> | null | undefined): PricingRules {
  if (!raw || typeof raw !== 'object') {
    return defaultPricingRules();
  }
  const delivery = (raw.delivery ?? {}) as Record<string, unknown>;
  const serviceFee = (raw.service_fee ?? {}) as Record<string, unknown>;
  const launchPromos = (raw.launch_promos ?? {}) as Record<string, unknown>;
  const cod = (raw.cod ?? {}) as Record<string, unknown>;

  const modeRaw = serviceFee.mode;
  const mode: ServiceFeeRules['mode'] =
    modeRaw === 'marginal' ? 'marginal'
    : modeRaw === 'percent' ? 'percent'
    : 'flat';

  return {
    pricingV2Enabled: Boolean(raw.pricing_v2_enabled),
    delivery: {
      baseFeeJmd: Number(delivery.base_fee_jmd ?? 400),
      includedKm: Number(delivery.included_km ?? 2),
      perExtraKmJmd: Number(delivery.per_extra_km_jmd ?? 60),
      maxFeeJmd: delivery.max_fee_jmd != null ? Number(delivery.max_fee_jmd) : undefined,
    },
    serviceFee: {
      mode,
      flatJmd: serviceFee.flat_jmd != null ? Number(serviceFee.flat_jmd) : 120,
      percent: serviceFee.percent != null ? Number(serviceFee.percent) : 0.05,
      minJmd: serviceFee.min_jmd != null ? Number(serviceFee.min_jmd) : 100,
      maxJmd: serviceFee.max_jmd != null ? Number(serviceFee.max_jmd) : 200,
      avgRate: serviceFee.avg_rate != null ? Number(serviceFee.avg_rate) : undefined,
      overrideRate: serviceFee.override_rate != null ? Number(serviceFee.override_rate) : undefined,
      overrideThresholdJmd: serviceFee.override_threshold_jmd != null
        ? Number(serviceFee.override_threshold_jmd)
        : undefined,
    },
    courierDeliveryShare: Number(raw.courier_delivery_share ?? 0.8),
    launchPromos: {
      freeDeliveryFirstNOrders: Number(launchPromos.free_delivery_first_n_orders ?? 0),
    },
    cod: {
      pauseThresholdJmd: Number(cod.pause_threshold_jmd ?? 10000),
    },
    taxRatePercent: Number(raw.tax_rate_percent ?? 16.5),
    minOrderSubtotalJmd: raw.min_order_subtotal_jmd != null
      ? Number(raw.min_order_subtotal_jmd)
      : undefined,
    cardProcessingFeePercent: raw.card_processing_fee_percent != null
      ? Number(raw.card_processing_fee_percent)
      : undefined,
  };
}

/** Serialize PricingRules to DB JSON (snake_case). */
export function serializePricingRules(rules: PricingRules): Record<string, unknown> {
  const sf = rules.serviceFee;
  return {
    pricing_v2_enabled: rules.pricingV2Enabled ?? false,
    delivery: {
      base_fee_jmd: rules.delivery.baseFeeJmd,
      included_km: rules.delivery.includedKm,
      per_extra_km_jmd: rules.delivery.perExtraKmJmd,
      max_fee_jmd: rules.delivery.maxFeeJmd,
    },
    service_fee: {
      mode: sf.mode,
      flat_jmd: sf.flatJmd,
      percent: sf.percent,
      min_jmd: sf.minJmd,
      max_jmd: sf.maxJmd,
      avg_rate: sf.avgRate,
      override_rate: sf.overrideRate,
      override_threshold_jmd: sf.overrideThresholdJmd,
    },
    courier_delivery_share: rules.courierDeliveryShare,
    launch_promos: {
      free_delivery_first_n_orders: rules.launchPromos?.freeDeliveryFirstNOrders ?? 0,
    },
    cod: {
      pause_threshold_jmd: rules.cod?.pauseThresholdJmd ?? 10000,
    },
    tax_rate_percent: rules.taxRatePercent ?? 16.5,
    min_order_subtotal_jmd: rules.minOrderSubtotalJmd,
    card_processing_fee_percent: rules.cardProcessingFeePercent,
  };
}

export function defaultPricingRules(): PricingRules {
  return {
    pricingV2Enabled: false,
    delivery: {
      baseFeeJmd: 400,
      includedKm: 2,
      perExtraKmJmd: 60,
      maxFeeJmd: 1500,
    },
    serviceFee: {
      mode: 'flat',
      flatJmd: 120,
      percent: 0.05,
      minJmd: 100,
      maxJmd: 200,
    },
    courierDeliveryShare: 0.8,
    launchPromos: { freeDeliveryFirstNOrders: 3 },
    cod: { pauseThresholdJmd: 10000 },
    taxRatePercent: 16.5,
    minOrderSubtotalJmd: 800,
    cardProcessingFeePercent: 0.045,
  };
}

export function parseServiceFeeOverride(
  raw: Record<string, unknown> | null | undefined,
): import('./types.ts').ServiceFeeOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const mode = raw.mode === 'percent' ? 'percent' : 'flat';
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    mode,
    amount,
    min: raw.min != null ? Number(raw.min) : undefined,
    max: raw.max != null ? Number(raw.max) : undefined,
  };
}

/** Minimum order gate — max of market and merchant floors. */
export function resolveMinOrderSubtotal(
  marketMinJmd: number | undefined,
  merchantMinJmd: number | null | undefined,
): number {
  const market = Math.max(0, marketMinJmd ?? 0);
  const merchant = Math.max(0, merchantMinJmd ?? 0);
  return Math.max(market, merchant);
}
