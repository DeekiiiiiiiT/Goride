/**
 * V22 — public trip import must reject cross-org organizationId in body.
 */
export function assertTripOrgScopeMatches(
  trips: Array<{ organizationId?: unknown }>,
  writeOrgId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  const org = writeOrgId.trim();
  if (!org) return { ok: false, status: 403, error: "Organization required" };
  for (const trip of trips) {
    const candidate =
      typeof trip.organizationId === "string" ? trip.organizationId.trim() : "";
    if (candidate && candidate !== org) {
      return {
        ok: false,
        status: 403,
        error: "organizationId must match authenticated fleet",
      };
    }
  }
  return { ok: true };
}
