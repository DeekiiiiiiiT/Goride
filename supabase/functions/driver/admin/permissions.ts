import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

/** Roles allowed to perform write actions (suspend, approve, compliance patch). */
export const DRIVER_WRITE_ROLES = new Set([
  "driver_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

/** Roles allowed to force-approve with override reason. */
export const DRIVER_FORCE_APPROVE_ROLES = new Set([
  "platform_owner",
  "superadmin",
]);

/** Roles allowed to delete driver profiles. */
export const DRIVER_DELETE_ROLES = new Set([
  "platform_owner",
  "superadmin",
]);

export function requireWrite(admin: ProductAdminUser): Response | null {
  if (!DRIVER_WRITE_ROLES.has(admin.role)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "driver_admin or platform role required for write actions",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function requireDelete(admin: ProductAdminUser): Response | null {
  if (!DRIVER_DELETE_ROLES.has(admin.role)) {
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
