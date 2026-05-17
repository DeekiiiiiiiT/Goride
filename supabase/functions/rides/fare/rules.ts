import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FareRulesInput } from "./compute.ts";
import { locationKeysForFallback } from "./jamaicaLocations.ts";
import { resolvePickupLocation } from "./resolveLocation.ts";
import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  normalizeVehicleType,
  vehicleTypesForFareLookup,
} from "./ridesVehicleTypes.ts";

const CACHE_TTL_MS = 60_000;

const ENV_FALLBACK: FareRulesInput = {
  baseFareMinor: Number(Deno.env.get("ROAM_RIDES_BASE_MINOR") ?? 30000),
  pricePerKmMinor: Number(Deno.env.get("ROAM_RIDES_PER_KM_MINOR") ?? 12000),
  pricePerMinMinor: Number(Deno.env.get("ROAM_RIDES_PER_MIN_MINOR") ?? 5000),
  bookingFeeMinor: Number(Deno.env.get("ROAM_RIDES_BOOKING_FEE_MINOR") ?? 5000),
  estimatedTollsMinor: Number(Deno.env.get("ROAM_RIDES_ESTIMATED_TOLLS_MINOR") ?? 0),
  minFareMinor: Number(Deno.env.get("ROAM_RIDES_MIN_FARE_MINOR") ?? 50000),
  currency: "JMD",
};

type CacheEntry = { rules: FareRulesInput; locationKey: string; at: number };
const cache = new Map<string, CacheEntry>();

export { resolvePickupLocation, resolveCity } from "./resolveLocation.ts";

async function fetchActiveRule(
  db: SupabaseClient,
  locationKey: string,
  vehicleType: string,
) {
  return db.from("fare_rules").select("*").eq("location_key", locationKey).eq(
    "vehicle_type",
    vehicleType,
  ).eq("is_active", true).maybeSingle();
}

export async function loadFareRules(
  db: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  vehicleType: string,
): Promise<FareRulesInput & { location_key: string; vehicle_type: string; city: string }> {
  const resolved = resolvePickupLocation(pickupLat, pickupLng);
  const keysToTry = resolved.fallbackKeys.length
    ? resolved.fallbackKeys
    : locationKeysForFallback(resolved.locationKey);

  const vehicleSlugs = vehicleTypesForFareLookup(vehicleType);
  const canonicalVehicle = normalizeVehicleType(vehicleType);

  for (const locationKey of keysToTry) {
    for (const vSlug of vehicleSlugs) {
      const cacheKey = `${locationKey}:${vSlug}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return {
          ...hit.rules,
          location_key: hit.locationKey,
          city: hit.locationKey,
          vehicle_type: canonicalVehicle,
        };
      }

      const { data } = await fetchActiveRule(db, locationKey, vSlug);
      if (!data) continue;

      const rules: FareRulesInput = {
        baseFareMinor: Number(data.base_fare_minor),
        pricePerKmMinor: Number(data.price_per_km_minor),
        pricePerMinMinor: Number(data.price_per_min_minor),
        bookingFeeMinor: Number(data.booking_fee_minor ?? 0),
        estimatedTollsMinor: Number(data.estimated_tolls_minor ?? 0),
        minFareMinor: Number(data.min_fare_minor),
        currency: String(data.currency ?? "JMD"),
      };
      cache.set(cacheKey, { rules, locationKey, at: Date.now() });
      return {
        ...rules,
        location_key: locationKey,
        city: locationKey,
        vehicle_type: canonicalVehicle,
      };
    }
  }

  return {
    ...ENV_FALLBACK,
    location_key: resolved.locationKey,
    city: resolved.locationKey,
    vehicle_type: canonicalVehicle || DEFAULT_RIDES_VEHICLE_TYPE,
  };
}
