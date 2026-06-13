/**
 * Organization Scoping Helpers — Roam Fleet
 *
 * Provides utility functions for stamping records with organizationId on write
 * and filtering records by organizationId on read.
 *
 * Created: Phase 7 of the RBAC rollout (see /solution.md).
 * Updated: Phase 0 of Fleet Data Isolation - Added logging and strict mode support.
 *
 * SAFETY RULES (Legacy Mode - feature flags OFF):
 * - If a record has no organizationId (pre-backfill), it is INCLUDED on read
 *   (graceful fallback during transition).
 * - If the user has no organizationId (anon passthrough), NO filtering is applied.
 * - Platform roles (platform_owner, platform_support, platform_analyst) bypass
 *   org filtering — they can see all organizations' data.
 *
 * STRICT MODE (feature flags ON):
 * - Records without organizationId are EXCLUDED from fleet views
 * - Users without organizationId get empty results (not all records)
 * - Platform roles still bypass filtering
 */

import type { Context } from "npm:hono";
import type { RbacUser, Role } from "./rbac_middleware.ts";
import * as filterStatsCache from "./memory_cache.ts";

// Platform roles that bypass org scoping (they see all orgs)
const PLATFORM_ROLES: Set<Role> = new Set([
  'platform_owner',
  'platform_support',
  'platform_analyst',
]);

// Logging configuration
const LOG_FILTER_STATS = true;  // Enable detailed filter logging
const LOG_SAMPLE_RATE = 0.1;    // Log 10% of requests to avoid noise

/**
 * Filter statistics for monitoring and debugging.
 */
export interface FilterStats {
  endpoint?: string;
  inputCount: number;
  outputCount: number;
  removedCount: number;
  orgId: string | null;
  userId: string | null;
  role: string | null;
  removedByReason: {
    noOrgId: number;
    legacyPlaceholder: number;
    orgMismatch: number;
    productLineMismatch: number;
  };
  timestamp: string;
  durationMs: number;
}

/**
 * Early imports / manual trips used this string instead of a real fleet UUID.
 * Must be treated like "no org" for reads so filterByOrg does not hide all rows
 * when the fleet user has a real organizationId (UUID).
 */
const LEGACY_ORG_PLACEHOLDER = "roam-default-org";

/** True if stored organizationId should be visible to any fleet-scoped reader. */
export function isLegacyOrgPlaceholder(organizationId: unknown): boolean {
  if (organizationId == null || organizationId === "") return false;
  return String(organizationId).trim().toLowerCase() === LEGACY_ORG_PLACEHOLDER;
}

/**
 * Extract the organizationId from the Hono context (set by requireAuth()).
 * Returns null if not available (anon passthrough or platform roles).
 */
export function getOrgId(c: Context): string | null {
  const user = c.get('rbacUser') as RbacUser | undefined;
  if (!user) return null;
  // Platform roles see everything — no org filter
  if (PLATFORM_ROLES.has(user.resolvedRole)) return null;
  return user.organizationId;
}

/**
 * Stamp a record with the current user's organizationId before writing to KV.
 * If the user is anon passthrough (no orgId), the record is left untouched
 * so we don't corrupt existing data.
 *
 * Usage: `await kv.set(key, stampOrg(record, c));`
 */
export function stampOrg<T extends Record<string, unknown>>(
  record: T,
  c: Context,
): T {
  const orgId = getOrgId(c);
  if (!orgId) return record; // anon passthrough or platform role — don't stamp
  return { ...record, organizationId: orgId };
}

/**
 * Filter an array of records to only those belonging to the current user's org.
 *
 * LEGACY BEHAVIOR (current default):
 * - Records without an organizationId field are INCLUDED (graceful fallback)
 * - If the user has no orgId (anon passthrough), ALL records are returned
 *
 * Use `filterByOrgStrict()` for new strict behavior with feature flags.
 *
 * Usage: `const scoped = filterByOrg(allRecords, c);`
 */
export function filterByOrg<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
  options?: { endpoint?: string; logStats?: boolean }
): T[] {
  const startTime = Date.now();
  const rbacUser = c.get('rbacUser') as RbacUser | undefined;
  const orgId = getOrgId(c);

  // Initialize stats tracking
  const stats: FilterStats = {
    endpoint: options?.endpoint,
    inputCount: records.length,
    outputCount: 0,
    removedCount: 0,
    orgId,
    userId: rbacUser?.userId || null,
    role: rbacUser?.resolvedRole || null,
    removedByReason: {
      noOrgId: 0,
      legacyPlaceholder: 0,
      orgMismatch: 0,
      productLineMismatch: 0,
    },
    timestamp: new Date().toISOString(),
    durationMs: 0,
  };

  let result: T[];

  if (!orgId) {
    // No org context — return all (backward compat / legacy behavior)
    result = records;
    stats.outputCount = records.length;
  } else {
    result = records.filter((r) => {
      if (!r.organizationId) {
        // Legacy: include records without org (pre-backfill)
        return true;
      }
      if (isLegacyOrgPlaceholder(r.organizationId)) {
        // Legacy: include roam-default-org records
        return true;
      }
      if (r.organizationId === orgId) {
        return true;
      }
      // Record belongs to different org - exclude
      stats.removedByReason.orgMismatch++;
      return false;
    });
    stats.outputCount = result.length;
    stats.removedCount = records.length - result.length;
  }

  stats.durationMs = Date.now() - startTime;

  // Log stats based on sample rate or if explicitly requested
  if (options?.logStats || (LOG_FILTER_STATS && Math.random() < LOG_SAMPLE_RATE)) {
    logFilterStats(stats);
  }

  return result;
}

