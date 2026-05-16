const AVG_SPEED_KMH = 25;
const ROUTE_CACHE_TTL_MS = 10 * 60_000;

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "google_directions" | "haversine_fallback";
};

type CacheEntry = { value: RouteEstimate; at: number };
const routeCache = new Map<string, CacheEntry>();

function cacheKey(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): string {
  const r = (n: number) => n.toFixed(5);
  return `${r(aLat)},${r(aLng)}|${r(bLat)},${r(bLng)}`;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function haversineFallback(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): RouteEstimate {
  const distanceKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const durationMinutes = Math.max(1, (distanceKm / AVG_SPEED_KMH) * 60);
  return { distanceKm, durationMinutes, source: "haversine_fallback" };
}

async function googleDirectionsRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): Promise<RouteEstimate | null> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY_RIDES") ??
    Deno.env.get("GOOGLE_MAPS_SERVER_KEY_RIDES");
  if (!apiKey) return null;

  const origin = `${pickupLat},${pickupLng}`;
  const destination = `${dropoffLat},${dropoffLng}`;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&region=jm&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json() as {
    status?: string;
    routes?: Array<{
      legs?: Array<{ distance?: { value: number }; duration?: { value: number } }>;
    }>;
  };

  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) return null;

  const leg = json.routes[0].legs[0];
  const meters = leg.distance?.value;
  const seconds = leg.duration?.value;
  if (meters == null || seconds == null) return null;

  return {
    distanceKm: meters / 1000,
    durationMinutes: Math.max(1, seconds / 60),
    source: "google_directions",
  };
}

export async function getRouteEstimate(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): Promise<RouteEstimate> {
  const key = cacheKey(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_CACHE_TTL_MS) return hit.value;

  let estimate: RouteEstimate;
  try {
    const routed = await googleDirectionsRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);
    estimate = routed ?? haversineFallback(pickupLat, pickupLng, dropoffLat, dropoffLng);
  } catch {
    estimate = haversineFallback(pickupLat, pickupLng, dropoffLat, dropoffLng);
  }

  routeCache.set(key, { value: estimate, at: Date.now() });
  return estimate;
}

export { AVG_SPEED_KMH };
