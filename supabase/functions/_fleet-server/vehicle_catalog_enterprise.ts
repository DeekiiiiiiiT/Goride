/**
 * Vehicle catalog enterprise helpers — dependency counts, fleet KV refs,
 * existential catalog existence cache (gate + delete guards).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CatalogDependencyCounts = {
  maintenanceTemplates: number;
  partFitments: number;
  fleetVehicles: number;
};

export type FleetCatalogRef = {
  vehicleId: string;
  organizationId: string | null;
  label: string | null;
  vehicle_catalog_id: string;
};

export function isCatalogUuid(id: string): boolean {
  return UUID_RE.test(String(id ?? "").trim());
}

/** Scan Deno KV vehicles for catalog id references. */
export async function findFleetVehiclesForCatalogIds(
  catalogIds: Iterable<string>,
): Promise<FleetCatalogRef[]> {
  const want = new Set(
    [...catalogIds].map((id) => String(id ?? "").trim()).filter((id) => UUID_RE.test(id)),
  );
  if (want.size === 0) return [];
  const vehicles = await kv.getByPrefix("vehicle:");
  const out: FleetCatalogRef[] = [];
  for (const raw of vehicles) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const cid =
      typeof v.vehicle_catalog_id === "string"
        ? v.vehicle_catalog_id.trim()
        : typeof v.vehicleCatalogId === "string"
          ? v.vehicleCatalogId.trim()
          : "";
    if (!cid || !want.has(cid)) continue;
    const vehicleId = String(v.id ?? "").trim();
    if (!vehicleId) continue;
    const plate =
      typeof v.licensePlate === "string"
        ? v.licensePlate
        : typeof v.plate === "string"
          ? v.plate
          : null;
    const make = typeof v.make === "string" ? v.make : "";
    const model = typeof v.model === "string" ? v.model : "";
    const label = [make, model, plate].filter(Boolean).join(" ").trim() || null;
    out.push({
      vehicleId,
      organizationId:
        typeof v.organizationId === "string"
          ? v.organizationId
          : typeof v.organization_id === "string"
            ? v.organization_id
            : null,
      label,
      vehicle_catalog_id: cid,
    });
  }
  return out;
}

export async function countCatalogDependencies(
  supabase: SupabaseClient,
  catalogId: string,
): Promise<CatalogDependencyCounts> {
  const id = String(catalogId ?? "").trim();
  const [tpl, fit, fleet] = await Promise.all([
    supabase
      .from("maintenance_task_templates")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_catalog_id", id),
    supabase
      .from("part_fitment")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_catalog_id", id),
    findFleetVehiclesForCatalogIds([id]),
  ]);
  if (tpl.error) throw tpl.error;
  if (fit.error) throw fit.error;
  return {
    maintenanceTemplates: tpl.count ?? 0,
    partFitments: fit.count ?? 0,
    fleetVehicles: fleet.length,
  };
}

