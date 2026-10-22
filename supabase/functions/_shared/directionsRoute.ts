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

/** Server key only. The browser key is referrer-locked and fails from the edge. */
export function googleMapsServerKey(): string | null {
  const key = Deno.env.get("GOOGLE_MAPS_SERVER_KEY_RIDES")?.trim();
  return key || null;
}

export type FuelRoutePlainReason =
  | "ok"
  | "maps_key_missing"
  | "google_refused"
  | "no_road"
  | "unavailable";

export type FuelRouteFailure = {
  status: string;
  errorMessage: string;
  plainReason: Exclude<FuelRoutePlainReason, "ok">;
  legacyBlocked: boolean;
};

export type FuelRouteKm = {
  km: number | null;
  source: "google_directions" | "google_routes" | null;
  failure?: FuelRouteFailure;
};

export type RoutingHealth = {
  ok: boolean;
  backend: "legacy" | "routes" | null;
  plainReason: FuelRoutePlainReason;
  message: string;
};

const KINGSTON = { lat: 17.9716, lng: -76.7936 };
const SPANISH_TOWN = { lat: 17.991, lng: -76.9573 };
const HEALTH_MIN_KM = 8;
const HEALTH_MAX_KM = 80;

export function fuelRouteOperatorMessage(reason: FuelRoutePlainReason): string {
  if (reason === "ok") return "Road routes are working.";
  if (reason === "maps_key_missing") {
    return "Routing unavailable — kilometres left unexplained. The server maps key is not set.";
  }
  if (reason === "google_refused") {
    return "Routing unavailable — kilometres left unexplained. Google refused the route.";
  }
  if (reason === "no_road") {
    return "Routing unavailable — kilometres left unexplained. No road was found.";
  }
  return "Routing unavailable — kilometres left unexplained.";
}

function safeGoogleMessage(message: string, apiKey: string): string {
  return message.split(apiKey).join("[redacted]").slice(0, 300);
}

export function reportFuelRouteFailure(
  where: string,
  status: string,
  errorMessage: string,
  plainReason: Exclude<FuelRoutePlainReason, "ok">,
  legacyBlocked = false,
): FuelRouteFailure {
  const failure: FuelRouteFailure = {
    status,
    errorMessage: errorMessage.slice(0, 300),
    plainReason,
    legacyBlocked,
  };
  console.error(JSON.stringify({
    scope: "fuel_route",
    where,
    status: failure.status,
    error_message: failure.errorMessage,
  }));
  return failure;
}

function legacyDirectionsBlocked(status: string, errorMessage: string): boolean {
  if (status !== "REQUEST_DENIED") return false;
  const msg = errorMessage.toLowerCase();
  return msg.includes("legacy")
    || msg.includes("routes api")
    || msg.includes("not enabled")
    || msg.includes("has not been used");
}

function plainFromStatus(status: string): Exclude<FuelRoutePlainReason, "ok"> {
  if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT" || status === "INVALID_REQUEST" || status === "PERMISSION_DENIED") {
    return "google_refused";
  }
  if (status === "NOT_FOUND" || status === "ZERO_RESULTS" || status === "NO_ROUTE") return "no_road";
  if (status === "MAPS_KEY_MISSING") return "maps_key_missing";
  return "unavailable";
}

type RouteFetchArgs = {
  apiKey: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
  origin?: string;
  destination?: string;
  fetchFn?: typeof fetch;
};

