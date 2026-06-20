/**
 * Identity service — RBAC permissions API.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dbUserMaxRoleLevel,
  fetchUserPermissionKeys,
  resolveUserPermissions,
} from "../_shared/rbacQuery.ts";
import { getJwtRoles, jwtPrimaryRole } from "../_shared/authEdge.ts";

const app = new Hono().basePath("/identity");

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
}));

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

app.get("/health", (c) => c.json({ service: "identity", status: "ok" }));

/** Current user's resolved permissions (DB + JWT fallback). */
app.get("/permissions", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const permissions = await resolveUserPermissions(user.id, user);
  const roleLevel = await dbUserMaxRoleLevel(user.id);
  const roles = getJwtRoles(user);

  return c.json({
    userId: user.id,
    email: user.email,
    primaryRole: jwtPrimaryRole(user),
    roles,
    permissions,
    roleLevel,
    isPlatformUser: permissions.includes("system.config")
      || roles.some((r) => ["platform_owner", "superadmin", "platform_support"].includes(r)),
  });
});

/** Lightweight permission check for a single key. */
app.get("/permissions/check", async (c) => {
  const authHeader = c.req.header("Authorization");
  const key = c.req.query("key");
  if (!authHeader?.startsWith("Bearer ") || !key) {
    return c.json({ error: "Unauthorized or missing key" }, 401);
  }

  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const permissions = await fetchUserPermissionKeys(user.id);
  const resolved = permissions.length > 0
    ? permissions
    : await resolveUserPermissions(user.id, user);

  return c.json({ key, allowed: resolved.includes(key) });
});

Deno.serve(app.fetch);
