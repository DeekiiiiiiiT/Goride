/**
 * Server checks use the website role table. Do not add a second copy here.
 */
import {
  canOpenCapabilityForRoles,
  type DashCapability,
} from "../../../../packages/dash-admin/src/config/dashAdminCapabilities.ts";

export function canSee(roles: string[], capability: string): boolean {
  return canOpenCapabilityForRoles(roles, capability as DashCapability);
}

/** Customer directory only. Courier staff already get courier search. */
export function canSeePeople(roles: string[]): boolean {
  return canSee(roles, "customers");
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
  const named = roles.filter((role) => role && role !== "authenticated");
  const courierOnly = named.length > 0 && named.every((role) => role === "courier_admin" || role === "courier_ops");
  if (canSee(roles, "team") && !courierOnly) return `/team?tab=all-users&id=${userId}`;
  return null;
}

/** A courier-only login may grant courier roles, never a Dash role. */
export function courierGrantAllowed(actorRoles: string[], targetRole: string): boolean {
  const roles = actorRoles.filter((role) => role && role !== "authenticated");
  const courierOnly = roles.length > 0 && roles.every((role) => role === "courier_admin" || role === "courier_ops");
  if (!courierOnly) return true;
  return targetRole === "courier_admin" || targetRole === "courier_ops";
}
