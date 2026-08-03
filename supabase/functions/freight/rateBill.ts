/**
 * Compute billable amount from rate card strategy + shipment geometry.
 */
import { haversineKm, pointInGeoJson, parseZoneGeoJson, type LatLng } from "../logistics/geo.ts";

export type PricingStrategy = "flat" | "distance_tier" | "zone" | "per_stop";

export type DistanceTier = { upToKm: number; amountMinor: number };
export type ZoneRule = { zoneId: string; amountMinor: number };
export type PerStopRules = { baseMinor: number; perStopMinor: number };

export type RateCardLike = {
  amount_minor?: number | null;
  pricing_strategy?: string | null;
  rules?: Record<string, unknown> | null;
  currency?: string | null;
};

export type ZoneLike = {
  id: string;
  geojson: unknown;
  active?: boolean;
  kind?: string;
};

export function computeDistanceTierAmount(
  distanceKm: number,
  tiers: DistanceTier[],
): number | null {
  const sorted = [...tiers].sort((a, b) => a.upToKm - b.upToKm);
  for (const t of sorted) {
    if (distanceKm <= t.upToKm) return Math.max(0, Math.floor(t.amountMinor));
  }
  // Beyond last band: use last tier amount
  if (sorted.length) return Math.max(0, Math.floor(sorted[sorted.length - 1].amountMinor));
  return null;
}

export function pickZoneAmount(
  point: LatLng,
  zoneRules: ZoneRule[],
  zones: ZoneLike[],
): number | null {
  const byId = new Map(zones.map((z) => [z.id, z]));
  for (const rule of zoneRules) {
    const z = byId.get(rule.zoneId);
    if (!z) continue;
    const geo = parseZoneGeoJson(z.geojson);
    if (geo && pointInGeoJson(point.lng, point.lat, geo)) {
      return Math.max(0, Math.floor(rule.amountMinor));
    }
  }
  return null;
}

export function computeRateCardAmountMinor(input: {
  card: RateCardLike;
  origin: LatLng | null;
  destination: LatLng | null;
  stopCount: number;
  pricingZones?: ZoneLike[];
}): { amountMinor: number; strategy: PricingStrategy; detail: Record<string, unknown> } {
  const strategy = (input.card.pricing_strategy || "flat") as PricingStrategy;
  const rules = (input.card.rules || {}) as Record<string, unknown>;
  const flat = Math.max(0, Math.floor(Number(input.card.amount_minor ?? 0)));

  if (strategy === "flat" || !strategy) {
    return { amountMinor: flat, strategy: "flat", detail: { flat } };
  }

  if (strategy === "distance_tier") {
    const tiers = Array.isArray(rules.tiers) ? (rules.tiers as DistanceTier[]) : [];
    if (!input.origin || !input.destination || !tiers.length) {
      return { amountMinor: flat, strategy, detail: { fallback: "flat", reason: "missing_geo_or_tiers" } };
    }
    const km = haversineKm(input.origin, input.destination);
    const amount = computeDistanceTierAmount(km, tiers);
    return {
      amountMinor: amount ?? flat,
      strategy,
      detail: { distanceKm: km, amount, fallback: amount == null ? flat : undefined },
    };
  }

  if (strategy === "zone") {
    const zoneRules = Array.isArray(rules.zones) ? (rules.zones as ZoneRule[]) : [];
    const zones = input.pricingZones ?? [];
    // Price by pickup (origin) zone match first
    if (input.origin && zoneRules.length) {
      const amount = pickZoneAmount(input.origin, zoneRules, zones);
      if (amount != null) {
        return { amountMinor: amount, strategy, detail: { matched: "origin", amount } };
      }
    }
    if (input.destination && zoneRules.length) {
      const amount = pickZoneAmount(input.destination, zoneRules, zones);
      if (amount != null) {
        return { amountMinor: amount, strategy, detail: { matched: "destination", amount } };
      }
    }
    return { amountMinor: flat, strategy, detail: { fallback: "flat", reason: "no_zone_match" } };
  }

  if (strategy === "per_stop") {
    const baseMinor = Math.max(0, Math.floor(Number(rules.baseMinor ?? 0)));
    const perStopMinor = Math.max(0, Math.floor(Number(rules.perStopMinor ?? 0)));
    const stops = Math.max(0, Math.floor(input.stopCount));
    const amount = baseMinor + perStopMinor * stops;
    return {
      amountMinor: amount > 0 ? amount : flat,
      strategy,
      detail: { baseMinor, perStopMinor, stopCount: stops },
    };
  }

  return { amountMinor: flat, strategy: "flat", detail: { flat, unknownStrategy: strategy } };
}
