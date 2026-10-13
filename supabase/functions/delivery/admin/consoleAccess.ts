/**
 * Who can see each console feed. Keep this in step with
 * packages/dash-admin/src/config/dashAdminCapabilities.ts.
 * Owners short-circuit. An unknown capability stays hidden.
 */

const OWNERS = new Set(["platform_owner", "superadmin", "dash_admin"]);

export function canSee(roles: string[], capability: string): boolean {
  if (roles.some((role) => OWNERS.has(role))) return true;
  const ops = roles.includes("dash_ops");
  const courier = roles.some((role) => role === "courier_admin" || role === "courier_ops");
  const support = roles.includes("platform_support");
  const analyst = roles.includes("platform_analyst");
  const map: Record<string, boolean> = {
    merchants: ops || support || analyst,
    couriers: ops || courier || support || analyst,
    customers: ops || support || analyst,
    team: courier,
    orders: ops || courier || support || analyst,
    support: ops || courier || support,
    dispatch: ops || courier || support || analyst,
    finance: analyst,
    "courier-cash": courier || analyst,
    "in-house": ops,
  };
  return map[capability] ?? false;
}

export function canSeePeople(roles: string[]): boolean {
  return canSee(roles, "customers") || canSee(roles, "team");
}

/** Strip characters that would split a PostgREST or() filter. */
export function sanitizeSearchToken(raw: string): string {
  return raw.replace(/[%_,().]/g, "").trim();
}

export function personHref(
  roles: string[],
  userId: string,
  personas: Array<{ persona?: string | null; ref_id?: string | null }>,
): string | null {
  const customer = personas.find((row) => row.persona === "customer" && row.ref_id);
  const courier = personas.find((row) => row.persona === "courier");
  if (customer?.ref_id && canSee(roles, "customers")) return `/customers/${customer.ref_id}`;
  if (courier && canSee(roles, "couriers")) return `/couriers/${userId}`;
  if (canSee(roles, "team")) return `/team?tab=all-users&id=${userId}`;
  return null;
}

/** A courier-only login may grant courier roles, never a Dash role. */
export function courierGrantAllowed(actorRoles: string[], targetRole: string): boolean {
  const roles = actorRoles.filter((role) => role && role !== "authenticated");
  const courierOnly = roles.length > 0 && roles.every((role) => role === "courier_admin" || role === "courier_ops");
  if (!courierOnly) return true;
  return targetRole === "courier_admin" || targetRole === "courier_ops";
}
