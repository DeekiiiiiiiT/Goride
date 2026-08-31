import { describe, expect, it } from 'vitest';
import {
  buildOrderPricing,
  defaultPricingRules,
  resolveRushPassFreeDelivery,
  validatePricingConfig,
  growthGuaranteeCreditFromCommission,
  jamaicaCalendarMonthsElapsed,
  shouldClawGrowthGuarantee,
  GG_QUALIFYING_ORDER_STATUSES,
} from './index.ts';
import type { MerchantTier, PricingRules } from './types.ts';

const RULES = defaultPricingRules();
const ECONOMY: MerchantTier = { slug: 'economy', name: 'Economy', commissionRate: 0.15 };
const GROWTH: MerchantTier = { slug: 'growth', name: 'Growth', commissionRate: 0.25 };
const DOMINANT: MerchantTier = { slug: 'dominant', name: 'Dominant', commissionRate: 0.30 };

describe('resolveRushPassFreeDelivery', () => {
  it('applies within distance and budget', () => {
    const r = resolveRushPassFreeDelivery({
      planAllowsFreeDelivery: true,
      distanceKm: 5,
      maxFreeDeliveryKm: 8,
      subsidyUsedJmd: 0,
      monthlyBudgetJmd: 1500,
    });
    expect(r.apply).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('denies over distance', () => {
    const r = resolveRushPassFreeDelivery({
      planAllowsFreeDelivery: true,
      distanceKm: 12,
      maxFreeDeliveryKm: 8,
      subsidyUsedJmd: 0,
      monthlyBudgetJmd: 1500,
    });
    expect(r.apply).toBe(false);
    expect(r.reason).toBe('distance');
  });

  it('denies when budget exhausted', () => {
    const r = resolveRushPassFreeDelivery({
      planAllowsFreeDelivery: true,
      distanceKm: 5,
      maxFreeDeliveryKm: 8,
      subsidyUsedJmd: 1500,
      monthlyBudgetJmd: 1500,
    });
    expect(r.apply).toBe(false);
    expect(r.reason).toBe('budget');
  });
});

describe('Pass distance matrix', () => {
  it('free delivery at 5 and 8 km; charged at 12 km with fee cut', () => {
    for (const km of [5, 8]) {
      const b = buildOrderPricing({
        subtotal: 2500,
        distanceKm: km,
        rules: RULES,
        tier: GROWTH,
        taxRatePercent: 15,
        paymentMethod: 'cash',
        freeDelivery: true,
        serviceFeeMultiplier: 0.5,
        rushPassApplied: true,
      });
      expect(b.deliveryFee).toBe(0);
      expect(b.freeDeliveryApplied).toBe(true);
    }
    const far = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 12,
      rules: RULES,
      tier: GROWTH,
      taxRatePercent: 15,
      paymentMethod: 'cash',
      freeDelivery: false,
      serviceFeeMultiplier: 0.5,
      rushPassApplied: true,
    });
    expect(far.deliveryFee).toBeGreaterThan(0);
    expect(far.contributionJmd).toBeGreaterThanOrEqual(
      RULES.guardrails?.minOrderContributionJmd ?? 150,
    );
  });

  it('Economy is unchanged by Pass inputs', () => {
    const base = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 5,
      rules: RULES,
      tier: ECONOMY,
      taxRatePercent: 15,
      paymentMethod: 'cash',
    });
    // Even if caller wrongly passes Pass flags, eligibility is resolver-side;
    // engine still prices when freeDelivery false
    const same = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 5,
      rules: RULES,
      tier: ECONOMY,
      taxRatePercent: 15,
      paymentMethod: 'cash',
      serviceFeeMultiplier: 1,
      rushPassApplied: false,
    });
    expect(same.customerTotal).toBe(base.customerTotal);
  });
});

describe('validatePricingConfig Pass bounds', () => {
  it('rejects unbounded Pass (zero km or budget)', () => {
    const bad: PricingRules = {
      ...RULES,
      rushPass: { maxFreeDeliveryKm: 0, monthlySubsidyBudgetJmd: 1500 },
    };
    expect(validatePricingConfig(bad, [GROWTH, DOMINANT])?.code).toBe('PASS_SUBSIDY_UNBOUNDED');
  });

  it('accepts default bounded Pass with real GCT', () => {
    expect(validatePricingConfig(RULES, [ECONOMY, GROWTH, DOMINANT])).toBeNull();
  });

  // Finding M: plan-write overlay — same validator rejects runaway admin caps
  it('rejects overlay of 25 km / J$1500 Pass caps (subsidy exceeds budget)', () => {
    const overlaid: PricingRules = {
      ...RULES,
      rushPass: { maxFreeDeliveryKm: 25, monthlySubsidyBudgetJmd: 1500 },
    };
    const err = validatePricingConfig(overlaid, [GROWTH, DOMINANT]);
    expect(err?.code).toBe('PASS_CONTRIBUTION_FLOOR');
  });

  it('accepts overlay of live 8 km / J$1500 Pass caps', () => {
    const overlaid: PricingRules = {
      ...RULES,
      rushPass: { maxFreeDeliveryKm: 8, monthlySubsidyBudgetJmd: 1500 },
    };
    expect(validatePricingConfig(overlaid, [ECONOMY, GROWTH, DOMINANT])).toBeNull();
  });
});

