import {
  JAMAICA_COUNTRY_SLUG,
  JAMAICA_COUNTIES,
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function pointInBounds(
  lat: number,
  lng: number,
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Resolve pickup coordinates to the most specific Jamaica location key we support. */
export function resolvePickupLocation(lat: number, lng: number): ResolvedPickupLocation {
  for (const county of JAMAICA_COUNTIES) {
    for (const parish of county.parishes) {
      if (!pointInBounds(lat, lng, parish.bounds)) continue;

      let nearestLocality: string | undefined;
      let nearestKm = 25;

      for (const loc of parish.localities) {
        if (loc.lat == null || loc.lng == null) continue;
        const km = haversineKm(lat, lng, loc.lat, loc.lng);
        if (km < nearestKm) {
          nearestKm = km;
          nearestLocality = loc.slug;
        }
      }

      const locationKey = buildLocationKey({
        scope: nearestLocality ? "locality" : "parish",
        county: county.slug,
        parish: parish.slug,
        locality: nearestLocality,
      });

      return {
        locationKey,
        county: county.slug,
        parish: parish.slug,
        locality: nearestLocality,
        fallbackKeys: locationKeysForFallback(locationKey),
      };
    }
  }

  return {
    locationKey: JAMAICA_COUNTRY_SLUG,
    fallbackKeys: [JAMAICA_COUNTRY_SLUG],
  };
}

/** @deprecated Use resolvePickupLocation — kept for quote token field name. */
export function resolveCity(lat: number, lng: number): string {
  return resolvePickupLocation(lat, lng).locationKey;
}
