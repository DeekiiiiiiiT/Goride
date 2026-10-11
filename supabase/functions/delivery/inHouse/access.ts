/** Desk role gates. Buyers place orders. They do not move money or edit the store. */

export const CONCIERGE_ROLES = new Set([
  "dash_concierge",
  "dash_ops",
  "dash_admin",
  "platform_owner",
  "platform_support",
  "platform_analyst",
  "superadmin",
]);

export const OPS_ROLES = new Set([
  "dash_ops",
  "dash_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

export const ADMIN_ROLES = new Set([
  "dash_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

export function hasAnyRole(roles: string[], allowed: Set<string>): boolean {
  return roles.some((role) => allowed.has(role));
}
