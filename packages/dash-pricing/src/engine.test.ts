import { describe, expect, it } from 'vitest';
import {
  applyRoadDistanceMultiplier,
  buildOrderPricing,
  resolveDeliveryFee,
  resolveDeliverySplit,
  resolveMarginalServiceFee,
  resolveMinOrderSubtotal,
  resolveProcessingFee,
  resolveProcessingFeeSplit,
  resolveServiceFee,
  shouldApplyFreeDelivery,
  defaultPricingRules,
  mergePricingRuleLayers,
} from './engine.ts';
import type { PricingRules } from './types.ts';

const SPANISH_TOWN_RULES: PricingRules = {
  ...defaultPricingRules(),
  // Existing unit tests assert legacy % delivery split + no small-order fee.
  courierBasePayJmd: 0,
  courierPerKmJmd: 0,
  courierMinPayJmd: 0,
  smallOrderThresholdJmd: 0,
  smallOrderFeeJmd: 0,
  hardMinOrderSubtotalJmd: 400,
  minOrderSubtotalJmd: 800,
};

describe('mergePricingRuleLayers', () => {
  it('lets town win over parish over default', () => {
    const merged = mergePricingRuleLayers(
      { delivery: { base_fee_jmd: 400, included_km: 2 }, pricing_v2_enabled: false },
      { delivery: { base_fee_jmd: 450 } },
      { delivery: { per_extra_km_jmd: 70 }, pricing_v2_enabled: true },
    );
    expect(merged).toEqual({
      delivery: { base_fee_jmd: 450, included_km: 2, per_extra_km_jmd: 70 },
      pricing_v2_enabled: true,
    });
  });
});

const MARGINAL_RULES: PricingRules = {
  ...defaultPricingRules(),
  pricingV2Enabled: true,
  courierBasePayJmd: 0,
  courierPerKmJmd: 0,
  courierMinPayJmd: 0,
  smallOrderThresholdJmd: 0,
  smallOrderFeeJmd: 0,
  serviceFee: {
    mode: 'marginal',
    avgRate: 0.15,
    overrideRate: 0.09,
    overrideThresholdJmd: 5000,
    minJmd: 150,
    maxJmd: 2500,
  },
  minOrderSubtotalJmd: 800,
  cardProcessingFeePercent: 0.045,
  launchPromos: { freeDeliveryFirstNOrders: 0 },
};

const PROMO_RULES: PricingRules = {
  ...MARGINAL_RULES,
  launchPromos: { freeDeliveryFirstNOrders: 3 },
};

describe('shouldApplyFreeDelivery', () => {
  it('never applies when N=0', () => {
    expect(shouldApplyFreeDelivery(MARGINAL_RULES, 0)).toBe(false);
    expect(shouldApplyFreeDelivery(MARGINAL_RULES, 1)).toBe(false);
  });

  it('applies when N>0 and under count', () => {
    expect(shouldApplyFreeDelivery(PROMO_RULES, 1)).toBe(true);
    expect(shouldApplyFreeDelivery(PROMO_RULES, 5)).toBe(false);
  });
});

describe('applyRoadDistanceMultiplier', () => {
  it('defaults to 1.4×', () => {
    expect(applyRoadDistanceMultiplier(10, undefined)).toBe(14);
  });
});

describe('resolveDeliveryFee', () => {
  it('charges base fee for trips under included km', () => {
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 1.5)).toBe(400);
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 2)).toBe(400);
  });

  it('adds per-km surcharge beyond included distance', () => {
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 3.2)).toBe(520);
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 4)).toBe(520);
  });

  it('falls back to base when distance unknown', () => {
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, null)).toBe(400);
  });
});

describe('resolveMarginalServiceFee', () => {
  const rules = MARGINAL_RULES.serviceFee;

  it('applies avg rate below threshold', () => {
    expect(resolveMarginalServiceFee(rules, 1200)).toBe(180);
  });

  it('applies bracketed rate above threshold', () => {
    expect(resolveMarginalServiceFee(rules, 6000)).toBe(840);
  });

  it('caps at max for huge orders', () => {
    expect(resolveMarginalServiceFee(rules, 60000)).toBe(2500);
  });

  it('floors at min for tiny orders', () => {
    expect(resolveMarginalServiceFee(rules, 400)).toBe(150);
  });
});

describe('resolveServiceFee', () => {
  it('uses marginal mode by default', () => {
    expect(resolveServiceFee(SPANISH_TOWN_RULES.serviceFee, 2500)).toBe(375);
  });

  it('respects min/max for percent mode', () => {
    const percentRules = { ...SPANISH_TOWN_RULES.serviceFee, mode: 'percent' as const, percent: 0.05 };
    expect(resolveServiceFee(percentRules, 1000)).toBe(150);
    expect(resolveServiceFee(percentRules, 5000)).toBe(250);
  });

  it('inherits market min when override omits it', () => {
    expect(
      resolveServiceFee(MARGINAL_RULES.serviceFee, 50000, { mode: 'percent', amount: 0.05 }),
    ).toBe(2500);
  });

  it('returns 0 when waived', () => {
    expect(resolveServiceFee(MARGINAL_RULES.serviceFee, 2500, null, true)).toBe(0);
  });
});

