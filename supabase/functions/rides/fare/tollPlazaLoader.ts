/**
 * Toll plaza loader from KV store.
 * Loads and caches toll plaza data for geofence evaluation.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TollPlaza {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  geofenceRadius: number;
  rates: {
    vehicleClass: string;
    amount: number;
    currency: string;
  }[];
  direction?: string;
  status: "active" | "inactive";
}

export interface LoadedTollPlaza extends TollPlaza {
  defaultRateMinor: number;
  currency: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: { plazas: LoadedTollPlaza[]; at: number } | null = null;

export function invalidateTollPlazaCache(): void {
  cached = null;
}

function parseKvTollPlaza(key: string, value: unknown): LoadedTollPlaza | null {
  if (!value || typeof value !== "object") return null;
  
  const v = value as Record<string, unknown>;
  const id = key.replace("toll_plaza:", "");
  
  const location = v.location as { lat?: number; lng?: number } | undefined;
  if (!location?.lat || !location?.lng) return null;
  
  const rates = Array.isArray(v.rates) ? v.rates : [];
  const defaultRate = rates.find((r: { vehicleClass?: string }) => 
    r.vehicleClass === "standard" || r.vehicleClass === "car"
  ) || rates[0];
  
  return {
    id,
    name: String(v.name ?? "Unknown Toll"),
    location: {
      lat: Number(location.lat),
      lng: Number(location.lng),
    },
    geofenceRadius: Number(v.geofenceRadius ?? 100),
    rates: rates.map((r: Record<string, unknown>) => ({
      vehicleClass: String(r.vehicleClass ?? "standard"),
      amount: Number(r.amount ?? 0),
      currency: String(r.currency ?? "JMD"),
    })),
    direction: typeof v.direction === "string" ? v.direction : undefined,
    status: v.status === "active" ? "active" : "inactive",
    defaultRateMinor: Math.round((Number(defaultRate?.amount ?? 0)) * 100),
    currency: String(defaultRate?.currency ?? "JMD"),
  };
}

export async function loadTollPlazas(
  db: SupabaseClient,
): Promise<LoadedTollPlaza[]> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.plazas;
  }

  try {
    const { data, error } = await db
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "toll_plaza:%");

    if (error) {
      console.error("[tollPlazaLoader] Failed to load toll plazas:", error.message);
      return cached?.plazas ?? [];
    }

    const plazas: LoadedTollPlaza[] = [];
    for (const row of data ?? []) {
      const parsed = parseKvTollPlaza(row.key, row.value);
      if (parsed && parsed.status === "active") {
        plazas.push(parsed);
      }
    }

    cached = { plazas, at: now };
    return plazas;
  } catch (e) {
    console.error("[tollPlazaLoader] Error:", e);
    return cached?.plazas ?? [];
  }
}

export async function loadTollPlazaById(
  db: SupabaseClient,
  tollId: string,
): Promise<LoadedTollPlaza | null> {
  const plazas = await loadTollPlazas(db);
  return plazas.find((p) => p.id === tollId) ?? null;
}
