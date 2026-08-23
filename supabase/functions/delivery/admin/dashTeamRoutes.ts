/**
 * Dash admin team — product-scoped role management for Dash + Courier operators.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashDelete, requireDashWrite } from "./dashPermissions.ts";
import { writeAdminAudit } from "./adminAuditWriter.ts";

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

async function assertCanGrantRole(adminUser: ProductAdminUser, targetRoleName: string): Promise<Response | null> {
  const isPlatformGrant = ["platform_owner", "platform_support", "platform_analyst", "identity_admin", "superadmin"].includes(targetRoleName);
  if (isPlatformGrant) {
    if (!adminUser.permissions.includes("roles.grant_platform") && !adminUser.permissions.includes("system.config")) {
      return new Response(JSON.stringify({ error: "forbidden", message: "Permission required: roles.grant_platform" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (!adminUser.permissions.includes("roles.grant") && !adminUser.permissions.includes("system.config")) {
    return new Response(JSON.stringify({ error: "forbidden", message: "Permission required: roles.grant" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const pdb = getPlatformDb();
  const [{ data: actorRoles }, { data: targetRole }] = await Promise.all([
    pdb.from("roles").select("level").in("name", adminUser.roles),
    pdb.from("roles").select("level").eq("name", targetRoleName).maybeSingle(),
  ]);
  const actorLevel = Math.max(...(actorRoles ?? []).map((r) => Number(r.level) || 0), 0);
  const targetLevel = Number(targetRole?.level) || 0;
  if (targetLevel >= actorLevel) {
    return new Response(JSON.stringify({ error: "forbidden", message: "Cannot grant a role at or above your level" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

const MANAGED_ROLE_NAMES = [
  "dash_admin", "dash_ops", "courier_admin", "courier_ops", "support_agent", "identity_admin",
] as const;
const PLATFORM_GRANT_ROLES = [
  "platform_owner", "platform_support", "platform_analyst", "identity_admin", "superadmin",
] as const;
const LISTABLE_CONSOLE_ROLES = [
  "platform_owner", "platform_support", "platform_analyst", "identity_admin",
  "dash_admin", "dash_ops", "courier_admin", "courier_ops", "support_agent", "superadmin",
] as const;
const MANAGED_ROLE_SET = new Set<string>([...MANAGED_ROLE_NAMES, ...PLATFORM_GRANT_ROLES]);

export function mountDashTeamRoutes(admin: Hono) {
  admin.get("/team", async (c) => {
    const pdb = getPlatformDb();
    const { data: roles } = await pdb.from("roles").select("id, name, level").in("name", [...LISTABLE_CONSOLE_ROLES]);
    const roleIds = (roles ?? []).map((r) => r.id as string);
    if (!roleIds.length) return c.json({ members: [] });

    const { data: userRoles, error } = await pdb.from("user_roles")
      .select("user_id, role_id, scope_type, scope_id, expires_at, roles(name, level)")
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
      return {
        userId,
        email,
        role: roleName,
        scope_type: (ur as { scope_type?: string }).scope_type,
        scope_id: (ur as { scope_id?: string }).scope_id,
        expires_at: (ur as { expires_at?: string }).expires_at,
      };
    }));

    return c.json({ members });
  });

  admin.get("/team/invites", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!adminUser.permissions.includes("invites.manage") && !adminUser.permissions.includes("system.config")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const pdb = getPlatformDb();
    const { data, error } = await pdb.from("pending_invites")
      .select("id, email, role_id, scope_type, scope_id, expires_at, created_at, roles(name)")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ invites: data ?? [] });
  });

  admin.delete("/team/invites/:inviteId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!adminUser.permissions.includes("invites.manage") && !adminUser.permissions.includes("system.config")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const inviteId = c.req.param("inviteId");
    const pdb = getPlatformDb();
    const { error } = await pdb.from("pending_invites").update({
      revoked_at: new Date().toISOString(),
      revoked_by: adminUser.id,
    }).eq("id", inviteId);
    if (error) return c.json({ error: error.message }, 500);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      action: "team.invite.revoked",
      permissionKey: "invites.manage",
      resourceType: "pending_invite",
      resourceId: inviteId,
    });
    return c.json({ ok: true });
  });

  admin.post("/team/invite", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const roleName = String(body.role || "");
    const scopeType = String(body.scope_type || "global");
    const scopeId = body.scope_id ? String(body.scope_id) : null;
    const expiresAt = body.expires_at ? String(body.expires_at) : null;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "A valid email is required" }, 400);
    }
    if (!MANAGED_ROLE_SET.has(roleName)) {
      return c.json({ error: `role must be one of managed console roles` }, 400);
    }
    const grantDenied = await assertCanGrantRole(adminUser, roleName);
    if (grantDenied) return grantDenied;

    const pdb = getPlatformDb();
    const { data: role } = await pdb.from("roles").select("id, level").eq("name", roleName).single();
    if (!role) return c.json({ error: "Role not found" }, 404);
    if (Number(role.level) < 800 && !expiresAt && roleName.includes("contractor")) {
      return c.json({ error: "expires_at required for contractor grants" }, 400);
    }

    const auth = getAuthAdmin();
    let userId = "";
    const { data: invited, error: inviteErr } = await auth.auth.admin.inviteUserByEmail(email);
    if (invited?.user?.id) {
      userId = invited.user.id;
    } else {
      await pdb.from("pending_invites").insert({
        email,
        role_id: role.id,
        invited_by: adminUser.id,
        scope_type: scopeType,
        scope_id: scopeId,
      });
      return c.json({
        ok: true,
        pending: true,
        email,
        role: roleName,
        message: inviteErr?.message || "Invite queued for delivery",
      }, 202);
    }

    const grantRow: Record<string, unknown> = {
      user_id: userId,
      role_id: role.id,
      granted_by: adminUser.id,
      scope_type: scopeType,
      scope_id: scopeId,
    };
    if (expiresAt) grantRow.expires_at = expiresAt;

    const { error: grantErr } = await pdb.from("user_roles").upsert(grantRow, { onConflict: "user_id,role_id" });
    if (grantErr) return c.json({ error: grantErr.message }, 500);

    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "team.member_invited",
      permissionKey: "roles.grant",
      metadata: { email, role: roleName, scope_type: scopeType },
    });

    return c.json({ ok: true, userId, email, role: roleName }, 201);
  });

  admin.patch("/team/:userId/role", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const roleName = String(body.role || "");
    const scopeType = String(body.scope_type || "global");
    const scopeId = body.scope_id ? String(body.scope_id) : null;
    const expiresAt = body.expires_at ? String(body.expires_at) : null;
    if (!MANAGED_ROLE_SET.has(roleName)) {
      return c.json({ error: "invalid role" }, 400);
    }
    const userId = c.req.param("userId");
    if (userId === adminUser.id) {
      return c.json({ error: "cannot_modify_own_roles" }, 400);
    }
    const grantDenied = await assertCanGrantRole(adminUser, roleName);
    if (grantDenied) return grantDenied;
    const pdb = getPlatformDb();
    const { data: role } = await pdb.from("roles").select("id").eq("name", roleName).single();
    if (!role) return c.json({ error: "Role not found" }, 404);

    const { data: managedRoles } = await pdb.from("roles").select("id").in("name", [...MANAGED_ROLE_NAMES]);
    const managedRoleIds = (managedRoles ?? []).map((r) => r.id);
    await pdb.from("user_roles").delete().eq("user_id", userId).in("role_id", managedRoleIds);

    const grantRow: Record<string, unknown> = {
      user_id: userId,
      role_id: role.id,
      granted_by: adminUser.id,
      scope_type: scopeType,
      scope_id: scopeId,
    };
    if (expiresAt) grantRow.expires_at = expiresAt;

    const { error } = await pdb.from("user_roles").insert(grantRow);
    if (error) return c.json({ error: error.message }, 500);

    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "team.role_changed",
      permissionKey: "roles.grant",
      metadata: { role: roleName },
    });
    return c.json({ ok: true, userId, role: roleName });
  });

  admin.delete("/team/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    if (userId === adminUser.id) {
      return c.json({ error: "cannot_modify_own_roles" }, 400);
    }
    const pdb = getPlatformDb();
    const { count: ownerCount } = await pdb.from("user_roles")
      .select("id", { count: "exact", head: true })
      .in("role_id", (await pdb.from("roles").select("id").eq("name", "platform_owner")).data?.map((r) => r.id) ?? []);
    const { data: targetOwners } = await pdb.from("user_roles")
      .select("role_id")
      .eq("user_id", userId)
      .in("role_id", (await pdb.from("roles").select("id").eq("name", "platform_owner")).data?.map((r) => r.id) ?? []);
    if ((targetOwners?.length ?? 0) > 0 && (ownerCount ?? 0) <= 1) {
      return c.json({ error: "cannot_remove_last_platform_owner" }, 400);
    }

    const { data: managedRoles } = await pdb.from("roles").select("id").in("name", [...MANAGED_ROLE_NAMES, ...PLATFORM_GRANT_ROLES]);
    const roleIds = (managedRoles ?? []).map((r) => r.id as string);
    const { error } = await pdb.from("user_roles").delete().eq("user_id", userId).in("role_id", roleIds);
    if (error) return c.json({ error: error.message }, 500);

    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "team.member_removed",
      permissionKey: "roles.grant",
    });
    return c.json({ ok: true });
  });
}
