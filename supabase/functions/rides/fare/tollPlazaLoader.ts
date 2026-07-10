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
  const classPriority = ["Class 1", "standard", "car"];
  let defaultRate: Record<string, unknown> | undefined;
  for (const cls of classPriority) {
    const hit = rates.find((r: Record<string, unknown>) => r.vehicleClass === cls);
    if (hit) {
      defaultRate = hit as Record<string, unknown>;
      break;
    }
  }
  if (!defaultRate && rates.length > 0) {
    defaultRate = rates[0] as Record<string, unknown>;
  }
  
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
      amount: Number(r.amount ?? r.rate ?? 0),
      currency: String(r.currency ?? "JMD"),
    })),
    direction: typeof v.direction === "string" ? v.direction : undefined,
    status:
      v.operationalStatus === "inactive" || v.status === "inactive"
        ? "inactive"
        : "active",
    defaultRateMinor: Math.round(
      Number(defaultRate?.amount ?? defaultRate?.rate ?? 0) * 100,
    ),
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

    // Overlay Super Admin Toll Info rates (single source of truth) when linked.
    try {
      const { data: scheduleRows } = await db
        .from("kv_store_37f42386")
        .select("key, value")
        .eq("key", "toll:rate_schedule")
        .maybeSingle();
      const raw = scheduleRows?.value as Record<string, unknown> | null;
      const current = (raw?.current as Record<string, unknown>) || raw;
      const schedulePlazas = Array.isArray(current?.plazas) ? current.plazas : [];
      for (const p of plazas) {
        const hit = schedulePlazas.find(
          (sp: any) => sp?.plazaId === p.id || String(sp?.plazaName || "").toLowerCase() === p.name.toLowerCase(),
        );
        const class1 = hit?.rates?.class1;
        const withTag = Number(class1?.withTag);
        if (withTag > 0) {
          p.defaultRateMinor = Math.round(withTag * 100);
          p.rates = [
            { vehicleClass: "Class 1", amount: withTag, currency: "JMD" },
            ...(Array.isArray(hit.rates)
              ? []
              : Object.entries(hit.rates || {}).map(([cid, r]: [string, any]) => ({
                  vehicleClass: cid.replace("class", "Class "),
                  amount: Number(r?.withTag) || 0,
                  currency: "JMD",
                }))),
          ];
          p.currency = "JMD";
        }
      }
    } catch (overlayErr) {
      console.warn("[tollPlazaLoader] Toll Info overlay skipped:", overlayErr);
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
