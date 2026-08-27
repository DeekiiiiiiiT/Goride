import { describe, expect, it } from 'vitest';
import {
  buildOrderPricing,
  resolveDeliveryFee,
  resolveDeliverySplit,
  resolveMarginalServiceFee,
  resolveMinOrderSubtotal,
  resolveProcessingFee,
  resolveServiceFee,
  defaultPricingRules,
} from './engine.ts';
import type { PricingRules } from './types.ts';

const SPANISH_TOWN_RULES = defaultPricingRules();

const MARGINAL_RULES: PricingRules = {
  ...defaultPricingRules(),
  pricingV2Enabled: true,
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
};

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
    expect(resolveMarginalServiceFee(rules, 1200)).toBe(180); // 15% × 1200
  });

  it('applies bracketed rate above threshold', () => {
    // 5000 × 15% + 1000 × 9% = 750 + 90 = 840
    expect(resolveMarginalServiceFee(rules, 6000)).toBe(840);
  });

  it('caps at max for huge orders', () => {
    // raw would be 5000×0.15 + 55000×0.09 = 750 + 4950 = 5700 → cap 2500
    expect(resolveMarginalServiceFee(rules, 60000)).toBe(2500);
  });

  it('floors at min for tiny orders', () => {
    expect(resolveMarginalServiceFee(rules, 400)).toBe(150); // 15% × 400 = 60 → floor 150
  });
});

describe('resolveServiceFee', () => {
  it('charges flat J$120 by default', () => {
    expect(resolveServiceFee(SPANISH_TOWN_RULES.serviceFee, 2500)).toBe(120);
  });

  it('respects min/max for percent mode', () => {
    const percentRules = { ...SPANISH_TOWN_RULES.serviceFee, mode: 'percent' as const, percent: 0.05 };
    expect(resolveServiceFee(percentRules, 1000)).toBe(100);
    expect(resolveServiceFee(percentRules, 5000)).toBe(200);
  });

  it('returns 0 when waived', () => {
    expect(resolveServiceFee(MARGINAL_RULES.serviceFee, 2500, null, true)).toBe(0);
  });

  it('uses merchant override when present', () => {
    expect(
      resolveServiceFee(MARGINAL_RULES.serviceFee, 2500, { mode: 'flat', amount: 99 }),
    ).toBe(99);
  });
});

describe('resolveProcessingFee', () => {
  it('returns 0 for COD', () => {
    expect(resolveProcessingFee(1000, 0.045, 'cash')).toBe(0);
  });

  it('computes card fee on order total', () => {
    expect(resolveProcessingFee(1000, 0.045, 'wipay')).toBe(45);
  });

  it('computes PayPal fee', () => {
    expect(resolveProcessingFee(200, 0.045, 'wipay')).toBe(9);
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

describe('buildOrderPricing — Spanish Town fixture (legacy flat)', () => {
  it('computes full breakdown for 3.2 km, J$2500 subtotal, standard tier', () => {
    const result = buildOrderPricing({
      subtotal: 2500,
      discount: 0,
      distanceKm: 3.2,
      rules: SPANISH_TOWN_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      taxRatePercent: 16.5,
    });

    expect(result.deliveryFee).toBe(520);
    expect(result.serviceFee).toBe(120);
    expect(result.merchantCommissionAmount).toBe(500);
    expect(result.orderTotal).toBe(3552.5);
    expect(result.processingFee).toBe(0);
    expect(result.customerTotal).toBe(3552.5);
    expect(result.total).toBe(3552.5);
  });

  it('zeros delivery for first-N launch promo', () => {
    const result = buildOrderPricing({
      subtotal: 1500,
      distanceKm: 3,
      rules: SPANISH_TOWN_RULES,
      tier: { slug: 'basic', name: 'Basic', commissionRate: 0.12 },
      customerOrderCount: 1,
      taxRatePercent: 16.5,
    });
    expect(result.freeDeliveryApplied).toBe(true);
    expect(result.deliveryFee).toBe(0);
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
    });
    expect(result.serviceFee).toBe(180);
    expect(result.tax).toBe(198); // 16.5% × 1200
    expect(result.orderTotal).toBe(1978); // 1200 + 180 + 400 + 198
    expect(result.processingFee).toBe(89.01); // 4.5% × 1978
    expect(result.customerTotal).toBe(2067.01);
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
    });
    expect(result.processingFee).toBe(0);
    expect(result.customerTotal).toBe(result.orderTotal);
  });

  it('fee waiver skips service fee and min floor', () => {
    const result = buildOrderPricing({
      subtotal: 1200,
      discount: 0,
      distanceKm: 2,
      rules: MARGINAL_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
      serviceFeeWaived: true,
      taxRatePercent: 16.5,
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
    });
    // fee on 5000 not 6000 → 5000 × 15% = 750
    expect(result.serviceFee).toBe(750);
  });
});
