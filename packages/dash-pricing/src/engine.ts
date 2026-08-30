import type {
  DeliveryFeeRules,
  MerchantTier,
  PaymentMethod,
  PricingBreakdown,
  PricingConfigValidationError,
  PricingInput,
  PricingRules,
  ServiceFeeDistanceAddon,
  ServiceFeeOverride,
  ServiceFeeRules,
} from './types.ts';
import { resolveOrderGct } from './gct.ts';
import {
  flattenNestedToLegacy,
  normalizeRulesBlob,
  serializePricingRulesNested,
  validatePricingRules,
} from './rulesBlob.ts';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isCardPayment(method: PaymentMethod | undefined): boolean {
  return method === 'wipay';
}

/** Resolve merchant commission rate from tier + optional override.
 * Commission is always on the marketplace (customer-facing) subtotal. */
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
        mode: override.mode ?? rules.mode,
        flatJmd: override.mode === 'flat' ? override.amount : rules.flatJmd,
        percent: override.mode === 'percent' ? override.amount : rules.percent,
        minJmd: override.min ?? rules.minJmd,
        maxJmd: override.max ?? rules.maxJmd,
        avgRate: rules.avgRate,
        overrideRate: rules.overrideRate,
        overrideThresholdJmd: rules.overrideThresholdJmd,
      }
    : rules;

  let fee = 0;
  if (effective.mode === 'flat') {
    fee = effective.flatJmd ?? 0;
  } else if (effective.mode === 'percent') {
    const pct = effective.percent ?? 0.05;
    fee = discountedSubtotal * pct;
  } else {
    return resolveMarginalServiceFee(effective, discountedSubtotal);
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

/** Distance service fee experiment — separate line from basket service fee. */
export function resolveServiceFeeDistanceAddon(
  addon: ServiceFeeDistanceAddon | null | undefined,
  distanceKm: number | null | undefined,
): number {
  if (!addon?.enabled) return 0;
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const threshold = Math.max(0, addon.thresholdKm ?? 0);
  const perKm = Math.max(0, addon.perKmJmd ?? 0);
  const maxJmd = Math.max(0, addon.maxJmd ?? 0);
  const billable = Math.max(0, distanceKm - threshold);
  if (billable <= 0 || perKm <= 0) return 0;
  const raw = Math.ceil(billable) * perKm;
  return roundMoney(maxJmd > 0 ? Math.min(raw, maxJmd) : raw);
}

/** Card processing fee on a taxable/chargeable amount. */
export function resolveProcessingFee(
  amount: number,
  cardProcessingFeePercent: number | undefined,
  paymentMethod: PaymentMethod | undefined,
): number {
  if (!isCardPayment(paymentMethod)) return 0;
  const rate = cardProcessingFeePercent ?? 0;
  if (rate <= 0) return 0;
  return roundMoney(Math.max(0, amount) * rate);
}

/** Split card processing: order portion on customer; tip portion from courier tip. */
export function resolveProcessingFeeSplit(
  orderBase: number,
  tip: number,
  cardProcessingFeePercent: number | undefined,
  paymentMethod: PaymentMethod | undefined,
): {
  processingFeeOrder: number;
  processingFeeTip: number;
  processingFee: number;
  courierTipNet: number;
} {
  const processingFeeOrder = resolveProcessingFee(
    orderBase,
    cardProcessingFeePercent,
    paymentMethod,
  );
  const processingFeeTip = resolveProcessingFee(
    tip,
    cardProcessingFeePercent,
    paymentMethod,
  );
  return {
    processingFeeOrder,
    processingFeeTip,
    processingFee: roundMoney(processingFeeOrder + processingFeeTip),
    courierTipNet: roundMoney(Math.max(0, tip - processingFeeTip)),
  };
}

/** Platform-wide distance-based delivery fee (identical across tiers). */
export function resolveDeliveryFee(
  rules: DeliveryFeeRules,
  distanceKm: number | null | undefined,
): number {
  const base = Math.max(0, Number(rules.baseJmd ?? 0));
  if (!Number.isFinite(base)) {
    throw new Error('resolveDeliveryFee requires customer.delivery.base_jmd');
  }
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return base;
  }
  const included = Math.max(0, rules.includedKm ?? 0);
  const extraKm = Math.max(0, distanceKm - included);
  const perKm = Math.max(0, rules.perExtraKmJmd ?? 0);
  const extra = Math.ceil(extraKm) * perKm;
  return roundMoney(base + extra);
}

