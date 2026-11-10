/**
 * Fleet Find parts — verified car access (explicit vehicle_catalog_id only; no MMY guess).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { filterByOrg } from "./org_scope.ts";

export function vehicleContextStatus(foundInKv: boolean, inOrg: boolean): 200 | 403 | 404 {
  if (!foundInKv) return 404;
  if (!inOrg) return 403;
  return 200;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PARTS_CHOOSE_CAR = "Choose one of your cars";

export function rejectUnlessVehicleId(vehicleId: string): { status: 400; error: string } | null {
  if (!vehicleId.trim()) return { status: 400, error: PARTS_CHOOSE_CAR };
  return null;
}

/** Fleet /find always searches the verified car catalog; query variantId is ignored. */
export function findPartsCatalogVariant(accessCatalogId: string | null, _queryVariantId?: string): string | null {
  return accessCatalogId;
}

export function assembleVerifiedCarAccess(
  foundInKv: boolean,
  inOrg: boolean,
  vehicle: Record<string, unknown> | null,
  existingCatalogIds: ReadonlySet<string>,
): VerifiedCarAccess {
  const status = vehicleContextStatus(foundInKv, inOrg);
  if (status !== 200) return { status, vehicle: null, catalogId: null };
  const catalogId = verifiedCatalogIdFromLink(readExplicitCatalogLink(vehicle), existingCatalogIds);
  return { status: 200, vehicle, catalogId };
}

/** UUID from the fleet vehicle record only (no make/model/year resolve). */
export function readExplicitCatalogLink(vehicle: Record<string, unknown> | null | undefined): string | null {
  if (!vehicle) return null;
  for (const key of ["vehicle_catalog_id", "vehicleCatalogId", "catalogId"] as const) {
    const raw = vehicle[key];
    if (typeof raw === "string" && UUID_RE.test(raw.trim())) return raw.trim();
  }
  return null;
}

export function verifiedCatalogIdFromLink(
  link: string | null,
  existingCatalogIds: ReadonlySet<string> | string[],
): string | null {
  if (!link || !UUID_RE.test(link)) return null;
  const set = existingCatalogIds instanceof Set ? existingCatalogIds : new Set(existingCatalogIds);
  return set.has(link) ? link : null;
}

export function partInterchangeFitsCatalogIds(
  groupId: string | null,
  listingCatalogIdsByGroup: Map<string, Set<string>>,
  allowedIds: ReadonlySet<string> | string[],
): boolean {
  if (!groupId) return false;
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  if (!allowed.size) return false;
  const listed = listingCatalogIdsByGroup.get(groupId);
  if (!listed?.size) return false;
  for (const id of listed) {
    if (allowed.has(id)) return true;
  }
  return false;
}

export type VariantAccessDecision =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string };

export function requireVariantInVerifiedSet(
  variantId: string,
  allowedIds: ReadonlySet<string> | string[],
): VariantAccessDecision {
  const trimmed = variantId.trim();
  if (!trimmed) return { ok: false, status: 400, error: "variantId required" };
  if (!UUID_RE.test(trimmed)) return { ok: false, status: 400, error: "Invalid variant" };
  const set = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  if (!set.has(trimmed)) return { ok: false, status: 404, error: "Vehicle not found" };
  return { ok: true };
}

async function filterLinksExistingInCatalog(
  supabase: SupabaseClient,
  links: string[],
): Promise<string[]> {
  const unique = [...new Set(links.filter((id) => UUID_RE.test(id)))];
  if (!unique.length) return [];
  const { data, error } = await supabase.from("vehicle_catalog").select("id").in("id", unique);
  if (error) throw error;
  return (data ?? []).map((row) => String((row as { id: string }).id));
}

export type VerifiedCarAccess = {
  status: 200 | 403 | 404;
  vehicle: Record<string, unknown> | null;
  catalogId: string | null;
};

export async function verifiedCarForVehicle(
  c: Context,
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<VerifiedCarAccess> {
  const raw = await kv.get(`vehicle:${vehicleId}`);
  const found = Boolean(raw && typeof raw === "object");
  const scoped = found ? filterByOrg([raw as Record<string, unknown>], c) : [];
  const vehicle = scoped[0] ?? null;
  const existing = await filterLinksExistingInCatalog(
    supabase,
    [readExplicitCatalogLink(vehicle)].filter((id): id is string => Boolean(id)),
  );
  return assembleVerifiedCarAccess(found, Boolean(vehicle), vehicle, new Set(existing));
}

export async function verifiedCatalogIdsForOrg(c: Context, supabase: SupabaseClient): Promise<string[]> {
  const raw = await kv.getByPrefix("vehicle:");
  const cars = filterByOrg(Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [], c);
  const links = cars.map((car) => readExplicitCatalogLink(car)).filter((id): id is string => Boolean(id));
  return filterLinksExistingInCatalog(supabase, links);
}

export async function partFitsCatalogIds(
  supabase: SupabaseClient,
  partId: string,
  catalogIds: string[],
): Promise<boolean> {
  if (!UUID_RE.test(partId) || !catalogIds.length) return false;
  const allowed = new Set(catalogIds.filter((id) => UUID_RE.test(id)));
  if (!allowed.size) return false;
  const { data: part, error: partError } = await supabase
    .from("part_master")
    .select("interchange_group_id")
    .eq("id", partId)
    .maybeSingle();
  if (partError) throw partError;
  const groupId = part?.interchange_group_id ? String(part.interchange_group_id) : "";
  if (!groupId) return false;
  const { data: listings, error: listError } = await supabase
    .from("part_listing")
    .select("vehicle_catalog_id")
    .eq("interchange_group_id", groupId)
    .in("vehicle_catalog_id", [...allowed]);
  if (listError) throw listError;
  return (listings ?? []).some((row) => allowed.has(String((row as { vehicle_catalog_id?: string }).vehicle_catalog_id ?? "")));
}
