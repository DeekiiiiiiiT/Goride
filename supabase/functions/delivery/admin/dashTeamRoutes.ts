/**
 * Dash admin team — product-scoped dash_admin / dash_ops management.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashDelete, requireDashWrite } from "./dashPermissions.ts";

function getPlatformDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "platform" } },
  );
}

function getAuthAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const DASH_ROLE_NAMES = new Set(["dash_admin", "dash_ops"]);

export function mountDashTeamRoutes(admin: Hono) {
  admin.get("/team", async (c) => {
    const pdb = getPlatformDb();
    const { data: roles } = await pdb.from("roles").select("id, name").in("name", ["dash_admin", "dash_ops"]);
    const roleIds = (roles ?? []).map((r) => r.id as string);
    if (!roleIds.length) return c.json({ members: [] });

    const { data: userRoles, error } = await pdb.from("user_roles")
      .select("user_id, role_id, roles(name)")
      .in("role_id", roleIds);
    if (error) return c.json({ error: error.message }, 500);

    const auth = getAuthAdmin();
    const members = await Promise.all((userRoles ?? []).map(async (ur) => {
      const userId = (ur as Record<string, unknown>).user_id as string;
      const roleName = ((ur as Record<string, unknown>).roles as { name?: string })?.name ?? "";
      let email = "";
      try {
        const { data: u } = await auth.auth.admin.getUserById(userId);
        email = u?.user?.email || "";
      } catch { /* ignore */ }
      return { userId, email, role: roleName };
    }));

    return c.json({ members });
  });

  admin.patch("/team/:userId/role", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const roleName = String(body.role || "");
    if (!DASH_ROLE_NAMES.has(roleName)) {
      return c.json({ error: "role must be dash_admin or dash_ops" }, 400);
    }
    const userId = c.req.param("userId");
    const pdb = getPlatformDb();
    const { data: role } = await pdb.from("roles").select("id").eq("name", roleName).single();
    if (!role) return c.json({ error: "Role not found" }, 404);

    await pdb.from("user_roles").delete().eq("user_id", userId)
      .in("role_id", (await pdb.from("roles").select("id").in("name", ["dash_admin", "dash_ops"])).data?.map((r) => r.id) ?? []);

    const { error } = await pdb.from("user_roles").insert({ user_id: userId, role_id: role.id });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, userId, role: roleName });
  });

  admin.delete("/team/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const pdb = getPlatformDb();
    const { data: dashRoles } = await pdb.from("roles").select("id").in("name", ["dash_admin", "dash_ops"]);
    const roleIds = (dashRoles ?? []).map((r) => r.id as string);
    const { error } = await pdb.from("user_roles").delete().eq("user_id", userId).in("role_id", roleIds);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
