/** Merchant tier definition */
export type MerchantTier = {
  slug: string;
  name: string;
  commissionRate: number;
  /** Customer-facing base delivery fee override (replaces market base). */
  baseDeliveryFeeJmd?: number | null;
  /** Menu inflation percent 0–1 (e.g. 0.20 = 20%). */
  menuInflationPercent?: number | null;
  searchBoost?: number;
  defaultDeliveryRadiusKm?: number;
  promoEligible?: boolean;
};

/** Service fee configuration */
export type ServiceFeeRules = {
  mode: 'flat' | 'percent' | 'marginal';
  flatJmd?: number;
  percent?: number;
  minJmd?: number;
  maxJmd?: number;
  /** Marginal bracket: rate on first slice of order */
  avgRate?: number;
  /** Marginal bracket: rate on amount above threshold */
  overrideRate?: number;
  /** Marginal bracket: subtotal breakpoint (JMD) */
  overrideThresholdJmd?: number;
};

/** Distance-based delivery fee rules */
export type DeliveryFeeRules = {
  baseFeeJmd: number;
  includedKm: number;
  perExtraKmJmd: number;
  maxFeeJmd?: number;
};

export type LaunchPromoRules = {
  freeDeliveryFirstNOrders?: number;
};

export type CodRules = {
  pauseThresholdJmd?: number;
};

export type PricingParty = 'customer' | 'rider' | 'partner' | 'platform';

/** Snake_case party sections stored in DB JSONB */
export type PlatformRulesBlob = {
  pricing_v2_enabled?: boolean;
  tax_rate_percent?: number;
  max_menu_inflation_percent?: number;
};

export type CustomerRulesBlob = {
  service_fee?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  min_order_subtotal_jmd?: number;
  hard_min_order_subtotal_jmd?: number;
  small_order_threshold_jmd?: number;
  small_order_fee_jmd?: number;
  card_processing_fee_percent?: number;
  launch_promos?: Record<string, unknown>;
};

export type RiderRulesBlob = {
  courier_delivery_share?: number;
  courier_base_pay_jmd?: number;
  courier_per_km_jmd?: number;
  courier_min_pay_jmd?: number;
  cod?: Record<string, unknown>;
  road_distance_multiplier?: number;
  tip_processing_from_rider?: boolean;
};

export type PartnerRulesBlob = {
  default_tier_slug?: string;
};

export type NestedRulesBlob = {
  platform?: PlatformRulesBlob;
  customer?: CustomerRulesBlob;
  rider?: RiderRulesBlob;
  partner?: PartnerRulesBlob;
};

/** Full market pricing profile rules blob — flat runtime shape for engine */
export type PricingRules = {
  pricingV2Enabled?: boolean;
  delivery: DeliveryFeeRules;
  serviceFee: ServiceFeeRules;
  /** @deprecated Prefer courier pay ladder; kept for free-delivery promo split fallback. */
  courierDeliveryShare: number;
  courierBasePayJmd?: number;
  courierPerKmJmd?: number;
  courierMinPayJmd?: number;
  launchPromos?: LaunchPromoRules;
  cod?: CodRules;
  taxRatePercent?: number;
  roadDistanceMultiplier?: number;
  /** Soft floor / small-order threshold alias when fee not set */
  minOrderSubtotalJmd?: number;
  /** Absolute hard block below this subtotal */
  hardMinOrderSubtotalJmd?: number;
  smallOrderThresholdJmd?: number;
  smallOrderFeeJmd?: number;
  cardProcessingFeePercent?: number;
  tipProcessingFromRider?: boolean;
  maxMenuInflationPercent?: number;
};

export type ServiceFeeOverride = {
  mode: 'flat' | 'percent';
  amount: number;
  min?: number;
  max?: number;
};

export type PaymentMethod = 'wipay' | 'cash';

export type PricingInput = {
  subtotal: number;
  discount?: number;
  taxRatePercent?: number;
  platformTaxRatePercent?: number;
  platformGctEnabled?: boolean;
  tip?: number;
  distanceKm?: number | null;
  distanceKmRaw?: number | null;
  rules: PricingRules;
  tier?: MerchantTier | null;
  merchantCommissionRateOverride?: number | null;
  serviceFeeOverride?: ServiceFeeOverride | null;
  customerOrderCount?: number;
  freeDelivery?: boolean;
  paymentMethod?: PaymentMethod;
  serviceFeeWaived?: boolean;
  zoneSurchargeJmd?: number;
};

export type PricingBreakdown = {
  subtotal: number;
  discount: number;
  discountedSubtotal: number;
  merchantCommissionRate: number;
  merchantCommissionAmount: number;
  serviceFee: number;
  deliveryFee: number;
  deliveryFeePlatformAmount: number;
  deliveryFeeCourierAmount: number;
  zoneSurchargeJmd: number;
  distanceKm: number | null;
  distanceKmRaw?: number | null;
  tax: number;
  taxFoodJmd: number;
  taxPlatformJmd: number;
  taxRateFoodPercent: number;
  taxRatePlatformPercent: number;
  tip: number;
  courierTipNet: number;
  orderTotal: number;
  processingFee: number;
  processingFeeOrder: number;
  processingFeeTip: number;
  promoCostJmd: number;
  smallOrderFee: number;
  platformDeliverySubsidyJmd: number;
  courierBasePayJmd: number;
  courierDistancePayJmd: number;
  customerTotal: number;
  total: number;
  pricingProfileVersion?: number;
  tierSlug?: string;
  freeDeliveryApplied: boolean;
  pricingModel: 'v2' | 'legacy';
};
