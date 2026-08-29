import type {
  MerchantTierRow,
  PricingLayerResponse,
  PricingParty,
  PricingRulesPayload,
} from '@roam/dash-admin-client';

export const PARTY_META: Record<
  PricingParty,
  { label: string; description: string; accent: string }
> = {
  customer: {
    label: 'Customer rules',
    description: 'Service fee, delivery charges, min order, card processing, promos',
    accent: 'border-sky-800/60',
  },
  partner: {
    label: 'Partner rules',
    description: 'Commission tiers — managed on Merchant Tiers tab',
    accent: 'border-violet-800/60',
  },
  rider: {
    label: 'Rider rules',
    description: 'Courier share, COD threshold, distance multiplier',
    accent: 'border-emerald-800/60',
  },
  platform: {
    label: 'Platform engine',
    description: 'Model B enablement and legacy tax rate in blob',
    accent: 'border-amber-800/60',
  },
};

export function formatJmd(n: number) {
  return `J$${Math.round(n).toLocaleString()}`;
}

export function layerLabel(source: string | undefined): string {
  if (!source || source === 'default') return 'Default';
  if (source === 'parish') return 'Parish';
  if (source === 'town') return 'Town';
  return source;
}

/** Effective flat payload for party edit forms (from API resolved + effective_rules). */
export function partyFormSeed(
  party: PricingParty,
  layer: PricingLayerResponse | null,
): PricingRulesPayload {
  const effective = layer?.effective_rules ?? layer?.rules ?? {};
  const resolved = layer?.resolved ?? {};

  if (party === 'customer') {
    const c = (resolved.customer ?? effective.customer ?? effective) as Record<string, unknown>;
    return {
      service_fee: (c.service_fee ?? effective.service_fee) as PricingRulesPayload['service_fee'],
      delivery: (c.delivery ?? effective.delivery) as PricingRulesPayload['delivery'],
      min_order_subtotal_jmd: Number(
        c.min_order_subtotal_jmd ?? effective.min_order_subtotal_jmd ?? 800,
      ),
      hard_min_order_subtotal_jmd: Number(
        c.hard_min_order_subtotal_jmd ?? effective.hard_min_order_subtotal_jmd ?? 400,
      ),
      small_order_threshold_jmd: Number(
        c.small_order_threshold_jmd ?? effective.small_order_threshold_jmd ?? 1500,
      ),
      small_order_fee_jmd: Number(
        c.small_order_fee_jmd ?? effective.small_order_fee_jmd ?? 400,
      ),
      card_processing_fee_percent: Number(
        c.card_processing_fee_percent ?? effective.card_processing_fee_percent ?? 0.045,
      ),
      launch_promos: (c.launch_promos ?? effective.launch_promos) as PricingRulesPayload['launch_promos'],
    };
  }

  if (party === 'rider') {
    const r = (resolved.rider ?? effective.rider ?? effective) as Record<string, unknown>;
    return {
      courier_delivery_share: Number(
        r.courier_delivery_share ?? effective.courier_delivery_share ?? 0.8,
      ),
      courier_base_pay_jmd: Number(
        r.courier_base_pay_jmd ?? effective.courier_base_pay_jmd ?? 250,
      ),
      courier_per_km_jmd: Number(
        r.courier_per_km_jmd ?? effective.courier_per_km_jmd ?? 80,
      ),
      courier_min_pay_jmd: Number(
        r.courier_min_pay_jmd ?? effective.courier_min_pay_jmd ?? 350,
      ),
      cod: (r.cod ?? effective.cod) as PricingRulesPayload['cod'],
      road_distance_multiplier: Number(
        r.road_distance_multiplier ?? effective.road_distance_multiplier ?? 1.4,
      ),
      tip_processing_from_rider:
        r.tip_processing_from_rider != null
          ? Boolean(r.tip_processing_from_rider)
          : effective.tip_processing_from_rider ?? true,
    };
  }

  if (party === 'platform') {
    const p = (resolved.platform ?? effective.platform ?? effective) as Record<string, unknown>;
    return {
      pricing_v2_enabled: Boolean(
        p.pricing_v2_enabled ?? effective.pricing_v2_enabled ?? false,
      ),
      // Statutory GCT is Accounting → GCT — do not seed tax_rate_percent (was resurrecting 16.5)
    };
  }

  const pt = (resolved.partner ?? effective.partner ?? {}) as Record<string, unknown>;
  return {
    partner: pt,
    default_tier_slug: pt.default_tier_slug as string | undefined,
  } as PricingRulesPayload;
}

