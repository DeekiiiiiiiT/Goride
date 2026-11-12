export type RouteCompany =
  | { ok: true; orgId: string }
  | { ok: false; status: 400 | 403; code: "NO_COMPANY" | "COMPANY_MISMATCH" };

/** Treat only non-empty trimmed strings as a client-named company. */
function namedCompanyId(requestedOrgId: unknown): string | null {
  if (typeof requestedOrgId !== "string") return null;
  const trimmed = requestedOrgId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The session company is authoritative. A named request company must match or we refuse.
 */
export function resolveRouteCompany(
  sessionOrgId: string | null,
  requestedOrgId: unknown,
): RouteCompany {
  const session = sessionOrgId != null ? String(sessionOrgId).trim() : "";
  if (!session) {
    return { ok: false, status: 400, code: "NO_COMPANY" };
  }
  const named = namedCompanyId(requestedOrgId);
  if (named != null && named !== session) {
    return { ok: false, status: 403, code: "COMPANY_MISMATCH" };
  }
  return { ok: true, orgId: session };
}
