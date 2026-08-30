/**
 * Architecture acceptance: live target config must pass validatePricingConfig
 * and keep delivery margin / tier monotonicity invariants.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOrderPricing,
  defaultPricingRules,
  parsePricingRules,
  resolveCourierPayLadder,
  resolveDeliveryFee,
  validatePricingConfig,
} from './engine.ts';
import type { MerchantTier } from './types.ts';

/** Production reseed blob shape (20260830300000). */
const LIVE_BLOB = {
  platform: { max_menu_inflation_percent: 0.25 },
  customer: {
    delivery: { base_jmd: 450, included_km: 0, per_km_jmd: 60, per_extra_km_jmd: 60 },
    service_fee: {
      mode: 'marginal',
      avg_rate: 0.115,
      override_rate: 0.085,
      override_threshold_jmd: 5000,
      min_jmd: 150,
      max_jmd: 2500,
    },
    min_order_subtotal_jmd: 600,
    small_order_threshold_jmd: 800,
    small_order_fee_jmd: 150,
    card_processing_fee_percent: 0.045,
    launch_promos: { free_delivery_first_n_orders: 0 },
  },
  rider: {
    courier_base_pay_jmd: 150,
    courier_per_km_jmd: 60,
    courier_min_pay_jmd: 350,
    road_distance_multiplier: 1.4,
    tip_processing_from_rider: true,
    cod: { pause_threshold_jmd: 10000 },
  },
  guardrails: {
    min_delivery_margin_jmd: 100,
    min_order_contribution_jmd: 150,
  },
};

const TIERS: MerchantTier[] = [
  { slug: 'economy', name: 'Economy', commissionRate: 0.15, defaultDeliveryRadiusKm: 6 },
  { slug: 'growth', name: 'Growth', commissionRate: 0.25, defaultDeliveryRadiusKm: 10 },
  { slug: 'dominant', name: 'Dominant', commissionRate: 0.30, defaultDeliveryRadiusKm: 15 },
];

describe('architecture acceptance', () => {
  const rules = parsePricingRules(LIVE_BLOB);

  it('matches defaultPricingRules delivery economics', () => {
    const d = defaultPricingRules();
    expect(rules.delivery.baseJmd).toBe(d.delivery.baseJmd);
    expect(rules.delivery.includedKm).toBe(0);
    expect(rules.courierBasePayJmd).toBe(150);
  });

  it('validatePricingConfig passes', () => {
    expect(validatePricingConfig(rules, TIERS)).toBeNull();
  });

  it('rejects per_km below courier (negative test)', () => {
    const bad = parsePricingRules({
      ...LIVE_BLOB,
      customer: {
        ...LIVE_BLOB.customer,
        delivery: { ...LIVE_BLOB.customer.delivery, per_km_jmd: 10, per_extra_km_jmd: 10 },
      },
    });
    expect(validatePricingConfig(bad, TIERS)?.code).toBe('PER_KM_BELOW_COST');
  });

  it('delivery margin >= 160 at every km 1..100', () => {
    for (let km = 1; km <= 100; km++) {
      const fee = resolveDeliveryFee(rules.delivery, km);
      const courier = resolveCourierPayLadder(rules, km).total;
      expect(fee - courier).toBeGreaterThanOrEqual(160);
    }
  });

  it('contribution monotone and customer total identical across tiers', () => {
    for (const basket of [800, 2500, 10000]) {
      const priced = TIERS.map((tier) =>
        buildOrderPricing({
          subtotal: basket,
          distanceKm: 5,
          rules,
          tier,
          taxRatePercent: 0.15,
          paymentMethod: 'cash',
        }),
      );
      expect(priced[1]!.contributionJmd).toBeGreaterThan(priced[0]!.contributionJmd);
      expect(priced[2]!.contributionJmd).toBeGreaterThan(priced[1]!.contributionJmd);
      expect(priced[0]!.customerTotal).toBe(priced[1]!.customerTotal);
      expect(priced[1]!.customerTotal).toBe(priced[2]!.customerTotal);
      expect(priced[0]!.contributionJmd).toBeGreaterThanOrEqual(150);
    }
  });

  it('worst case Dominant J$600 / 50 km stays profitable', () => {
    const b = buildOrderPricing({
      subtotal: 600,
      distanceKm: 50,
      rules,
      tier: TIERS[2],
      taxRatePercent: 0.15,
      paymentMethod: 'cash',
    });
    expect(b.contributionJmd).toBeGreaterThan(0);
    expect(b.deliveryFeePlatformAmount).toBeGreaterThanOrEqual(160);
  });
});
