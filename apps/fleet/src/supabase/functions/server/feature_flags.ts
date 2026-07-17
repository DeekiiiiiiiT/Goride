/**
 * Feature Flags for Fleet Data Isolation
 * 
 * Provides KV-backed feature flags for gradual rollout of strict
 * org filtering, auth hardening, and product line isolation.
 * 
 * Flags are stored in KV at `feature_flag:{name}` with structure:
 * {
 *   enabled: boolean,
 *   enabledForOrgs?: string[],  // Per-org overrides
 *   updatedAt: string,
 *   updatedBy?: string
 * }
 * 
 * Phase 0 of Fleet Data Isolation Implementation.
 */

import * as kv from "./kv_store.tsx";
import * as memCache from "./memory_cache.ts";

export interface FeatureFlagValue {
  enabled: boolean;
  enabledForOrgs?: string[];
  disabledForOrgs?: string[];
  updatedAt: string;
  updatedBy?: string;
  description?: string;
}

export interface FeatureFlagStats {
  name: string;
  checkCount: number;
  enabledCount: number;
  disabledCount: number;
  lastChecked?: string;
}

const FLAG_PREFIX = "feature_flag:";
const STATS_PREFIX = "feature_flag_stats:";
const CACHE_TTL_MS = 30_000; // 30 seconds in-memory cache

// Known feature flags for data isolation
export const FEATURE_FLAGS = {
  STRICT_AUTH: "strict_auth",
  STRICT_ORG_FILTER: "strict_org_filter",
  PRODUCT_LINE_FILTER: "product_line_filter",
  /** Unlinked trip credits first, then dispute top-ups; allocation-backed balances. */
  CORRECT_TOLL_SETTLEMENT_ORDER: "correct_toll_settlement_order",
} as const;

export type FeatureFlagName = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

/**
 * Check if a feature flag is enabled.
 * 
 * Priority:
 * 1. Per-org disable list (if org in disabledForOrgs, return false)
 * 2. Per-org enable list (if org in enabledForOrgs, return true)
 * 3. Global enabled setting
 * 4. Default to false if flag doesn't exist
 */
export async function isFeatureEnabled(
  flagName: string,
  orgId?: string | null
): Promise<boolean> {
  try {
    // Check memory cache first
    const cacheKey = `flag:${flagName}`;
    const cached = memCache.featureFlagCache?.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return evaluateFlag(cached, orgId);
    }

    // Fetch from KV
    const key = `${FLAG_PREFIX}${flagName}`;
    const flag = await kv.get(key) as FeatureFlagValue | null;

    if (!flag) {
      // Flag doesn't exist - default to disabled for safety
      return false;
    }

    // Cache the flag value
    if (memCache.featureFlagCache) {
      memCache.featureFlagCache.set(cacheKey, flag, CACHE_TTL_MS);
    }

    // Track stats asynchronously (don't block response)
    trackFlagCheck(flagName, evaluateFlag(flag, orgId)).catch(() => {});

    return evaluateFlag(flag, orgId);
  } catch (err) {
    console.error(`[FeatureFlags] Error checking flag ${flagName}:`, err);
    // Fail closed - return false on errors for safety
    return false;
  }
}

/**
 * Evaluate a flag value with org context.
 */
function evaluateFlag(flag: FeatureFlagValue, orgId?: string | null): boolean {
  if (!flag) return false;

  // Check org-specific overrides first
  if (orgId) {
    // Disable list takes priority (safety first)
    if (flag.disabledForOrgs?.includes(orgId)) {
      return false;
    }
    // Enable list
    if (flag.enabledForOrgs?.includes(orgId)) {
      return true;
    }
  }

  // Fall back to global setting
  return flag.enabled === true;
}

/**
 * Set a feature flag value.
 */
