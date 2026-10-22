/**
 * Home pin and routed commute / short reposition gaps.
 * One gap that cannot be routed does not throw away the week.
 * Successful driving distances are remembered. Failures are not.
 */
import { fetchGoogleDirectionsRouteWithTurn, googleMapsRidesApiKey, haversineKm } from "../_shared/directionsRoute.ts";
import { getServiceClient } from "./service_client.ts";
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

function pointKey(point: LegPoint): string {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`;
  }
  return String(point.label || "").trim().toLowerCase();
}

async function drivingKmByAddress(origin: string, destination: string): Promise<number | null> {
  const apiKey = googleMapsRidesApiKey();
  if (!apiKey) return null;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&region=jm&key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as {
      status?: string;
      routes?: Array<{ legs?: Array<{ distance?: { value?: number } }> }>;
    };
    if (json.status !== "OK") return null;
    const meters = json.routes?.[0]?.legs?.[0]?.distance?.value;
    return meters != null ? meters / 1000 : null;
  } catch {
    return null;
  }
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

async function rememberRouteKm(fromKey: string, toKey: string, km: number): Promise<void> {
  try {
    const client = getServiceClient();
    await client.from("fuel_route_cache").upsert(
      { from_key: fromKey, to_key: toKey, km, source: "google_directions" },
      { onConflict: "from_key,to_key" },
    );
  } catch {
    // A missed cache write must not fail the week.
  }
}

async function drivingKm(from: LegPoint, to: LegPoint): Promise<number | null> {
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
  let km: number | null = null;
  if (coords) {
    try {
      const route = await fetchGoogleDirectionsRouteWithTurn(
        Number(from.lat),
        Number(from.lng),
        Number(to.lat),
        Number(to.lng),
      );
      if (route?.source === "google_directions") km = route.distanceKm;
    } catch {
      km = null;
    }
  } else if (from.label && to.label) {
    km = await drivingKmByAddress(from.label, to.label);
  }
  if (km == null) return null;
  routeCache.set(key, km);
  if (coords) await rememberRouteKm(fromKey, toKey, km);
  return km;
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
  const apiKey = googleMapsRidesApiKey();
  const trimmed = address.trim();
  if (!apiKey || !trimmed) return null;
  const query = /jamaica/i.test(trimmed) ? trimmed : `${trimmed}, Jamaica`;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=jm&key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const json = await res.json() as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const loc = json.status === "OK" ? json.results?.[0]?.geometry?.location : undefined;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  } catch {
    return null;
  }
}

export async function measureOffAppKm(args: {
  home: { lat: number; lng: number } | null;
  trips: ShiftTrip[];
}): Promise<{
  commuteKm: number;
  repositionKm: number | null;
  repositionMeasured: boolean;
  repositionAnyEstimated: boolean;
  repositionAnySkipped: boolean;
}> {
  const shifts = groupShifts(args.trips || []);
  let commuteKm = 0;
  if (args.home) {
    const legs = commuteLegs({ lat: args.home.lat, lng: args.home.lng }, shifts);
    for (const leg of legs) {
      const net = netLegKm(await drivingKm(leg.from, leg.to), leg.alreadyCountedKm);
      if (net != null) commuteKm += net;
    }
  }

  const gaps = repositionGaps(shifts);
  const tripsHavePoints = (args.trips || []).some((trip) =>
    pointUsable({ lat: trip.startLat, lng: trip.startLng, label: trip.pickupLocation }) ||
    pointUsable({ lat: trip.endLat, lng: trip.endLng, label: trip.dropoffLocation })
  );
  if (!gaps.length) {
    return {
      commuteKm: round2(commuteKm),
      repositionKm: tripsHavePoints ? 0 : null,
      repositionMeasured: tripsHavePoints,
      repositionAnyEstimated: false,
      repositionAnySkipped: false,
    };
  }
  const folded = foldMeasuredGaps(await Promise.all(gaps.map(async (gap) => {
    const routedKm = await drivingKm(gap.from, gap.to);
    const straightKm = routedKm == null && hasCoords(gap.from) && hasCoords(gap.to)
      ? haversineKm(Number(gap.from.lat), Number(gap.from.lng), Number(gap.to.lat), Number(gap.to.lng))
      : null;
    return { routedKm, straightKm, alreadyCountedKm: gap.alreadyCountedKm };
  })));
  return {
    commuteKm: round2(commuteKm),
    repositionKm: folded.measured ? folded.repositionKm : null,
    repositionMeasured: folded.measured,
    repositionAnyEstimated: folded.anyEstimated,
    repositionAnySkipped: folded.anySkipped,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
