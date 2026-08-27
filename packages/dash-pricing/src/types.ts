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

/** Full market pricing profile rules blob */
export type PricingRules = {
  pricingV2Enabled?: boolean;
  delivery: DeliveryFeeRules;
  serviceFee: ServiceFeeRules;
  courierDeliveryShare: number;
  launchPromos?: LaunchPromoRules;
  cod?: CodRules;
  taxRatePercent?: number;
  /** Checkout gate — minimum food subtotal before order can proceed */
  minOrderSubtotalJmd?: number;
  /** Card/wallet processing fee rate applied to order total (e.g. 0.045) */
  cardProcessingFeePercent?: number;
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
  tip?: number;
  distanceKm?: number | null;
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
  distanceKm: number | null;
  tax: number;
  tip: number;
  /** Pre-processing order total */
  orderTotal: number;
  processingFee: number;
  /** Final amount customer pays */
  customerTotal: number;
  /** Alias for customerTotal (backward compat) */
  total: number;
  pricingProfileVersion?: number;
  tierSlug?: string;
  freeDeliveryApplied: boolean;
  pricingModel: 'v2' | 'legacy';
};
