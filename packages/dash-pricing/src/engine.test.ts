import { describe, expect, it } from 'vitest';
import {
  applyRoadDistanceMultiplier,
  buildOrderPricing,
  defaultPricingRules,
  mergePricingRuleLayers,
  resolveContributionJmd,
  resolveDeliveryFee,
  resolveOrderFloorJmd,
  resolveCourierPayLadder,
  resolveServiceFeeDistanceAddon,
  shouldApplyFreeDelivery,
  validatePricingConfig,
} from './engine.ts';
import type { MerchantTier, PricingRules } from './types.ts';

const RULES: PricingRules = defaultPricingRules();

const ECONOMY: MerchantTier = { slug: 'economy', name: 'Economy', commissionRate: 0.15 };
const GROWTH: MerchantTier = { slug: 'growth', name: 'Growth', commissionRate: 0.25 };
const DOMINANT: MerchantTier = { slug: 'dominant', name: 'Dominant', commissionRate: 0.30 };

describe('resolveDeliveryFee', () => {
  it('uses platform base with no free km', () => {
    expect(resolveDeliveryFee(RULES.delivery, null)).toBe(450);
    expect(resolveDeliveryFee(RULES.delivery, 1)).toBe(510);
    expect(resolveDeliveryFee(RULES.delivery, 4)).toBe(690);
    expect(resolveDeliveryFee(RULES.delivery, 20)).toBe(1650);
  });

  it('never caps the customer fee', () => {
    expect(resolveDeliveryFee(RULES.delivery, 100)).toBe(6450);
  });
});

describe('resolveServiceFeeDistanceAddon', () => {
  const addon = { enabled: true, thresholdKm: 5, perKmJmd: 20, maxJmd: 200 };

  it('is zero when disabled or under threshold', () => {
    expect(resolveServiceFeeDistanceAddon({ ...addon, enabled: false }, 30)).toBe(0);
    expect(resolveServiceFeeDistanceAddon(addon, 3)).toBe(0);
    expect(resolveServiceFeeDistanceAddon(addon, 5)).toBe(0);
  });

  it('charges per km past threshold and caps', () => {
    expect(resolveServiceFeeDistanceAddon(addon, 12)).toBe(140); // ceil(7)*20
    expect(resolveServiceFeeDistanceAddon(addon, 30)).toBe(200); // capped
  });
});

describe('Rush Pass service fee multiplier', () => {
  it('halves basket service fee but keeps distance addon', () => {
    const rules: PricingRules = {
      ...RULES,
      serviceFeeDistanceAddon: { enabled: true, thresholdKm: 5, perKmJmd: 20, maxJmd: 200 },
    };
    const base = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 12,
      rules,
      tier: GROWTH,
      taxRatePercent: 0.15,
      paymentMethod: 'cash',
    });
    const pass = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 12,
      rules,
      tier: GROWTH,
      taxRatePercent: 0.15,
      paymentMethod: 'cash',
      freeDelivery: true,
      serviceFeeMultiplier: 0.5,
      rushPassApplied: true,
    });
    expect(pass.serviceFeeDistanceJmd).toBe(base.serviceFeeDistanceJmd);
    expect(pass.freeDeliveryApplied).toBe(true);
    expect(pass.rushPassApplied).toBe(true);
    expect(pass.deliveryFee).toBe(0);
    // Basket portion of service fee is halved
    const baseBasket = base.serviceFee - base.serviceFeeDistanceJmd;
    const passBasket = pass.serviceFee - pass.serviceFeeDistanceJmd;
    expect(passBasket).toBeCloseTo(baseBasket * 0.5, 1);
  });
});

describe('delivery margin invariant', () => {
  it('stays >= 160 from 1..100 km', () => {
    for (let km = 1; km <= 100; km++) {
      const fee = resolveDeliveryFee(RULES.delivery, km);
      const courier = resolveCourierPayLadder(RULES, km).total;
      expect(fee - courier).toBeGreaterThanOrEqual(160);
    }
  });
});

