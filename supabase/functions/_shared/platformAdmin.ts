/**
 * Platform Super Admin guard for Edge Functions.
 * DB-backed with JWT fallback during migration.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtPrimaryRole } from "./authEdge.ts";
import { dbIsPlatformUser } from "./rbacQuery.ts";
import { ROLE_LEVELS } from "./platformPermissions.ts";

export const PLATFORM_ADMIN_ROLES = new Set([
  "platform_owner",
  "platform_support",
  "platform_analyst",
  "superadmin",
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

  const isPlatformDb = await dbIsPlatformUser(user.id);
  // Platform access requires DB row — never JWT alone (app_metadata can be stale; user_metadata is spoofable)
  if (!isPlatformDb) {
    return c.json({
      error: "Forbidden",
      message: "Platform admin role required",
      currentRole: jwtPrimaryRole(user) || "(none)",
    }, 403);
  }

  const rawRole = jwtPrimaryRole(user);
  return { id: user.id, email: user.email || "", role: rawRole || "platform_owner" };
}

export function isPlatformAdminRole(role: string): boolean {
  return PLATFORM_ADMIN_ROLES.has(role);
}

export { ROLE_LEVELS };
