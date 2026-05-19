/**
 * Service → ordered body types for wave-tier dispatch.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invalidateVehicleTypesCache } from "./vehicleTypesDb.ts";

export type BodyTypeTier = {
  body_type_slug: string;
  priority: number;
  commando_body_type?: string | null;
};

const CACHE_TTL_MS = 30_000;
const tierCache = new Map<string, { tiers: BodyTypeTier[]; at: number }>();

export function invalidateServiceMatchingCache(): void {
  tierCache.clear();
  invalidateVehicleTypesCache();
}

function serviceBodyTypesTable(tables: { service_body_types?: string; vehicle_types: string }): string {
  return tables.service_body_types ?? "service_body_types";
}

export async function loadServiceBodyTypeTiers(
  db: SupabaseClient,
  tables: { service_body_types?: string; vehicle_types: string },
  serviceSlug: string,
): Promise<BodyTypeTier[]> {
  const key = serviceSlug.trim().toLowerCase();
  const now = Date.now();
  const hit = tierCache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.tiers;

  const linkTable = serviceBodyTypesTable(tables);
  const { data: links, error } = await db
    .from(linkTable)
    .select("body_type_slug, priority")
    .eq("service_slug", key)
    .order("priority")
    .order("body_type_slug");

  if (error || !links?.length) {
    tierCache.set(key, { tiers: [], at: now });
    return [];
  }

  const slugs = links.map((r: { body_type_slug: string }) => r.body_type_slug);
  const { data: bodyRows } = await db
    .from(tables.vehicle_types)
    .select("slug, commando_body_type, solution_kind, is_active")
    .in("slug", slugs);

  const bodyBySlug = new Map(
    (bodyRows ?? []).map((r: {
      slug: string;
      commando_body_type?: string | null;
      solution_kind?: string;
      is_active?: boolean;
    }) => [r.slug, r]),
  );

  const tiers: BodyTypeTier[] = [];
  for (const link of links as { body_type_slug: string; priority: number }[]) {
    const body = bodyBySlug.get(link.body_type_slug);
    if (!body || body.solution_kind !== "vehicle" || body.is_active === false) continue;
    tiers.push({
      body_type_slug: link.body_type_slug,
      priority: link.priority ?? 10,
      commando_body_type: body.commando_body_type ?? null,
    });
  }

  tierCache.set(key, { tiers, at: now });
  return tiers;
}

/** Cumulative body-type slugs eligible for a given matching wave (1-based). */
export function allowedBodySlugsForWave(tiers: BodyTypeTier[], wave: number): Set<string> {
  if (!tiers.length) return new Set();
  const sorted = [...tiers].sort((a, b) => a.priority - b.priority || a.body_type_slug.localeCompare(b.body_type_slug));
  const distinctPriorities = [...new Set(sorted.map((t) => t.priority))].sort((a, b) => a - b);
  const maxTierIndex = Math.min(Math.max(wave, 1), distinctPriorities.length) - 1;
  const allowedPriorities = new Set(distinctPriorities.slice(0, maxTierIndex + 1));
  const allowed = new Set<string>();
  for (const t of sorted) {
    if (allowedPriorities.has(t.priority)) allowed.add(t.body_type_slug);
  }
  return allowed;
}
