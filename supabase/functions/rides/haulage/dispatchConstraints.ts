/**
 * Haulage-only dispatch constraints (weight, dimensions, upright).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isHaulageDispatchConstraintsEnabled } from "./buildHaulageQuote.ts";
import { loadHaulageManifestForRide } from "./manifestJoin.ts";

export type BodyCapacityRow = {
  slug: string;
  max_payload_kg: number | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
  supports_upright_load: boolean;
};

const BODY_PRIORITY: Record<string, number> = {
  sedan: 10,
  suv: 20,
  pickup: 30,
  "cargo-van": 40,
  "box-truck": 50,
};

function tierMeetsFloor(driverSlug: string | null, jobFloor: string | null): boolean {
  if (!jobFloor) return true;
  const d = BODY_PRIORITY[(driverSlug ?? "").toLowerCase()] ?? 0;
  const j = BODY_PRIORITY[jobFloor.toLowerCase()] ?? 0;
  return d >= j;
}

export async function loadBodyCapacityMap(
  db: SupabaseClient,
  slugs: string[],
): Promise<Map<string, BodyCapacityRow>> {
  if (!slugs.length) return new Map();
  const { data } = await db.from("rides_vehicle_types")
    .select("slug, max_payload_kg, cargo_length_cm, cargo_width_cm, cargo_height_cm, supports_upright_load")
    .in("slug", slugs);
  const map = new Map<string, BodyCapacityRow>();
  for (const row of data ?? []) {
    const r = row as BodyCapacityRow;
    map.set(r.slug, r);
  }
  return map;
}

export function driverMeetsHaulageManifest(
  driverBodySlug: string | null,
  bodyRow: BodyCapacityRow | undefined,
  manifest: {
    total_weight_kg: number;
    min_body_type_slug: string | null;
    lines: { length_cm: number | null; upright_only: boolean }[];
  },
): boolean {
  if (!tierMeetsFloor(driverBodySlug, manifest.min_body_type_slug)) return false;
  if (!bodyRow) return true;

  if (bodyRow.max_payload_kg != null && manifest.total_weight_kg > Number(bodyRow.max_payload_kg)) {
    return false;
  }

  let needsUpright = false;
  let maxLength = 0;
  let maxHeight = 0;
  for (const line of manifest.lines) {
    if (line.upright_only) needsUpright = true;
    if (line.length_cm != null) maxLength = Math.max(maxLength, line.length_cm);
    if (line.length_cm != null) maxHeight = Math.max(maxHeight, line.length_cm);
  }

  if (needsUpright && !bodyRow.supports_upright_load) return false;
  if (bodyRow.cargo_length_cm != null && maxLength > Number(bodyRow.cargo_length_cm)) return false;
  if (bodyRow.cargo_height_cm != null && maxHeight > Number(bodyRow.cargo_height_cm)) return false;

  return true;
}

export async function filterDriversForHaulageJob(
  db: SupabaseClient,
  rideRequestId: string,
  vehicleOption: string,
  candidates: { driver_user_id: string; body_type_slug: string | null }[],
): Promise<{ driver_user_id: string; body_type_slug: string | null }[]> {
  if (vehicleOption !== "haulage" || !isHaulageDispatchConstraintsEnabled()) {
    return candidates;
  }

  const manifest = await loadHaulageManifestForRide(db, rideRequestId);
  if (!manifest) return candidates;

  const slugs = [...new Set(candidates.map((c) => c.body_type_slug).filter(Boolean) as string[])];
  const capacityMap = await loadBodyCapacityMap(db, slugs);

  return candidates.filter((c) => {
    const row = c.body_type_slug ? capacityMap.get(c.body_type_slug) : undefined;
    return driverMeetsHaulageManifest(c.body_type_slug, row, manifest);
  });
}
