import { describe, expect, it } from 'vitest';
import {
  buildOrderPricing,
  resolveDeliveryFee,
  resolveDeliverySplit,
  resolveServiceFee,
  defaultPricingRules,
} from './engine.ts';

const SPANISH_TOWN_RULES = defaultPricingRules();

describe('resolveDeliveryFee', () => {
  it('charges base fee for trips under included km', () => {
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 1.5)).toBe(400);
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 2)).toBe(400);
  });

  it('adds per-km surcharge beyond included distance', () => {
    // 3.2 km → 2 included + 2 extra (ceil) × 60 = 400 + 120 = 520
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 3.2)).toBe(520);
    // 4 km → 2 extra × 60 = 400 + 120 = 520
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, 4)).toBe(520);
  });

  it('falls back to base when distance unknown', () => {
    expect(resolveDeliveryFee(SPANISH_TOWN_RULES.delivery, null)).toBe(400);
  });
});

describe('resolveServiceFee', () => {
  it('charges flat J$120 by default', () => {
    expect(resolveServiceFee(SPANISH_TOWN_RULES.serviceFee, 2500)).toBe(120);
  });

  it('respects min/max for percent mode', () => {
    const percentRules = { ...SPANISH_TOWN_RULES.serviceFee, mode: 'percent' as const, percent: 0.05 };
    expect(resolveServiceFee(percentRules, 1000)).toBe(100); // min
    expect(resolveServiceFee(percentRules, 5000)).toBe(200); // max
  });
});

describe('resolveDeliverySplit', () => {
  it('splits 80/20', () => {
    const split = resolveDeliverySplit(500, 0.8);
    expect(split.courierAmount).toBe(400);
    expect(split.platformAmount).toBe(100);
  });
});

describe('buildOrderPricing — Spanish Town fixture', () => {
  it('computes full breakdown for 3.2 km, J$2500 subtotal, standard tier', () => {
    const result = buildOrderPricing({
      subtotal: 2500,
      discount: 0,
      distanceKm: 3.2,
      rules: SPANISH_TOWN_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      customerOrderCount: 5,
    });

    expect(result.deliveryFee).toBe(520);
    expect(result.serviceFee).toBe(120);
    expect(result.merchantCommissionAmount).toBe(500);
    expect(result.merchantCommissionRate).toBe(0.20);
    expect(result.deliveryFeeCourierAmount).toBe(416);
    expect(result.deliveryFeePlatformAmount).toBe(104);
    expect(result.tax).toBe(412.5);
    expect(result.total).toBe(3552.5);
  });

  it('zeros delivery for first-N launch promo', () => {
    const result = buildOrderPricing({
      subtotal: 1500,
      distanceKm: 3,
      rules: SPANISH_TOWN_RULES,
      tier: { slug: 'basic', name: 'Basic', commissionRate: 0.12 },
      customerOrderCount: 1,
    });
    expect(result.freeDeliveryApplied).toBe(true);
    expect(result.deliveryFee).toBe(0);
  });

  it('applies tier override commission', () => {
    const result = buildOrderPricing({
      subtotal: 2000,
      distanceKm: 2,
      rules: SPANISH_TOWN_RULES,
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.20 },
      merchantCommissionRateOverride: 0.15,
    });
    expect(result.merchantCommissionAmount).toBe(300);
  });
});
