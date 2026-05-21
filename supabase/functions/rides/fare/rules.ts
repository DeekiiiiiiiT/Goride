import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { FareRulesInput } from "./compute.ts";
import { locationKeysForFallback } from "./jamaicaLocations.ts";
import { resolvePickupLocation } from "./resolveLocation.ts";
import { normalizeVehicleType } from "./ridesVehicleTypes.ts";
import {
  loadVehicleTypesFromDb,
  vehicleTypesForFareLookupFromList,
} from "./vehicleTypesDb.ts";

const CACHE_TTL_MS = 60_000;

type CacheEntry = { rules: FareRulesInput; locationKey: string; at: number };
const cache = new Map<string, CacheEntry>();

export { resolvePickupLocation, resolveCity } from "./resolveLocation.ts";

/** Thrown when no active fare_rules row matches pickup + vehicle (production: no hardcoded fallback). */
export class FareRuleNotFoundError extends Error {
  readonly code = "no_fare_rule";

  constructor(
    readonly vehicleType: string,
    readonly resolvedLocationKey: string,
    readonly locationKeysTried: string[],
    readonly vehicleTypesTried: string[],
  ) {
    super(
      `No active fare rule for "${vehicleType}" at this pickup (${resolvedLocationKey}). ` +
        `Each service needs its own rule. In Fare Rules, confirm All Jamaica + this service is active ` +
        `and the rule’s service ID matches Transport Solutions (e.g. roam-standard, not an old slug like roam-s).`,
    );
    this.name = "FareRuleNotFoundError";
  }

  toResponseBody(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      vehicle_type: this.vehicleType,
      location_key: this.resolvedLocationKey,
      location_keys_tried: this.locationKeysTried,
      vehicle_types_tried: this.vehicleTypesTried,
    };
  }
}

async function fetchActiveRule(
  db: SupabaseClient,
  locationKey: string,
  vehicleType: string,
) {
  const base = () =>
    db.from("fare_rules").select("*").eq("vehicle_type", vehicleType).eq("is_active", true);

  const { data: byKey } = await base().eq("location_key", locationKey).maybeSingle();
  if (byKey) return byKey;

  // Legacy rows may only have `city` populated.
  const { data: byCity } = await base().eq("city", locationKey).maybeSingle();
  return byCity;
}

export type LoadedFareRules = FareRulesInput & {
  location_key: string;
  vehicle_type: string;
  city: string;
};

export async function loadFareRules(
  db: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  vehicleType: string,
): Promise<LoadedFareRules> {
  const resolved = resolvePickupLocation(pickupLat, pickupLng);
  const keysToTry = resolved.fallbackKeys.length
    ? resolved.fallbackKeys
    : locationKeysForFallback(resolved.locationKey);

  const catalog = await loadVehicleTypesFromDb(db, "vehicle_types", { activeOnly: false });
  const knownSlugs = catalog.map((t) => t.slug);
  const vehicleSlugs = vehicleTypesForFareLookupFromList(vehicleType, knownSlugs);
  const canonicalVehicle = vehicleType.trim().toLowerCase() || normalizeVehicleType(vehicleType);

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

  throw new FareRuleNotFoundError(
    canonicalVehicle || vehicleType,
    resolved.locationKey,
    keysToTry,
    vehicleSlugs,
  );
}
