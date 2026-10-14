import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";

const RETIRED = new Set(["retired", "sold", "inactive", "archived"]);

function orgOf(vehicle: Record<string, unknown>): string {
  return String(vehicle.organizationId || vehicle.organization_id || "");
}

const CATALOG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storedCatalogId(vehicle: Record<string, unknown>): string | null {
  const raw = vehicle.vehicle_catalog_id;
  if (typeof raw === "string" && CATALOG_UUID.test(raw.trim())) return raw.trim();
  return null;
}

export type FleetCoverage = {
  coveragePct: number;
  vehicleCount: number;
  coveredCount: number;
  componentsRequired: number;
  components: Array<{ opCode: string; name: string; matchedVehicles: number }>;
  missing: Array<{ opCode: string; name: string }>;
  byOrg: Array<{
    organizationId: string;
    vehicleCount: number;
    coveredCount: number;
    coveragePct: number;
    missingOpCodes: string[];
  }>;
};

/** Active fleet vehicles, capped per fleet, scored in one database call. */
export async function loadFleetCoverage(
  supabase: SupabaseClient,
  organizationId?: string | null,
): Promise<FleetCoverage> {
  const vehicles = await kv.getByPrefix("vehicle:");
  const active = (vehicles || []).filter((v) => {
    if (!v || typeof v !== "object") return false;
    const status = String((v as { status?: string }).status ?? "active").toLowerCase();
    return !RETIRED.has(status);
  }) as Record<string, unknown>[];
  const scoped = organizationId
    ? active.filter((v) => orgOf(v) === organizationId)
    : active;

  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const vehicle of scoped) {
    const oid = orgOf(vehicle);
    const list = buckets.get(oid) ?? [];
    if (list.length >= 400) continue;
    list.push(vehicle);
    buckets.set(oid, list);
  }

  const picked: Record<string, unknown>[] = [];
  for (const list of buckets.values()) {
    for (const vehicle of list) {
      if (picked.length >= 2000) break;
      picked.push(vehicle);
    }
  }

  const payload: Array<{ organizationId: string; catalogId: string | null; year: number | null }> = [];
  for (const vehicle of picked) {
    const catalogId = storedCatalogId(vehicle) ?? await resolveCatalogIdForKvVehicle(supabase, vehicle);
    const year = Number(vehicle.year);
    payload.push({
      organizationId: orgOf(vehicle),
      catalogId,
      year: Number.isFinite(year) ? year : null,
    });
  }

  const { data, error } = await supabase.rpc("parts_fleet_coverage", { p_vehicles: payload });
  if (error) throw error;
  const row = (data ?? {}) as Partial<FleetCoverage>;
  return {
    coveragePct: Number(row.coveragePct ?? 0),
    vehicleCount: Number(row.vehicleCount ?? 0),
    coveredCount: Number(row.coveredCount ?? 0),
    componentsRequired: Number(row.componentsRequired ?? 10),
    components: Array.isArray(row.components) ? row.components : [],
    missing: Array.isArray(row.missing) ? row.missing : [],
    byOrg: Array.isArray(row.byOrg) ? row.byOrg : [],
  };
}