export function partyPreviewMetrics(
  party: PricingParty,
  layer: PricingLayerResponse | null,
  tiers: MerchantTierRow[],
): Array<{ label: string; value: string }> {
  const seed = partyFormSeed(party, layer);
  if (party === 'customer') {
    const avg = Math.round((seed.service_fee?.avg_rate ?? 0.15) * 1000) / 10;
    return [
      { label: 'Service avg', value: `${avg}%` },
      { label: 'Min order', value: formatJmd(seed.min_order_subtotal_jmd ?? 800) },
      {
        label: 'Base delivery',
        value: formatJmd(seed.delivery?.base_fee_jmd ?? 400),
      },
    ];
  }
  if (party === 'rider') {
    return [
      {
        label: 'Courier share',
        value: `${Math.round((seed.courier_delivery_share ?? 0.8) * 100)}%`,
      },
      {
        label: 'COD pause',
        value: formatJmd(seed.cod?.pause_threshold_jmd ?? 10000),
      },
      {
        label: 'Road mult',
        value: `${seed.road_distance_multiplier ?? 1.4}×`,
      },
    ];
  }
  if (party === 'platform') {
    return [
      {
        label: 'Model',
        value: seed.pricing_v2_enabled ? 'Model B' : 'Legacy A',
      },
      { label: 'Tax in blob', value: 'deprecated — Accounting GCT' },
    ];
  }
  const tierLine = tiers
    .slice(0, 3)
    .map((t) => `${t.name} ${Math.round(Number(t.commission_rate) * 100)}%`)
    .join(' · ');
  return [
    { label: 'Tiers', value: tierLine || '—' },
    {
      label: 'Merchants',
      value: String(tiers.reduce((n, t) => n + Number(t.merchant_count ?? 0), 0)),
    },
  ];
}

/** Build party-scoped save payload from form state. */
export function partySavePayload(
  party: PricingParty,
  form: PricingRulesPayload,
): PricingRulesPayload {
  if (party === 'customer') {
    return {
      service_fee: { ...form.service_fee, mode: 'marginal' },
      delivery: form.delivery,
      min_order_subtotal_jmd: form.min_order_subtotal_jmd,
      hard_min_order_subtotal_jmd: form.hard_min_order_subtotal_jmd,
      small_order_threshold_jmd: form.small_order_threshold_jmd,
      small_order_fee_jmd: form.small_order_fee_jmd,
      card_processing_fee_percent: form.card_processing_fee_percent,
      launch_promos: form.launch_promos,
    };
  }
  if (party === 'rider') {
    return {
      courier_delivery_share: form.courier_delivery_share,
      courier_base_pay_jmd: form.courier_base_pay_jmd,
      courier_per_km_jmd: form.courier_per_km_jmd,
      courier_min_pay_jmd: form.courier_min_pay_jmd,
      cod: form.cod,
      road_distance_multiplier: form.road_distance_multiplier,
      tip_processing_from_rider: form.tip_processing_from_rider,
    };
  }
  if (party === 'platform') {
    return {
      pricing_v2_enabled: form.pricing_v2_enabled,
    };
  }
  return {
    default_tier_slug: (form as { default_tier_slug?: string }).default_tier_slug,
  };
}

export const MARKET_RULE_PARTIES: PricingParty[] = ['customer', 'partner', 'rider', 'platform'];
