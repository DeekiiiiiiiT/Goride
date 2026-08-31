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

/** Experiment: distance-based service fee addon (separate checkout line). */
export type ServiceFeeDistanceAddon = {
  enabled: boolean;
  thresholdKm: number;
  perKmJmd: number;
  maxJmd: number;
};

/** Merchant tier definition — demand goods only (no delivery subsidy / inflation). */
export type MerchantTier = {
  slug: string;
  name: string;
  commissionRate: number;
  searchBoost?: number;
  defaultDeliveryRadiusKm?: number;
  promoEligible?: boolean;
  /** Dominant auto-promoted placement */
  autoAds?: boolean;
};

/** Platform-wide distance-based delivery fee (identical across tiers). */
export type DeliveryFeeRules = {
  /** Platform starting fee (JMD). */
  baseJmd: number;
  includedKm: number;
  /** Alias: per_km_jmd / per_extra_km_jmd in blob */
  perExtraKmJmd: number;
};

export type LaunchPromoRules = {
  freeDeliveryFirstNOrders?: number;
};

export type CodRules = {
  pauseThresholdJmd?: number;
};

export type PricingGuardrails = {
  minDeliveryMarginJmd?: number;
  minOrderContributionJmd?: number;
};

export type PricingParty = 'customer' | 'rider' | 'partner' | 'platform';

/** Snake_case party sections stored in DB JSONB */
export type PlatformRulesBlob = {
  max_menu_inflation_percent?: number;
};

export type CustomerRulesBlob = {
  service_fee?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  min_order_subtotal_jmd?: number;
  small_order_threshold_jmd?: number;
  small_order_fee_jmd?: number;
  card_processing_fee_percent?: number;
  launch_promos?: Record<string, unknown>;
};

export type RiderRulesBlob = {
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
  guardrails?: Record<string, unknown>;
  growth_guarantee?: Record<string, unknown>;
  rush_pass?: Record<string, unknown>;
  promo_free_delivery?: Record<string, unknown>;
};

/** Full market pricing profile rules blob — flat runtime shape for engine */
export type PricingRules = {
  delivery: DeliveryFeeRules;
  serviceFee: ServiceFeeRules;
  /** Distance service fee experiment — off by default */
  serviceFeeDistanceAddon?: ServiceFeeDistanceAddon;
  courierBasePayJmd: number;
  courierPerKmJmd: number;
  courierMinPayJmd: number;
  launchPromos?: LaunchPromoRules;
  cod?: CodRules;
  taxRatePercent?: number;
  roadDistanceMultiplier?: number;
  /** Absolute hard block below this subtotal */
  minOrderSubtotalJmd?: number;
  smallOrderThresholdJmd?: number;
  smallOrderFeeJmd?: number;
  cardProcessingFeePercent?: number;
  tipProcessingFromRider?: boolean;
  maxMenuInflationPercent?: number;
  guardrails?: PricingGuardrails;
  /** Growth Guarantee config (platform rules) */
  growthGuarantee?: {
    enabled: boolean;
    tierSlugs: string[];
    monthsFromAssignment: number;
    minOrdersPerMonth: number;
    /** Hard ceiling on credit per merchant per period (JMD). */
    maxCreditJmdPerPeriod?: number;
  };
  /**
   * Rush Pass free-delivery bounds (platform defaults; plan may override).
   * Both must be positive — unbounded Pass free delivery is rejected by validatePricingConfig.
   */
  rushPass?: {
    maxFreeDeliveryKm: number;
    monthlySubsidyBudgetJmd: number;
  };
  /**
   * Platform promo / launch free-delivery bounds (Finding N).
   * Same shape as Rush Pass — distance cap + monthly subsidy budget.
   */
  promoFreeDelivery?: {
    maxFreeDeliveryKm: number;
    monthlySubsidyBudgetJmd: number;
  };
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
  /** Rush Pass: multiply basket service fee (distance addon unchanged). Default 1. */
  serviceFeeMultiplier?: number;
  zoneSurchargeJmd?: number;
  /** Who funds food `discount` — default merchant */
  promoFundedBy?: 'merchant' | 'platform' | 'shared';
  rushPassApplied?: boolean;
  rushPassMembershipId?: string | null;
  /** When Pass is on but free delivery is withheld */
  rushPassFreeDeliveryDeniedReason?: 'distance' | 'budget' | null;
  rushPassSubsidyBudgetJmd?: number;
  rushPassSubsidyUsedJmd?: number;
  rushPassSubsidyRemainingJmd?: number;
  /** Promo/launch free delivery withheld (Finding N) */
  promoFreeDeliveryDeniedReason?: 'distance' | 'budget' | null;
  promoFreeDeliverySubsidyBudgetJmd?: number;
  promoFreeDeliverySubsidyUsedJmd?: number;
  promoFreeDeliverySubsidyRemainingJmd?: number;
};

export type PricingBreakdown = {
  subtotal: number;
  discount: number;
  discountedSubtotal: number;
  merchantCommissionRate: number;
  merchantCommissionAmount: number;
  /** Basket-based service fee (after Pass multiplier). */
  serviceFee: number;
  /** Distance service fee experiment line (not multiplied by Pass). */
  serviceFeeDistanceJmd: number;
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
  /** True contribution (excludes GCT + WiPay). */
  contributionJmd: number;
  promoFundedBy: 'merchant' | 'platform' | 'shared';
  pricingProfileVersion?: number;
  tierSlug?: string;
  freeDeliveryApplied: boolean;
  rushPassApplied: boolean;
  rushPassMembershipId?: string | null;
  rushPassFreeDeliveryDeniedReason?: 'distance' | 'budget' | null;
  rushPassSubsidyBudgetJmd?: number;
  rushPassSubsidyUsedJmd?: number;
  rushPassSubsidyRemainingJmd?: number;
  promoFreeDeliveryDeniedReason?: 'distance' | 'budget' | null;
  promoFreeDeliverySubsidyBudgetJmd?: number;
  promoFreeDeliverySubsidyUsedJmd?: number;
  promoFreeDeliverySubsidyRemainingJmd?: number;
};

export type PricingConfigValidationError = {
  code: string;
  message: string;
};
