/**
 * Product-scoped Admin guard for Edge Functions.
 * Allows both platform roles and product-specific admin roles.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";
import { resolveEffectiveRoleNames, resolveUserPermissions, userHasProductAccessResolved } from "./rbacQuery.ts";

/** Product identifiers */
export type ProductKey = "fleet" | "enterprise" | "dash" | "rides" | "driver" | "haul" | "courier";

/** Platform roles that have access to all product admins */
export const PLATFORM_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "platform_analyst",
  "superadmin",
]);

/** Product-specific admin roles */
export const PRODUCT_ADMIN_ROLES: Record<ProductKey, Set<string>> = {
  fleet: new Set([...PLATFORM_ROLES, "fleet_admin", "fleet_ops"]),
  enterprise: new Set([...PLATFORM_ROLES, "enterprise_admin", "enterprise_ops"]),
  dash: new Set([...PLATFORM_ROLES, "dash_admin", "dash_ops", "courier_admin", "courier_ops"]),
  rides: new Set([...PLATFORM_ROLES, "rides_admin", "rides_ops"]),
  driver: new Set([...PLATFORM_ROLES, "driver_admin", "driver_ops"]),
  haul: new Set([...PLATFORM_ROLES, "haul_admin", "haul_ops"]),
  courier: new Set([...PLATFORM_ROLES, "courier_admin", "courier_ops", "dash_admin", "dash_ops"]),
};

export type ProductAdminUser = {
  id: string;
  email: string;
  role: string;
  /** All roles on the JWT (for write gates when primary role differs). */
  roles: string[];
  /** Resolved permission keys from DB + JWT fallback. */
  permissions: string[];
  isPlatformRole: boolean;
};

/** Fallback when platform.staff_security has not loaded — matches catalog default. */
export const DEFAULT_MFA_REQUIRED_ROLES = [
  "platform_owner",
  "dash_admin",
  "courier_admin",
  "identity_admin",
  "superadmin",
] as const;

const MFA_MIN_LEVEL = 800;

const ROLE_LEVELS: Record<string, number> = {
  platform_owner: 1000,
  superadmin: 1000,
  platform_support: 950,
  identity_admin: 900,
  dash_admin: 800,
  courier_admin: 800,
  dash_ops: 700,
  courier_ops: 700,
  support_agent: 600,
  dash_concierge: 500,
  platform_analyst: 500,
};

