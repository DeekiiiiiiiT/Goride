/**
 * Unified person directory and identity lifecycle actions.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { fetchUserRoleNames } from "../../_shared/rbacQuery.ts";
import { writeAdminAudit } from "./adminAuditWriter.ts";
import { getAuthAdmin, getDb } from "./merchantAdminShared.ts";
import {
  applyIdentityBan,
  applyIdentityUnban,
  applyIdentityGlobalRestrict,
  clearIdentityGlobalRestrict,
} from "./identityState.ts";
import { normalizeJmPhone } from "./identityPhone.ts";

function platformDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "platform" } },
  );
}

type PersonaRow = {
  persona: string;
  ref_id: string;
  status: string;
  market_id: string | null;
};

function hasPermission(admin: ProductAdminUser, key: string): boolean {
  return admin.permissions.includes(key) || admin.permissions.includes("system.config");
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

function sanitizeSearchToken(raw: string): string {
  return raw.replace(/[%_,().]/g, "").trim();
}

function maskIdentityRow(
  row: Record<string, unknown>,
  canViewPii: boolean,
): Record<string, unknown> {
  if (canViewPii) return row;
  return {
    ...row,
    primary_email: maskEmail(row.primary_email as string),
    primary_phone: maskPhone(row.primary_phone as string),
  };
}

async function applyPersonaRestrict(
  persona: string,
  userId: string,
  action: "restrict" | "unrestrict",
  reason: string,
): Promise<Response | null> {
  const db = getDb();
  if (persona === "customer") {
    const { data: customer } = await db.from("customers").select("id").eq("user_id", userId).maybeSingle();
    if (!customer) return new Response(JSON.stringify({ error: "persona_not_found" }), { status: 404 });
    const patch = action === "restrict"
      ? { account_status: "suspended", suspended_reason: reason }
      : { account_status: "active", suspended_reason: null, suspended_at: null, suspended_by: null };
    const { error } = await db.from("customers").update(patch).eq("user_id", userId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return null;
  }
  if (persona === "courier") {
    const { data: courier } = await db.from("courier_profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (!courier) return new Response(JSON.stringify({ error: "persona_not_found" }), { status: 404 });
    const patch = action === "restrict"
      ? { status: "suspended", suspended_reason: reason }
      : { status: "active", suspended_reason: null, suspended_at: null, suspended_by: null };
    const { error } = await db.from("courier_profiles").update(patch).eq("user_id", userId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (action === "restrict") {
      await db.from("courier_availability").update({ is_online: false }).eq("driver_id", userId);
      await getAuthAdmin().auth.admin.signOut(userId, "global");
    }
    return null;
  }
  return new Response(JSON.stringify({ error: "unsupported_persona" }), { status: 400 });
}

export function registerIdentityAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const qRaw = c.req.query("q")?.trim();
    const persona = c.req.query("persona")?.trim();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const sort = c.req.query("sort")?.trim() || "updated_at";
    const order = c.req.query("order") === "asc" ? "asc" : "desc";
    const offset = (page - 1) * limit;
    const canViewPii = hasPermission(adminUser, "identity.pii.read");

    const pdb = platformDb();
    let query = pdb.from("identities").select("*", { count: "exact" })
      .order(sort === "display_name" ? "display_name" : "updated_at", { ascending: order === "asc" });

    if (qRaw) {
      const q = sanitizeSearchToken(qRaw.toLowerCase());
      if (q) {
        const phoneNorm = normalizeJmPhone(q);
        const phoneDigits = phoneNorm.replace(/\D/g, "");
        const filters = [
          `primary_email.ilike.%${q}%`,
          `display_name.ilike.%${q}%`,
        ];
        if (phoneDigits.length >= 4) {
          filters.push(`primary_phone.ilike.%${phoneDigits}%`);
        }
        query = query.or(filters.join(","));
      }
      const delivery = getDb();
      const { data: orderMatch } = await delivery.from("orders")
        .select("customer_id, customers(user_id)")
        .eq("order_number", qRaw.toUpperCase())
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
      const masked = maskIdentityRow(row as Record<string, unknown>, canViewPii);
      return {
        ...masked,
        personas: ps.map(({ persona, ref_id, status, market_id }) =>
          ({ persona, ref_id, status, market_id })),
      };
    });

    if (persona) {
      rows = rows.filter((r) =>
        (r.personas as PersonaRow[]).some((p) => p.persona === persona));
    }

    return c.json({ identities: rows, total: count ?? rows.length, page, limit });
  });

  admin.get("/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const userId = c.req.param("userId");
    const canViewPii = hasPermission(adminUser, "identity.pii.read");
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

    const identityRow = identity ?? {
      user_id: userId,
      primary_email: authEmail,
      global_status: "active",
    };

    return c.json({
      identity: maskIdentityRow(identityRow as Record<string, unknown>, canViewPii),
      authEmail: canViewPii ? authEmail : maskEmail(authEmail),
      personas: personas ?? [],
      customer,
      courier,
      ownedMerchants: ownedMerchants ?? [],
      staffMemberships: staffMemberships ?? [],
      consoleRoles,
      permissions: {
        can_ban: hasPermission(adminUser, "identity.status.ban") || hasPermission(adminUser, "users.ban"),
        can_unban: hasPermission(adminUser, "identity.status.ban") || hasPermission(adminUser, "users.ban"),
        can_revoke_sessions: hasPermission(adminUser, "sessions.revoke"),
        can_restrict: hasPermission(adminUser, "identity.status.restrict"),
        can_revoke_staff: hasPermission(adminUser, "merchant.staff.revoke"),
        can_view_pii: canViewPii,
        can_export: hasPermission(adminUser, "identity.export"),
        can_delete: hasPermission(adminUser, "identity.delete"),
      },
    });
  });

  admin.get("/:userId/sessions", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "sessions.read")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    // Supabase does not expose per-session listing via admin API; return auth metadata snapshot.
    const { data: u, error } = await getAuthAdmin().auth.admin.getUserById(userId);
    if (error || !u?.user) return c.json({ error: "not_found" }, 404);
    const user = u.user;
    return c.json({
      sessions: [{
        id: "current",
        device: "auth.users",
        last_seen: user.last_sign_in_at ?? user.updated_at,
        created_at: user.created_at,
      }],
      note: "Per-device session listing requires Supabase session management API",
    });
  });

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
    await applyIdentityBan(userId, reason, adminUser.id);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.ban",
      permissionKey: "identity.status.ban",
      reason,
    });
    return c.json({ ok: true, global_status: "banned" });
  });

  admin.post("/:userId/unban", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.ban") && !hasPermission(adminUser, "users.ban")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    await applyIdentityUnban(userId, reason, adminUser.id);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.unban",
      permissionKey: "identity.status.ban",
      reason,
    });
    return c.json({ ok: true, global_status: "active" });
  });

  admin.post("/:userId/restrict", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.restrict")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    const status = body.status === "suspended" ? "suspended" : "restricted";
    if (!reason) return c.json({ error: "reason_required" }, 400);
    await applyIdentityGlobalRestrict(userId, status, reason, adminUser.id);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.restrict",
      permissionKey: "identity.status.restrict",
      reason,
      metadata: { global_status: status },
    });
    return c.json({ ok: true, global_status: status });
  });

  admin.post("/:userId/unrestrict", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.restrict")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    await clearIdentityGlobalRestrict(userId, reason, adminUser.id);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.unrestrict",
      permissionKey: "identity.status.restrict",
      reason,
    });
    return c.json({ ok: true, global_status: "active" });
  });

  admin.post("/:userId/personas/:persona/restrict", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.restrict")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const persona = c.req.param("persona");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const err = await applyPersonaRestrict(persona, userId, "restrict", reason);
    if (err) return err;
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.persona.restrict",
      permissionKey: "identity.status.restrict",
      reason,
      metadata: { persona },
    });
    return c.json({ ok: true, persona, status: "restricted" });
  });

  admin.post("/:userId/personas/:persona/unrestrict", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.status.restrict")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const persona = c.req.param("persona");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const err = await applyPersonaRestrict(persona, userId, "unrestrict", reason);
    if (err) return err;
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.persona.unrestrict",
      permissionKey: "identity.status.restrict",
      reason,
      metadata: { persona },
    });
    return c.json({ ok: true, persona, status: "active" });
  });

  admin.post("/:userId/export", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.export")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const pdb = platformDb();
    const delivery = getDb();
    const { data: identity } = await pdb.from("identities").select("*").eq("user_id", userId).maybeSingle();
    const { data: personas } = await pdb.from("identity_personas").select("*").eq("user_id", userId);
    const { data: customer } = await delivery.from("customers").select("id").eq("user_id", userId).maybeSingle();
    const { data: orders } = customer?.id
      ? await delivery.from("orders").select("id, order_number, status, total, placed_at")
        .eq("customer_id", customer.id).limit(500)
      : { data: [] };
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.export",
      permissionKey: "identity.export",
      reason,
    });
    return c.json({
      exported_at: new Date().toISOString(),
      user_id: userId,
      identity,
      personas,
      orders: orders ?? [],
    });
  });

  admin.post("/:userId/merge", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "identity.merge")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const sourceUserId = String(body.source_user_id ?? "").trim();
    const targetUserId = c.req.param("userId");
    const reason = String(body.reason ?? "").trim();
    if (!sourceUserId || !reason) return c.json({ error: "source_user_id and reason required" }, 400);
    if (sourceUserId === targetUserId) return c.json({ error: "cannot_merge_self" }, 400);
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: targetUserId,
      action: "identity.merge.requested",
      permissionKey: "identity.merge",
      reason,
      metadata: { source_user_id: sourceUserId },
    });
    return c.json({
      ok: true,
      status: "pending_manual_review",
      message: "Merge recorded for manual data reconciliation",
      source_user_id: sourceUserId,
      target_user_id: targetUserId,
    });
  });

  admin.post("/:userId/impersonate", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "system.config")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = String(body.reason ?? "").trim();
    const durationMinutes = Math.min(Number(body.duration_minutes) || 15, 60);
    if (!reason) return c.json({ error: "reason_required" }, 400);
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    await writeAdminAudit({
      actorUserId: adminUser.id,
      targetUserId: userId,
      action: "identity.impersonate.start",
      permissionKey: "system.config",
      reason,
      metadata: { expires_at: expiresAt, duration_minutes: durationMinutes },
    });
    return c.json({
      ok: true,
      impersonation: {
        target_user_id: userId,
        expires_at: expiresAt,
        banner: 'Support view-as session — actions are audited',
      },
    });
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

  const staffList = new Hono();
  staffList.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });
  staffList.get("/", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    if (!hasPermission(adminUser, "merchant.staff.read") && !hasPermission(adminUser, "system.config")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const db = getDb();
    const pdb = platformDb();
    const { data: members, error } = await db.from("merchant_team_members")
      .select("id, user_id, merchant_id, role, name, email, merchants(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return c.json({ error: error.message }, 500);
    const userIds = [...new Set(
      (members ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((id): id is string => Boolean(id)),
    )];
    const { data: identities } = userIds.length > 0
      ? await pdb.from("identities").select("user_id, display_name, primary_email").in("user_id", userIds)
      : { data: [] };
    const byUser = new Map((identities ?? []).map((i) => [String((i as { user_id: string }).user_id), i]));
    const staff = (members ?? []).map((m) => ({
      ...m,
      identities: byUser.get(String((m as { user_id: string }).user_id)) ?? null,
    }));
    return c.json({ staff });
  });
  app.route("/admin/merchant-staff", staffList);
}
