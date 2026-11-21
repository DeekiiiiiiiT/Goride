/**
 * part_fitment's replacement (docs/research-engine-audit.md RE-12): every reader of the old, empty part_fitment
 * table reads part_listing through here, in part_fitment's JSON shape, so the admin and fleet apps see no change.
 * One row per listing (car + interchange group + position); the group's part is its first part by name, so a part
 * is never listed twice for the same car and place.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type FitmentShapedRow = {
  id: string;
  part_id: string;
  vehicle_catalog_id: string;
  chassis_code: string | null;
  engine_code: string | null;
  year_from: number | null;
  year_to: number | null;
  position: string | null;
  side: string | null;
  trust: string | null;
  created_at: string | null;
  updated_at: string | null;
  part_master: Record<string, unknown>;
};

type ListingRow = {
  id: string;
  vehicle_catalog_id: string;
  interchange_group_id: string;
  position: string | null;
  side: string | null;
  year_from: number | null;
  year_to: number | null;
  trust: string | null;
  verified_at: string | null;
  vehicle_catalog: { chassis_code: string | null; engine_code: string | null } | null;
  part_interchange_group: { part_master: Array<Record<string, unknown>> | null } | null;
};

const PART_FIELDS =
  "id, name, oem_part_number, category_id, maintenance_component_id, description, metadata, manufacturer, part_kind, catalog_decision, part_category ( id, slug, label, parent_id, sort_order )";

const LISTING_SELECT =
  `id, vehicle_catalog_id, interchange_group_id, position, side, year_from, year_to, trust, verified_at, vehicle_catalog ( chassis_code, engine_code ), part_interchange_group ( part_master ( ${PART_FIELDS} ) )`;

/**
 * Pure: part_listing rows → part_fitment-shaped rows (one per listing). Each row names the part asked for when it is in
 * the group (review #10), else the group's first part by name.
 */
export function listingRowsToFitmentShape(rows: ListingRow[], preferPartId?: string | null): FitmentShapedRow[] {
  const out: FitmentShapedRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const parts = [...(r.part_interchange_group?.part_master ?? [])]
      .filter((p) => p && p.catalog_decision !== "rejected")
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    const part = (preferPartId ? parts.find((p) => String(p.id) === String(preferPartId)) : undefined) ?? parts[0];
    if (!part) continue;
    const key = `${r.vehicle_catalog_id}|${part.id}|${r.position ?? ""}|${r.side ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id,
      part_id: String(part.id),
      vehicle_catalog_id: r.vehicle_catalog_id,
      chassis_code: r.vehicle_catalog?.chassis_code ?? null,
      engine_code: r.vehicle_catalog?.engine_code ?? null,
      year_from: r.year_from,
      year_to: r.year_to,
      position: r.position,
      side: r.side,
      trust: r.trust,
      created_at: r.verified_at,
      updated_at: r.verified_at,
      part_master: part,
    });
  }
  return out;
}

export async function listingsForVehicle(
  supabase: SupabaseClient,
  opts: { catalogId?: string | null; partId?: string | null; limit?: number },
): Promise<FitmentShapedRow[]> {
  let q = supabase.from("part_listing").select(LISTING_SELECT).order("verified_at", { ascending: false });
  if (opts.catalogId) q = q.eq("vehicle_catalog_id", opts.catalogId);
  if (opts.partId) {
    const { data: part, error } = await supabase.from("part_master").select("interchange_group_id").eq("id", opts.partId)
      .maybeSingle();
    if (error) throw error;
    const groupId = (part as { interchange_group_id?: string | null } | null)?.interchange_group_id;
    if (!groupId) return [];
    q = q.eq("interchange_group_id", groupId);
  }
  const { data, error } = await q.limit(opts.limit ?? 500);
  if (error) throw error;
  return listingRowsToFitmentShape((data ?? []) as unknown as ListingRow[], opts.partId);
}

/** How many listings these car versions have (vehicle-delete dependency count and "Catalogue linked"). */
export async function countListings(supabase: SupabaseClient, catalogIds: string[]): Promise<number> {
  const ids = [...new Set(catalogIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const { count, error } = await supabase.from("part_listing").select("id", { count: "exact", head: true })
    .in("vehicle_catalog_id", ids);
  if (error) throw error;
  return count ?? 0;
}