/**
 * Log filter statistics for monitoring.
 */
function logFilterStats(stats: FilterStats): void {
  const summary = `[filterByOrg] ${stats.endpoint || 'unknown'}: ${stats.inputCount} -> ${stats.outputCount} records (removed: ${stats.removedCount}) for org=${stats.orgId || 'null'} role=${stats.role || 'unknown'} in ${stats.durationMs}ms`;
  
  if (stats.removedCount > 0) {
    console.log(summary, {
      removedByReason: stats.removedByReason,
    });
  } else if (stats.inputCount > 100) {
    // Log large unfiltered responses for awareness
    console.log(summary);
  }

  // Cache stats for admin dashboard
  const cacheKey = `filter_stats:${stats.timestamp.split('T')[0]}:${stats.endpoint || 'unknown'}`;
  try {
    filterStatsCache.filterStatsCache.set(cacheKey, stats, 60 * 60 * 1000); // 1 hour
  } catch {
    // Non-critical - ignore cache errors
  }
}

/**
 * Check if a single record belongs to the current user's org (or has no org set).
 * Useful for single-record reads and delete operations.
 */
export function belongsToOrg(
  record: Record<string, unknown> | null | undefined,
  c: Context,
): boolean {
  if (!record) return false;
  const orgId = getOrgId(c);
  if (!orgId) return true; // anon passthrough / platform — always allowed
  if (!record.organizationId) return true; // pre-backfill graceful fallback
  if (isLegacyOrgPlaceholder(record.organizationId)) return true;
  return record.organizationId === orgId;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRICT MODE FUNCTIONS (Phase 0-3 of Fleet Data Isolation)
// These functions enforce proper tenant isolation without legacy fallbacks.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * STRICT filter: Only return records that explicitly match the user's org.
 * 
 * Differences from legacy filterByOrg():
 * - Records WITHOUT organizationId are EXCLUDED (not included)
 * - Users WITHOUT orgId get EMPTY results (not all records)
 * - Legacy placeholder records are EXCLUDED (not included)
 * - Platform roles still bypass filtering (for admin dashboards)
 */
export function filterByOrgStrict<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
  options?: { endpoint?: string; logStats?: boolean }
): T[] {
  const startTime = Date.now();
  const rbacUser = c.get('rbacUser') as RbacUser | undefined;

  // Platform roles can see all (for admin dashboards)
  if (rbacUser && PLATFORM_ROLES.has(rbacUser.resolvedRole)) {
    return records;
  }

  const orgId = getOrgId(c);

  // Initialize stats tracking
  const stats: FilterStats = {
    endpoint: options?.endpoint,
    inputCount: records.length,
    outputCount: 0,
    removedCount: 0,
    orgId,
    userId: rbacUser?.userId || null,
    role: rbacUser?.resolvedRole || null,
    removedByReason: {
      noOrgId: 0,
      legacyPlaceholder: 0,
      orgMismatch: 0,
      productLineMismatch: 0,
    },
    timestamp: new Date().toISOString(),
    durationMs: 0,
  };

  // STRICT: No org context = empty result (not all records)
  if (!orgId) {
    console.warn(`[filterByOrgStrict] No org context for user ${rbacUser?.userId || 'unknown'} (role: ${rbacUser?.resolvedRole || 'unknown'}) - returning empty array`);
    stats.outputCount = 0;
    stats.removedCount = records.length;
    stats.durationMs = Date.now() - startTime;
    logFilterStats(stats);
    return [];
  }

  // STRICT: Only exact org match, no fallbacks
  const result = records.filter((r) => {
    if (!r.organizationId) {
      // STRICT: Exclude records without org
      stats.removedByReason.noOrgId++;
      return false;
    }
    if (isLegacyOrgPlaceholder(r.organizationId)) {
      // STRICT: Exclude legacy placeholder records
      stats.removedByReason.legacyPlaceholder++;
      return false;
    }
    if (r.organizationId === orgId) {
      return true;
    }
    // Record belongs to different org - exclude
    stats.removedByReason.orgMismatch++;
    return false;
  });

  stats.outputCount = result.length;
  stats.removedCount = records.length - result.length;
  stats.durationMs = Date.now() - startTime;

  // Always log strict filter results for monitoring during rollout
  logFilterStats(stats);

  return result;
}

