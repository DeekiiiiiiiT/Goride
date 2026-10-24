import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  JAMAICA_COUNTRY_SLUG,
  buildLocationKey,
  locationKeysForFallback,
  type JamaicaCountySlug,
} from "./jamaicaLocations.ts";

export type ResolvedPickupLocation = {
  locationKey: string;
  county?: JamaicaCountySlug;
  parish?: string;
  locality?: string;
  fallbackKeys: string[];
};

function geoDb(db: SupabaseClient) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return db;
  return createClient(url, key, { db: { schema: "geo" } });
}

/**
 * Resolve a pickup to the fare key using Dominion's borders.
 * The key shape stays jamaica/county/parish/town so existing fare rules keep matching.
 */
export async function resolvePickupLocation(
  lat: number,
  lng: number,
  db?: SupabaseClient,
): Promise<ResolvedPickupLocation> {
  const client = db ? geoDb(db) : geoDb(createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  ));
  const { data, error } = await client.rpc("resolve_fare_location", { p_lat: lat, p_lng: lng });
  if (error || !data || typeof data !== "object") {
    return { locationKey: JAMAICA_COUNTRY_SLUG, fallbackKeys: [JAMAICA_COUNTRY_SLUG] };
  }
  const row = data as { location_key?: string; county?: string; parish?: string; locality?: string };
  const locationKey = row.location_key || JAMAICA_COUNTRY_SLUG;
  return {
    locationKey,
    county: row.county as JamaicaCountySlug | undefined,
    parish: row.parish,
    locality: row.locality,
    fallbackKeys: locationKeysForFallback(locationKey),
  };
}

export async function resolveCity(lat: number, lng: number, db?: SupabaseClient): Promise<string> {
  return (await resolvePickupLocation(lat, lng, db)).locationKey;
}

export { buildLocationKey };
