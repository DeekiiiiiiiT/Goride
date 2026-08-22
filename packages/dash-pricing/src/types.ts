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
  mode: 'flat' | 'percent';
  flatJmd?: number;
  percent?: number;
  minJmd?: number;
  maxJmd?: number;
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
};

export type ServiceFeeOverride = {
  mode: 'flat' | 'percent';
  amount: number;
  min?: number;
  max?: number;
};

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
  total: number;
  pricingProfileVersion?: number;
  tierSlug?: string;
  freeDeliveryApplied: boolean;
  pricingModel: 'v2' | 'legacy';
};
