/**
 * Load vehicle / service tiers from rides.vehicle_types (with short TTL cache).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  RIDES_VEHICLE_TYPES as FALLBACK_TYPES,
  RIDES_VEHICLE_LEGACY_ALIASES,
} from "./ridesVehicleTypes.ts";

export type VehicleTypeRow = {
  slug: string;
  label: string;
  description: string;
  seats: number;
  capacity_label: string | null;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
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
};

const CACHE_TTL_MS = 30_000;
let cache: { rows: VehicleTypeRow[]; at: number } | null = null;

function rowToDto(r: VehicleTypeRow): VehicleTypeDto {
  return {
    slug: r.slug,
    label: r.label,
    description: r.description ?? "",
    seats: r.seats ?? 0,
    capacity_label: r.capacity_label,
    tagline: r.tagline,
    sort_order: r.sort_order ?? 0,
    is_active: r.is_active !== false,
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

export function vehicleTypesForFareLookupFromList(
  vehicleType: string,
  knownSlugs: string[],
): string[] {
  const raw = vehicleType.trim().toLowerCase();
  const canonical = normalizeVehicleSlug(raw);
  const keys = new Set<string>([canonical, raw]);
  if (canonical === "uberx") keys.add("standard");
  if (raw === "standard") keys.add("uberx");
  for (const s of knownSlugs) {
    if (s === canonical || s === raw) keys.add(s);
  }
  return [...keys];
}

export function capacityDisplay(v: VehicleTypeDto): string {
  if (v.capacity_label?.trim()) return v.capacity_label.trim();
  return `${v.seats} seats`;
}