/**
 * Feature-flag controlled filter.
 * Uses strict mode when feature flag is enabled, legacy mode otherwise.
 * 
 * This is the PRIMARY filter function to use during the rollout period.
 * After stable rollout, this can be replaced with filterByOrgStrict directly.
 */
export async function filterByOrgSafe<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
  options?: { endpoint?: string }
): Promise<T[]> {
  // Import feature flags dynamically to avoid circular dependency
  const { isFeatureEnabled, FEATURE_FLAGS } = await import("./feature_flags.ts");
  
  const orgId = getOrgId(c);
  const useStrict = await isFeatureEnabled(FEATURE_FLAGS.STRICT_ORG_FILTER, orgId);

  if (useStrict) {
    return filterByOrgStrict(records, c, { ...options, logStats: true });
  }

  return filterByOrg(records, c, options);
}

/**
 * STRICT check if a single record belongs to the current user's org.
 * Returns false for records without organizationId (unlike legacy belongsToOrg).
 */
export function belongsToOrgStrict(
  record: Record<string, unknown> | null | undefined,
  c: Context,
): boolean {
  if (!record) return false;
  
  const rbacUser = c.get('rbacUser') as RbacUser | undefined;
  
  // Platform roles can access all
  if (rbacUser && PLATFORM_ROLES.has(rbacUser.resolvedRole)) {
    return true;
  }

  const orgId = getOrgId(c);
  
  // STRICT: No org context = no access
  if (!orgId) return false;
  
  // STRICT: Record must have org and it must match
  if (!record.organizationId) return false;
  if (isLegacyOrgPlaceholder(record.organizationId)) return false;
  
  return record.organizationId === orgId;
}

/**
 * Feature-flag controlled single-record check.
 */
export async function belongsToOrgSafe(
  record: Record<string, unknown> | null | undefined,
  c: Context,
): Promise<boolean> {
  const { isFeatureEnabled, FEATURE_FLAGS } = await import("./feature_flags.ts");
  
  const orgId = getOrgId(c);
  const useStrict = await isFeatureEnabled(FEATURE_FLAGS.STRICT_ORG_FILTER, orgId);

  if (useStrict) {
    return belongsToOrgStrict(record, c);
  }

  return belongsToOrg(record, c);
}

/**
 * Get aggregated filter statistics for monitoring dashboard.
 */
export function getFilterStatsFromCache(): FilterStats[] {
  const stats: FilterStats[] = [];
  // This would need implementation with proper cache enumeration
  // For now, stats are logged and can be viewed in logs
  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Combined Org + Product Line Filtering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combined filter: Organization + Product Line.
 * 
 * Applies both org filtering (via filterByOrgSafe) and product line filtering
 * (via filterByProductLineSafe) based on feature flags.
 * 
 * This is the preferred filter for fleet data endpoints.
 */
export async function filterByOrgAndProduct<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
  options?: { endpoint?: string }
): Promise<T[]> {
  // First, filter by organization
  const orgFiltered = await filterByOrgSafe(records, c, options);

  // Then, filter by product line (if feature flag enabled)
  const { filterByProductLineSafe } = await import("./product_line.ts");
  const filtered = await filterByProductLineSafe(orgFiltered, c);

  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Enhanced Record Stamping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stamp a record with organizationId AND productLine before writing.
 * 
 * This replaces the old stampOrg() for new data writes.
 * Ensures both org scoping and product line separation are captured.
 * 
 * Usage: `await kv.set(key, stampRecord(record, c));`
 */
export function stampRecord<T extends Record<string, unknown>>(
  record: T,
  c: Context,
): T {
  const orgId = getOrgId(c);
  
  // Import resolveProductLine synchronously is not possible, so we do it via the header directly
  const productLineHeader = c.req.header("X-Roam-Product-Line")?.trim().toLowerCase();
  const origin = c.req.header("Origin")?.toLowerCase() || "";
  const referer = c.req.header("Referer")?.toLowerCase() || "";
  const hostHint = origin || referer;
  
  let productLine: string = "fleet"; // default
  if (productLineHeader === "fleet" || productLineHeader === "enterprise") {
    productLine = productLineHeader;
  } else if (hostHint.includes("roamenterprise")) {
    productLine = "enterprise";
  } else if (hostHint.includes("roamfleet")) {
    productLine = "fleet";
  }
  
  // Only stamp if we have org context (don't corrupt data for anon passthrough)
  if (!orgId) {
    // Still stamp productLine for legacy records
    return {
      ...record,
      productLine: productLine,
      updatedAt: new Date().toISOString(),
    };
  }
  
  return {
    ...record,
    organizationId: orgId,
    productLine: productLine,
    updatedAt: new Date().toISOString(),
  };
}
