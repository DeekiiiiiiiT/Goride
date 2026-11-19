/**
 * Slice C — fleet parts bell notices (LC-08).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type FleetPartsNoticeItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  carLabel: string | null;
  /** The car model the notice is about (the route turns it into one of the fleet's cars: vehicleId). */
  vehicleCatalogId: string | null;
  /** One of this fleet's cars of that model, so the bell can open Find parts for it (set by the route). */
  vehicleId?: string | null;
  jobId: string | null;
  jobName: string | null;
  places: string[] | null;
};

export async function listFleetPartsNotices(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ items: FleetPartsNoticeItem[]; unreadCount: number }> {
  const { data, error } = await supabase
    .from("fleet_parts_notices")
    .select(
      "id, kind, title, body, created_at, read_at, vehicle_catalog_id, maintenance_component_id, position_codes",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const rows = data ?? [];

  const vcatIds = [
    ...new Set(
      rows
        .map((r) => (r as { vehicle_catalog_id?: string }).vehicle_catalog_id)
        .filter((id): id is string => Boolean(id))
        .map(String),
    ),
  ];
  const jobIds = [
    ...new Set(
      rows
        .map((r) => (r as { maintenance_component_id?: string }).maintenance_component_id)
        .filter((id): id is string => Boolean(id))
        .map(String),
    ),
  ];

  const carById = new Map<string, string>();
  if (vcatIds.length) {
    const { data: vcRows, error: vcErr } = await supabase
      .from("vehicle_catalog")
      .select("id, make, model, production_start_year")
      .in("id", vcatIds);
    if (vcErr) throw vcErr;
    for (const row of vcRows ?? []) {
      const r = row as { id: string; make?: string; model?: string; production_start_year?: number };
      carById.set(String(r.id), [r.make, r.model, r.production_start_year].filter((x) => x != null && x !== "").join(" "));
    }
  }

  const jobById = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobRows, error: jobErr } = await supabase
      .from("maintenance_service_categories")
      .select("id, name")
      .in("id", jobIds);
    if (jobErr) throw jobErr;
    for (const row of jobRows ?? []) {
      jobById.set(String((row as { id: string }).id), String((row as { name?: string }).name ?? ""));
    }
  }

  const { count: unreadCount, error: unreadErr } = await supabase
    .from("fleet_parts_notices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("read_at", null);
  if (unreadErr) throw unreadErr;

  const items: FleetPartsNoticeItem[] = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const vcatId = r.vehicle_catalog_id != null ? String(r.vehicle_catalog_id) : null;
    const jobId = r.maintenance_component_id != null ? String(r.maintenance_component_id) : null;
    return {
      id: String(r.id),
      kind: String(r.kind ?? ""),
      title: String(r.title ?? ""),
      body: String(r.body ?? ""),
      createdAt: String(r.created_at ?? ""),
      read: r.read_at != null,
      carLabel: vcatId ? (carById.get(vcatId) ?? null) : null,
      vehicleCatalogId: vcatId,
      jobId,
      jobName: jobId ? (jobById.get(jobId) ?? null) : null,
      places: Array.isArray(r.position_codes) ? r.position_codes.map(String) : null,
    };
  });

  return { items, unreadCount: unreadCount ?? 0 };
}

/** First of the fleet's cars linked to each car model (by its explicit catalogue link). */
export function vehicleIdByCatalog(
  cars: Array<Record<string, unknown>>,
  catalogLinkOf: (car: Record<string, unknown>) => string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const car of cars) {
    const link = catalogLinkOf(car);
    const id = String(car.id ?? "").trim();
    if (link && id && !out.has(link)) out.set(link, id);
  }
  return out;
}
/**
 * This company's first car of each model in the notices (code review #8): one org-scoped read of fleet_vehicles
 * for just those models, instead of every company's cars on each bell poll. The link is read the same way as
 * readExplicitCatalogLink (payload first, then the column).
 */
export async function orgVehicleIdByCatalog(
  supabase: SupabaseClient,
  orgId: string,
  catalogIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(catalogIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length || !orgId) return new Map();
  const list = ids.join(",");
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("id, vehicle_catalog_id, payload_link:payload_json->>vehicle_catalog_id")
    .eq("organization_id", orgId)
    .or(`vehicle_catalog_id.in.(${list}),payload_json->>vehicle_catalog_id.in.(${list})`)
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw error;
  const wanted = new Set(ids);
  return vehicleIdByCatalog(
    (data ?? []) as Array<Record<string, unknown>>,
    (car) => {
      const link = String(car.payload_link ?? car.vehicle_catalog_id ?? "").trim();
      return wanted.has(link) ? link : null;
    },
  );
}
