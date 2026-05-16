import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FareRulesInput } from "./compute.ts";

const DEFAULT_CITY = "jamaica";
const CACHE_TTL_MS = 60_000;

const ENV_FALLBACK: FareRulesInput = {
  baseFareMinor: Number(Deno.env.get("ROAM_RIDES_BASE_MINOR") ?? 30000),
  pricePerKmMinor: Number(Deno.env.get("ROAM_RIDES_PER_KM_MINOR") ?? 12000),
  pricePerMinMinor: Number(Deno.env.get("ROAM_RIDES_PER_MIN_MINOR") ?? 5000),
  bookingFeeMinor: Number(Deno.env.get("ROAM_RIDES_BOOKING_FEE_MINOR") ?? 5000),
  minFareMinor: Number(Deno.env.get("ROAM_RIDES_MIN_FARE_MINOR") ?? 50000),
  currency: "JMD",
};

type CacheEntry = { rules: FareRulesInput; city: string; at: number };
const cache = new Map<string, CacheEntry>();

export function resolveCity(_pickupLat: number, _pickupLng: number): string {
  return DEFAULT_CITY;
}

export async function loadFareRules(
  db: SupabaseClient,
  city: string,
  vehicleType: string,
): Promise<FareRulesInput & { city: string; vehicle_type: string }> {
  const key = `${city}:${vehicleType}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.rules, city: hit.city, vehicle_type: vehicleType };
  }

  const { data } = await db.from("fare_rules").select("*").eq("city", city).eq(
    "vehicle_type",
    vehicleType,
  ).eq("is_active", true).maybeSingle();

  if (!data) {
    return { ...ENV_FALLBACK, city, vehicle_type: vehicleType };
  }

  const rules: FareRulesInput = {
    baseFareMinor: Number(data.base_fare_minor),
    pricePerKmMinor: Number(data.price_per_km_minor),
    pricePerMinMinor: Number(data.price_per_min_minor),
    bookingFeeMinor: Number(data.booking_fee_minor ?? 0),
    minFareMinor: Number(data.min_fare_minor),
    currency: String(data.currency ?? "JMD"),
  };
  cache.set(key, { rules, city, at: Date.now() });
  return { ...rules, city, vehicle_type: vehicleType };
}
