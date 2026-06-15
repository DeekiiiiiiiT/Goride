/**
 * Platform Super Admin guard for Edge Functions (delivery, rides, etc.).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtPrimaryRole } from "./authEdge.ts";

export const PLATFORM_ADMIN_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "superadmin",
  "super_admin",
  "admin",
  "rides_admin",
]);

export type PlatformAdminUser = { id: string; email: string; role: string };

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

export async function requirePlatformAdmin(
  c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response },
): Promise<PlatformAdminUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }
  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }
  const rawRole = jwtPrimaryRole(user);
  if (!PLATFORM_ADMIN_ROLES.has(rawRole)) {
    return c.json({
      error: "Forbidden",
      message: "Platform admin role required",
      currentRole: rawRole || "(none)",
    }, 403);
  }
  return { id: user.id, email: user.email || "", role: rawRole };
}

export function isPlatformAdminRole(role: string): boolean {
  return PLATFORM_ADMIN_ROLES.has(role);
}
