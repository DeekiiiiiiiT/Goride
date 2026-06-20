/**
 * Role level middleware — DB-backed with JWT fallback.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";
import { logPermissionCheck } from "./auditLog.ts";
import { dbUserMaxRoleLevel } from "./rbacQuery.ts";
import { ROLE_LEVELS, type RoleLevel } from "./platformPermissions.ts";

const JWT_ROLE_LEVELS: Record<string, number> = {
  platform_owner: 1000,
  superadmin: 1000,
  platform_support: 950,
  platform_analyst: 500,
  fleet_admin: 800,
  fleet_ops: 700,
  enterprise_admin: 800,
  enterprise_ops: 700,
  dash_admin: 800,
  dash_ops: 700,
  rides_admin: 800,
  rides_ops: 700,
  driver_admin: 800,
  driver_ops: 700,
  haul_admin: 800,
  haul_ops: 700,
  courier_admin: 800,
  courier_ops: 700,
};

export type LevelAuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  roles: string[];
  roleLevel: number;
};

type JsonContext = {
  req: { header: (n: string) => string | undefined; raw: Request };
  json: (b: unknown, s?: number) => Response;
};

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

function jwtMaxLevel(roles: string[]): number {
  let max = 0;
  for (const r of roles) {
    const level = JWT_ROLE_LEVELS[r];
    if (level && level > max) max = level;
  }
  return max;
}

export async function requireMinRoleLevel(
  c: JsonContext,
  minLevel: RoleLevel,
): Promise<LevelAuthenticatedUser | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getJwtRoles(user);
  const dbLevel = await dbUserMaxRoleLevel(user.id);
  const jwtLevel = jwtMaxLevel(roles);
  const effectiveLevel = Math.max(dbLevel, jwtLevel);

  if (effectiveLevel < minLevel) {
    await logPermissionCheck({
      actorUserId: user.id,
      action: "permission.denied",
      permissionKey: `role.level.${minLevel}`,
      metadata: { effectiveLevel, minLevel },
      request: c.req.raw,
    });
    return c.json({
      error: "Forbidden",
      message: `Minimum role level ${minLevel} required`,
      currentLevel: effectiveLevel,
    }, 403);
  }

  return {
    id: user.id,
    email: user.email || "",
    role: jwtPrimaryRole(user),
    roles,
    roleLevel: effectiveLevel,
  };
}
