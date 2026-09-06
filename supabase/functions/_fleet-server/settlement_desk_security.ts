/**
 * Phase 0 settlement desk security guards — pure predicates (S1-1, S1-2b, S1-3).
 * Kept free of Hono/KV so Deno + Vitest can both cover them.
 */

export const SETTLEMENT_DESK_CATEGORIES = new Set([
  "Cash Collection",
  "Driver Payouts",
  "Cash Write Off",
  "Float Issue",
  "Adjustment",
]);

export function isSettlementDeskCategory(category: unknown): boolean {
  return typeof category === "string" && SETTLEMENT_DESK_CATEGORIES.has(category);
}

const LEGACY_ORG_PLACEHOLDER = "roam-default-org";

function isLegacyOrg(organizationId: unknown): boolean {
  if (organizationId == null || organizationId === "") return false;
  return String(organizationId).trim().toLowerCase() === LEGACY_ORG_PLACEHOLDER;
}

/**
 * Cross-tenant delete/mutate guard.
 * N-1: unstamped / legacy org rows fail closed when the caller has an org.
 * Platform callers pass organizationId=null and are allowed through.
 * Pass denyUnstamped:false only during a documented burn-down backfill window
 * (or set SETTLEMENT_ORG_STRICT=0 in the edge runtime).
 */
export function mayMutateTransactionOrg(
  recordOrgId: unknown,
  callerOrgId: string | null | undefined,
  opts?: { denyUnstamped?: boolean },
): boolean {
  if (!callerOrgId) return true;
  let denyUnstamped = opts?.denyUnstamped;
  if (denyUnstamped === undefined) {
    try {
      // Edge runtime only — browser/Vitest never hit this path.
      const env = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } })
        .Deno?.env?.get?.("SETTLEMENT_ORG_STRICT");
      denyUnstamped = env !== "0";
    } catch {
      denyUnstamped = true;
    }
  }
  if (recordOrgId == null || String(recordOrgId).trim() === "") {
    return !denyUnstamped;
  }
  if (isLegacyOrg(recordOrgId)) {
    return !denyUnstamped;
  }
  return String(recordOrgId) === callerOrgId;
}

/** Pure filter mirroring list* org scoping for tests. */
export function filterPeriodsByOrganizationId<T extends { organizationId?: string | null }>(
  rows: T[],
  organizationId: string | null | undefined,
): T[] {
  if (!organizationId) return rows;
  return rows.filter((r) => r.organizationId === organizationId);
}
