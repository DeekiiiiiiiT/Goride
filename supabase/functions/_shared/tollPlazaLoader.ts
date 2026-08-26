/**
 * Shared toll plaza loader for rides geofence + Toll Brain.
 * Loads KV plazas, org-scopes them, and overlays Toll Info class1.withTag rates.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordBelongsToOrg } from "./orgRecordScope.ts";
import type { TollPlazaVerificationStatus } from "./tollGeofenceCore.ts";

const KV_TABLE = "kv_store_37f42386";
const RATE_SCHEDULE_KEY = "toll:rate_schedule";
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  /** Operational active/inactive (from operationalStatus). */
  status: "active" | "inactive";
  /** Fleet verification workflow (from status field on KV plaza). */
  verificationStatus?: TollPlazaVerificationStatus;
  organizationId?: string;
}

export interface LoadedTollPlaza extends TollPlaza {
  defaultRateMinor: number;
  currency: string;
}

export interface LoadTollPlazasOptions {
  /** When set, apply legacy org filter (matches fleet filterByOrg). */
  organizationId?: string | null;
}

type CacheEntry = {
  orgKey: string;
  plazas: LoadedTollPlaza[];
  at: number;
};

let cached: CacheEntry | null = null;

export function invalidateTollPlazaCache(): void {
  cached = null;
}

/** Alias for toll-brain callers. */
export function invalidatePlazaCache(): void {
  invalidateTollPlazaCache();
}

function pickDefaultRate(
  rates: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const classPriority = ["Class 1", "standard", "car"];
  for (const cls of classPriority) {
    const hit = rates.find((r) => r.vehicleClass === cls);
    if (hit) return hit;
  }
  return rates[0];
}

export function parseKvTollPlaza(
  key: string,
  value: unknown,
): LoadedTollPlaza | null {
  if (!value || typeof value !== "object") return null;

  const v = value as Record<string, unknown>;
  const id = key.replace("toll_plaza:", "");

  const location = v.location as { lat?: number; lng?: number } | undefined;
  if (!location?.lat || !location?.lng) return null;

  const rates = Array.isArray(v.rates)
    ? (v.rates as Record<string, unknown>[])
    : [];
  const defaultRate = pickDefaultRate(rates);
  const orgRaw = v.organizationId;

  // Fleet KV: `status` = verified|unverified|learnt; `operationalStatus` = active|inactive.
  // Legacy rows sometimes used `status: "active"|"inactive"` for operations.
  const statusRaw = String(v.status ?? "").toLowerCase();
  const opRaw = String(v.operationalStatus ?? "").toLowerCase();
  let verificationStatus: TollPlazaVerificationStatus | undefined;
  if (
    statusRaw === "verified" || statusRaw === "unverified" || statusRaw === "learnt"
  ) {
    verificationStatus = statusRaw;
  } else if (
    v.verificationStatus === "verified" ||
    v.verificationStatus === "unverified" ||
    v.verificationStatus === "learnt"
  ) {
    verificationStatus = v.verificationStatus as TollPlazaVerificationStatus;
  }

  const operationalInactive =
    opRaw === "inactive" ||
    opRaw === "under_construction" ||
    statusRaw === "inactive";

  return {
    id,
    name: String(v.name ?? "Unknown Toll"),
    location: {
      lat: Number(location.lat),
      lng: Number(location.lng),
    },
    geofenceRadius: Number(v.geofenceRadius ?? 100),
    rates: rates.map((r) => ({
      vehicleClass: String(r.vehicleClass ?? "standard"),
      amount: Number(r.amount ?? r.rate ?? 0),
      currency: String(r.currency ?? "JMD"),
    })),
    direction: typeof v.direction === "string" ? v.direction : undefined,
    status: operationalInactive ? "inactive" : "active",
    verificationStatus,
    defaultRateMinor: Math.round(
      Number(defaultRate?.amount ?? defaultRate?.rate ?? 0) * 100,
    ),
    currency: String(defaultRate?.currency ?? "JMD"),
    organizationId:
      orgRaw != null && orgRaw !== "" ? String(orgRaw) : undefined,
  };
}

type SchedulePlaza = {
  plazaId?: string;
  plazaName?: string;
  rates?: Record<string, { withTag?: number; withoutTag?: number }> | unknown;
};

/** Extract current schedule plaza list from Toll Info KV document. */
export function schedulePlazasFromTollInfo(
  raw: unknown,
): SchedulePlaza[] {
  if (!raw || typeof raw !== "object") return [];
  const doc = raw as Record<string, unknown>;
  const current = (doc.current as Record<string, unknown>) || doc;
  return Array.isArray(current.plazas) ? (current.plazas as SchedulePlaza[]) : [];
}