describe('resolveProcessingFee', () => {
  it('returns 0 for COD', () => {
    expect(resolveProcessingFee(1000, 0.045, 'cash')).toBe(0);
  });

  it('computes card fee on amount', () => {
    expect(resolveProcessingFee(1000, 0.045, 'wipay')).toBe(45);
  });

  it('computes wipay fee', () => {
    expect(resolveProcessingFee(200, 0.045, 'wipay')).toBe(9);
  });
});

describe('resolveProcessingFeeSplit', () => {
  it('charges order processing on customer, tip processing from courier', () => {
    const r = resolveProcessingFeeSplit(2000, 100, 0.045, 'wipay');
    expect(r.processingFeeOrder).toBe(90);
    expect(r.processingFeeTip).toBe(4.5);
    expect(r.courierTipNet).toBe(95.5);
  });
});

describe('resolveMinOrderSubtotal', () => {
  it('returns max of market and merchant', () => {
    expect(resolveMinOrderSubtotal(800, 1000)).toBe(1000);
    expect(resolveMinOrderSubtotal(800, 500)).toBe(800);
  });
});

describe('resolveDeliverySplit', () => {
  it('splits 80/20', () => {
    const split = resolveDeliverySplit(500, 0.8);
    expect(split.courierAmount).toBe(400);
    expect(split.platformAmount).toBe(100);
  });
});

describe('buildOrderPricing — marginal defaults', () => {
  it('computes full breakdown for 3.2 km, J$2500 subtotal', () => {
    const result = buildOrderPricing({
      subtotal: 2500,
      discount: 0,
      distanceKm: 3.2,
      rules: { ...SPANISH_TOWN_RULES, pricingV2Enabled: true },
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });

    expect(result.deliveryFee).toBe(520);
    expect(result.serviceFee).toBe(375);
    expect(result.merchantCommissionAmount).toBe(500);
    expect(result.taxFoodJmd).toBe(412.5);
    expect(result.taxPlatformJmd).toBeGreaterThan(0);
    expect(result.processingFee).toBe(0);
  });

  it('free delivery promo pays courier — platform absorbs', () => {
    const result = buildOrderPricing({
      subtotal: 1500,
      distanceKm: 3,
      rules: PROMO_RULES,
      tier: { slug: 'basic', name: 'Basic', commissionRate: 0.12 },
      customerOrderCount: 1,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.freeDeliveryApplied).toBe(true);
    expect(result.deliveryFee).toBe(0);
    expect(result.deliveryFeeCourierAmount).toBeGreaterThan(0);
    expect(result.promoCostJmd).toBe(result.deliveryFeeCourierAmount);
    expect(result.deliveryFeePlatformAmount).toBe(-result.deliveryFeeCourierAmount);
  });
});

describe('buildOrderPricing — marginal + processing', () => {
  it('small order $1200 food, card', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'wipay',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.serviceFee).toBe(180);
    expect(result.taxFoodJmd).toBe(198);
    expect(result.taxPlatformJmd).toBeGreaterThan(0);
    const orderBase = 1200 + 180 + 400 + result.tax;
    expect(result.processingFeeOrder).toBe(Math.round(orderBase * 0.045 * 100) / 100);
    expect(result.customerTotal).toBe(result.orderTotal + result.processingFeeOrder);
  });

  it('small order $300 floor, cash', () => {
    const result = buildOrderPricing({
      subtotal: 300,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'cash',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.serviceFee).toBe(150);
  });

  it('large order capped, card', () => {
    const result = buildOrderPricing({
      subtotal: 60000,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'wipay',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.serviceFee).toBe(2500);
  });

  it('COD skips processing fee', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'cash',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.processingFee).toBe(0);
    expect(result.customerTotal).toBe(result.orderTotal);
  });

  it('card with tip — customer not charged tip processing', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2,
      tip: 100,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'wipay',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.processingFeeTip).toBe(4.5);
    expect(result.courierTipNet).toBe(95.5);
    expect(result.customerTotal).toBe(result.orderTotal + result.processingFeeOrder);
  });

  it('fee waiver skips service fee', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      serviceFeeWaived: true,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.serviceFee).toBe(0);
  });

  it('uses discounted subtotal for service fee', () => {
    const result = buildOrderPricing({
      subtotal: 6000,
      discount: 1000,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.serviceFee).toBe(750);
  });
});

describe('buildOrderPricing — trial balance invariant', () => {
  it('v2 COD parts sum to customer total', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2.5,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'cash',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
      tip: 50,
    });
    const platformDue = result.serviceFee + result.merchantCommissionAmount
      + Math.max(0, result.deliveryFeePlatformAmount) + result.tax;
    const merchantDue = result.discountedSubtotal - result.merchantCommissionAmount;
    const courier = result.deliveryFeeCourierAmount + result.courierTipNet;
    expect(Math.round((platformDue + merchantDue + courier) * 100) / 100).toBe(result.customerTotal);
  });
});

