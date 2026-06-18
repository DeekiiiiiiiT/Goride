/**
 * Haulage fare quote builder.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadFareRules } from "../fare/rules.ts";
import { getRouteEstimate } from "../fare/routing.ts";
import { gridCellKey } from "../fare/buildQuote.ts";
import { resolveFareRulesDbForQuote } from "../../_shared/ridesAdminDb.ts";
import type { AggregatedManifest } from "./aggregateManifest.ts";
import {
  HAULAGE_SCHEDULED_QUOTE_TTL_MS,
  itemsFingerprint,
  mintHaulageQuoteToken,
} from "./haulageQuoteToken.ts";

export type HaulageFareBreakdown = {
  base_minor: number;
  weight_minor: number;
  distance_minor: number;
  stairs_multiplier: number;
  prep_surcharge_minor: number;
  fragile_surcharge_minor: number;
  disassembly_surcharge_minor: number;
  surge_multiplier: number;
  total_minor: number;
  currency: string;
};

const STAIRS_MULTIPLIER: Record<string, number> = {
  none: 1,
  "1_flight": 1.25,
  "2_plus": 1.5,
};
const PREP_SURCHARGE_MINOR = 2500;
const FRAGILE_SURCHARGE_MINOR = 1500;
const DISASSEMBLY_SURCHARGE_MINOR = 2000;
const PER_KG_MINOR = 45;

export function isHaulageQuoteEnabled(): boolean {
  return Deno.env.get("HAULAGE_QUOTE_ENABLED") === "1";
}

export function isHaulageCatalogEnabled(): boolean {
  return Deno.env.get("HAULAGE_CATALOG_ENABLED") === "1";
}

export function isHaulageBookingEnabled(): boolean {
  return Deno.env.get("HAULAGE_BOOKING_ENABLED") === "1";
}

export function isHaulageDispatchConstraintsEnabled(): boolean {
  return Deno.env.get("HAULAGE_DISPATCH_CONSTRAINTS_ENABLED") === "1";
}

export async function buildHaulageQuote(
  db: SupabaseClient,
  params: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    stairs_level: string;
    prep_status: string;
    manifest: AggregatedManifest;
    items: { item_id: string; variant_id: string; qty?: number }[];
    scheduled_pickup_at?: string | null;
    readSurge: (cellKey: string) => Promise<number>;
    departureTimeUnix?: number;
  },
) {
  const fareCtx = await resolveFareRulesDbForQuote();
  const rules = await loadFareRules(
    fareCtx.db,
    params.pickupLat,
    params.pickupLng,
    "haulage",
    {
      fareRulesTable: fareCtx.fareRulesTable,
      vehicleTypesTable: fareCtx.vehicleTypesTable,
    },
  );

  const route = await getRouteEstimate(
    params.pickupLat,
    params.pickupLng,
    params.dropoffLat,
    params.dropoffLng,
    params.departureTimeUnix,
  );

  const cellKey = gridCellKey(params.pickupLat, params.pickupLng);
  const surge = await params.readSurge(cellKey);
  const stairs_multiplier = STAIRS_MULTIPLIER[params.stairs_level] ?? 1;
  const prep_surcharge_minor = params.prep_status === "needs_unhooking" ? PREP_SURCHARGE_MINOR : 0;

  let fragile_surcharge_minor = 0;
  let disassembly_surcharge_minor = 0;
  for (const line of params.manifest.lines) {
    if (line.fragile) fragile_surcharge_minor += FRAGILE_SURCHARGE_MINOR;
    if (line.requires_disassembly) disassembly_surcharge_minor += DISASSEMBLY_SURCHARGE_MINOR;
  }

  const base_minor = Number(rules.base_fare_minor) + Number(rules.booking_fee_minor);
  const weight_minor = Math.round(params.manifest.total_weight_kg * PER_KG_MINOR);
  const distance_minor = Math.round(route.distanceKm * Number(rules.price_per_km_minor));
  const subtotal = base_minor + weight_minor + distance_minor + prep_surcharge_minor +
    fragile_surcharge_minor + disassembly_surcharge_minor;
  const total_minor = Math.max(
    Number(rules.min_fare_minor),
    Math.round(subtotal * stairs_multiplier * surge),
  );

  const booking_kind = params.scheduled_pickup_at ? "scheduled" as const : "immediate" as const;
  const breakdown: HaulageFareBreakdown = {
    base_minor,
    weight_minor,
    distance_minor,
    stairs_multiplier,
    prep_surcharge_minor,
    fragile_surcharge_minor,
    disassembly_surcharge_minor,
    surge_multiplier: surge,
    total_minor,
    currency: rules.currency,
  };

  const fingerprint = itemsFingerprint(params.items);
  const ttl = booking_kind === "scheduled" ? HAULAGE_SCHEDULED_QUOTE_TTL_MS : undefined;
  const quote_token = await mintHaulageQuoteToken({
    pickup_lat: params.pickupLat,
    pickup_lng: params.pickupLng,
    dropoff_lat: params.dropoffLat,
    dropoff_lng: params.dropoffLng,
    stairs_level: params.stairs_level,
    prep_status: params.prep_status,
    items_fingerprint: fingerprint,
    distance_km: route.distanceKm,
    duration_minutes: route.durationMinutes,
    fare_estimate_minor: total_minor,
    currency: rules.currency,
    breakdown,
    booking_kind,
    scheduled_pickup_at: params.scheduled_pickup_at ?? null,
    min_body_type_slug: params.manifest.min_body_type_slug,
    total_weight_kg: params.manifest.total_weight_kg,
    manifest_summary: params.manifest.manifest_summary,
  }, ttl);

  return {
    quote_token,
    expires_at: new Date(Date.now() + (ttl ?? 5 * 60_000)).toISOString(),
    min_body_type_slug: params.manifest.min_body_type_slug,
    total_weight_kg: params.manifest.total_weight_kg,
    total_volume_cm3: params.manifest.total_volume_cm3,
    fill_percent: params.manifest.fill_percent,
    recommended_gear: params.manifest.recommended_gear,
    manifest_summary: params.manifest.manifest_summary,
    distance_km: route.distanceKm,
    duration_minutes: route.durationMinutes,
    breakdown,
    booking_kind,
    scheduled_pickup_at: params.scheduled_pickup_at ?? null,
  };
}
