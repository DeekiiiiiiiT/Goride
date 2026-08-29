import { describe, expect, it } from 'vitest';
import {
  buildOrderPricing,
  defaultPricingRules,
  mergePricingRuleLayers,
  parsePricingRules,
  serializePricingRules,
} from './engine.ts';
import {
  computeRulesProvenance,
  flattenNestedToLegacy,
  mergePartyRulesBlob,
  normalizeRulesBlob,
  validatePartyRules,
} from './rulesBlob.ts';

describe('normalizeRulesBlob', () => {
  it('lifts legacy flat keys into party namespaces', () => {
    const nested = normalizeRulesBlob({
      pricing_v2_enabled: true,
      service_fee: { mode: 'marginal', avg_rate: 0.15 },
      courier_delivery_share: 0.75,
      delivery: { base_fee_jmd: 400 },
    });
    expect(nested.platform?.pricing_v2_enabled).toBe(true);
    expect(nested.customer?.service_fee).toEqual({ mode: 'marginal', avg_rate: 0.15 });
    expect(nested.customer?.delivery).toEqual({ base_fee_jmd: 400 });
    expect(nested.rider?.courier_delivery_share).toBe(0.75);
  });

  it('prefers nested keys over flat when both present', () => {
    const nested = normalizeRulesBlob({
      courier_delivery_share: 0.5,
      rider: { courier_delivery_share: 0.9 },
    });
    expect(nested.rider?.courier_delivery_share).toBe(0.9);
  });
});

describe('parsePricingRules flat/nested parity', () => {
  const flat = serializePricingRules(defaultPricingRules());

  it('parses legacy flat blob — honours stored values over new defaults', () => {
    const legacy = {
      pricing_v2_enabled: false,
      delivery: { base_fee_jmd: 400, included_km: 2, per_extra_km_jmd: 60, max_fee_jmd: 1500 },
      service_fee: {
        mode: 'marginal',
        avg_rate: 0.15,
        override_rate: 0.09,
        override_threshold_jmd: 5000,
        min_jmd: 150,
        max_jmd: 2500,
      },
      courier_delivery_share: 0.8,
      cod: { pause_threshold_jmd: 10000 },
      min_order_subtotal_jmd: 800,
      card_processing_fee_percent: 0.045,
    };
    const parsed = parsePricingRules(legacy);
    expect(parsed.pricingV2Enabled).toBe(false);
    expect(parsed.minOrderSubtotalJmd).toBe(800);
    expect(parsed.delivery.baseFeeJmd).toBe(400);
    expect(parsed.delivery.includedKm).toBe(2);
    expect(parsed.delivery.perExtraKmJmd).toBe(60);
    expect(parsed.delivery.maxFeeJmd).toBe(1500);
    expect(parsed.serviceFee.mode).toBe('marginal');
    expect(parsed.serviceFee.avgRate).toBe(0.15);
    expect(parsed.courierDeliveryShare).toBe(0.8);
    expect(parsed.cardProcessingFeePercent).toBe(0.045);
    expect(parsed.cod?.pauseThresholdJmd).toBe(10000);
  });

  it('round-trips nested serialize without changing pricing output', () => {
    const parsed = parsePricingRules(flat);
    const before = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 3.2,
      rules: { ...parsed, pricingV2Enabled: true },
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.2 },
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    const roundTripped = parsePricingRules(serializePricingRules(parsed));
    const after = buildOrderPricing({
      subtotal: 2500,
      distanceKm: 3.2,
      rules: { ...roundTripped, pricingV2Enabled: true },
      tier: { slug: 'standard', name: 'Standard', commissionRate: 0.2 },
      taxRatePercent: 16.5,
      platformTaxRatePercent: 16.5,
    });
    expect(after.deliveryFee).toBe(before.deliveryFee);
    expect(after.serviceFee).toBe(before.serviceFee);
    expect(after.customerTotal).toBe(before.customerTotal);
  });
});

describe('mergePricingRuleLayers with nested parties', () => {
  it('town overrides only rider share; customer inherits default', () => {
    const defaultLayer = serializePricingRules(defaultPricingRules());
    const townPartial = {
      rider: { courier_delivery_share: 0.85 },
    };
    const merged = mergePricingRuleLayers(defaultLayer, null, townPartial);
    const rules = parsePricingRules(merged);
    expect(rules.courierDeliveryShare).toBe(0.85);
    expect(rules.serviceFee.avgRate).toBe(0.15);
    expect(rules.delivery.baseFeeJmd).toBe(400);
  });

  it('partial parish rider cod merge does not zero service fee', () => {
    const defaultLayer = serializePricingRules(defaultPricingRules());
    const parishPartial = { rider: { cod: { pause_threshold_jmd: 15000 } } };
    const merged = mergePricingRuleLayers(defaultLayer, parishPartial);
    const rules = parsePricingRules(merged);
    expect(rules.cod?.pauseThresholdJmd).toBe(15000);
    expect(rules.serviceFee.minJmd).toBe(150);
  });
});

describe('mergePartyRulesBlob', () => {
  it('merges customer partial into existing blob', () => {
    const existing = serializePricingRules(defaultPricingRules());
    const updated = mergePartyRulesBlob(existing, 'customer', {
      min_order_subtotal_jmd: 1000,
    });
    const flat = flattenNestedToLegacy(updated);
    expect(flat.min_order_subtotal_jmd).toBe(1000);
    expect(flat.courier_delivery_share).toBe(0.8);
  });
});

describe('computeRulesProvenance', () => {
  it('attributes fields to winning layer', () => {
    const defaultLayer = serializePricingRules(defaultPricingRules());
    const townLayer = { rider: { courier_delivery_share: 0.85 } };
    const merged = mergePricingRuleLayers(defaultLayer, null, townLayer);
    parsePricingRules(merged);
    const prov = computeRulesProvenance([
      { label: 'default', blob: defaultLayer },
      { label: 'town', blob: townLayer },
    ]);
    expect(prov.rider?.courier_delivery_share).toBe('town');
    expect(prov.customer?.['service_fee.avg_rate']).toBe('default');
  });
});

describe('validatePartyRules', () => {
  it('validates rider share bounds', () => {
    const rules = defaultPricingRules();
    rules.courierDeliveryShare = 1.5;
    expect(validatePartyRules('rider', rules)).toMatch(/courier_delivery_share/);
  });
});