describe('buildOrderPricing — zone surcharge (SURCHARGE-1)', () => {
  it('splits surcharge into platform + courier (identity holds)', () => {
    const without = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 3.2,
      rules: { ...SPANISH_TOWN_RULES, pricingV2Enabled: true },
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    const withSur = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 3.2,
      rules: { ...SPANISH_TOWN_RULES, pricingV2Enabled: true },
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
      zoneSurchargeJmd: 200,
    });
    expect(withSur.zoneSurchargeJmd).toBe(200);
    expect(withSur.deliveryFee).toBe(without.deliveryFee + 200);
    expect(
      withSur.deliveryFeePlatformAmount + withSur.deliveryFeeCourierAmount,
    ).toBeCloseTo(withSur.deliveryFee, 2);
    expect(withSur.customerTotal).toBeGreaterThan(without.customerTotal);
  });

  it('card processing fee rises with surcharge-inclusive order base', () => {
    const without = buildOrderPricing({
      subtotal: 2000,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'wipay',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    const withSur = buildOrderPricing({
      subtotal: 2000,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'wipay',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
      zoneSurchargeJmd: 200,
    });
    expect(withSur.processingFeeOrder).toBeGreaterThan(without.processingFeeOrder);
    expect(
      withSur.deliveryFeePlatformAmount + withSur.deliveryFeeCourierAmount,
    ).toBeCloseTo(withSur.deliveryFee, 2);
  });

  it('free delivery still charges surcharge; split identity holds', () => {
    const result = buildOrderPricing({
      subtotal: 1500,
      distanceKm: 3,
      rules: PROMO_RULES,
      tier: { slug: 'basic', name: 'Basic', commissionRate: 0.12 },
      customerOrderCount: 1,
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
      zoneSurchargeJmd: 200,
    });
    expect(result.freeDeliveryApplied).toBe(true);
    expect(result.deliveryFee).toBe(200);
    expect(result.zoneSurchargeJmd).toBe(200);
    expect(result.promoCostJmd).toBeGreaterThan(0);
    expect(
      result.deliveryFeePlatformAmount + result.deliveryFeeCourierAmount,
    ).toBeCloseTo(result.deliveryFee, 2);
  });

  it('COD trial balance holds with surcharge', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2.5,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      paymentMethod: 'cash',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
      tip: 50,
      zoneSurchargeJmd: 200,
    });
    expect(
      result.deliveryFeePlatformAmount + result.deliveryFeeCourierAmount,
    ).toBeCloseTo(result.deliveryFee, 2);
    const platformDue = result.serviceFee + result.merchantCommissionAmount
      + Math.max(0, result.deliveryFeePlatformAmount) + result.tax;
    const merchantDue = result.discountedSubtotal - result.merchantCommissionAmount;
    const courier = result.deliveryFeeCourierAmount + result.courierTipNet;
    expect(Math.round((platformDue + merchantDue + courier) * 100) / 100).toBe(
      result.customerTotal,
    );
  });
});

describe('marketplace — tier base, courier ladder, small-order fee', () => {
  it('tier base replaces market base at zero distance', () => {
    expect(
      resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, null, 150),
    ).toBe(150);
    expect(
      resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 5, 150),
    ).toBe(150 + 3 * 60);
  });

  it('courier ladder pays independently of customer fee', () => {
    const rules: PricingRules = {
      ...SPANISH_TOWN_RULES,
      courierBasePayJmd: 250,
      courierPerKmJmd: 80,
      courierMinPayJmd: 350,
    };
    const result = buildOrderPricing({
      subtotal: 2000,
      distanceKm: 12,
      rules,
      tier: {
        slug: 'dominant',
        name: 'Dominant',
        commissionRate: 0.30,
        baseDeliveryFeeJmd: 150,
      },
      paymentMethod: 'cash',
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(result.deliveryFee).toBe(150 + 10 * 60); // 2km included
    expect(result.deliveryFeeCourierAmount).toBe(250 + 12 * 80); // 1210
    expect(result.platformDeliverySubsidyJmd).toBeGreaterThan(0);
    expect(result.deliveryFeePlatformAmount).toBeLessThan(0);
  });

  it('small-order fee applies below threshold', () => {
    const rules: PricingRules = {
      ...SPANISH_TOWN_RULES,
      smallOrderThresholdJmd: 1500,
      smallOrderFeeJmd: 400,
    };
    const result = buildOrderPricing({
      subtotal: 900,
      distanceKm: 1,
      rules,
      paymentMethod: 'cash',
      taxRatePercent: 0,
      platformTaxRatePercent: 0,
      platformGctEnabled: false,
    });
    expect(result.smallOrderFee).toBe(400);
    expect(result.customerTotal).toBe(
      900 + result.serviceFee + result.deliveryFee + 400,
    );
  });
});
