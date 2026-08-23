import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

function hasPermission(admin: ProductAdminUser, key: string): boolean {
  return admin.permissions?.includes(key) ?? false;
}

export function requireDashWrite(admin: ProductAdminUser): Response | null {
  if (
    hasPermission(admin, "dash.users.write")
    || hasPermission(admin, "system.config")
  ) {
    return null;
  }
  return new Response(
    JSON.stringify({
      error: "forbidden",
      message: "Permission required: dash.users.write",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

export function requireDashDelete(admin: ProductAdminUser): Response | null {
  if (
    hasPermission(admin, "dash.users.write")
    || hasPermission(admin, "users.delete")
    || hasPermission(admin, "identity.delete")
  ) {
    return null;
  }
  return new Response(
    JSON.stringify({
      error: "forbidden",
      message: "Permission required for delete actions",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

export function canForceApproveMerchant(admin: ProductAdminUser): boolean {
  return hasPermission(admin, "dash.compliance.approve")
    || hasPermission(admin, "system.config");
}

/** @deprecated Use requireDashWrite — kept for transitional imports */
export function hasAnyDashRole(_roles: string[], _allowed: ReadonlySet<string>): boolean {
  return false;
}