describe('validatePricingConfig promo free delivery (Finding N)', () => {
  it('rejects unbounded promo FD caps', () => {
    const bad: PricingRules = {
      ...RULES,
      promoFreeDelivery: { maxFreeDeliveryKm: 0, monthlySubsidyBudgetJmd: 1500 },
    };
    expect(validatePricingConfig(bad, [GROWTH])?.code).toBe('PROMO_FD_SUBSIDY_UNBOUNDED');
  });

  it('rejects promo FD max km where subsidy exceeds monthly budget', () => {
    const bad: PricingRules = {
      ...RULES,
      promoFreeDelivery: { maxFreeDeliveryKm: 25, monthlySubsidyBudgetJmd: 1500 },
    };
    expect(validatePricingConfig(bad, [GROWTH])?.code).toBe('PROMO_FD_CONTRIBUTION_FLOOR');
  });

  it('accepts default 8 km / J$1500 promo FD', () => {
    expect(validatePricingConfig(RULES, [ECONOMY, GROWTH, DOMINANT])).toBeNull();
  });

  it('promo free delivery at 5 km applies; beyond cap charges delivery', () => {
    const near = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 5,
      rules: RULES,
      tier: GROWTH,
      taxRatePercent: 15,
      paymentMethod: 'cash',
      freeDelivery: true,
      rushPassApplied: false,
    });
    expect(near.freeDeliveryApplied).toBe(true);
    expect(near.promoFundedBy).toBe('platform');
    const far = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 12,
      rules: RULES,
      tier: GROWTH,
      taxRatePercent: 15,
      paymentMethod: 'cash',
      freeDelivery: false,
      rushPassApplied: false,
    });
    expect(far.freeDeliveryApplied).toBe(false);
    expect(far.deliveryFee).toBeGreaterThan(0);
  });
});

describe('growthGuaranteeCreditFromCommission', () => {
  it('does not over-credit vs discounted commission', () => {
    // Dominant 30% on discounted 1000 = 300 commission recorded
    const credit = growthGuaranteeCreditFromCommission(300, 0.3, 0.15);
    // = 300 * (1 - 0.15/0.3) = 300 * 0.5 = 150
    expect(credit).toBe(150);
    // Wrong subtotal method on 2000 gross would have been 2000*0.15=300 — we must be lower
    expect(credit).toBeLessThan(300);
  });

  it('qualifying statuses are delivered/completed only', () => {
    expect(GG_QUALIFYING_ORDER_STATUSES.has('pending')).toBe(false);
    expect(GG_QUALIFYING_ORDER_STATUSES.has('delivered')).toBe(true);
    expect(GG_QUALIFYING_ORDER_STATUSES.has('completed')).toBe(true);
  });
});

describe('shouldClawGrowthGuarantee', () => {
  it('posts claw only when prior credit exists and order was qualifying', () => {
    expect(
      shouldClawGrowthGuarantee({
        priorQualifyingStatus: true,
        hasPeriodCredit: true,
        alreadyClawed: false,
        inAssignmentWindow: true,
        clawAmount: 150,
      }),
    ).toBe(true);
  });

  it('no-ops without prior credit, double claw, or pending cancel', () => {
    expect(
      shouldClawGrowthGuarantee({
        priorQualifyingStatus: false,
        hasPeriodCredit: true,
        alreadyClawed: false,
        inAssignmentWindow: true,
        clawAmount: 150,
      }),
    ).toBe(false);
    expect(
      shouldClawGrowthGuarantee({
        priorQualifyingStatus: true,
        hasPeriodCredit: false,
        alreadyClawed: false,
        inAssignmentWindow: true,
        clawAmount: 150,
      }),
    ).toBe(false);
    expect(
      shouldClawGrowthGuarantee({
        priorQualifyingStatus: true,
        hasPeriodCredit: true,
        alreadyClawed: true,
        inAssignmentWindow: true,
        clawAmount: 150,
      }),
    ).toBe(false);
  });
});

describe('jamaicaCalendarMonthsElapsed', () => {
  it('counts calendar months without 30.4375 drift', () => {
    // Assigned Jan 15 → period end Jul 1 (6 months later start of July) = 5 full months elapsed
    const n = jamaicaCalendarMonthsElapsed(
      '2026-01-15T05:00:00.000Z',
      '2026-07-01T05:00:00.000Z',
    );
    expect(n).toBe(5);
  });
});