/** True platform contribution (excludes GCT + processing). */
export function resolveContributionJmd(parts: {
  merchantCommissionAmount: number;
  serviceFee: number;
  deliveryFeePlatformAmount: number;
  smallOrderFee: number;
  peakPayAmount?: number;
}): number {
  return roundMoney(
    parts.merchantCommissionAmount
      + parts.serviceFee
      + parts.deliveryFeePlatformAmount
      + parts.smallOrderFee
      - Math.max(0, parts.peakPayAmount ?? 0),
  );
}

/** Apply road-distance multiplier to raw haversine km. */
export function applyRoadDistanceMultiplier(
  rawKm: number | null | undefined,
  multiplier: number | undefined,
): number | null {
  if (rawKm == null || !Number.isFinite(rawKm) || rawKm <= 0) return null;
  const mult = multiplier != null && Number.isFinite(multiplier) && multiplier > 0
    ? multiplier
    : 1.4;
  return roundMoney(rawKm * mult);
}

/** Independent courier pay ladder from trip economics. */
export function resolveCourierPayLadder(
  rules: PricingRules,
  distanceKm: number | null | undefined,
): { basePay: number; distancePay: number; total: number } {
  const basePay = Math.max(0, Number(rules.courierBasePayJmd ?? 0));
  const perKm = Math.max(0, Number(rules.courierPerKmJmd ?? 0));
  const minPay = Math.max(0, Number(rules.courierMinPayJmd ?? 0));
  const km = distanceKm != null && Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const distancePay = roundMoney(Math.ceil(km) * perKm);
  const raw = roundMoney(basePay + distancePay);
  const total = roundMoney(Math.max(raw, minPay));
  // Attribute any min-pay top-up to base so UI can show components
  const topUp = roundMoney(Math.max(0, total - raw));
  return { basePay: roundMoney(basePay + topUp), distancePay, total };
}

/** Small-order fee when subtotal is below threshold (and above hard min). */
export function resolveSmallOrderFee(
  rules: PricingRules,
  discountedSubtotal: number,
): number {
  const threshold = Math.max(0, Number(rules.smallOrderThresholdJmd ?? 0));
  const fee = Math.max(0, Number(rules.smallOrderFeeJmd ?? 0));
  if (threshold <= 0 || fee <= 0) return 0;
  if (discountedSubtotal >= threshold) return 0;
  return roundMoney(fee);
}

/** Check if launch promo applies free delivery. */
export function shouldApplyFreeDelivery(
  rules: PricingRules,
  customerOrderCount: number,
  freeDeliveryFlag?: boolean,
): boolean {
  if (freeDeliveryFlag === true) return true;
  if (freeDeliveryFlag === false) return false;
  const n = rules.launchPromos?.freeDeliveryFirstNOrders ?? 0;
  return n > 0 && customerOrderCount < n;
}

