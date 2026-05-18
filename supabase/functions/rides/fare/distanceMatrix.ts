import { googleMapsRidesApiKey, haversineKm } from "./routing.ts";

const MATRIX_CACHE_TTL_MS = 2 * 60_000;
const MAX_MATRIX_DESTINATIONS = 25;
const AVG_SPEED_KMH = 25;

export type RankedDriver = {
  user_id: string;
  lat: number;
  lng: number;
  driveSeconds: number;
  haversineKm: number;
};

export type MatrixRankResult = {
  ranked: RankedDriver[];
  source: "google_distance_matrix" | "haversine_fallback";
};

type CacheEntry = { value: MatrixRankResult; at: number };
const matrixCache = new Map<string, CacheEntry>();

export type PickupEtaEstimate = {
  pickupSeconds: number;
  source: "google_distance_matrix" | "haversine_fallback";
};

type PickupEtaCacheEntry = { value: PickupEtaEstimate; at: number };
const pickupEtaCache = new Map<string, PickupEtaCacheEntry>();

function pickupEtaCacheKey(
  pickupLat: number,
  pickupLng: number,
  drivers: Array<{ user_id: string }>,
): string {
  const r = (n: number) => n.toFixed(5);
  const ids = drivers.map((d) => d.user_id).sort().join(",");
  return `pickup:${r(pickupLat)},${r(pickupLng)}|${ids}`;
}

function matrixCacheKey(
  originLat: number,
  originLng: number,
  drivers: Array<{ user_id: string; lat: number; lng: number }>,
): string {
  const r = (n: number) => n.toFixed(5);
  const ids = drivers.map((d) => d.user_id).sort().join(",");
  return `${r(originLat)},${r(originLng)}|${ids}`;
}

function haversineRank(
  origin: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number; haversineKm: number }>,
): MatrixRankResult {
  const ranked = drivers
    .map((d) => ({
      user_id: d.user_id,
      lat: d.lat,
      lng: d.lng,
      haversineKm: d.haversineKm,
      driveSeconds: Math.max(60, (d.haversineKm / AVG_SPEED_KMH) * 3600),
    }))
    .sort((a, b) => a.driveSeconds - b.driveSeconds || a.user_id.localeCompare(b.user_id));
  return { ranked, source: "haversine_fallback" };
}

type MatrixElement = {
  status?: string;
  duration?: { value: number };
  duration_in_traffic?: { value: number };
};

/** Exported for unit tests with mocked fetch. */
export async function fetchDistanceMatrixDriveTimes(
  origin: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number }>,
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, number> | null> {
  const apiKey = googleMapsRidesApiKey();
  if (!apiKey || drivers.length === 0) return null;

  const originStr = `${origin.lat},${origin.lng}`;
  const destinations = drivers.map((d) => `${d.lat},${d.lng}`).join("|");
  const departureTime = Math.floor(Date.now() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originStr)}&destinations=${encodeURIComponent(destinations)}&mode=driving&departure_time=${departureTime}&traffic_model=best_guess&key=${encodeURIComponent(apiKey)}`;

  const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json() as {
    status?: string;
    rows?: Array<{ elements?: MatrixElement[] }>;
  };

  if (json.status !== "OK" || !json.rows?.[0]?.elements) return null;

  const elements = json.rows[0].elements;
  if (elements.length !== drivers.length) return null;

  const out = new Map<string, number>();
  for (let i = 0; i < drivers.length; i++) {
    const el = elements[i];
    if (el.status !== "OK") continue;
    const seconds = el.duration_in_traffic?.value ?? el.duration?.value;
    if (seconds == null) continue;
    out.set(drivers[i].user_id, seconds);
  }

  return out.size > 0 ? out : null;
}

/** Driver origins → single pickup destination (nearest-driver ETA for quotes). */
export async function fetchDriverToPickupTimes(
  pickup: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number }>,
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, number> | null> {
  const apiKey = googleMapsRidesApiKey();
  if (!apiKey || drivers.length === 0) return null;

  const origins = drivers.map((d) => `${d.lat},${d.lng}`).join("|");
  const destination = `${pickup.lat},${pickup.lng}`;
  const departureTime = Math.floor(Date.now() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destination)}&mode=driving&departure_time=${departureTime}&traffic_model=best_guess&key=${encodeURIComponent(apiKey)}`;

  const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json() as {
    status?: string;
    rows?: Array<{ elements?: MatrixElement[] }>;
  };

  if (json.status !== "OK" || !json.rows) return null;
  if (json.rows.length !== drivers.length) return null;

  const out = new Map<string, number>();
  for (let i = 0; i < drivers.length; i++) {
    const el = json.rows[i]?.elements?.[0];
    if (!el || el.status !== "OK") continue;
    const seconds = el.duration_in_traffic?.value ?? el.duration?.value;
    if (seconds == null) continue;
    out.set(drivers[i].user_id, seconds);
  }

  return out.size > 0 ? out : null;
}

