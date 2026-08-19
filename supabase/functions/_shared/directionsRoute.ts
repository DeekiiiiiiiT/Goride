/**
 * Google Directions routing shared by rides and courier delivery.
 */
const AVG_SPEED_KMH = 25;
const ROUTE_CACHE_TTL_MS = 10 * 60_000;

export type NextTurn = {
  instruction: string;
  distanceM: number;
};

export type CourierRouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "google_directions" | "haversine_fallback";
  trafficAware?: boolean;
  encodedPolyline?: string;
  nextTurn?: NextTurn;
};

export function googleMapsRidesApiKey(): string | null {
  return Deno.env.get("GOOGLE_MAPS_API_KEY_RIDES") ??
    Deno.env.get("GOOGLE_MAPS_SERVER_KEY_RIDES") ??
    null;
}

type CacheEntry = { value: CourierRouteEstimate; at: number };
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
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): CourierRouteEstimate {
  const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const durationMinutes = Math.max(1, (distanceKm / AVG_SPEED_KMH) * 60);
  const destLabel = "your destination";
  return {
    distanceKm,
    durationMinutes,
    source: "haversine_fallback",
    nextTurn: {
      instruction: `Head toward ${destLabel}`,
      distanceM: Math.round(distanceKm * 1000),
    },
  };
}

type DirectionsStep = {
  html_instructions?: string;
  distance?: { value: number };
};

type DirectionsLeg = {
  distance?: { value: number };
  duration?: { value: number };
  duration_in_traffic?: { value: number };
  steps?: DirectionsStep[];
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Exported for unit tests with mocked fetch. */
export async function fetchGoogleDirectionsRouteWithTurn(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  fetchFn: typeof fetch = fetch,
  departureTimeUnix?: number,
): Promise<CourierRouteEstimate | null> {
  const apiKey = googleMapsRidesApiKey();
  if (!apiKey) return null;

  const origin = `${fromLat},${fromLng}`;
  const destination = `${toLat},${toLng}`;
  const departureTime = departureTimeUnix ?? Math.floor(Date.now() / 1000);
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
  const firstStep = leg.steps?.[0];
  const nextTurn: NextTurn | undefined = firstStep
    ? {
      instruction: stripHtml(firstStep.html_instructions || "Continue on route"),
      distanceM: firstStep.distance?.value ?? 0,
    }
    : undefined;

  return {
    distanceKm: meters / 1000,
    durationMinutes: Math.max(1, seconds / 60),
    source: "google_directions",
    trafficAware: trafficSeconds != null,
    ...(encodedPolyline ? { encodedPolyline } : {}),
    ...(nextTurn ? { nextTurn } : {}),
  };
}

export async function getCourierRouteEstimate(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  departureTimeUnix?: number,
): Promise<CourierRouteEstimate> {
  const key = cacheKey(fromLat, fromLng, toLat, toLng);
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_CACHE_TTL_MS && departureTimeUnix == null) {
    return hit.value;
  }

  const google = await fetchGoogleDirectionsRouteWithTurn(
    fromLat,
    fromLng,
    toLat,
    toLng,
    fetch,
    departureTimeUnix,
  );
  if (google) {
    if (departureTimeUnix == null) routeCache.set(key, { value: google, at: Date.now() });
    return google;
  }
  return haversineFallback(fromLat, fromLng, toLat, toLng);
}