/** Build full order pricing breakdown (Model B). */
export function buildOrderPricing(input: PricingInput): PricingBreakdown {
  const subtotal = Math.max(0, input.subtotal);
  const discount = Math.max(0, input.discount ?? 0);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const foodRatePercent = input.taxRatePercent;
  if (foodRatePercent == null || !Number.isFinite(foodRatePercent)) {
    throw new Error('buildOrderPricing requires taxRatePercent from GCT resolver');
  }
  const platformRatePercent = input.platformTaxRatePercent ?? foodRatePercent;
  const tip = Math.max(0, input.tip ?? 0);

  const { rate: merchantCommissionRate, amount: merchantCommissionAmount } =
    resolveMerchantCommission(
      input.tier,
      input.merchantCommissionRateOverride,
      discountedSubtotal,
    );

  const distanceKmRaw = input.distanceKmRaw ?? input.distanceKm ?? null;
  const distanceKm = input.distanceKm != null && Number.isFinite(input.distanceKm)
    ? roundMoney(input.distanceKm)
    : null;

  let serviceFee = resolveServiceFee(
    input.rules.serviceFee,
    discountedSubtotal,
    input.serviceFeeOverride,
    input.serviceFeeWaived,
  );
  const multiplier = input.serviceFeeMultiplier != null && Number.isFinite(input.serviceFeeMultiplier)
    ? Math.max(0, Math.min(1, input.serviceFeeMultiplier))
    : 1;
  if (multiplier !== 1) {
    serviceFee = roundMoney(serviceFee * multiplier);
  }

  const serviceFeeDistanceJmd = resolveServiceFeeDistanceAddon(
    input.rules.serviceFeeDistanceAddon,
    distanceKm,
  );
  // Total service charged to customer = basket fee + distance addon
  const serviceFeeTotal = roundMoney(serviceFee + serviceFeeDistanceJmd);

  const smallOrderFee = resolveSmallOrderFee(input.rules, discountedSubtotal);

  const baseDeliveryFee = resolveDeliveryFee(input.rules.delivery, distanceKm);
  // Risk premium from zone policy — always charged; free-delivery only waives base.
  const zoneSurchargeJmd = Math.max(
    0,
    Math.trunc(Number(input.zoneSurchargeJmd ?? 0) || 0),
  );
  const grossDeliveryFee = roundMoney(baseDeliveryFee + zoneSurchargeJmd);
  const freeDeliveryApplied = shouldApplyFreeDelivery(
    input.rules,
    input.customerOrderCount ?? 0,
    input.freeDelivery,
  );

  // Courier pay ladder is required (legacy % share of customer fee removed).
  const ladderConfigured =
    (input.rules.courierBasePayJmd ?? 0) > 0 ||
    (input.rules.courierPerKmJmd ?? 0) > 0 ||
    (input.rules.courierMinPayJmd ?? 0) > 0;
  if (!ladderConfigured) {
    throw new Error(
      'buildOrderPricing requires courier pay ladder (courier_base_pay_jmd / per_km / min)',
    );
  }

  const ladder = resolveCourierPayLadder(input.rules, distanceKm);
  const courierBasePayJmd = ladder.basePay;
  const courierDistancePayJmd = ladder.distancePay;
  const deliveryFeeCourierAmount = ladder.total;

  let deliveryFee = grossDeliveryFee;
  let deliveryFeePlatformAmount = 0;
  let promoCostJmd = 0;
  let platformDeliverySubsidyJmd = 0;

  if (freeDeliveryApplied) {
    // Customer pays surcharge only; courier still earns full ladder.
    deliveryFee = zoneSurchargeJmd;
    deliveryFeePlatformAmount = roundMoney(zoneSurchargeJmd - ladder.total);
    promoCostJmd = roundMoney(Math.max(0, ladder.total - zoneSurchargeJmd));
    platformDeliverySubsidyJmd = promoCostJmd;
  } else {
    deliveryFee = grossDeliveryFee;
    // Platform share = what customer paid for delivery minus courier pay (can be negative).
    deliveryFeePlatformAmount = roundMoney(grossDeliveryFee - ladder.total);
    platformDeliverySubsidyJmd = roundMoney(
      Math.max(0, ladder.total - grossDeliveryFee),
    );
  }

  const gct = resolveOrderGct({
    discountedSubtotal,
    serviceFee: serviceFeeTotal,
    deliveryFeePlatformAmount,
    smallOrderFee,
    foodRatePercent,
    platformRatePercent,
    platformGctEnabled: input.platformGctEnabled,
  });

  const orderBase = roundMoney(
    discountedSubtotal + serviceFeeTotal + deliveryFee + smallOrderFee + gct.tax,
  );
  const orderTotal = roundMoney(orderBase + tip);

  const proc = resolveProcessingFeeSplit(
    orderBase,
    tip,
    input.rules.cardProcessingFeePercent,
    input.paymentMethod,
  );

  const customerTotal = roundMoney(orderBase + tip + proc.processingFeeOrder);

  const promoFundedBy = input.promoFundedBy ?? 'merchant';
  const contributionJmd = resolveContributionJmd({
    merchantCommissionAmount,
    serviceFee: serviceFeeTotal,
    deliveryFeePlatformAmount,
    smallOrderFee,
  });

  return {
    subtotal,
    discount,
    discountedSubtotal,
    merchantCommissionRate,
    merchantCommissionAmount,
    serviceFee: serviceFeeTotal,
    serviceFeeDistanceJmd,
    deliveryFee,
    deliveryFeePlatformAmount,
    deliveryFeeCourierAmount,
    zoneSurchargeJmd,
    distanceKm,
    distanceKmRaw,
    tax: gct.tax,
    taxFoodJmd: gct.taxFoodJmd,
    taxPlatformJmd: gct.taxPlatformJmd,
    taxRateFoodPercent: gct.taxRateFoodPercent,
    taxRatePlatformPercent: gct.taxRatePlatformPercent,
    tip,
    courierTipNet: proc.courierTipNet,
    orderTotal,
    processingFee: proc.processingFee,
    processingFeeOrder: proc.processingFeeOrder,
    processingFeeTip: proc.processingFeeTip,
    promoCostJmd,
    smallOrderFee,
    platformDeliverySubsidyJmd,
    courierBasePayJmd,
    courierDistancePayJmd,
    customerTotal,
    total: customerTotal,
    contributionJmd,
    promoFundedBy,
    tierSlug: input.tier?.slug,
    freeDeliveryApplied,
    rushPassApplied: input.rushPassApplied === true,
    rushPassMembershipId: input.rushPassMembershipId ?? null,
  };
}