export async function countCatalogDependenciesForIds(
  supabase: SupabaseClient,
  catalogIds: string[],
): Promise<CatalogDependencyCounts> {
  const ids = [...new Set(catalogIds.map((id) => String(id).trim()).filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) {
    return { maintenanceTemplates: 0, partFitments: 0, fleetVehicles: 0 };
  }
  const [tpl, fit, fleet] = await Promise.all([
    supabase
      .from("maintenance_task_templates")
      .select("id", { count: "exact", head: true })
      .in("vehicle_catalog_id", ids),
    supabase
      .from("part_fitment")
      .select("id", { count: "exact", head: true })
      .in("vehicle_catalog_id", ids),
    findFleetVehiclesForCatalogIds(ids),
  ]);
  if (tpl.error) throw tpl.error;
  if (fit.error) throw fit.error;
  return {
    maintenanceTemplates: tpl.count ?? 0,
    partFitments: fit.count ?? 0,
    fleetVehicles: fleet.length,
  };
}

export function dependenciesBlockDelete(deps: CatalogDependencyCounts): boolean {
  return deps.maintenanceTemplates > 0 || deps.partFitments > 0 || deps.fleetVehicles > 0;
}

/** Short-TTL existence cache for gate checks. */
const existenceCache = new Map<string, { ok: boolean; expires: number }>();
const EXISTENCE_TTL_MS = 30_000;

export async function catalogIdExists(
  supabase: SupabaseClient,
  catalogId: string,
): Promise<boolean> {
  const id = String(catalogId ?? "").trim();
  if (!UUID_RE.test(id)) return false;
  const now = Date.now();
  const hit = existenceCache.get(id);
  if (hit && hit.expires > now) return hit.ok;
  const { data, error } = await supabase.from("vehicle_catalog").select("id").eq("id", id).maybeSingle();
  if (error) {
    console.error("[vehicle-catalog] existence check:", error.message);
    // Fail open on transient DB errors so we do not park the whole fleet on outage.
    return true;
  }
  const ok = Boolean(data?.id);
  existenceCache.set(id, { ok, expires: now + EXISTENCE_TTL_MS });
  return ok;
}

export function invalidateCatalogExistenceCache(catalogId?: string): void {
  if (catalogId) existenceCache.delete(String(catalogId).trim());
  else existenceCache.clear();
}

/** Orphan report: KV vehicles pointing at missing catalog rows. */
export async function listCatalogOrphanVehicles(
  supabase: SupabaseClient,
): Promise<Array<FleetCatalogRef & { reason: "missing_catalog_row" | "invalid_catalog_id" }>> {
  const vehicles = await kv.getByPrefix("vehicle:");
  const refs: FleetCatalogRef[] = [];
  for (const raw of vehicles) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const cid =
      typeof v.vehicle_catalog_id === "string"
        ? v.vehicle_catalog_id.trim()
        : typeof v.vehicleCatalogId === "string"
          ? v.vehicleCatalogId.trim()
          : "";
    if (!cid) continue;
    const vehicleId = String(v.id ?? "").trim();
    if (!vehicleId) continue;
    const plate =
      typeof v.licensePlate === "string"
        ? v.licensePlate
        : typeof v.plate === "string"
          ? v.plate
          : null;
    const make = typeof v.make === "string" ? v.make : "";
    const model = typeof v.model === "string" ? v.model : "";
    refs.push({
      vehicleId,
      organizationId:
        typeof v.organizationId === "string"
          ? v.organizationId
          : typeof v.organization_id === "string"
            ? v.organization_id
            : null,
      label: [make, model, plate].filter(Boolean).join(" ").trim() || null,
      vehicle_catalog_id: cid,
    });
  }
  const validIds = [...new Set(refs.map((r) => r.vehicle_catalog_id).filter((id) => UUID_RE.test(id)))];
  const existing = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < validIds.length; i += CHUNK) {
    const slice = validIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("vehicle_catalog").select("id").in("id", slice);
    if (error) throw error;
    for (const row of data || []) {
      if (row?.id) existing.add(String(row.id));
    }
  }
  const out: Array<FleetCatalogRef & { reason: "missing_catalog_row" | "invalid_catalog_id" }> = [];
  for (const r of refs) {
    if (!UUID_RE.test(r.vehicle_catalog_id)) {
      out.push({ ...r, reason: "invalid_catalog_id" });
    } else if (!existing.has(r.vehicle_catalog_id)) {
      out.push({ ...r, reason: "missing_catalog_row" });
    }
  }
  return out;
}

export function stampCatalogProvenance(
  row: Record<string, unknown>,
  opts: {
    userId: string | null;
    source?: "manual" | "csv_import" | "pending_approve";
    importBatchId?: string | null;
    isCreate: boolean;
  },
): void {
  const nowUser = opts.userId && UUID_RE.test(opts.userId) ? opts.userId : null;
  if (opts.isCreate) {
    row.created_by = nowUser;
    if (opts.source) row.source = opts.source;
    else if (row.source == null || row.source === "") row.source = "manual";
    // Only new rows carry the batch id — undo-batch must not delete pre-existing updates.
    if (opts.importBatchId !== undefined) {
      row.import_batch_id = opts.importBatchId;
    }
  } else {
    if (opts.source) row.source = opts.source;
  }
  row.updated_by = nowUser;
}
