/**
 * Three-party pricing rules blob: normalize, serialize, merge, provenance.
 * DB stores nested JSON; engine consumes flat PricingRules.
 */
import type {
  CodRules,
  CustomerRulesBlob,
  DeliveryFeeRules,
  LaunchPromoRules,
  NestedRulesBlob,
  PartnerRulesBlob,
  PlatformRulesBlob,
  PricingParty,
  PricingRules,
  RiderRulesBlob,
  ServiceFeeRules,
} from './types.ts';
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge two plain objects; later wins. */
export function deepMergeObjects(
  ...layers: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const mergeTwo = (
    base: Record<string, unknown>,
    over: Record<string, unknown>,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(over)) {
      if (value === undefined) continue;
      const prev = out[key];
      if (isPlainObject(prev) && isPlainObject(value)) {
        out[key] = mergeTwo(prev, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  let acc: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    acc = mergeTwo(acc, layer);
  }
  return acc;
}

const FLAT_TO_PARTY: Array<{ party: PricingParty; key: string; nestedKey?: string }> = [
  { party: 'platform', key: 'pricing_v2_enabled' },
  { party: 'platform', key: 'tax_rate_percent' },
  { party: 'platform', key: 'max_menu_inflation_percent' },
  { party: 'customer', key: 'service_fee' },
  { party: 'customer', key: 'min_order_subtotal_jmd' },
  { party: 'customer', key: 'hard_min_order_subtotal_jmd' },
  { party: 'customer', key: 'small_order_threshold_jmd' },
  { party: 'customer', key: 'small_order_fee_jmd' },
  { party: 'customer', key: 'card_processing_fee_percent' },
  { party: 'customer', key: 'launch_promos' },
  { party: 'customer', key: 'delivery' },
  { party: 'rider', key: 'courier_delivery_share' },
  { party: 'rider', key: 'courier_base_pay_jmd' },
  { party: 'rider', key: 'courier_per_km_jmd' },
  { party: 'rider', key: 'courier_min_pay_jmd' },
  { party: 'rider', key: 'cod' },
  { party: 'rider', key: 'road_distance_multiplier' },
  { party: 'rider', key: 'tip_processing_from_rider' },
  { party: 'partner', key: 'default_tier_slug' },
];

/** Lift legacy flat keys into party namespaces. Nested keys win over flat. */
export function normalizeRulesBlob(
  raw: Record<string, unknown> | null | undefined,
): NestedRulesBlob {
  if (!raw || !isPlainObject(raw)) {
    return {};
  }

  const platform: Record<string, unknown> = isPlainObject(raw.platform)
    ? { ...raw.platform }
    : {};
  const customer: Record<string, unknown> = isPlainObject(raw.customer)
    ? { ...raw.customer }
    : {};
  const rider: Record<string, unknown> = isPlainObject(raw.rider) ? { ...raw.rider } : {};
  const partner: Record<string, unknown> = isPlainObject(raw.partner)
    ? { ...raw.partner }
    : {};

  for (const { party, key } of FLAT_TO_PARTY) {
    if (raw[key] === undefined) continue;
    const target =
      party === 'platform' ? platform
      : party === 'customer' ? customer
      : party === 'rider' ? rider
      : partner;
    if (target[key] === undefined) {
      target[key] = raw[key];
    }
  }

  if (partner.default_tier_slug === undefined && raw.default_tier_slug !== undefined) {
    partner.default_tier_slug = raw.default_tier_slug;
  }

  return {
    platform: Object.keys(platform).length ? platform : undefined,
    customer: Object.keys(customer).length ? customer : undefined,
    rider: Object.keys(rider).length ? rider : undefined,
    partner: Object.keys(partner).length ? partner : undefined,
  };
}

/** Flat PricingRules → nested blob for DB writes. */
export function serializePricingRulesNested(rules: PricingRules): NestedRulesBlob {
  const sf = rules.serviceFee;
  return {
    platform: {
      pricing_v2_enabled: rules.pricingV2Enabled ?? true,
      max_menu_inflation_percent: rules.maxMenuInflationPercent ?? 0.25,
    },
    customer: {
      service_fee: {
        mode: sf.mode,
        flat_jmd: sf.flatJmd,
        percent: sf.percent,
        min_jmd: sf.minJmd,
        max_jmd: sf.maxJmd,
        avg_rate: sf.avgRate,
        override_rate: sf.overrideRate,
        override_threshold_jmd: sf.overrideThresholdJmd,
      },
      delivery: {
        base_fee_jmd: rules.delivery.baseFeeJmd,
        included_km: rules.delivery.includedKm,
        per_extra_km_jmd: rules.delivery.perExtraKmJmd,
        max_fee_jmd: rules.delivery.maxFeeJmd,
      },
      min_order_subtotal_jmd: rules.minOrderSubtotalJmd,
      hard_min_order_subtotal_jmd: rules.hardMinOrderSubtotalJmd,
      small_order_threshold_jmd: rules.smallOrderThresholdJmd,
      small_order_fee_jmd: rules.smallOrderFeeJmd,
      card_processing_fee_percent: rules.cardProcessingFeePercent,
      launch_promos: {
        free_delivery_first_n_orders: rules.launchPromos?.freeDeliveryFirstNOrders ?? 0,
      },
    },
    rider: {
      courier_delivery_share: rules.courierDeliveryShare,
      courier_base_pay_jmd: rules.courierBasePayJmd,
      courier_per_km_jmd: rules.courierPerKmJmd,
      courier_min_pay_jmd: rules.courierMinPayJmd,
      cod: {
        pause_threshold_jmd: rules.cod?.pauseThresholdJmd ?? 10000,
      },
      road_distance_multiplier: rules.roadDistanceMultiplier ?? 1.4,
      tip_processing_from_rider: rules.tipProcessingFromRider ?? true,
    },
    partner: {},
  };
}

/** Merge party partial update into existing blob. */
export function mergePartyRulesBlob(
  existing: Record<string, unknown> | null | undefined,
  party: PricingParty,
  partial: Record<string, unknown>,
): NestedRulesBlob {
  const normalized = normalizeRulesBlob(existing);
  const sectionKey = party as keyof NestedRulesBlob;
  const currentSection = (normalized[sectionKey] ?? {}) as Record<string, unknown>;
  const merged = deepMergeObjects(currentSection, partial);
  return normalizeRulesBlob({
    ...flattenNestedToLegacy(normalized),
    [sectionKey]: merged,
  });
}

/** Nested blob → flat legacy root keys (for layer merge compatibility). */
export function flattenNestedToLegacy(blob: NestedRulesBlob): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const platform = blob.platform ?? {};
  const customer = blob.customer ?? {};
  const rider = blob.rider ?? {};
  const partner = blob.partner ?? {};

  if (platform.pricing_v2_enabled !== undefined) {
    out.pricing_v2_enabled = platform.pricing_v2_enabled;
  }
  if (platform.tax_rate_percent !== undefined) {
    out.tax_rate_percent = platform.tax_rate_percent;
  }
  if (platform.max_menu_inflation_percent !== undefined) {
    out.max_menu_inflation_percent = platform.max_menu_inflation_percent;
  }
  if (customer.service_fee !== undefined) out.service_fee = customer.service_fee;
  if (customer.delivery !== undefined) out.delivery = customer.delivery;
  if (customer.min_order_subtotal_jmd !== undefined) {
    out.min_order_subtotal_jmd = customer.min_order_subtotal_jmd;
  }
  if (customer.hard_min_order_subtotal_jmd !== undefined) {
    out.hard_min_order_subtotal_jmd = customer.hard_min_order_subtotal_jmd;
  }
  if (customer.small_order_threshold_jmd !== undefined) {
    out.small_order_threshold_jmd = customer.small_order_threshold_jmd;
  }
  if (customer.small_order_fee_jmd !== undefined) {
    out.small_order_fee_jmd = customer.small_order_fee_jmd;
  }
  if (customer.card_processing_fee_percent !== undefined) {
    out.card_processing_fee_percent = customer.card_processing_fee_percent;
  }
  if (customer.launch_promos !== undefined) out.launch_promos = customer.launch_promos;
  if (rider.courier_delivery_share !== undefined) {
    out.courier_delivery_share = rider.courier_delivery_share;
  }
  if (rider.courier_base_pay_jmd !== undefined) {
    out.courier_base_pay_jmd = rider.courier_base_pay_jmd;
  }
  if (rider.courier_per_km_jmd !== undefined) {
    out.courier_per_km_jmd = rider.courier_per_km_jmd;
  }
  if (rider.courier_min_pay_jmd !== undefined) {
    out.courier_min_pay_jmd = rider.courier_min_pay_jmd;
  }
  if (rider.cod !== undefined) out.cod = rider.cod;
  if (rider.road_distance_multiplier !== undefined) {
    out.road_distance_multiplier = rider.road_distance_multiplier;
  }
  if (rider.tip_processing_from_rider !== undefined) {
    out.tip_processing_from_rider = rider.tip_processing_from_rider;
  }
  if (partner.default_tier_slug !== undefined) {
    out.default_tier_slug = partner.default_tier_slug;
  }

  if (blob.platform) out.platform = blob.platform;
  if (blob.customer) out.customer = blob.customer;
  if (blob.rider) out.rider = blob.rider;
  if (blob.partner) out.partner = blob.partner;

  return out;
}

export type LayerLabel = 'default' | 'parish' | 'town';

export type RulesProvenance = Partial<Record<PricingParty, Record<string, LayerLabel>>>;

/** Walk merged nested blob; attribute each leaf to the winning layer. */
export function computeRulesProvenance(
  layers: Array<{ label: LayerLabel; blob: Record<string, unknown> | null }>,
): RulesProvenance {
  const provenance: RulesProvenance = {};
  const partyKeys: PricingParty[] = ['platform', 'customer', 'rider', 'partner'];

  const setPath = (party: PricingParty, path: string, label: LayerLabel) => {
    if (!provenance[party]) provenance[party] = {};
    provenance[party]![path] = label;
  };

  const walk = (
    party: PricingParty,
    path: string,
    values: Array<{ label: LayerLabel; value: unknown }>,
  ) => {
    const winner = [...values].reverse().find((v) => v.value !== undefined);
    if (winner) setPath(party, path, winner.label);
  };

  for (const party of partyKeys) {
    for (const { label, blob } of layers) {
      if (!blob) continue;
      const normalized = normalizeRulesBlob(blob);
      const section = normalized[party];
      if (!isPlainObject(section)) continue;

      const collectLeaves = (
        obj: Record<string, unknown>,
        prefix: string,
        layerLabel: LayerLabel,
        acc: Map<string, Array<{ label: LayerLabel; value: unknown }>>,
      ) => {
        for (const [k, v] of Object.entries(obj)) {
          const p = prefix ? `${prefix}.${k}` : k;
          if (isPlainObject(v)) {
            collectLeaves(v, p, layerLabel, acc);
          } else {
            const list = acc.get(p) ?? [];
            list.push({ label: layerLabel, value: v });
            acc.set(p, list);
          }
        }
      };

      const acc = new Map<string, Array<{ label: LayerLabel; value: unknown }>>();
      collectLeaves(section, '', label, acc);
      for (const [path, values] of acc) {
        walk(party, path, values);
      }
    }
  }

  return provenance;
}

/** Extract party section from normalized blob (snake_case keys). */
export function extractPartyBlob(
  blob: NestedRulesBlob,
  party: PricingParty,
): Record<string, unknown> {
  const normalized = normalizeRulesBlob(flattenNestedToLegacy(blob));
  return (normalized[party] ?? {}) as Record<string, unknown>;
}

export function partyPartialToFlatKeys(
  party: PricingParty,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const nested = mergePartyRulesBlob({}, party, partial);
  return flattenNestedToLegacy(nested);
}

/** Validate a single party's rules subset. Returns error message or null. */
export function validatePartyRules(
  party: PricingParty,
  flatRules: PricingRules,
): string | null {
  if (party === 'customer') return validateCustomerRules(flatRules);
  if (party === 'rider') return validateRiderRules(flatRules);
  if (party === 'partner') return validatePartnerRules(flatRules);
  if (party === 'platform') return validatePlatformRules(flatRules);
  return null;
}

export function validateCustomerRules(rules: PricingRules): string | null {
  const sf = rules.serviceFee;
  if (sf.mode === 'marginal') {
    const avg = sf.avgRate ?? 0;
    const override = sf.overrideRate ?? 0;
    if (avg < 0 || avg > 1) return 'avg_rate must be between 0 and 1';
    if (override < 0 || override > 1) return 'override_rate must be between 0 and 1';
    if ((sf.overrideThresholdJmd ?? 0) < 0) return 'override_threshold_jmd must be >= 0';
  }
  const min = sf.minJmd ?? 0;
  const max = sf.maxJmd ?? 99999;
  if (min > max) return 'min_jmd cannot exceed max_jmd';
  if ((rules.minOrderSubtotalJmd ?? 0) < 0) return 'min_order_subtotal_jmd must be >= 0';
  if ((rules.hardMinOrderSubtotalJmd ?? 0) < 0) return 'hard_min_order_subtotal_jmd must be >= 0';
  if ((rules.smallOrderThresholdJmd ?? 0) < 0) return 'small_order_threshold_jmd must be >= 0';
  if ((rules.smallOrderFeeJmd ?? 0) < 0) return 'small_order_fee_jmd must be >= 0';
  const proc = rules.cardProcessingFeePercent ?? 0;
  if (proc < 0 || proc > 0.15) return 'card_processing_fee_percent must be between 0 and 0.15';
  const d = rules.delivery;
  if ((d.baseFeeJmd ?? 0) < 0) return 'delivery.base_fee_jmd must be >= 0';
  if ((d.includedKm ?? 0) < 0) return 'delivery.included_km must be >= 0';
  if ((d.perExtraKmJmd ?? 0) < 0) return 'delivery.per_extra_km_jmd must be >= 0';
  if (d.maxFeeJmd != null && d.maxFeeJmd > 0 && d.maxFeeJmd < d.baseFeeJmd) {
    return 'delivery.max_fee_jmd cannot be below base_fee_jmd';
  }
  const promoN = rules.launchPromos?.freeDeliveryFirstNOrders ?? 0;
  if (promoN < 0 || promoN > 99) return 'free_delivery_first_n_orders must be between 0 and 99';
  return null;
}

export function validateRiderRules(rules: PricingRules): string | null {
  const share = rules.courierDeliveryShare ?? 0;
  if (share < 0 || share > 1) return 'courier_delivery_share must be between 0 and 1';
  if ((rules.courierBasePayJmd ?? 0) < 0) return 'courier_base_pay_jmd must be >= 0';
  if ((rules.courierPerKmJmd ?? 0) < 0) return 'courier_per_km_jmd must be >= 0';
  if ((rules.courierMinPayJmd ?? 0) < 0) return 'courier_min_pay_jmd must be >= 0';
  const roadMult = rules.roadDistanceMultiplier ?? 1.4;
  if (roadMult < 1 || roadMult > 3) return 'road_distance_multiplier must be between 1 and 3';
  const cod = rules.cod?.pauseThresholdJmd ?? 10000;
  if (cod < 0) return 'cod.pause_threshold_jmd must be >= 0';
  return null;
}

export function validatePartnerRules(_rules: PricingRules): string | null {
  return null;
}

export function validatePlatformRules(rules: PricingRules): string | null {
  const taxRate = rules.taxRatePercent ?? 15;
  if (taxRate < 0 || taxRate > 30) return 'tax_rate_percent must be between 0 and 30';
  const maxInflation = rules.maxMenuInflationPercent ?? 0.25;
  if (maxInflation < 0 || maxInflation > 1) return 'max_menu_inflation_percent must be between 0 and 1';
  return null;
}

export function validatePricingRules(rules: PricingRules): string | null {
  return (
    validatePlatformRules(rules)
    ?? validateCustomerRules(rules)
    ?? validateRiderRules(rules)
    ?? validatePartnerRules(rules)
  );
}

/** Resolved party sections from merged flat rules. */
export function resolvePartySections(flat: PricingRules): {
  platform: PlatformRulesBlob;
  customer: CustomerRulesBlob;
  rider: RiderRulesBlob;
  partner: PartnerRulesBlob;
} {
  const nested = serializePricingRulesNested(flat);
  return {
    platform: (nested.platform ?? {}) as PlatformRulesBlob,
    customer: (nested.customer ?? {}) as CustomerRulesBlob,
    rider: (nested.rider ?? {}) as RiderRulesBlob,
    partner: (nested.partner ?? {}) as PartnerRulesBlob,
  };
}
