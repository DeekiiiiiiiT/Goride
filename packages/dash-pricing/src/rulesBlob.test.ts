import { describe, expect, it } from 'vitest';
import {
  defaultPricingRules,
  parsePricingRules,
  serializePricingRules,
} from './engine.ts';
import {
  normalizeRulesBlob,
  validatePartyRules,
} from './rulesBlob.ts';

describe('normalizeRulesBlob', () => {
  it('strips retired max_fee / hard_min / commission_base', () => {
    const nested = normalizeRulesBlob({
      pricing_v2_enabled: true,
      commission_base: 'marketplace',
      service_fee: { mode: 'marginal', avg_rate: 0.115 },
      courier_delivery_share: 0.75,
      courier_base_pay_jmd: 150,
      hard_min_order_subtotal_jmd: 600,
      delivery: {
        base_fee_jmd: 400,
        base_jmd: 450,
        included_km: 0,
        per_extra_km_jmd: 60,
        max_fee_jmd: 1500,
      },
      customer: {
        hard_min_order_subtotal_jmd: 600,
        delivery: { max_fee_jmd: 1500, base_jmd: 450, included_km: 0, per_km_jmd: 60 },
      },
      platform: { commission_base: 'marketplace', max_menu_inflation_percent: 0.25 },
    });
    expect(nested.platform?.pricing_v2_enabled).toBeUndefined();
    expect((nested.platform as Record<string, unknown>)?.commission_base).toBeUndefined();
    expect(nested.customer?.hard_min_order_subtotal_jmd).toBeUndefined();
    expect((nested.customer?.delivery as Record<string, unknown>)?.max_fee_jmd).toBeUndefined();
    expect((nested.customer?.delivery as Record<string, unknown>)?.base_fee_jmd).toBeUndefined();
    expect((nested.customer?.delivery as Record<string, unknown>)?.base_jmd).toBe(450);
    expect(nested.rider?.courier_delivery_share).toBeUndefined();
  });
});

describe('parsePricingRules', () => {
  it('reads base_jmd and ignores max_fee', () => {
    const parsed = parsePricingRules({
      customer: {
        delivery: {
          base_jmd: 450,
          included_km: 0,
          per_km_jmd: 60,
          max_fee_jmd: 1500,
        },
      },
      rider: {
        courier_base_pay_jmd: 150,
        courier_per_km_jmd: 60,
        courier_min_pay_jmd: 350,
      },
      guardrails: {
        min_delivery_margin_jmd: 100,
        min_order_contribution_jmd: 150,
      },
    });
    expect(parsed.delivery.baseJmd).toBe(450);
    expect(parsed.delivery.includedKm).toBe(0);
    expect((parsed.delivery as Record<string, unknown>).maxFeeJmd).toBeUndefined();
    expect(parsed.guardrails?.minDeliveryMarginJmd).toBe(100);
  });

  it('round-trips serialize → parse', () => {
    const rules = defaultPricingRules();
    const again = parsePricingRules(serializePricingRules(rules));
    expect(again.delivery.baseJmd).toBe(450);
    expect(again.delivery.includedKm).toBe(0);
    expect(again.minOrderSubtotalJmd).toBe(600);
    expect(again.smallOrderThresholdJmd).toBe(800);
  });
});

describe('validatePartyRules', () => {
  it('accepts default customer rules', () => {
    expect(validatePartyRules('customer', defaultPricingRules())).toBeNull();
  });
});
