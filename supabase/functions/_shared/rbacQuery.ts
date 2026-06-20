/**
 * Database-backed RBAC queries with JWT fallback during migration.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";
import {
  hasProductAdminAccess,
  type ProductKey,
} from "./productAdmin.ts";
import { productPortalAccess } from "./platformPermissions.ts";

export type RbacUser = {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function fetchUserPermissionKeys(userId: string): Promise<string[]> {
  const { data, error } = await serviceClient().rpc("rbac_user_permission_keys", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[rbac] rbac_user_permission_keys failed:", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function dbUserHasPermission(
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("rbac_user_has_permission", {
    p_user_id: userId,
    p_permission_key: permissionKey,
  });
  if (error) {
    console.warn("[rbac] rbac_user_has_permission failed:", error.message);
    return false;
  }
  return data === true;
}

export async function dbUserMaxRoleLevel(userId: string): Promise<number> {
  const { data, error } = await serviceClient().rpc("rbac_user_max_role_level", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[rbac] rbac_user_max_role_level failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export async function dbIsPlatformUser(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("rbac_is_platform_user", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[rbac] rbac_is_platform_user failed:", error.message);
    return false;
  }
  return data === true;
}

export async function dbUserHasProductAccess(
  userId: string,
  product: ProductKey,
): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("rbac_user_has_product_access", {
    p_user_id: userId,
    p_product_key: product,
  });
  if (error) {
    console.warn("[rbac] rbac_user_has_product_access failed:", error.message);
    return false;
  }
  return data === true;
}

/** Resolve permissions: DB first, JWT role mapping as fallback. */
export async function resolveUserPermissions(
  userId: string,
  user: RbacUser,
): Promise<string[]> {
  const fromDb = await fetchUserPermissionKeys(userId);
  if (fromDb.length > 0) return fromDb;

  const roles = getJwtRoles(user);
  const keys = new Set<string>();
  for (const role of roles) {
    keys.add("users.read");
    for (const product of [
      "fleet", "enterprise", "dash", "rides", "driver", "haul", "courier",
    ] as ProductKey[]) {
      if (hasProductAdminAccess(role, product)) {
        keys.add(productPortalAccess(product));
        if (role.endsWith("_admin") || role === "platform_owner" || role === "superadmin") {
          keys.add(`${product}.users.write`);
          keys.add(`${product}.compliance.approve`);
          keys.add(`${product}.support.write`);
          keys.add(`${product}.settings.write`);
        }
        keys.add(`${product}.users.read`);
        keys.add(`${product}.compliance.read`);
        keys.add(`${product}.ledger.read`);
        keys.add(`${product}.presence.read`);
        keys.add(`${product}.settings.read`);
      }
    }
    if (role === "platform_owner" || role === "superadmin") {
      keys.add("users.read");
      keys.add("analytics.view");
      keys.add("system.config");
      keys.add("audit.read");
    }
  }
  return [...keys];
}

export async function userHasPermissionResolved(
  userId: string,
  user: RbacUser,
  permissionKey: string,
): Promise<boolean> {
  const fromDb = await dbUserHasPermission(userId, permissionKey);
  if (fromDb) return true;

  const perms = await resolveUserPermissions(userId, user);
  if (perms.includes(permissionKey)) return true;

  const roles = getJwtRoles(user);
  if (roles.length === 0) return false;

  if (permissionKey.endsWith(".portal.access")) {
    const product = permissionKey.replace(".portal.access", "") as ProductKey;
    return roles.some((r) => hasProductAdminAccess(r, product));
  }
  return false;
}

export async function userHasProductAccessResolved(
  userId: string,
  user: RbacUser,
  product: ProductKey,
): Promise<boolean> {
  const fromDb = await dbUserHasProductAccess(userId, product);
  if (fromDb) return true;
  return getJwtRoles(user).some((r) => hasProductAdminAccess(r, product));
}
