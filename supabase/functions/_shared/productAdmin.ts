/**
 * Product-scoped Admin guard for Edge Functions.
 * Allows both platform roles and product-specific admin roles.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";

/** Product identifiers */
export type ProductKey = "fleet" | "enterprise" | "dash" | "rides" | "driver" | "haul" | "courier";

/** Platform roles that have access to all product admins */
export const PLATFORM_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "superadmin",
]);

/** Product-specific admin roles */
export const PRODUCT_ADMIN_ROLES: Record<ProductKey, Set<string>> = {
  fleet: new Set([...PLATFORM_ROLES, "fleet_admin", "fleet_ops"]),
  enterprise: new Set([...PLATFORM_ROLES, "enterprise_admin", "enterprise_ops"]),
  dash: new Set([...PLATFORM_ROLES, "dash_admin", "dash_ops"]),
  rides: new Set([...PLATFORM_ROLES, "rides_admin", "rides_ops"]),
  driver: new Set([...PLATFORM_ROLES, "driver_admin", "driver_ops"]),
  haul: new Set([...PLATFORM_ROLES, "haul_admin", "haul_ops"]),
  courier: new Set([...PLATFORM_ROLES, "courier_admin", "courier_ops"]),
};

export type ProductAdminUser = {
  id: string;
  email: string;
  role: string;
  /** All roles on the JWT (for write gates when primary role differs). */
  roles: string[];
  isPlatformRole: boolean;
};

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

/**
 * Verify that the request has a valid token with product admin access.
 * Returns the user info if authorized, or a 401/403 Response if not.
 */
export async function requireProductAdmin(
  c: {
    req: { header: (n: string) => string | undefined };
    json: (b: unknown, s?: number) => Response;
  },
  product: ProductKey,
): Promise<ProductAdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getJwtRoles(user);
  const allowedRoles = PRODUCT_ADMIN_ROLES[product];
  const matched = roles.find((r) => allowedRoles.has(r));

  if (!matched) {
    return c.json(
      {
        error: "Forbidden",
        message: `${product} admin role required`,
        currentRole: jwtPrimaryRole(user) || "(none)",
        allowedRoles: Array.from(allowedRoles),
      },
      403,
    );
  }

  return {
    id: user.id,
    email: user.email || "",
    role: matched,
    roles,
    isPlatformRole: PLATFORM_ROLES.has(matched),
  };
}

type AdminContext = {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
};

/**
 * Verify admin access for any of the given products (e.g. driver + rides support tools).
 */
export async function requireProductAdminAny(
  c: AdminContext,
  products: ProductKey[],
): Promise<ProductAdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getJwtRoles(user);
  let matched: string | undefined;
  for (const product of products) {
    const allowed = PRODUCT_ADMIN_ROLES[product];
    matched = roles.find((r) => allowed.has(r));
    if (matched) break;
  }

  if (!matched) {
    const allowedRoles = [
      ...new Set(products.flatMap((p) => Array.from(PRODUCT_ADMIN_ROLES[p]))),
    ];
    return c.json(
      {
        error: "Forbidden",
        message: `Admin role required (${products.join(" or ")})`,
        currentRole: jwtPrimaryRole(user) || "(none)",
        allowedRoles,
      },
      403,
    );
  }

  return {
    id: user.id,
    email: user.email || "",
    role: matched,
    roles,
    isPlatformRole: PLATFORM_ROLES.has(matched),
  };
}

/**
 * Check if a role has access to a specific product admin.
 */
export function hasProductAdminAccess(
  role: string | null | undefined,
  product: ProductKey,
): boolean {
  if (!role) return false;
  return PRODUCT_ADMIN_ROLES[product].has(role);
}

/**
 * Check if any JWT role grants product admin access.
 */
export function userHasProductAdminAccess(
  user: {
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  product: ProductKey,
): boolean {
  return getJwtRoles(user).some((r) => hasProductAdminAccess(r, product));
}

/**
 * Check if a role is a platform-level role.
 */
export function isPlatformRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return PLATFORM_ROLES.has(role);
}

/**
 * Get all products a role can access.
 */
export function getAccessibleProducts(role: string | null | undefined): ProductKey[] {
  if (!role) return [];
  const products: ProductKey[] = [];
  for (const [product, roles] of Object.entries(PRODUCT_ADMIN_ROLES)) {
    if (roles.has(role)) {
      products.push(product as ProductKey);
    }
  }
  return products;
}