function haversineNearestPickupSeconds(
  pickup: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number; haversineKm: number }>,
): number {
  let min = Infinity;
  for (const d of drivers) {
    const km = d.haversineKm ??
      haversineKm(pickup.lat, pickup.lng, d.lat, d.lng);
    const sec = Math.max(60, (km / AVG_SPEED_KMH) * 3600);
    if (sec < min) min = sec;
  }
  return Math.round(min === Infinity ? 60 : min);
}

/**
 * Nearest-driver pickup ETA: drivers → pickup Matrix (min drive time).
 */
export async function estimateNearestPickupEta(
  pickup: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number; haversineKm: number }>,
): Promise<PickupEtaEstimate> {
  if (drivers.length === 0) {
    return { pickupSeconds: 60, source: "haversine_fallback" };
  }

  const batch = drivers.slice(0, MAX_MATRIX_DESTINATIONS);
  const cacheKey = pickupEtaCacheKey(pickup.lat, pickup.lng, batch);
  const hit = pickupEtaCache.get(cacheKey);
  if (hit && Date.now() - hit.at < MATRIX_CACHE_TTL_MS) {
    return hit.value;
  }

  let result: PickupEtaEstimate;
  try {
    const times = await fetchDriverToPickupTimes(
      pickup,
      batch.map((d) => ({ user_id: d.user_id, lat: d.lat, lng: d.lng })),
    );

    if (!times) {
      result = {
        pickupSeconds: haversineNearestPickupSeconds(pickup, drivers),
        source: "haversine_fallback",
      };
    } else {
      let min = Infinity;
      for (const d of batch) {
        const sec = times.get(d.user_id) ??
          Math.max(60, (d.haversineKm / AVG_SPEED_KMH) * 3600);
        if (sec < min) min = sec;
      }
      for (const d of drivers.slice(MAX_MATRIX_DESTINATIONS)) {
        const sec = Math.max(60, (d.haversineKm / AVG_SPEED_KMH) * 3600);
        if (sec < min) min = sec;
      }
      result = {
        pickupSeconds: Math.round(min === Infinity ? 60 : min),
        source: "google_distance_matrix",
      };
    }
  } catch {
    result = {
      pickupSeconds: haversineNearestPickupSeconds(pickup, drivers),
      source: "haversine_fallback",
    };
  }

  pickupEtaCache.set(cacheKey, { value: result, at: Date.now() });
  return result;
}

/**
 * Rank drivers by drive time from pickup. Pre-sorted haversine list should already
 * be radius-filtered; only the first MAX_MATRIX_DESTINATIONS are sent to Google.
 */
export async function rankDriversByDriveTime(
  origin: { lat: number; lng: number },
  drivers: Array<{ user_id: string; lat: number; lng: number; haversineKm: number }>,
): Promise<MatrixRankResult> {
  if (drivers.length === 0) {
    return { ranked: [], source: "haversine_fallback" };
  }

  const batch = drivers.slice(0, MAX_MATRIX_DESTINATIONS);
  const cacheKey = matrixCacheKey(
    origin.lat,
    origin.lng,
    batch.map((d) => ({ user_id: d.user_id, lat: d.lat, lng: d.lng })),
  );
  const hit = matrixCache.get(cacheKey);
  if (hit && Date.now() - hit.at < MATRIX_CACHE_TTL_MS) {
    return hit.value;
  }

  let result: MatrixRankResult;
  try {
    const driveTimes = await fetchDistanceMatrixDriveTimes(
      origin,
      batch.map((d) => ({ user_id: d.user_id, lat: d.lat, lng: d.lng })),
    );

    if (!driveTimes) {
      result = haversineRank(origin, drivers);
    } else {
      const rankedBatch = batch
        .map((d) => {
          const driveSeconds = driveTimes.get(d.user_id) ??
            Math.max(60, (d.haversineKm / AVG_SPEED_KMH) * 3600);
          return {
            user_id: d.user_id,
            lat: d.lat,
            lng: d.lng,
            haversineKm: d.haversineKm,
            driveSeconds,
          };
        })
        .sort((a, b) => a.driveSeconds - b.driveSeconds || a.user_id.localeCompare(b.user_id));

      const remainder = drivers.slice(MAX_MATRIX_DESTINATIONS);
      const rankedRemainder = remainder
        .map((d) => ({
          user_id: d.user_id,
          lat: d.lat,
          lng: d.lng,
          haversineKm: d.haversineKm,
          driveSeconds: Math.max(60, (d.haversineKm / AVG_SPEED_KMH) * 3600),
        }))
        .sort((a, b) => a.driveSeconds - b.driveSeconds || a.user_id.localeCompare(b.user_id));

      result = {
        ranked: [...rankedBatch, ...rankedRemainder],
        source: "google_distance_matrix",
      };
    }
  } catch {
    result = haversineRank(origin, drivers);
  }

  matrixCache.set(cacheKey, { value: result, at: Date.now() });
  return result;
}

export { MAX_MATRIX_DESTINATIONS };
