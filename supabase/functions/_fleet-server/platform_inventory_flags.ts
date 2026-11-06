/**
 * Load fleet inventory phase flags from public.platform_feature_flags (R3-16).
 */
import { getServiceClient } from "./service_client.ts";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; flags: Record<string, boolean> } | null = null;

/** Test / ops: reload flags from DB on next read. */
export function clearFleetInventoryFeatureFlagsCache(): void {
  cached = null;
}

export async function loadFleetInventoryFeatureFlags(): Promise<Record<string, boolean>> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.flags;
  }

  const out: Record<string, boolean> = {};
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("platform_feature_flags")
      .select("name, enabled")
      .or("name.like.fleet_inventory_%,name.like.inv_%");
    if (error) {
      console.log(`loadFleetInventoryFeatureFlags: ${error.message}`);
      return out;
    }
    for (const row of data ?? []) {
      const name = String((row as { name?: string }).name ?? "");
      if (!name) continue;
      out[name] = Boolean((row as { enabled?: boolean }).enabled);
    }
    cached = { at: Date.now(), flags: out };
  } catch (e) {
    console.log(`loadFleetInventoryFeatureFlags error: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}

export async function isFleetInventoryPhaseEnabled(flagName: string): Promise<boolean> {
  const flags = await loadFleetInventoryFeatureFlags();
  return flags[flagName] === true;
}
