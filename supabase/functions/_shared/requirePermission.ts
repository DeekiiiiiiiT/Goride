/**
 * Unified permission middleware — DB-backed with JWT fallback.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "./authEdge.ts";
import { logPermissionCheck } from "./auditLog.ts";
import {
  resolveUserPermissions,
  userHasPermissionResolved,
} from "./rbacQuery.ts";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
  isPlatformUser: boolean;
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

export async function requireAuthenticatedUser(
  c: JsonContext,
): Promise<{ user: AuthenticatedUser } | Response> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: missing Authorization header" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized: invalid token" }, 401);
  }

  const roles = getJwtRoles(user);
  const permissions = await resolveUserPermissions(user.id, user);
  const isPlatformUser = permissions.includes("system.config")
    || roles.some((r) => r === "platform_owner" || r === "superadmin" || r === "platform_support");

  return {
    user: {
      id: user.id,
      email: user.email || "",
      role: jwtPrimaryRole(user),
      roles,
      permissions,
      isPlatformUser,
    },
  };
}

export async function requirePermission(
  c: JsonContext,
  permissionKey: string,
  options?: { auditResource?: { type: string; id: string } },
): Promise<AuthenticatedUser | Response> {
  const authResult = await requireAuthenticatedUser(c);
  if (authResult instanceof Response) return authResult;

  const { user } = authResult;
  const authHeader = c.req.header("Authorization")!;
  const { data: { user: fullUser } } = await authClient(authHeader).auth.getUser();
  const hasAccess = fullUser
    ? await userHasPermissionResolved(fullUser.id, fullUser, permissionKey)
    : user.permissions.includes(permissionKey);

  if (!hasAccess) {
    await logPermissionCheck({
      actorUserId: user.id,
      action: "permission.denied",
      permissionKey,
      resourceType: options?.auditResource?.type,
      resourceId: options?.auditResource?.id,
      request: c.req.raw,
    });
    return c.json({
      error: "Forbidden",
      message: `Permission required: ${permissionKey}`,
      currentRole: user.role || "(none)",
    }, 403);
  }

  await logPermissionCheck({
    actorUserId: user.id,
    action: "permission.granted",
    permissionKey,
    resourceType: options?.auditResource?.type,
    resourceId: options?.auditResource?.id,
    request: c.req.raw,
  });

  return user;
}
