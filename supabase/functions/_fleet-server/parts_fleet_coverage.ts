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
    organizationName: string;
    vehicleCount: number;
    coveredCount: number;
    coveragePct: number;
    missingOpCodes: string[];
  }>;
};

type FleetVehicleRow = {
  organization_id?: string | null;
  year?: number | null;
  status?: string | null;
  vehicle_catalog_id?: string | null;
  make?: string | null;
  model?: string | null;
};

function activeStatus(status: string): boolean {
  return !RETIRED.has(status.toLowerCase());
}

/** Active fleet vehicles, capped per fleet, scored in one database call. */
export async function loadFleetCoverage(
  supabase: SupabaseClient,
  organizationId?: string | null,
): Promise<FleetCoverage> {
  const fromSql = await loadSqlFleetVehicles(supabase);
  const fromKv = ((await kv.getByPrefix("vehicle:")) || []).filter((v) => {
    if (!v || typeof v !== "object") return false;
    const status = String((v as { status?: string }).status ?? "active");
    return activeStatus(status);
  }) as Record<string, unknown>[];
  const seen = new Set(fromSql.map((v) => `${orgOf(v)}:${storedCatalogId(v) ?? ""}:${String(v.year ?? "")}`));
  const active = [
    ...fromSql,
    ...fromKv.filter((v) => !seen.has(`${orgOf(v)}:${storedCatalogId(v) ?? ""}:${String(v.year ?? "")}`)),
  ];
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
  const byOrg = Array.isArray(row.byOrg) ? row.byOrg : [];
  const names = await organizationNames(supabase, byOrg.map((org) => String(org.organizationId ?? "")));
  return {
    coveragePct: Number(row.coveragePct ?? 0),
    vehicleCount: Number(row.vehicleCount ?? 0),
    coveredCount: Number(row.coveredCount ?? 0),
    componentsRequired: Number(row.componentsRequired ?? 10),
    components: Array.isArray(row.components) ? row.components : [],
    missing: Array.isArray(row.missing) ? row.missing : [],
    byOrg: byOrg.map((org) => ({
      ...org,
      organizationName: names.get(String(org.organizationId ?? "")) || String(org.organizationId ?? ""),
    })),
  };
}

async function loadSqlFleetVehicles(supabase: SupabaseClient): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("organization_id, year, status, vehicle_catalog_id, make, model");
  if (error) throw error;
  return ((data || []) as FleetVehicleRow[])
    .filter((row) => activeStatus(String(row.status ?? "active")))
    .map((row) => ({
      organizationId: row.organization_id ?? "",
      year: row.year,
      status: row.status,
      vehicle_catalog_id: row.vehicle_catalog_id,
      make: row.make,
      model: row.model,
    }));
}

async function organizationNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data, error } = await supabase.from("organizations").select("id, name").in("id", unique);
  if (error || !data) return names;
  for (const row of data as Array<{ id: string; name?: string | null }>) {
    if (row.name) names.set(String(row.id), row.name);
  }
  return names;
}
