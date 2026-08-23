import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

function hasPermission(admin: ProductAdminUser, key: string): boolean {
  return admin.permissions?.includes(key) ?? false;
}

export function requireWrite(admin: ProductAdminUser): Response | null {
  if (
    hasPermission(admin, "courier.users.write")
    || hasPermission(admin, "system.config")
  ) {
    return null;
  }
  return new Response(
    JSON.stringify({
      error: "forbidden",
      message: "Permission required: courier.users.write",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

export function requireDelete(admin: ProductAdminUser): Response | null {
  if (
    hasPermission(admin, "courier.users.write")
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

export function requireComplianceApprove(admin: ProductAdminUser): Response | null {
  if (
    hasPermission(admin, "courier.compliance.approve")
    || hasPermission(admin, "system.config")
  ) {
    return null;
  }
  return new Response(
    JSON.stringify({
      error: "forbidden",
      message: "Permission required: courier.compliance.approve",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/** @deprecated */
export function hasAnyCourierRole(_roles: string[], _allowed: ReadonlySet<string>): boolean {
  return false;
}