export async function setFeatureFlag(
  flagName: string,
  enabled: boolean,
  options?: {
    enabledForOrgs?: string[];
    disabledForOrgs?: string[];
    description?: string;
    updatedBy?: string;
  }
): Promise<void> {
  const key = `${FLAG_PREFIX}${flagName}`;
  
  // Get existing flag to preserve org lists if not specified
  const existing = await kv.get(key) as FeatureFlagValue | null;

  const flag: FeatureFlagValue = {
    enabled,
    enabledForOrgs: options?.enabledForOrgs ?? existing?.enabledForOrgs,
    disabledForOrgs: options?.disabledForOrgs ?? existing?.disabledForOrgs,
    description: options?.description ?? existing?.description,
    updatedAt: new Date().toISOString(),
    updatedBy: options?.updatedBy,
  };

  await kv.set(key, flag);

  // Invalidate cache
  const cacheKey = `flag:${flagName}`;
  if (memCache.featureFlagCache) {
    memCache.featureFlagCache.invalidate(cacheKey);
  }

  console.log(`[FeatureFlags] Set ${flagName} to ${enabled}`, {
    enabledForOrgs: flag.enabledForOrgs?.length ?? 0,
    disabledForOrgs: flag.disabledForOrgs?.length ?? 0,
    updatedBy: flag.updatedBy,
  });
}

/**
 * Add an org to the enabled list for a flag.
 */
export async function enableFlagForOrg(
  flagName: string,
  orgId: string,
  updatedBy?: string
): Promise<void> {
  const key = `${FLAG_PREFIX}${flagName}`;
  const existing = await kv.get(key) as FeatureFlagValue | null;

  const enabledForOrgs = new Set(existing?.enabledForOrgs ?? []);
  enabledForOrgs.add(orgId);

  // Remove from disabled list if present
  const disabledForOrgs = new Set(existing?.disabledForOrgs ?? []);
  disabledForOrgs.delete(orgId);

  await setFeatureFlag(flagName, existing?.enabled ?? false, {
    enabledForOrgs: Array.from(enabledForOrgs),
    disabledForOrgs: Array.from(disabledForOrgs),
    description: existing?.description,
    updatedBy,
  });

  console.log(`[FeatureFlags] Enabled ${flagName} for org ${orgId}`);
}

/**
 * Add an org to the disabled list for a flag.
 */
export async function disableFlagForOrg(
  flagName: string,
  orgId: string,
  updatedBy?: string
): Promise<void> {
  const key = `${FLAG_PREFIX}${flagName}`;
  const existing = await kv.get(key) as FeatureFlagValue | null;

  const disabledForOrgs = new Set(existing?.disabledForOrgs ?? []);
  disabledForOrgs.add(orgId);

  // Remove from enabled list if present
  const enabledForOrgs = new Set(existing?.enabledForOrgs ?? []);
  enabledForOrgs.delete(orgId);

  await setFeatureFlag(flagName, existing?.enabled ?? false, {
    enabledForOrgs: Array.from(enabledForOrgs),
    disabledForOrgs: Array.from(disabledForOrgs),
    description: existing?.description,
    updatedBy,
  });

  console.log(`[FeatureFlags] Disabled ${flagName} for org ${orgId}`);
}

/**
 * Get all feature flags.
 */
export async function getAllFeatureFlags(): Promise<Record<string, FeatureFlagValue>> {
  try {
    const allFlags = await kv.getByPrefix(FLAG_PREFIX);
    const result: Record<string, FeatureFlagValue> = {};

    // getByPrefix returns values, we need to reconstruct the map
    // This is a limitation - let's query differently
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", `${FLAG_PREFIX}%`);

    if (error) throw error;

    for (const row of data || []) {
      const flagName = row.key.replace(FLAG_PREFIX, "");
      result[flagName] = row.value as FeatureFlagValue;
    }

    return result;
  } catch (err) {
    console.error("[FeatureFlags] Error getting all flags:", err);
    return {};
  }
}

/**
 * Get a single feature flag's full configuration.
 */
export async function getFeatureFlag(flagName: string): Promise<FeatureFlagValue | null> {
  try {
    const key = `${FLAG_PREFIX}${flagName}`;
    return await kv.get(key) as FeatureFlagValue | null;
  } catch (err) {
    console.error(`[FeatureFlags] Error getting flag ${flagName}:`, err);
    return null;
  }
}