describe('tier ladder monotone', () => {
  it('contribution increases with commission at every basket', () => {
    for (const basket of [800, 1500, 2500, 4000, 10000]) {
      const e = buildOrderPricing({
        subtotal: basket, distanceKm: 5, rules: RULES, tier: ECONOMY,
        taxRatePercent: 0.15, paymentMethod: 'cash',
      });
      const g = buildOrderPricing({
        subtotal: basket, distanceKm: 5, rules: RULES, tier: GROWTH,
        taxRatePercent: 0.15, paymentMethod: 'cash',
      });
      const d = buildOrderPricing({
        subtotal: basket, distanceKm: 5, rules: RULES, tier: DOMINANT,
        taxRatePercent: 0.15, paymentMethod: 'cash',
      });
      expect(g.contributionJmd).toBeGreaterThan(e.contributionJmd);
      expect(d.contributionJmd).toBeGreaterThan(g.contributionJmd);
      // Same customer total when inflation is external (identical subtotals)
      expect(e.customerTotal).toBe(g.customerTotal);
      expect(g.customerTotal).toBe(d.customerTotal);
    }
  });
});

describe('buildOrderPricing', () => {
  it('writes contribution and promo funding', () => {
    const b = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 5,
      rules: RULES,
      tier: ECONOMY,
      taxRatePercent: 0.15,
      paymentMethod: 'wipay',
    });
    expect(b.contributionJmd).toBe(
      resolveContributionJmd({
        merchantCommissionAmount: b.merchantCommissionAmount,
        serviceFee: b.serviceFee,
        deliveryFeePlatformAmount: b.deliveryFeePlatformAmount,
        smallOrderFee: b.smallOrderFee,
      }),
    );
    expect(b.promoFundedBy).toBe('merchant');
    expect(b.deliveryFeeCourierAmount).toBeGreaterThan(0);
  });

  it('does not require tier delivery base', () => {
    expect(() =>
      buildOrderPricing({
        subtotal: 1000,
        distanceKm: 3,
        rules: RULES,
        tier: { slug: 'x', name: 'X', commissionRate: 0.2 },
        taxRatePercent: 0.15,
        paymentMethod: 'cash',
      }),
    ).not.toThrow();
  });
});

describe('validatePricingConfig', () => {
  it('accepts target architecture', () => {
    expect(validatePricingConfig(RULES, [ECONOMY, GROWTH, DOMINANT])).toBeNull();
  });

  it('rejects per_km below courier cost', () => {
    const bad = {
      ...RULES,
      delivery: { ...RULES.delivery, perExtraKmJmd: 30 },
    };
    expect(validatePricingConfig(bad, [ECONOMY]).code).toBe('PER_KM_BELOW_COST');
  });

  it('rejects incoherent floors', () => {
    const bad = {
      ...RULES,
      minOrderSubtotalJmd: 900,
      smallOrderThresholdJmd: 800,
    };
    expect(validatePricingConfig(bad, [ECONOMY]).code).toBe('ORDER_FLOORS_INCOHERENT');
  });

  it('accepts Rush Pass worst-case with distance addon on', () => {
    const withAddon: PricingRules = {
      ...RULES,
      serviceFeeDistanceAddon: {
        enabled: true,
        thresholdKm: 5,
        perKmJmd: 20,
        maxJmd: 200,
      },
    };
    expect(validatePricingConfig(withAddon, [ECONOMY, GROWTH, DOMINANT])).toBeNull();
  });
});

describe('resolveOrderFloorJmd', () => {
  it('uses market floor only', () => {
    expect(resolveOrderFloorJmd(600)).toBe(600);
    expect(resolveOrderFloorJmd(undefined)).toBe(0);
  });
});

describe('shouldApplyFreeDelivery', () => {
  it('never applies when N=0', () => {
    expect(shouldApplyFreeDelivery(RULES, 0)).toBe(false);
  });
});

describe('applyRoadDistanceMultiplier', () => {
  it('defaults to 1.4x', () => {
    expect(applyRoadDistanceMultiplier(10, undefined)).toBe(14);
  });
});

describe('mergePricingRuleLayers', () => {
  it('lets town win over parish over default', () => {
    const merged = mergePricingRuleLayers(
      { delivery: { included_km: 0, per_extra_km_jmd: 60, base_jmd: 450 } },
      { delivery: { included_km: 1 } },
      { delivery: { per_extra_km_jmd: 70 } },
    );
    expect(merged).toEqual({
      delivery: { included_km: 1, per_extra_km_jmd: 70, base_jmd: 450 },
    });
  });
});
