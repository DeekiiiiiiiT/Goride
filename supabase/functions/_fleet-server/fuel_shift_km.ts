/**
 * Home pin and routed commute / short reposition gaps.
 * One gap that cannot be routed does not throw away the week.
 * Successful driving distances are remembered. Failures are not.
 */
import {
  fetchLegacyDirectionsKm,
  fetchRoutesApiKm,
  googleMapsServerKey,
  haversineKm,
  reportFuelRouteFailure,
  type RoutingHealth,
} from "../_shared/directionsRoute.ts";
import { getServiceClient } from "./service_client.ts";
import { commuteRouteStatus } from "../../../packages/fuel-core/src/commuteRouteStatus.ts";
import { straightLineRoadKm } from "../../../packages/fuel-core/src/roadFactor.ts";
import {
  commuteLegs,
  foldMeasuredGaps,
  groupShifts,
  netLegKm,
  pointUsable,
  repositionGaps,
  type LegPoint,
  type ShiftTrip,
} from "../../../packages/fuel-core/src/shiftLegs.ts";

const routeCache = new Map<string, number>();
const ROUTE_CONCURRENCY = 4;

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

function pointKey(point: LegPoint): string {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`;
  }
  return String(point.label || "").trim().toLowerCase();
}

type RouteSession = {
  backend: RoutingHealth["backend"];
  apiKey: string | null;
};

type FuelRouteHit = { km: number; source: "google_directions" | "google_routes" };

async function drivingKmByAddress(origin: string, destination: string, session: RouteSession): Promise<FuelRouteHit | null> {
  if (!session.apiKey || !session.backend) return null;
  const result = session.backend === "routes"
    ? await fetchRoutesApiKm({ apiKey: session.apiKey, origin, destination })
    : await fetchLegacyDirectionsKm({ apiKey: session.apiKey, origin, destination });
  if (result.km == null || !result.source) return null;
  return { km: result.km, source: result.source };
}

function hasCoords(point: LegPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

async function cachedRouteKm(fromKey: string, toKey: string): Promise<number | null> {
  try {
    const client = getServiceClient();
    const { data, error } = await client
      .from("fuel_route_cache")
      .select("km")
      .eq("from_key", fromKey)
      .eq("to_key", toKey)
      .maybeSingle();
    if (error || data?.km == null) return null;
    const km = Number(data.km);
    return Number.isFinite(km) ? km : null;
  } catch {
    return null;
  }
}

async function rememberRouteKm(
  fromKey: string,
  toKey: string,
  km: number,
  source: FuelRouteHit["source"],
): Promise<void> {
  try {
    const client = getServiceClient();
    await client.from("fuel_route_cache").upsert(
      { from_key: fromKey, to_key: toKey, km, source },
      { onConflict: "from_key,to_key" },
    );
  } catch {
    // A missed cache write must not fail the week.
  }
}

async function drivingKm(from: LegPoint, to: LegPoint, session: RouteSession): Promise<number | null> {
  if (!session.backend || !session.apiKey) return null;
  const fromKey = pointKey(from);
  const toKey = pointKey(to);
  const key = `${fromKey}>${toKey}`;
  if (routeCache.has(key)) return routeCache.get(key) ?? null;
  const coords = hasCoords(from) && hasCoords(to);
  if (coords) {
    const cached = await cachedRouteKm(fromKey, toKey);
    if (cached != null) {
      routeCache.set(key, cached);
      return cached;
    }
  }
  let hit: FuelRouteHit | null = null;
  if (coords) {
    const result = session.backend === "routes"
      ? await fetchRoutesApiKm({
        apiKey: session.apiKey,
        fromLat: Number(from.lat),
        fromLng: Number(from.lng),
        toLat: Number(to.lat),
        toLng: Number(to.lng),
      })
      : await fetchLegacyDirectionsKm({
        apiKey: session.apiKey,
        fromLat: Number(from.lat),
        fromLng: Number(from.lng),
        toLat: Number(to.lat),
        toLng: Number(to.lng),
      });
    if (result.km != null && result.source) hit = { km: result.km, source: result.source };
  } else if (from.label && to.label) {
    hit = await drivingKmByAddress(from.label, to.label, session);
  }
  if (!hit) return null;
  routeCache.set(key, hit.km);
  if (coords) await rememberRouteKm(fromKey, toKey, hit.km, hit.source);
  return hit.km;
}

/** Place a home pin on the driver being saved. Never reads a stale copy to write back. */
export async function stampDriverHomePin(driver: Record<string, unknown>): Promise<void> {
  const lat = Number(driver.homeLat);
  const lng = Number(driver.homeLng);
  if (lat && lng) {
    if (driver.homePinSource !== "home" && driver.homePinSource !== "address") {
      driver.homePinSource = String(driver.homeAddress || "").trim() ? "home" : "address";
    }
    return;
  }
  const homeAddress = String(driver.homeAddress || "").trim();
  const street = String(driver.address || "").trim();
  const query = homeAddress || street;
  if (!query) return;
  const pin = await geocodeJamaicaAddress(query);
  if (!pin) return;
  driver.homeLat = pin.lat;
  driver.homeLng = pin.lng;
  driver.homePinSource = homeAddress ? "home" : "address";
}

export async function geocodeJamaicaAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = googleMapsServerKey();
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (!apiKey) {
    reportFuelRouteFailure("geocode", "MAPS_KEY_MISSING", "", "maps_key_missing");
    return null;
  }
  const query = /jamaica/i.test(trimmed) ? trimmed : `${trimmed}, Jamaica`;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=jm&key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      reportFuelRouteFailure("geocode", `HTTP_${res.status}`, "request failed", "unavailable");
      return null;
    }
    const json = await res.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const status = String(json.status || "UNKNOWN");
    const loc = status === "OK" ? json.results?.[0]?.geometry?.location : undefined;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      reportFuelRouteFailure(
        "geocode",
        status,
        String(json.error_message || "").split(apiKey).join("[redacted]"),
        status === "ZERO_RESULTS" ? "no_road" : "google_refused",
      );
      return null;
    }
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  } catch {
    reportFuelRouteFailure("geocode", "UNAVAILABLE", "request failed", "unavailable");
    return null;
  }
}

export async function measureOffAppKm(args: {
  home: { lat: number; lng: number } | null;
  trips: ShiftTrip[];
  routing: RoutingHealth;
}): Promise<{
  commuteKm: number;
  commuteStatus: "routed" | "estimated" | "none";
  commuteNote?: string;
  repositionKm: number | null;
  repositionMeasured: boolean;
  repositionAnyEstimated: boolean;
  repositionAnySkipped: boolean;
}> {
  const session: RouteSession = {
    backend: args.routing.ok ? args.routing.backend : null,
    apiKey: args.routing.ok ? googleMapsServerKey() : null,
  };
  const shifts = groupShifts(args.trips || []);
  const legs = args.home ? commuteLegs({ lat: args.home.lat, lng: args.home.lng }, shifts) : [];
  let commuteKm = 0;
  let routedLegs = 0;
  if (session.backend && session.apiKey) {
    for (const leg of legs) {
      const km = await drivingKm(leg.from, leg.to, session);
      if (km == null) continue;
      routedLegs += 1;
      const net = netLegKm(km, leg.alreadyCountedKm);
      if (net != null) commuteKm += net;
    }
  }
  const commute = commuteRouteStatus({
    homeMissing: !args.home,
    routingOk: Boolean(session.backend && session.apiKey),
    legs: legs.length,
    routedLegs,
  });
  const commuteStatus: "routed" | "estimated" | "none" = commute.confidence === "measured"
    ? "routed"
    : commute.confidence;

  const gaps = repositionGaps(shifts);
  const tripsHavePoints = (args.trips || []).some((trip) =>
    pointUsable({ lat: trip.startLat, lng: trip.startLng, label: trip.pickupLocation }) ||
    pointUsable({ lat: trip.endLat, lng: trip.endLng, label: trip.dropoffLocation })
  );
  if (!gaps.length) {
    return {
      commuteKm: round2(commuteKm),
      commuteStatus,
      commuteNote: commute.note,
      repositionKm: tripsHavePoints ? 0 : null,
      repositionMeasured: tripsHavePoints,
      repositionAnyEstimated: false,
      repositionAnySkipped: false,
    };
  }
  const folded = foldMeasuredGaps(await mapLimited(gaps, ROUTE_CONCURRENCY, async (gap) => {
    const routedKm = session.backend && session.apiKey
      ? await drivingKm(gap.from, gap.to, session)
      : null;
    const straightKm = routedKm == null && hasCoords(gap.from) && hasCoords(gap.to)
      ? straightLineRoadKm(haversineKm(
        Number(gap.from.lat),
        Number(gap.from.lng),
        Number(gap.to.lat),
        Number(gap.to.lng),
      ))
      : null;
    return { routedKm, straightKm, alreadyCountedKm: gap.alreadyCountedKm };
  }));
  return {
    commuteKm: round2(commuteKm),
    commuteStatus,
    commuteNote: commute.note,
    repositionKm: folded.measured ? folded.repositionKm : null,
    repositionMeasured: folded.measured,
    repositionAnyEstimated: folded.anyEstimated,
    repositionAnySkipped: folded.anySkipped,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
