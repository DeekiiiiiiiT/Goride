const AVG_SPEED_KMH = 25;
const ROUTE_CACHE_TTL_MS = 10 * 60_000;

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "google_directions" | "haversine_fallback";
  trafficAware?: boolean;
  encodedPolyline?: string;
};

export function googleMapsRidesApiKey(): string | null {
  return Deno.env.get("GOOGLE_MAPS_API_KEY_RIDES") ??
    Deno.env.get("GOOGLE_MAPS_SERVER_KEY_RIDES") ??
    null;
}

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

type DirectionsLeg = {
  distance?: { value: number };
  duration?: { value: number };
  duration_in_traffic?: { value: number };
};

/** Exported for unit tests with mocked fetch. */
export async function fetchGoogleDirectionsRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  fetchFn: typeof fetch = fetch,
): Promise<RouteEstimate | null> {
  const apiKey = googleMapsRidesApiKey();
  if (!apiKey) return null;

  const origin = `${pickupLat},${pickupLng}`;
  const destination = `${dropoffLat},${dropoffLng}`;
  const departureTime = Math.floor(Date.now() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&region=jm&departure_time=${departureTime}&key=${encodeURIComponent(apiKey)}`;

  const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json() as {
    status?: string;
    routes?: Array<{
      overview_polyline?: { points?: string };
      legs?: DirectionsLeg[];
    }>;
  };

  if (json.status !== "OK" || !json.routes?.[0]?.legs?.[0]) return null;

  const route = json.routes[0];
  const leg = route.legs![0];
  const meters = leg.distance?.value;
  const trafficSeconds = leg.duration_in_traffic?.value;
  const baseSeconds = leg.duration?.value;
  const seconds = trafficSeconds ?? baseSeconds;
  if (meters == null || seconds == null) return null;

  const encodedPolyline = route.overview_polyline?.points;

  return {
    distanceKm: meters / 1000,
    durationMinutes: Math.max(1, seconds / 60),
    source: "google_directions",
    trafficAware: trafficSeconds != null,
    ...(encodedPolyline ? { encodedPolyline } : {}),
  };
}

async function googleDirectionsRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): Promise<RouteEstimate | null> {
  return fetchGoogleDirectionsRoute(pickupLat, pickupLng, dropoffLat, dropoffLng);
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
