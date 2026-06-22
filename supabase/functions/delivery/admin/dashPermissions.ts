import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

export const DASH_WRITE_ROLES = new Set([
  "dash_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

export const DASH_DELETE_ROLES = new Set([
  "platform_owner",
  "superadmin",
  "dash_admin",
]);

export const DASH_FORCE_APPROVE_ROLES = new Set([
  "platform_owner",
  "superadmin",
  "dash_admin",
]);

export function hasAnyDashRole(roles: string[], allowed: ReadonlySet<string>): boolean {
  return roles.some((r) => allowed.has(r));
}

export function requireDashWrite(admin: ProductAdminUser): Response | null {
  if (!hasAnyDashRole(admin.roles, DASH_WRITE_ROLES)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "dash_admin or platform role required for write actions",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function requireDashDelete(admin: ProductAdminUser): Response | null {
  if (!hasAnyDashRole(admin.roles, DASH_DELETE_ROLES)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "platform_owner, superadmin, or dash_admin required for delete actions",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function canForceApproveMerchant(adminRoles: string[]): boolean {
  return hasAnyDashRole(adminRoles, DASH_FORCE_APPROVE_ROLES);
}
