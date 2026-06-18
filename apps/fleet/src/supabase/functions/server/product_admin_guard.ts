/**
 * Product-scoped admin guard (fleet product admin at roamfleet.co/admin).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import type { ProductLine } from "./product_line.ts";

export type FleetProductKey = "fleet" | "enterprise" | "dash" | "rides" | "driver" | "haul";

const PLATFORM_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "superadmin",
]);

const PRODUCT_ADMIN_ROLES: Record<FleetProductKey, Set<string>> = {
  fleet: new Set([...PLATFORM_ROLES, "fleet_admin", "fleet_ops"]),
  enterprise: new Set([...PLATFORM_ROLES, "enterprise_admin", "enterprise_ops"]),
  dash: new Set([...PLATFORM_ROLES, "dash_admin", "dash_ops"]),
  rides: new Set([...PLATFORM_ROLES, "rides_admin", "rides_ops"]),
  driver: new Set([...PLATFORM_ROLES, "driver_admin", "driver_ops"]),
  haul: new Set([...PLATFORM_ROLES, "haul_admin", "haul_ops"]),
};

export type ProductAdminUser = {
  id: string;
  email: string;
  role: string;
  isPlatformRole: boolean;
};

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getRoles(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): string[] {
  const app = user.app_metadata || {};
  const meta = user.user_metadata || {};
  const roles = app.roles;
  if (Array.isArray(roles) && roles.length > 0) {
    return roles.map((r) => String(r));
  }
  const single = app.role ?? meta.role;
  return single ? [String(single)] : [];
}

export async function requireProductAdmin(
  c: {
    req: { header: (n: string) => string | undefined };
    json: (b: unknown, s?: number) => Response;
  },
  product: FleetProductKey,
): Promise<ProductAdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getRoles(user);
  const allowedRoles = PRODUCT_ADMIN_ROLES[product];
  const matched = roles.find((r) => allowedRoles.has(r));

  if (!matched) {
    return c.json(
      {
        error: "Forbidden",
        message: `${product} admin role required`,
        allowedRoles: Array.from(allowedRoles),
      },
      403,
    );
  }

  return {
    id: user.id,
    email: user.email || "",
    role: matched,
    isPlatformRole: PLATFORM_ROLES.has(matched),
  };
}
