/**
 * Toll Brain detect helpers (plaza proximity).
 * Uses shared geo + KV plaza catalog.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { distanceMeters } from "../_shared/geo.ts";
import { isPointNearPlaza, routeCrossesPlaza, type TollPlazaGeo } from "../_shared/tollGeofenceCore.ts";

export interface LoadedPlaza extends TollPlazaGeo {
  currency: string;
}

let cache: { plazas: LoadedPlaza[]; at: number } | null = null;
const TTL = 5 * 60 * 1000;

export function invalidatePlazaCache() {
  cache = null;
}

export async function loadPlazas(db: SupabaseClient): Promise<LoadedPlaza[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.plazas;
  const { data, error } = await db
    .from("kv_store_37f42386")
    .select("key, value")
    .like("key", "toll_plaza:%")
    .limit(500);
  if (error) {
    console.error("[toll-brain] plaza load failed", error.message);
    return cache?.plazas || [];
  }
  const plazas: LoadedPlaza[] = [];
  for (const row of data || []) {
    const v = row.value as Record<string, unknown>;
    if (!v || typeof v !== "object") continue;
    if (v.operationalStatus === "inactive" || v.status === "inactive") continue;
    const loc = v.location as { lat?: number; lng?: number } | undefined;
    if (!loc?.lat || !loc?.lng) continue;
    const rates = Array.isArray(v.rates) ? v.rates as Record<string, unknown>[] : [];
    const rate = rates.find((r) => r.vehicleClass === "Class 1") || rates[0];
    const amount = Number(rate?.amount ?? rate?.rate ?? 0);
    plazas.push({
      id: String(row.key).replace("toll_plaza:", ""),
      name: String(v.name ?? "Unknown Toll"),
      location: { lat: Number(loc.lat), lng: Number(loc.lng) },
      geofenceRadius: Number(v.geofenceRadius ?? 100),
      defaultRateMinor: Math.round(amount * 100),
      currency: String(rate?.currency ?? "JMD"),
    });
  }
  cache = { plazas, at: Date.now() };
  return plazas;
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
  const cooldownMode = !!input.recentByPlaza;
  const cooldownMs = input.cooldownMs ?? 5 * 60 * 1000;
  const nowMs = input.nowMs ?? Date.now();
  const point = { lat: input.lat, lng: input.lng };
  const tollsCrossed: Array<{
    tollPlazaId: string;
    tollPlazaName: string;
    tollAmountMinor: number;
    currency: string;
    driverLat: number;
    driverLng: number;
  }> = [];
  let totalTollsMinor = 0;

  for (const plaza of input.plazas) {
    if (!(plaza.defaultRateMinor > 0)) continue;
    if (cooldownMode) {
      const last = input.recentByPlaza![plaza.id];
      if (last !== undefined && nowMs - last < cooldownMs) continue;
    } else if (already.has(plaza.id)) {
      continue;
    }
    if (!isPointNearPlaza(point, plaza, input.geofenceRadiusM)) continue;
    tollsCrossed.push({
      tollPlazaId: plaza.id,
      tollPlazaName: plaza.name,
      tollAmountMinor: plaza.defaultRateMinor,
      currency: plaza.currency,
      driverLat: input.lat,
      driverLng: input.lng,
    });
    totalTollsMinor += plaza.defaultRateMinor;
  }
  return { tollsCrossed, totalTollsMinor };
}

export function estimateRoute(input: {
  points: Array<{ lat: number; lng: number }>;
  plazas: LoadedPlaza[];
  geofenceRadiusM: number;
}): { plazaIds: string[]; totalTollsMinor: number; currency: string } {
  const hit: LoadedPlaza[] = [];
  for (const plaza of input.plazas) {
    if (routeCrossesPlaza(input.points, plaza, input.geofenceRadiusM)) {
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