/** Deep-merge snake_case rules blobs. Later layers win. Arrays are replaced, not concat. */
export function mergePricingRuleLayers(
  ...layers: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v != null && typeof v === 'object' && !Array.isArray(v);

  const mergeTwo = (
    base: Record<string, unknown>,
    over: Record<string, unknown>,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(over)) {
      if (value === undefined) continue;
      const prev = out[key];
      if (isPlainObject(prev) && isPlainObject(value)) {
        out[key] = mergeTwo(prev, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  let acc: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    acc = mergeTwo(acc, layer);
  }
  return acc;
}

const DEFAULTS = defaultPricingRules();

/** Parse DB rules JSON (snake_case, flat or nested) into PricingRules. */
export function parsePricingRules(raw: Record<string, unknown> | null | undefined): PricingRules {
  if (!raw || typeof raw !== 'object') {
    return defaultPricingRules();
  }
  const flat = flattenNestedToLegacy(normalizeRulesBlob(raw));
  const delivery = (flat.delivery ?? {}) as Record<string, unknown>;
  const serviceFee = (flat.service_fee ?? {}) as Record<string, unknown>;
  const launchPromos = (flat.launch_promos ?? {}) as Record<string, unknown>;
  const cod = (flat.cod ?? {}) as Record<string, unknown>;

  const modeRaw = serviceFee.mode;
  const mode: ServiceFeeRules['mode'] =
    modeRaw === 'marginal' ? 'marginal'
    : modeRaw === 'percent' ? 'percent'
    : 'flat';

  const guardrailsRaw = (flat.guardrails ?? {}) as Record<string, unknown>;
  const distanceAddonRaw = (
    (serviceFee.distance_addon as Record<string, unknown> | undefined)
    ?? (flat.service_fee_distance_addon as Record<string, unknown> | undefined)
    ?? {}
  );
  const ggRaw = (flat.growth_guarantee ?? {}) as Record<string, unknown>;
  const perKm = Number(
    delivery.per_km_jmd ?? delivery.per_extra_km_jmd ?? DEFAULTS.delivery.perExtraKmJmd,
  );

  const defaultAddon = DEFAULTS.serviceFeeDistanceAddon!;
  const serviceFeeDistanceAddon: ServiceFeeDistanceAddon = {
    enabled: distanceAddonRaw.enabled != null
      ? Boolean(distanceAddonRaw.enabled)
      : defaultAddon.enabled,
    thresholdKm: Number(distanceAddonRaw.threshold_km ?? defaultAddon.thresholdKm),
    perKmJmd: Number(distanceAddonRaw.per_km_jmd ?? defaultAddon.perKmJmd),
    maxJmd: Number(distanceAddonRaw.max_jmd ?? defaultAddon.maxJmd),
  };

  const growthGuarantee = {
    enabled: ggRaw.enabled != null ? Boolean(ggRaw.enabled) : (DEFAULTS.growthGuarantee?.enabled ?? true),
    tierSlugs: Array.isArray(ggRaw.tier_slugs)
      ? (ggRaw.tier_slugs as string[])
      : (DEFAULTS.growthGuarantee?.tierSlugs ?? ['dominant']),
    monthsFromAssignment: Number(
      ggRaw.months_from_assignment ?? DEFAULTS.growthGuarantee?.monthsFromAssignment ?? 6,
    ),
    minOrdersPerMonth: Number(
      ggRaw.min_orders_per_month ?? DEFAULTS.growthGuarantee?.minOrdersPerMonth ?? 20,
    ),
  };

  return {
    delivery: {
      baseJmd: Number(delivery.base_jmd ?? DEFAULTS.delivery.baseJmd),
      includedKm: Number(delivery.included_km ?? DEFAULTS.delivery.includedKm),
      perExtraKmJmd: perKm,
    },
    serviceFee: {
      mode,
      flatJmd: serviceFee.flat_jmd != null ? Number(serviceFee.flat_jmd) : DEFAULTS.serviceFee.flatJmd,
      percent: serviceFee.percent != null ? Number(serviceFee.percent) : DEFAULTS.serviceFee.percent,
      minJmd: serviceFee.min_jmd != null ? Number(serviceFee.min_jmd) : DEFAULTS.serviceFee.minJmd,
      maxJmd: serviceFee.max_jmd != null ? Number(serviceFee.max_jmd) : DEFAULTS.serviceFee.maxJmd,
      avgRate: serviceFee.avg_rate != null ? Number(serviceFee.avg_rate) : DEFAULTS.serviceFee.avgRate,
      overrideRate: serviceFee.override_rate != null
        ? Number(serviceFee.override_rate)
        : DEFAULTS.serviceFee.overrideRate,
      overrideThresholdJmd: serviceFee.override_threshold_jmd != null
        ? Number(serviceFee.override_threshold_jmd)
        : DEFAULTS.serviceFee.overrideThresholdJmd,
    },
    serviceFeeDistanceAddon,
    courierBasePayJmd: flat.courier_base_pay_jmd != null
      ? Number(flat.courier_base_pay_jmd)
      : DEFAULTS.courierBasePayJmd,
    courierPerKmJmd: flat.courier_per_km_jmd != null
      ? Number(flat.courier_per_km_jmd)
      : DEFAULTS.courierPerKmJmd,
    courierMinPayJmd: flat.courier_min_pay_jmd != null
      ? Number(flat.courier_min_pay_jmd)
      : DEFAULTS.courierMinPayJmd,
    launchPromos: {
      freeDeliveryFirstNOrders: Number(
        launchPromos.free_delivery_first_n_orders ?? DEFAULTS.launchPromos?.freeDeliveryFirstNOrders ?? 0,
      ),
    },
    cod: {
      pauseThresholdJmd: Number(cod.pause_threshold_jmd ?? DEFAULTS.cod?.pauseThresholdJmd ?? 10000),
    },
    taxRatePercent: undefined,
    roadDistanceMultiplier: flat.road_distance_multiplier != null
      ? Number(flat.road_distance_multiplier)
      : DEFAULTS.roadDistanceMultiplier,
    minOrderSubtotalJmd: flat.min_order_subtotal_jmd != null
      ? Number(flat.min_order_subtotal_jmd)
      : DEFAULTS.minOrderSubtotalJmd,
    smallOrderThresholdJmd: flat.small_order_threshold_jmd != null
      ? Number(flat.small_order_threshold_jmd)
      : DEFAULTS.smallOrderThresholdJmd,
    smallOrderFeeJmd: flat.small_order_fee_jmd != null
      ? Number(flat.small_order_fee_jmd)
      : DEFAULTS.smallOrderFeeJmd,
    cardProcessingFeePercent: flat.card_processing_fee_percent != null
      ? Number(flat.card_processing_fee_percent)
      : DEFAULTS.cardProcessingFeePercent,
    tipProcessingFromRider: flat.tip_processing_from_rider != null
      ? Boolean(flat.tip_processing_from_rider)
      : DEFAULTS.tipProcessingFromRider,
    maxMenuInflationPercent: flat.max_menu_inflation_percent != null
      ? Number(flat.max_menu_inflation_percent)
      : DEFAULTS.maxMenuInflationPercent,
    guardrails: {
      minDeliveryMarginJmd: guardrailsRaw.min_delivery_margin_jmd != null
        ? Number(guardrailsRaw.min_delivery_margin_jmd)
        : DEFAULTS.guardrails?.minDeliveryMarginJmd,
      minOrderContributionJmd: guardrailsRaw.min_order_contribution_jmd != null
        ? Number(guardrailsRaw.min_order_contribution_jmd)
        : DEFAULTS.guardrails?.minOrderContributionJmd,
    },
    growthGuarantee,
  };
}

/** Serialize PricingRules to nested DB JSON (snake_case party namespaces). */
export function serializePricingRules(rules: PricingRules): Record<string, unknown> {
  return flattenNestedToLegacy(serializePricingRulesNested(rules));
}

export function defaultPricingRules(): PricingRules {
  return {
    delivery: {
      baseJmd: 450,
      includedKm: 0,
      perExtraKmJmd: 60,
    },
    serviceFee: {
      mode: 'marginal',
      flatJmd: 120,
      percent: 0.05,
      minJmd: 150,
      maxJmd: 2500,
      avgRate: 0.115,
      overrideRate: 0.085,
      overrideThresholdJmd: 5000,
    },
    serviceFeeDistanceAddon: {
      enabled: false,
      thresholdKm: 5,
      perKmJmd: 20,
      maxJmd: 200,
    },
    courierBasePayJmd: 150,
    courierPerKmJmd: 60,
    courierMinPayJmd: 350,
    launchPromos: { freeDeliveryFirstNOrders: 0 },
    cod: { pauseThresholdJmd: 10000 },
    // Tax rate is NOT a pricing-rules default — callers must supply via GCT resolver.
    roadDistanceMultiplier: 1.4,
    minOrderSubtotalJmd: 600,
    smallOrderThresholdJmd: 800,
    smallOrderFeeJmd: 150,
    cardProcessingFeePercent: 0.045,
    tipProcessingFromRider: true,
    maxMenuInflationPercent: 0.25,
    guardrails: {
      minDeliveryMarginJmd: 100,
      minOrderContributionJmd: 150,
    },
    growthGuarantee: {
      enabled: true,
      tierSlugs: ['dominant'],
      monthsFromAssignment: 6,
      minOrdersPerMonth: 20,
    },
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

/** Absolute order floor — market hard min (merchant min_order is advisory/UI only). */
export function resolveOrderFloorJmd(
  marketMinJmd: number | undefined,
): number {
  return Math.max(0, marketMinJmd ?? 0);
}

/**
 * Reject configs that can lose money on delivery or invert the tier ladder.
 * Called on every admin pricing write path + CI.
 */
export function validatePricingConfig(
  rules: PricingRules,
  tiers: MerchantTier[],
  opts?: { maxRadiusKm?: number },
): PricingConfigValidationError | null {
  const baseErr = validatePricingRules(rules);
  if (baseErr) {
    return { code: 'RULES_INVALID', message: baseErr };
  }

  const customerPerKm = rules.delivery.perExtraKmJmd ?? 0;
  const courierPerKm = rules.courierPerKmJmd ?? 0;
  if (customerPerKm < courierPerKm) {
    return {
      code: 'PER_KM_BELOW_COST',
      message: `customer per_km (${customerPerKm}) must be >= courier per_km (${courierPerKm})`,
    };
  }

  const included = rules.delivery.includedKm ?? 0;
  if (included > 0) {
    const funded = (rules.delivery.baseJmd ?? 0) >= included * courierPerKm;
    if (!funded) {
      return {
        code: 'INCLUDED_KM_UNFUNDED',
        message: `included_km ${included} is not funded by delivery base_jmd`,
      };
    }
  }

  const maxRadius = Math.max(1, opts?.maxRadiusKm ?? 100);
  const minMargin = rules.guardrails?.minDeliveryMarginJmd ?? 100;
  for (let km = 1; km <= maxRadius; km++) {
    const fee = resolveDeliveryFee(rules.delivery, km);
    const courier = resolveCourierPayLadder(rules, km).total;
    const margin = roundMoney(fee - courier);
    if (margin < minMargin) {
      return {
        code: 'DELIVERY_MARGIN_FLOOR',
        message: `delivery margin ${margin} at ${km} km is below floor ${minMargin}`,
      };
    }
  }

  const minOrder = rules.minOrderSubtotalJmd ?? 0;
  const smallThreshold = rules.smallOrderThresholdJmd ?? 0;
  if (smallThreshold > 0 && minOrder > smallThreshold) {
    return {
      code: 'ORDER_FLOORS_INCOHERENT',
      message: `min_order_subtotal (${minOrder}) cannot exceed small_order_threshold (${smallThreshold})`,
    };
  }

  if (tiers.length >= 2) {
    const sorted = [...tiers].sort((a, b) => a.commissionRate - b.commissionRate);
    const baskets = [800, 2500, 10000];
    for (const basket of baskets) {
      let prev: number | null = null;
      for (const tier of sorted) {
        const b = buildOrderPricing({
          subtotal: basket,
          distanceKm: 5,
          rules,
          tier,
          taxRatePercent: 0.15,
          paymentMethod: 'cash',
        });
        if (prev != null && b.contributionJmd < prev) {
          return {
            code: 'TIER_LADDER_NOT_MONOTONE',
            message: `contribution falls at basket ${basket} for tier ${tier.slug}`,
          };
        }
        prev = b.contributionJmd;
      }
    }
  }

  // Distance addon at max radius must not break delivery margin (addon is platform revenue)
  const distAddon = rules.serviceFeeDistanceAddon;
  if (distAddon?.enabled) {
    const feeAtMax = resolveDeliveryFee(rules.delivery, maxRadius);
    const courierAtMax = resolveCourierPayLadder(rules, maxRadius).total;
    const margin = roundMoney(feeAtMax - courierAtMax);
    if (margin < minMargin) {
      return {
        code: 'DELIVERY_MARGIN_FLOOR',
        message: `with distance addon enabled, delivery margin ${margin} at ${maxRadius} km is below floor ${minMargin}`,
      };
    }
  }

  // Rush Pass worst-case: free delivery + 50% service fee at Growth/Dominant must still
  // clear contribution floor when platform funds delivery (promoCost). Floor check uses
  // contribution after subsidy — Pass makes contribution lower; reject if negative at
  // typical baskets for eligible tiers with max distance addon.
  const passEligible = tiers.filter((t) =>
    ['growth', 'dominant'].includes(String(t.slug).toLowerCase())
  );
  const passRules: PricingRules = {
    ...rules,
    serviceFeeDistanceAddon: distAddon?.enabled
      ? distAddon
      : { enabled: true, thresholdKm: 5, perKmJmd: 20, maxJmd: 200 },
  };
  const contribFloor = rules.guardrails?.minOrderContributionJmd ?? 0;
  for (const tier of passEligible) {
    for (const basket of [800, 2500]) {
      const pass = buildOrderPricing({
        subtotal: basket,
        distanceKm: maxRadius,
        rules: passRules,
        tier,
        taxRatePercent: 0.15,
        paymentMethod: 'cash',
        freeDelivery: true,
        serviceFeeMultiplier: 0.5,
        rushPassApplied: true,
      });
      // Platform-funded free delivery: contribution can dip but must not go deeply negative
      // beyond the configured floor when Pass is off; with Pass on, allow down to -promoCost
      // but reject configs where non-Pass contribution at same basket is already below floor.
      const base = buildOrderPricing({
        subtotal: basket,
        distanceKm: 5,
        rules,
        tier,
        taxRatePercent: 0.15,
        paymentMethod: 'cash',
      });
      if (contribFloor > 0 && base.contributionJmd < contribFloor) {
        return {
          code: 'PASS_CONTRIBUTION_FLOOR',
          message: `tier ${tier.slug} basket ${basket} contribution ${base.contributionJmd} below floor ${contribFloor} (Pass worst-case baseline)`,
        };
      }
      // Pass quote itself should still have finite totals / non-NaN contribution
      if (!Number.isFinite(pass.contributionJmd) || !Number.isFinite(pass.customerTotal)) {
        return {
          code: 'PASS_CONTRIBUTION_FLOOR',
          message: `Rush Pass quote invalid for tier ${tier.slug} basket ${basket}`,
        };
      }
    }
  }

  return null;
}