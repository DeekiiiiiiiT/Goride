/**
 * Organization Scoping Helpers — Roam Fleet
 *
 * Provides utility functions for stamping records with organizationId on write
 * and filtering records by organizationId on read.
 *
 * Created: Phase 7 of the RBAC rollout (see /solution.md).
 *
 * SAFETY RULES:
 * - If a record has no organizationId (pre-backfill), it is INCLUDED on read
 *   (graceful fallback during transition).
 * - If the user has no organizationId (anon passthrough), NO filtering is applied.
 * - Platform roles (platform_owner, platform_support, platform_analyst) bypass
 *   org filtering — they can see all organizations' data.
 */

import type { Context } from "npm:hono";
import type { RbacUser, Role } from "./rbac_middleware.ts";

// Platform roles that bypass org scoping (they see all orgs)
const PLATFORM_ROLES: Set<Role> = new Set([
  'platform_owner',
  'platform_support',
  'platform_analyst',
]);

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
 * SAFETY: Records without an organizationId field are INCLUDED (graceful
 * fallback for pre-backfill data). If the user has no orgId (anon passthrough
 * or platform role), ALL records are returned (no filtering).
 *
 * Usage: `const scoped = filterByOrg(allRecords, c);`
 */
export function filterByOrg<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
): T[] {
  const orgId = getOrgId(c);
  if (!orgId) return records; // no org context — return all (backward compat)
  return records.filter((r) => {
    if (!r.organizationId) return true;
    if (isLegacyOrgPlaceholder(r.organizationId)) return true;
    return r.organizationId === orgId;
  });
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
