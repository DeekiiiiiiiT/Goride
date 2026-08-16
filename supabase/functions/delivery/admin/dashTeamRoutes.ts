/**
 * Dash admin team — product-scoped role management for Dash + Courier operators.
 * Manages dash_admin / dash_ops / courier_admin / courier_ops role assignments.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashDelete, requireDashWrite } from "./dashPermissions.ts";
import { writeKvAudit } from "./merchantAdminShared.ts";

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

/** Roles this team console can grant/manage. */
const MANAGED_ROLE_NAMES = ["dash_admin", "dash_ops", "courier_admin", "courier_ops"] as const;
const MANAGED_ROLE_SET = new Set<string>(MANAGED_ROLE_NAMES);

export function mountDashTeamRoutes(admin: Hono) {
  admin.get("/team", async (c) => {
    const pdb = getPlatformDb();
    const { data: roles } = await pdb.from("roles").select("id, name").in("name", [...MANAGED_ROLE_NAMES]);
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

  admin.post("/team/invite", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const roleName = String(body.role || "");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "A valid email is required" }, 400);
    }
    if (!MANAGED_ROLE_SET.has(roleName)) {
      return c.json({ error: `role must be one of ${MANAGED_ROLE_NAMES.join(", ")}` }, 400);
    }

    const pdb = getPlatformDb();
    const { data: role } = await pdb.from("roles").select("id").eq("name", roleName).single();
    if (!role) return c.json({ error: "Role not found" }, 404);

    const auth = getAuthAdmin();

    // Resolve or create the target auth user. Invite by email if new; reuse if existing.
    let userId = "";
    const { data: invited, error: inviteErr } = await auth.auth.admin.inviteUserByEmail(email);
    if (invited?.user?.id) {
      userId = invited.user.id;
    } else {
      // Already registered (or invite disabled) — fall back to createUser, then lookup.
      const { data: created } = await auth.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (created?.user?.id) {
        userId = created.user.id;
      } else {
        // User exists — page through admin list to find the id.
        const { data: list } = await auth.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
        if (match?.id) userId = match.id;
      }
      if (!userId) {
        return c.json({ error: inviteErr?.message || "Could not resolve invited user" }, 500);
      }
    }

    // Grant the role idempotently (unique on user_id+role_id assumed at DB level).
    const { error: grantErr } = await pdb
      .from("user_roles")
      .upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id" });
    if (grantErr) return c.json({ error: grantErr.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.team_member_invited",
      userId,
      email,
      `Granted ${roleName}`,
    );

    return c.json({ ok: true, userId, email, role: roleName }, 201);
  });

  admin.patch("/team/:userId/role", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const roleName = String(body.role || "");
    if (!MANAGED_ROLE_SET.has(roleName)) {
      return c.json({ error: `role must be one of ${MANAGED_ROLE_NAMES.join(", ")}` }, 400);
    }
    const userId = c.req.param("userId");
    const pdb = getPlatformDb();
    const { data: role } = await pdb.from("roles").select("id").eq("name", roleName).single();
    if (!role) return c.json({ error: "Role not found" }, 404);

    const { data: managedRoles } = await pdb.from("roles").select("id").in("name", [...MANAGED_ROLE_NAMES]);
    const managedRoleIds = (managedRoles ?? []).map((r) => r.id);
    await pdb.from("user_roles").delete().eq("user_id", userId).in("role_id", managedRoleIds);

    const { error } = await pdb.from("user_roles").insert({ user_id: userId, role_id: role.id });
    if (error) return c.json({ error: error.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.team_member_role_changed",
      userId,
      "",
      `Role set to ${roleName}`,
    );
    return c.json({ ok: true, userId, role: roleName });
  });

  admin.delete("/team/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const pdb = getPlatformDb();
    const { data: managedRoles } = await pdb.from("roles").select("id").in("name", [...MANAGED_ROLE_NAMES]);
    const roleIds = (managedRoles ?? []).map((r) => r.id as string);
    const { error } = await pdb.from("user_roles").delete().eq("user_id", userId).in("role_id", roleIds);
    if (error) return c.json({ error: error.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.team_member_removed",
      userId,
      "",
      "All managed roles revoked",
    );
    return c.json({ ok: true });
  });
}
