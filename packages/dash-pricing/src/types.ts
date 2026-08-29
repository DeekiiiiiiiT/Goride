/** Merchant tier definition */
export type MerchantTier = {
  slug: string;
  name: string;
  commissionRate: number;
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
};

export type CustomerRulesBlob = {
  service_fee?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  min_order_subtotal_jmd?: number;
  card_processing_fee_percent?: number;
  launch_promos?: Record<string, unknown>;
};

export type RiderRulesBlob = {
  courier_delivery_share?: number;
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
  courierDeliveryShare: number;
  launchPromos?: LaunchPromoRules;
  cod?: CodRules;
  taxRatePercent?: number;
  /** Road-distance multiplier applied to haversine km (default 1.4) */
  roadDistanceMultiplier?: number;
  /** Checkout gate — minimum food subtotal before order can proceed */
  minOrderSubtotalJmd?: number;
  /** Card/wallet processing fee rate applied to order total (e.g. 0.045) */
  cardProcessingFeePercent?: number;
  /** When true, card processing on tip is deducted from courier tip (default true) */
  tipProcessingFromRider?: boolean;
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
  /** Merchant food GCT rate (0 when unregistered) */
  taxRatePercent?: number;
  /** Roam platform GCT rate on service + delivery platform share */
  platformTaxRatePercent?: number;
  platformGctEnabled?: boolean;
  tip?: number;
  distanceKm?: number | null;
  /** Raw haversine km before road multiplier (audit trail) */
  distanceKmRaw?: number | null;
  rules: PricingRules;
  tier?: MerchantTier | null;
  merchantCommissionRateOverride?: number | null;
  serviceFeeOverride?: ServiceFeeOverride | null;
  /** Customer completed order count for launch promos */
  customerOrderCount?: number;
  /** Force free delivery (promo applied) */
  freeDelivery?: boolean;
  paymentMethod?: PaymentMethod;
  /** Skip service fee entirely (promo/loyalty waiver) */
  serviceFeeWaived?: boolean;
  /**
   * Zone risk surcharge (JMD) from coverage policy action=surcharge.
   * Folded into gross delivery fee before the platform/courier split.
   * Not waived by free-delivery promos.
   */
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
  /** Zone policy surcharge folded into deliveryFee (0 when none). */
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
  /** Pre-processing order total (includes tip) */
  orderTotal: number;
  processingFee: number;
  processingFeeOrder: number;
  processingFeeTip: number;
  /** Platform marketing cost when free-delivery promo funds courier */
  promoCostJmd: number;
  /** Final amount customer pays */
  customerTotal: number;
  /** Alias for customerTotal (backward compat) */
  total: number;
  pricingProfileVersion?: number;
  tierSlug?: string;
  freeDeliveryApplied: boolean;
  pricingModel: 'v2' | 'legacy';
};
