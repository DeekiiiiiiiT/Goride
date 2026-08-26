/**
 * Toll Brain detect helpers (plaza proximity).
 * Uses shared segment matcher + shared plaza loader.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { distanceMeters, type LatLng } from "../_shared/geo.ts";
import {
  evaluateLiveFixAgainstPlazas,
  ROUND_TRIP_COOLDOWN_MS,
  routeCrossesPlaza,
  type TollPlazaGeo,
} from "../_shared/tollGeofenceCore.ts";
import {
  invalidatePlazaCache,
  loadPlazas as loadSharedPlazas,
  type LoadedTollPlaza,
  type LoadTollPlazasOptions,
} from "../_shared/tollPlazaLoader.ts";

export type LoadedPlaza = LoadedTollPlaza;

export { invalidatePlazaCache };

export async function loadPlazas(
  db: SupabaseClient,
  options?: LoadTollPlazasOptions,
): Promise<LoadedPlaza[]> {
  return loadSharedPlazas(db, options);
}

function toPlazaGeo(p: LoadedPlaza): TollPlazaGeo {
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    geofenceRadius: p.geofenceRadius,
    defaultRateMinor: p.defaultRateMinor,
    currency: p.currency,
    direction: p.direction,
    verificationStatus: p.verificationStatus,
  };
}

export function evaluatePoint(input: {
  lat: number;
  lng: number;
  plazas: LoadedPlaza[];
  geofenceRadiusM: number;
  alreadyCrossedPlazaIds?: string[];
  recentByPlaza?: Record<string, number>;
  cooldownMs?: number;
  nowMs?: number;
  /** Previous fix for segment-to-circle matching. */
  prevLat?: number | null;
  prevLng?: number | null;
}): {
  tollsCrossed: Array<{
    tollPlazaId: string;
    tollPlazaName: string;
    tollAmountMinor: number;
    currency: string;
    driverLat: number;
    driverLng: number;
  }>;
  totalTollsMinor: number;
} {
  const already = new Set(input.alreadyCrossedPlazaIds || []);
  const cooldownMs = input.cooldownMs ?? ROUND_TRIP_COOLDOWN_MS;
  const nowMs = input.nowMs ?? Date.now();
  const curr = { lat: input.lat, lng: input.lng };
  const prev: LatLng | null =
    input.prevLat != null && input.prevLng != null &&
      Number.isFinite(input.prevLat) && Number.isFinite(input.prevLng)
      ? { lat: Number(input.prevLat), lng: Number(input.prevLng) }
      : null;

  const recentByPlaza = input.recentByPlaza
    ? new Map(Object.entries(input.recentByPlaza).map(([k, v]) => [k, Number(v)]))
    : undefined;

  const hits = evaluateLiveFixAgainstPlazas(prev, curr, input.plazas.map(toPlazaGeo), {
    fallbackRadiusM: input.geofenceRadiusM,
    requireVerified: true,
    enforceDirection: true,
    recentByPlaza,
    cooldownMs,
    nowMs,
    alreadyCrossed: already,
  });

  const tollsCrossed = hits.map((h) => ({
    tollPlazaId: h.plazaId,
    tollPlazaName: h.plazaName,
    tollAmountMinor: h.tollAmountMinor,
    currency: h.currency,
    driverLat: h.lat,
    driverLng: h.lng,
  }));
  const totalTollsMinor = tollsCrossed.reduce((s, c) => s + c.tollAmountMinor, 0);
  return { tollsCrossed, totalTollsMinor };
}

export function estimateRoute(input: {
  points: Array<{ lat: number; lng: number }>;
  plazas: LoadedPlaza[];
  geofenceRadiusM: number;
}): { plazaIds: string[]; totalTollsMinor: number; currency: string } {
  const hit: LoadedPlaza[] = [];
  for (const plaza of input.plazas) {
    if (routeCrossesPlaza(input.points, toPlazaGeo(plaza), input.geofenceRadiusM)) {
      hit.push(plaza);
    }
  }
  const totalTollsMinor = hit.reduce((s, p) => s + p.defaultRateMinor, 0);
  return {
    plazaIds: hit.map((p) => p.id),
    totalTollsMinor,
    currency: hit[0]?.currency || "JMD",
  };
}

export { distanceMeters };
export type { TollPlazaGeo };