/**
 * Overlay Toll Info class1.withTag onto linked plazas so geofence gating
 * (defaultRateMinor > 0) works even when AddTollPlazaModal never wrote rates[].
 */
export function applyTollInfoRateOverlay(
  plazas: LoadedTollPlaza[],
  scheduleRaw: unknown,
): LoadedTollPlaza[] {
  const schedulePlazas = schedulePlazasFromTollInfo(scheduleRaw);
  if (schedulePlazas.length === 0) return plazas;

  for (const p of plazas) {
    const hit = schedulePlazas.find(
      (sp) =>
        sp?.plazaId === p.id ||
        String(sp?.plazaName || "").toLowerCase() === p.name.toLowerCase(),
    );
    if (!hit) continue;

    const ratesObj =
      hit.rates && typeof hit.rates === "object" && !Array.isArray(hit.rates)
        ? (hit.rates as Record<string, { withTag?: number }>)
        : null;
    const class1 = ratesObj?.class1;
    const withTag = Number(class1?.withTag);
    if (!(withTag > 0)) continue;

    p.defaultRateMinor = Math.round(withTag * 100);
    p.rates = [
      { vehicleClass: "Class 1", amount: withTag, currency: "JMD" },
      ...(ratesObj
        ? Object.entries(ratesObj)
          .filter(([cid]) => cid !== "class1")
          .map(([cid, r]) => ({
            vehicleClass: cid.replace("class", "Class "),
            amount: Number(r?.withTag) || 0,
            currency: "JMD",
          }))
        : []),
    ];
    p.currency = "JMD";
  }
  return plazas;
}

async function loadRateScheduleValue(
  db: SupabaseClient,
): Promise<unknown | null> {
  const { data, error } = await db
    .from(KV_TABLE)
    .select("key, value")
    .eq("key", RATE_SCHEDULE_KEY)
    .maybeSingle();
  if (error) {
    console.warn("[tollPlazaLoader] Toll Info schedule load failed:", error.message);
    return null;
  }
  return (data as { value?: unknown } | null)?.value ?? null;
}

export async function loadTollPlazas(
  db: SupabaseClient,
  options?: LoadTollPlazasOptions,
): Promise<LoadedTollPlaza[]> {
  const organizationId = options?.organizationId ?? null;
  const orgKey = organizationId ?? "__all__";
  const now = Date.now();
  if (cached && cached.orgKey === orgKey && now - cached.at < CACHE_TTL_MS) {
    return cached.plazas;
  }

  try {
    const { data, error } = await db
      .from(KV_TABLE)
      .select("key, value")
      .like("key", "toll_plaza:%")
      .limit(500);

    if (error) {
      console.error("[tollPlazaLoader] Failed to load toll plazas:", error.message);
      return cached?.orgKey === orgKey ? cached.plazas : cached?.plazas ?? [];
    }

    const plazas: LoadedTollPlaza[] = [];
    for (const row of data ?? []) {
      const raw = row.value as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") continue;
      if (!recordBelongsToOrg(raw, organizationId)) continue;
      const parsed = parseKvTollPlaza(row.key, raw);
      if (parsed && parsed.status === "active") {
        plazas.push(parsed);
      }
    }

    try {
      const scheduleRaw = await loadRateScheduleValue(db);
      if (scheduleRaw) applyTollInfoRateOverlay(plazas, scheduleRaw);
    } catch (overlayErr) {
      console.warn("[tollPlazaLoader] Toll Info overlay skipped:", overlayErr);
    }

    cached = { orgKey, plazas, at: now };
    return plazas;
  } catch (e) {
    console.error("[tollPlazaLoader] Error:", e);
    return cached?.orgKey === orgKey ? cached.plazas : cached?.plazas ?? [];
  }
}

/** toll-brain-compatible alias. */
export async function loadPlazas(
  db: SupabaseClient,
  options?: LoadTollPlazasOptions,
): Promise<LoadedTollPlaza[]> {
  return loadTollPlazas(db, options);
}

export async function loadTollPlazaById(
  db: SupabaseClient,
  tollId: string,
  options?: LoadTollPlazasOptions,
): Promise<LoadedTollPlaza | null> {
  const plazas = await loadTollPlazas(db, options);
  return plazas.find((p) => p.id === tollId) ?? null;
}