/**
 * Track flag check statistics (async, non-blocking).
 */
async function trackFlagCheck(flagName: string, result: boolean): Promise<void> {
  try {
    const statsKey = `${STATS_PREFIX}${flagName}`;
    const existing = await kv.get(statsKey) as FeatureFlagStats | null;

    const stats: FeatureFlagStats = {
      name: flagName,
      checkCount: (existing?.checkCount ?? 0) + 1,
      enabledCount: (existing?.enabledCount ?? 0) + (result ? 1 : 0),
      disabledCount: (existing?.disabledCount ?? 0) + (result ? 0 : 1),
      lastChecked: new Date().toISOString(),
    };

    await kv.set(statsKey, stats);
  } catch {
    // Ignore stats errors - they're non-critical
  }
}

/**
 * Get statistics for a feature flag.
 */
export async function getFeatureFlagStats(flagName: string): Promise<FeatureFlagStats | null> {
  try {
    const statsKey = `${STATS_PREFIX}${flagName}`;
    return await kv.get(statsKey) as FeatureFlagStats | null;
  } catch (err) {
    console.error(`[FeatureFlags] Error getting stats for ${flagName}:`, err);
    return null;
  }
}

/**
 * Get statistics for all feature flags.
 */
export async function getAllFeatureFlagStats(): Promise<Record<string, FeatureFlagStats>> {
  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", `${STATS_PREFIX}%`);

    if (error) throw error;

    const result: Record<string, FeatureFlagStats> = {};
    for (const row of data || []) {
      const flagName = row.key.replace(STATS_PREFIX, "");
      result[flagName] = row.value as FeatureFlagStats;
    }

    return result;
  } catch (err) {
    console.error("[FeatureFlags] Error getting all stats:", err);
    return {};
  }
}

/**
 * Initialize default feature flags if they don't exist.
 * Called once on server startup or via admin endpoint.
 */
export async function initializeDefaultFlags(): Promise<void> {
  const defaults: Array<{
    name: FeatureFlagName;
    enabled: boolean;
    description: string;
  }> = [
    {
      name: FEATURE_FLAGS.STRICT_AUTH,
      enabled: false,
      description: "Reject anonymous key on data endpoints (require valid JWT)",
    },
    {
      name: FEATURE_FLAGS.STRICT_ORG_FILTER,
      enabled: false,
      description: "Exclude records without organizationId from fleet views",
    },
    {
      name: FEATURE_FLAGS.PRODUCT_LINE_FILTER,
      enabled: false,
      description: "Filter data by product line (fleet vs enterprise)",
    },
    {
      name: FEATURE_FLAGS.CORRECT_TOLL_SETTLEMENT_ORDER,
      enabled: true,
      description:
        "Apply unlinked trip refunds before dispute refunds; settle via allocation ledger",
    },
  ];

  for (const def of defaults) {
    const existing = await getFeatureFlag(def.name);
    if (!existing) {
      await setFeatureFlag(def.name, def.enabled, {
        description: def.description,
        updatedBy: "system_init",
      });
      console.log(`[FeatureFlags] Initialized default flag: ${def.name}`);
    }
  }
}

/**
 * Emergency disable all strict flags.
 * Use for rollback if issues occur in production.
 */
export async function emergencyDisableAll(updatedBy?: string): Promise<void> {
  console.warn("[FeatureFlags] EMERGENCY DISABLE ALL - Rolling back strict flags");

  await setFeatureFlag(FEATURE_FLAGS.STRICT_AUTH, false, { updatedBy });
  await setFeatureFlag(FEATURE_FLAGS.STRICT_ORG_FILTER, false, { updatedBy });
  await setFeatureFlag(FEATURE_FLAGS.PRODUCT_LINE_FILTER, false, { updatedBy });
  await setFeatureFlag(FEATURE_FLAGS.CORRECT_TOLL_SETTLEMENT_ORDER, false, { updatedBy });

  console.log("[FeatureFlags] All strict flags disabled");
}