/** Read aal from JWT payload (token already verified via getUser). */
export function jwtAssuranceLevel(authHeader: string): "aal1" | "aal2" {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const mid = token.split(".")[1];
    if (!mid) return "aal1";
    const json = atob(mid.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { aal?: string };
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/** True when roles need 2-step login per platform.staff_security (+ level ≥ 800 floor). */
export function staffRolesRequireMfa(
  roles: string[],
  mfaRequiredRoles?: string[] | null,
): boolean {
  const list =
    mfaRequiredRoles && mfaRequiredRoles.length > 0
      ? mfaRequiredRoles
      : (DEFAULT_MFA_REQUIRED_ROLES as readonly string[]);
  return roles.some((r) => {
    const level = ROLE_LEVELS[r] ?? 0;
    return level >= MFA_MIN_LEVEL || list.includes(r);
  });
}

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

/** platform.staff_security — privileged admins must present AAL2. */
async function enforceStaffMfa(
  c: {
    req: { header: (n: string) => string | undefined };
    json: (b: unknown, s?: number) => Response;
  },
  authHeader: string,
  roles: string[],
): Promise<Response | null> {
  let mfaRequiredRoles: string[] | null = null;
  try {
    const { getSetting } = await import("./rushSettings/getSetting.ts");
    const sec = await getSetting<{
      sessionTimeoutMinutes?: number;
      mfaRequiredRoles?: string[];
    }>("platform.staff_security");
    if (sec && Array.isArray(sec.mfaRequiredRoles)) {
      mfaRequiredRoles = sec.mfaRequiredRoles;
    }
  } catch {
    /* use defaults */
  }
  if (!staffRolesRequireMfa(roles, mfaRequiredRoles)) return null;
  if (jwtAssuranceLevel(authHeader) === "aal2") return null;
  return c.json(
    {
      error: "Forbidden",
      message: "Two-step login required",
      code: "mfa_required",
    },
    403,
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

  const roles = await resolveEffectiveRoleNames(user.id, user);
  if (product === "dash" && isInHouseBuyerOnly(roles)) {
    return c.json(
      { error: "Forbidden", message: "dash admin role required" },
      403,
    );
  }
  const allowedRoles = PRODUCT_ADMIN_ROLES[product];
  const matchedProduct = roles.find((r) => allowedRoles.has(r) && !PLATFORM_ROLES.has(r));
  const matchedPlatform = roles.find((r) => PLATFORM_ROLES.has(r));
  const dbAccess = await userHasProductAccessResolved(user.id, user, product);

  let platformDbOk = false;
  if (matchedPlatform && !matchedProduct && !dbAccess) {
    const { dbIsPlatformUser } = await import("./rbacQuery.ts");
    platformDbOk = await dbIsPlatformUser(user.id);
  }

  if (!matchedProduct && !matchedPlatform && !dbAccess && !platformDbOk) {
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

  const effectiveRole = matchedProduct
    ?? matchedPlatform
    ?? (dbAccess ? `${product}_admin` : jwtPrimaryRole(user))
    ?? roles[0]
    ?? "";

  const mfaBlock = await enforceStaffMfa(c, authHeader, roles);
  if (mfaBlock) return mfaBlock;

  const permissions = await resolveUserPermissions(user.id, user);

  return {
    id: user.id,
    email: user.email || "",
    role: effectiveRole,
    roles,
    permissions,
    isPlatformRole: PLATFORM_ROLES.has(effectiveRole),
  };
}

/** A buyer can open the desk. They cannot open the rest of the ops console. */
export function isInHouseBuyerOnly(roles: string[]): boolean {
  if (!roles.includes("dash_concierge")) return false;
  const elevated = new Set([
    "dash_admin",
    "dash_ops",
    "courier_admin",
    "courier_ops",
    ...PLATFORM_ROLES,
  ]);
  return !roles.some((role) => elevated.has(role));
}

/**
 * Authenticate and allow an explicit role set.
 * Used by the In-House desk so buyers are not dash admins.
 */
export async function requireRoleSet(
  c: {
    req: { header: (n: string) => string | undefined };
    json: (b: unknown, s?: number) => Response;
  },
  allowed: Set<string>,
): Promise<ProductAdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }
  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }
  const roles = await resolveEffectiveRoleNames(user.id, user);
  if (!roles.some((role) => allowed.has(role))) {
    return c.json({ error: "Forbidden", message: "desk role required" }, 403);
  }
  const mfaBlock = await enforceStaffMfa(c, authHeader, roles);
  if (mfaBlock) return mfaBlock;
  const permissions = await resolveUserPermissions(user.id, user);
  const effectiveRole = roles.find((role) => allowed.has(role)) ?? roles[0] ?? "";
  return {
    id: user.id,
    email: user.email || "",
    role: effectiveRole,
    roles,
    permissions,
    isPlatformRole: PLATFORM_ROLES.has(effectiveRole),
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

  const roles = await resolveEffectiveRoleNames(user.id, user);
  let matched: string | undefined;
  for (const product of products) {
    const allowed = PRODUCT_ADMIN_ROLES[product];
    matched = roles.find((r) => allowed.has(r));
    if (matched) {
      break;
    }
    const dbAccess = await userHasProductAccessResolved(user.id, user, product);
    if (dbAccess) {
      matched = `${product}_admin`;
      break;
    }
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

  const mfaBlock = await enforceStaffMfa(c, authHeader, roles);
  if (mfaBlock) return mfaBlock;

  return {
    id: user.id,
    email: user.email || "",
    role: matched,
    roles,
    permissions: await resolveUserPermissions(user.id, user),
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
