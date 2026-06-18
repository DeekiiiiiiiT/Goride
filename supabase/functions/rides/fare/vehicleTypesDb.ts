/**
 * Load vehicle / service tiers from rides.vehicle_types (with short TTL cache).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  FARE_RULE_SERVICE_ALIASES,
  RIDES_VEHICLE_TYPES as FALLBACK_TYPES,
  RIDES_VEHICLE_LEGACY_ALIASES,
} from "./ridesVehicleTypes.ts";

export type TransportSolutionKind = "vehicle" | "service";
export type ServiceCategory = "rideshare" | "courier" | "event" | "haulage";

export type VehicleTypeRow = {
  slug: string;
  label: string;
  description: string;
  seats: number;
  capacity_label: string | null;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
  solution_kind?: TransportSolutionKind | string | null;
  service_category?: ServiceCategory | string | null;
  commando_body_type?: string | null;
};

export type VehicleTypeDto = {
  slug: string;
  label: string;
  description: string;
  seats: number;
  capacity_label: string | null;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
  solution_kind: TransportSolutionKind;
  service_category: ServiceCategory | null;
  commando_body_type: string | null;
};

function inferSolutionKind(slug: string, kind?: string | null): TransportSolutionKind {
  if (kind === "service" || kind === "vehicle") return kind;
  return slug === "courier" ? "service" : "vehicle";
}

const CACHE_TTL_MS = 30_000;
let cache: { rows: VehicleTypeRow[]; at: number } | null = null;

function inferServiceCategory(slug: string, stored?: string | null): ServiceCategory {
  if (stored === "rideshare" || stored === "courier" || stored === "event" || stored === "haulage") {
    return stored;
  }
  const normalized = slug.trim().toLowerCase();
  if (normalized === "courier") return "courier";
  if (normalized === "event-booking" || normalized === "event") return "event";
  if (normalized === "haulage") return "haulage";
  return "rideshare";
}

function rowToDto(r: VehicleTypeRow): VehicleTypeDto {
  const kind = inferSolutionKind(r.slug, r.solution_kind);
  return {
    slug: r.slug,
    label: r.label,
    description: r.description ?? "",
    seats: r.seats ?? 0,
    capacity_label: r.capacity_label,
    tagline: r.tagline,
    sort_order: r.sort_order ?? 0,
    is_active: r.is_active !== false,
    solution_kind: kind,
    service_category: kind === "service" ? inferServiceCategory(r.slug, r.service_category) : null,
    commando_body_type: r.commando_body_type ?? null,
  };
}

function fallbackRows(): VehicleTypeRow[] {
  return FALLBACK_TYPES.map((v, i) => ({
    slug: v.slug,
    label: v.label,
    description: v.description,
    seats: v.seats,
    capacity_label: v.capacityLabel ?? null,
    tagline: v.slug === "courier" ? "Send a package" : null,
    sort_order: (i + 1) * 10,
    is_active: true,
    solution_kind: inferSolutionKind(v.slug),
    service_category: inferServiceCategory(v.slug),
  }));
}

export function invalidateVehicleTypesCache(): void {
  cache = null;
}

export async function loadVehicleTypesFromDb(
  db: SupabaseClient,
  tableName: string,
  opts?: { activeOnly?: boolean },
): Promise<VehicleTypeDto[]> {
  const activeOnly = opts?.activeOnly !== false;
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    const rows = activeOnly ? cache.rows.filter((r) => r.is_active) : cache.rows;
    return rows.map(rowToDto);
  }

  let q = db.from(tableName).select("*").order("sort_order").order("slug");
  if (activeOnly) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error || !data?.length) {
    const fb = fallbackRows();
    cache = { rows: fb, at: now };
    return (activeOnly ? fb.filter((r) => r.is_active) : fb).map(rowToDto);
  }

  const rows = data as VehicleTypeRow[];
  cache = { rows, at: now };
  return (activeOnly ? rows.filter((r) => r.is_active) : rows).map(rowToDto);
}

export async function loadAllVehicleTypesAdmin(
  db: SupabaseClient,
  tableName: string,
): Promise<VehicleTypeDto[]> {
  invalidateVehicleTypesCache();
  return loadVehicleTypesFromDb(db, tableName, { activeOnly: false });
}

export function normalizeVehicleSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!slug) return DEFAULT_RIDES_VEHICLE_TYPE;
  return RIDES_VEHICLE_LEGACY_ALIASES[slug] ?? slug;
}

export async function isKnownVehicleSlug(
  db: SupabaseClient,
  tableName: string,
  raw: string,
): Promise<boolean> {
  const slug = normalizeVehicleSlug(raw);
  const types = await loadVehicleTypesFromDb(db, tableName, { activeOnly: false });
  if (types.some((t) => t.slug === slug && t.is_active)) return true;
  if (types.some((t) => t.slug === slug)) return true;
  return FALLBACK_TYPES.some((v) => v.slug === slug);
}

/** Fare rules and rider booking must reference an active service slug. */
export async function isKnownServiceSlug(
  db: SupabaseClient,
  tableName: string,
  raw: string,
): Promise<boolean> {
  const slug = raw.trim().toLowerCase();
  const types = await loadVehicleTypesFromDb(db, tableName, { activeOnly: false });
  const hit = types.find((t) => t.slug === slug);
  if (hit) return hit.solution_kind === "service" && hit.is_active;
  return false;
}

export function vehicleTypesForFareLookupFromList(
  vehicleType: string,
  knownSlugs: string[],
): string[] {
  const raw = vehicleType.trim().toLowerCase();
  const canonical = normalizeVehicleSlug(raw);
  const keys = new Set<string>([canonical, raw]);
  if (canonical === "uberx") keys.add("standard");
  if (raw === "standard") keys.add("uberx");
  for (const alias of FARE_RULE_SERVICE_ALIASES[canonical] ?? FARE_RULE_SERVICE_ALIASES[raw] ?? []) {
    keys.add(alias);
  }
  for (const s of knownSlugs) {
    if (s === canonical || s === raw) keys.add(s);
  }
  return [...keys];
}

export function capacityDisplay(v: VehicleTypeDto): string {
  if (v.capacity_label?.trim()) return v.capacity_label.trim();
  if (v.seats <= 0) return "Variable";
  return v.seats === 1 ? "up to 1 passenger" : `up to ${v.seats} passengers`;
}