export async function fetchLegacyDirectionsKm(args: RouteFetchArgs): Promise<FuelRouteKm> {
  const fetchFn = args.fetchFn ?? fetch;
  const origin = args.origin ?? `${args.fromLat},${args.fromLng}`;
  const destination = args.destination ?? `${args.toLat},${args.toLng}`;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&region=jm&key=${encodeURIComponent(args.apiKey)}`;
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return {
        km: null,
        source: null,
        failure: reportFuelRouteFailure(
          "legacy_directions",
          `HTTP_${res.status}`,
          "request failed",
          "unavailable",
        ),
      };
    }
    const json = await res.json() as {
      status?: string;
      error_message?: string;
      routes?: Array<{ legs?: Array<{ distance?: { value?: number } }> }>;
    };
    const status = String(json.status || "UNKNOWN");
    const errorMessage = safeGoogleMessage(String(json.error_message || ""), args.apiKey);
    if (status !== "OK") {
      return {
        km: null,
        source: null,
        failure: reportFuelRouteFailure(
          "legacy_directions",
          status,
          errorMessage,
          plainFromStatus(status),
          legacyDirectionsBlocked(status, errorMessage),
        ),
      };
    }
    const meters = json.routes?.[0]?.legs?.[0]?.distance?.value;
    if (meters == null) {
      return {
        km: null,
        source: null,
        failure: reportFuelRouteFailure("legacy_directions", "NO_ROUTE", errorMessage, "no_road"),
      };
    }
    return { km: meters / 1000, source: "google_directions" };
  } catch {
    return {
      km: null,
      source: null,
      failure: reportFuelRouteFailure("legacy_directions", "UNAVAILABLE", "request failed", "unavailable"),
    };
  }
}

export async function fetchRoutesApiKm(args: RouteFetchArgs): Promise<FuelRouteKm> {
  const fetchFn = args.fetchFn ?? fetch;
  const origin = args.origin
    ? { address: args.origin }
    : { location: { latLng: { latitude: args.fromLat, longitude: args.fromLng } } };
  const destination = args.destination
    ? { address: args.destination }
    : { location: { latLng: { latitude: args.toLat, longitude: args.toLng } } };
  try {
    const res = await fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": args.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin,
        destination,
        travelMode: "DRIVE",
        regionCode: "JM",
      }),
    });
    const json = await res.json() as {
      routes?: Array<{ distanceMeters?: number }>;
      error?: { status?: string; message?: string };
    };
    if (!res.ok || json.error) {
      const status = String(json.error?.status || `HTTP_${res.status}`);
      const errorMessage = safeGoogleMessage(String(json.error?.message || "request failed"), args.apiKey);
      return {
        km: null,
        source: null,
        failure: reportFuelRouteFailure(
          "routes_api",
          status,
          errorMessage,
          plainFromStatus(status),
        ),
      };
    }
    const meters = json.routes?.[0]?.distanceMeters;
    if (meters == null) {
      return {
        km: null,
        source: null,
        failure: reportFuelRouteFailure("routes_api", "NO_ROUTE", "", "no_road"),
      };
    }
    return { km: meters / 1000, source: "google_routes" };
  } catch {
    return {
      km: null,
      source: null,
      failure: reportFuelRouteFailure("routes_api", "UNAVAILABLE", "request failed", "unavailable"),
    };
  }
}

function healthKmOk(km: number | null): boolean {
  return km != null && km >= HEALTH_MIN_KM && km <= HEALTH_MAX_KM;
}

/** One Kingston → Spanish Town drive before any car is measured. */
export async function checkFuelRoutingHealth(opts?: {
  fetchFn?: typeof fetch;
  apiKey?: string | null;
}): Promise<RoutingHealth> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const apiKey = opts && "apiKey" in opts ? (opts.apiKey?.trim() || null) : googleMapsServerKey();
  if (!apiKey) {
    reportFuelRouteFailure("health", "MAPS_KEY_MISSING", "", "maps_key_missing");
    return {
      ok: false,
      backend: null,
      plainReason: "maps_key_missing",
      message: fuelRouteOperatorMessage("maps_key_missing"),
    };
  }
  const leg = {
    apiKey,
    fromLat: KINGSTON.lat,
    fromLng: KINGSTON.lng,
    toLat: SPANISH_TOWN.lat,
    toLng: SPANISH_TOWN.lng,
    fetchFn,
  };
  const legacy = await fetchLegacyDirectionsKm(leg);
  if (healthKmOk(legacy.km)) {
    return {
      ok: true,
      backend: "legacy",
      plainReason: "ok",
      message: fuelRouteOperatorMessage("ok"),
    };
  }
  if (legacy.failure?.legacyBlocked) {
    const routes = await fetchRoutesApiKm(leg);
    if (healthKmOk(routes.km)) {
      return {
        ok: true,
        backend: "routes",
        plainReason: "ok",
        message: fuelRouteOperatorMessage("ok"),
      };
    }
    const reason = routes.failure?.plainReason || "google_refused";
    return { ok: false, backend: null, plainReason: reason, message: fuelRouteOperatorMessage(reason) };
  }
  const reason = legacy.failure?.plainReason || "unavailable";
  return { ok: false, backend: null, plainReason: reason, message: fuelRouteOperatorMessage(reason) };
}
