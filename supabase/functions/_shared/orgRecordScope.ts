/**
 * Pure org-scoping helpers for KV/table records (no Hono context).
 * Mirrors legacy filterByOrg / belongsToOrg semantics from fleet org_scope.ts.
 */

const LEGACY_ORG_PLACEHOLDER = "roam-default-org";

/** True if stored organizationId should be visible to any fleet-scoped reader. */
export function isLegacyOrgPlaceholder(organizationId: unknown): boolean {
  if (organizationId == null || organizationId === "") return false;
  return String(organizationId).trim().toLowerCase() === LEGACY_ORG_PLACEHOLDER;
}

/**
 * Legacy visibility: no org context → all records;
 * missing / placeholder org on record → included;
 * otherwise exact organizationId match.
 */
export function recordBelongsToOrg(
  record: Record<string, unknown> | null | undefined,
  organizationId: string | null | undefined,
): boolean {
  if (!record) return false;
  if (!organizationId) return true;
  const recOrg = record.organizationId;
  if (recOrg == null || recOrg === "") return true;
  if (isLegacyOrgPlaceholder(recOrg)) return true;
  return String(recOrg) === organizationId;
}

/** Filter records with legacy org semantics (same as filterByOrg without Context). */
export function filterRecordsByOrg<T extends Record<string, unknown>>(
  records: T[],
  organizationId: string | null | undefined,
): T[] {
  if (!organizationId) return records;
  return records.filter((r) => recordBelongsToOrg(r, organizationId));
}
