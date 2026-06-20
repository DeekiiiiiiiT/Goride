import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

/** Roles allowed to perform write actions (suspend, approve, compliance patch). */
export const COURIER_WRITE_ROLES = new Set([
  "courier_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

export function hasAnyCourierRole(roles: string[], allowed: ReadonlySet<string>): boolean {
  return roles.some((r) => allowed.has(r));
}

/** Roles allowed to delete courier profiles. */
export const COURIER_DELETE_ROLES = new Set([
  "platform_owner",
  "superadmin",
]);

export function requireWrite(admin: ProductAdminUser): Response | null {
  if (!hasAnyCourierRole(admin.roles, COURIER_WRITE_ROLES)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "courier_admin or platform role required for write actions",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function requireDelete(admin: ProductAdminUser): Response | null {
  if (!hasAnyCourierRole(admin.roles, COURIER_DELETE_ROLES)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "platform_owner or superadmin required for delete actions",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}
