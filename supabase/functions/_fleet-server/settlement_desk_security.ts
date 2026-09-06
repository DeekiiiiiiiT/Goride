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
 * Cross-tenant delete guard. Returns true when the caller may mutate the record.
 * Platform callers pass organizationId=null and are allowed through.
 */
export function mayMutateTransactionOrg(
  recordOrgId: unknown,
  callerOrgId: string | null | undefined,
): boolean {
  if (!callerOrgId) return true;
  if (recordOrgId == null || String(recordOrgId).trim() === "") return true;
  if (isLegacyOrg(recordOrgId)) return true;
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
