/**
 * Unified person directory — read-only Phase 1.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { fetchUserRoleNames } from "../../_shared/rbacQuery.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { buildCourierSuspendCrossPersonaWarning } from "./courierAdminActions.ts";
import { writeAdminAudit } from "./adminAuditWriter.ts";
import { getAuthAdmin, getDb } from "./merchantAdminShared.ts";

function platformDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "platform" } },
  );
}

import { normalizeJmPhone } from "./identityPhone.ts";

type PersonaRow = {
  persona: string;
  ref_id: string;
  status: string;
  market_id: string | null;
};

export function registerIdentityAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/", async (c) => {
    const q = c.req.query("q")?.trim().toLowerCase();
    const persona = c.req.query("persona")?.trim();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;

    const pdb = platformDb();
    let query = pdb.from("identities").select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (q) {
      const phoneNorm = normalizeJmPhone(q);
      query = query.or(
        `primary_email.ilike.%${q}%,primary_phone.ilike.%${q}%,display_name.ilike.%${q}%,primary_phone.ilike.%${phoneNorm.replace('+', '')}%`,
      );
      const delivery = getDb();
      const { data: orderMatch } = await delivery.from("orders")
        .select("customer_id, customers(user_id)")
        .eq("order_number", q.toUpperCase())
        .maybeSingle();
      const orderUserId = (orderMatch as { customers?: { user_id?: string } } | null)?.customers?.user_id;
      if (orderUserId) {
        query = pdb.from("identities").select("*", { count: "exact" }).eq("user_id", orderUserId);
      }
    }

    const { data: identities, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);

    const userIds = (identities ?? []).map((i) => String((i as { user_id: string }).user_id));
    const { data: personas } = userIds.length > 0
      ? await pdb.from("identity_personas").select("*").in("user_id", userIds)
      : { data: [] as PersonaRow[] };

    const personasByUser = new Map<string, PersonaRow[]>();
    for (const p of personas ?? []) {
      const uid = String((p as PersonaRow & { user_id: string }).user_id);
      const list = personasByUser.get(uid) ?? [];
      list.push(p as PersonaRow & { user_id: string });
      personasByUser.set(uid, list);
    }

    let rows = (identities ?? []).map((row) => {
      const userId = String((row as { user_id: string }).user_id);
      const ps = personasByUser.get(userId) ?? [];
      return { ...row, personas: ps.map(({ persona, ref_id, status, market_id }) =>
        ({ persona, ref_id, status, market_id })) };
    });

    if (persona) {
      rows = rows.filter((r) =>
        (r.personas as PersonaRow[]).some((p) => p.persona === persona));
    }

    return c.json({ identities: rows, total: count ?? rows.length, page, limit });
  });

  admin.get("/audit/events", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!adminUser.permissions.includes("audit.read") && !adminUser.permissions.includes("system.config")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const pdb = platformDb();
    const { data, error, count } = await pdb.from("permission_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ events: data ?? [], total: count ?? 0, page, limit });
  });

  admin.get("/:userId", async (c) => {
    const userId = c.req.param("userId");
    const pdb = platformDb();
    const delivery = getDb();

    const { data: identity, error } = await pdb.from("identities").select("*")
      .eq("user_id", userId).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);

    const { data: personas } = await pdb.from("identity_personas").select("*")
      .eq("user_id", userId);

    let authEmail = "";
    try {
      const { data: u } = await getAuthAdmin().auth.admin.getUserById(userId);
      authEmail = u?.user?.email || "";
    } catch { /* ignore */ }

    const { data: customer } = await delivery.from("customers").select("*")
      .eq("user_id", userId).maybeSingle();
    const { data: courier } = await delivery.from("courier_profiles").select("*")
      .eq("user_id", userId).maybeSingle();
    const { data: ownedMerchants } = await delivery.from("merchants").select("id, name, operational_status, market_id")
      .eq("owner_id", userId);
    const { data: staffMemberships } = await delivery.from("merchant_team_members")
      .select("id, merchant_id, role, is_owner, merchants(name)")
      .eq("user_id", userId);

    const consoleRoles = await fetchUserRoleNames(userId);

    return c.json({
      identity: identity ?? {
        user_id: userId,
        primary_email: authEmail,
        global_status: "active",
        personas: personas ?? [],
      },
      authEmail,
      personas: personas ?? [],
      customer,
      courier,
      ownedMerchants: ownedMerchants ?? [],
      staffMemberships: staffMemberships ?? [],
      consoleRoles,
    });
  });

  function hasPermission(admin: ProductAdminUser, key: string): boolean {
    return admin.permissions.includes(key) || admin.permissions.includes("system.config");
  }

  admin.post("/:userId/sessions/revoke-all", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "sessions.revoke")) {
      return c.json({ error: "forbidden", message: "Permission required: sessions.revoke" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    await getAuthAdmin().auth.admin.signOut(userId, "global");
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.sessions.revoke_all",
      permissionKey: "sessions.revoke",
      reason,
    });
    return c.json({ ok: true });
  });

  admin.post("/:userId/ban", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.ban") && !hasPermission(adminUser, "users.ban")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const pdb = platformDb();
    await pdb.from("identities").upsert({
      user_id: userId,
      global_status: "banned",
      status_reason: reason,
      status_changed_at: new Date().toISOString(),
      status_changed_by: adminUser.id,
    }, { onConflict: "user_id" });
    await getAuthAdmin().auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.ban",
      permissionKey: "identity.status.ban",
      reason,
    });
    return c.json({ ok: true, global_status: "banned" });
  });

  admin.delete("/merchant-staff/:memberId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "merchant.staff.revoke")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const memberId = c.req.param("memberId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const db = getDb();
    const { data: member } = await db.from("merchant_team_members").select("id, user_id, merchant_id")
      .eq("id", memberId).maybeSingle();
    if (!member) return c.json({ error: "not_found" }, 404);
    await db.from("merchant_team_members").delete().eq("id", memberId);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: String(member.user_id),
      action: "merchant.staff.revoke",
      permissionKey: "merchant.staff.revoke",
      reason,
      resourceType: "merchant_team_member",
      resourceId: memberId,
    });
    return c.json({ ok: true });
  });

  app.route("/admin/identities", admin);
}
