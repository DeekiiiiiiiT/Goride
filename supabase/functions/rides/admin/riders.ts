/**
 * Rides admin — rider user management (directory, detail, support actions).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isPlatformRole,
  requireProductAdmin,
  type ProductAdminUser,
} from "../../_shared/productAdmin.ts";
import { getJwtRoles, jwtPrimaryRole } from "../../_shared/authEdge.ts";
import { getRiderAdminDb, type RidesAdminTables } from "../../_shared/ridesAdminDb.ts";

type RiderAdminDb = Awaited<ReturnType<typeof getRiderAdminDb>>;

async function riderDbOrResponse(
  c: { json: (body: unknown, status?: number) => Response },
): Promise<RiderAdminDb | Response> {
  try {
    return await getRiderAdminDb();
  } catch (e) {
    const message = e instanceof Error
      ? e.message
      : "Rider admin database is not available";
    return c.json({ error: "rider_admin_db_unavailable", message }, 503);
  }
}

const RIDER_WRITE_ROLES = new Set([
  "rides_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

const BAN_ROLES = new Set(["platform_owner", "superadmin"]);

type AccountStatus = "active" | "suspended" | "banned";

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function requireWrite(admin: ProductAdminUser): Response | null {
  if (!RIDER_WRITE_ROLES.has(admin.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "rides_admin or platform role required" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

function requireBan(admin: ProductAdminUser): Response | null {
  if (!BAN_ROLES.has(admin.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "platform_owner or superadmin required" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

async function riderAudit(
  db: SupabaseClient,
  tables: RidesAdminTables,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await db.from(tables.audit_events).insert({
    ride_request_id: null,
    actor_user_id: actorId,
    event_type: eventType,
    payload,
  });
}

function isPassengerUser(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): boolean {
  if (getJwtRoles(user).includes("passenger")) return true;
  const surface = user.user_metadata?.surface;
  if (surface === "passenger") return true;
  return jwtPrimaryRole(user) === "passenger";
}

async function ensureProfile(
  db: SupabaseClient,
  tables: RidesAdminTables,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data: existing } = await db.from(tables.rider_profiles)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing as Record<string, unknown>;

  const { data: created, error } = await db.from(tables.rider_profiles)
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return created as Record<string, unknown>;
}

type DirectoryRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  account_status: AccountStatus;
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  last_ride_at: string | null;
  lifetime_spend_minor: number;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

async function enrichAuth(row: DirectoryRow): Promise<DirectoryRow> {
  const auth = serviceAuth();
  const { data, error } = await auth.auth.admin.getUserById(row.user_id);
  if (error || !data.user) return row;
  return {
    ...row,
    email: data.user.email ?? null,
    created_at: data.user.created_at ?? null,
    last_sign_in_at: data.user.last_sign_in_at ?? null,
  };
}

async function buildDirectory(
  db: SupabaseClient,
  tables: RidesAdminTables,
  opts: { status?: string; q?: string; sort?: string; page: number; limit: number },
): Promise<{ riders: DirectoryRow[]; total: number }> {
  const auth = serviceAuth();
  const q = (opts.q ?? "").trim().toLowerCase();
  const statusFilter = opts.status?.trim();

  const { data: statsRows } = await db.from(tables.rider_directory_stats).select("*");
  const { data: profileRows } = await db.from(tables.rider_profiles).select("*");

  const byId = new Map<string, DirectoryRow>();

  for (const s of statsRows ?? []) {
    const uid = s.rider_user_id as string;
    byId.set(uid, {
      user_id: uid,
      display_name: null,
      phone: null,
      account_status: "active",
      total_trips: Number(s.total_trips ?? 0),
      completed_trips: Number(s.completed_trips ?? 0),
      cancelled_trips: Number(s.cancelled_trips ?? 0),
      last_ride_at: s.last_ride_at as string | null,
      lifetime_spend_minor: Number(s.lifetime_spend_minor ?? 0),
      email: null,
      created_at: null,
      last_sign_in_at: null,
    });
  }

  for (const p of profileRows ?? []) {
    const uid = p.user_id as string;
    const base = byId.get(uid) ?? {
      user_id: uid,
      display_name: null,
      phone: null,
      account_status: "active" as AccountStatus,
      total_trips: 0,
      completed_trips: 0,
      cancelled_trips: 0,
      last_ride_at: null,
      lifetime_spend_minor: 0,
      email: null,
      created_at: null,
      last_sign_in_at: null,
    };
    byId.set(uid, {
      ...base,
      display_name: (p.display_name as string | null) ?? base.display_name,
      phone: (p.phone as string | null) ?? base.phone,
      account_status: (p.account_status as AccountStatus) ?? base.account_status,
    });
  }

  // Include passengers from auth who may not have trips yet
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: list, error } = await auth.auth.admin.listUsers({ page, perPage });
    if (error || !list?.users?.length) break;
    for (const u of list.users) {
      if (!isPassengerUser(u)) continue;
      if (!byId.has(u.id)) {
        byId.set(u.id, {
          user_id: u.id,
          display_name: null,
          phone: (u.phone as string | null) ?? null,
          account_status: "active",
          total_trips: 0,
          completed_trips: 0,
          cancelled_trips: 0,
          last_ride_at: null,
          lifetime_spend_minor: 0,
          email: u.email ?? null,
          created_at: u.created_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    }
    if (list.users.length < perPage) break;
    page++;
    if (page > 25) break;
  }

  let rows = Array.from(byId.values());

  if (statusFilter && statusFilter !== "all") {
    rows = rows.filter((r) => r.account_status === statusFilter);
  }

  if (q) {
    const uuidLike = /^[0-9a-f-]{8,}$/i.test(q);
    if (uuidLike) {
      rows = rows.filter((r) => r.user_id.toLowerCase().startsWith(q));
    } else {
      rows = rows.filter((r) => {
        const hay = [
          r.email,
          r.display_name,
          r.phone,
          r.user_id,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
  }

  const sort = opts.sort ?? "last_ride";
  rows.sort((a, b) => {
    if (sort === "trips") return b.total_trips - a.total_trips || a.user_id.localeCompare(b.user_id);
    if (sort === "signup") {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta || a.user_id.localeCompare(b.user_id);
    }
    const ta = a.last_ride_at ? new Date(a.last_ride_at).getTime() : 0;
    const tb = b.last_ride_at ? new Date(b.last_ride_at).getTime() : 0;
    return tb - ta || a.user_id.localeCompare(b.user_id);
  });

  const total = rows.length;
  const offset = (opts.page - 1) * opts.limit;
  const pageRows = rows.slice(offset, offset + opts.limit);

  const enriched = await Promise.all(
    pageRows.map(async (r) => {
      if (r.email) return r;
      return enrichAuth(r);
    }),
  );

  return { riders: enriched, total };
}

export function registerRiderAdminRoutes(admin: Hono) {
  admin.get("/riders", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const q = c.req.query("q") ?? undefined;
    const status = c.req.query("status") ?? undefined;
    const sort = c.req.query("sort") ?? undefined;

    try {
      const { riders, total } = await buildDirectory(resolved.db, resolved.tables, {
        page,
        limit,
        q,
        status,
        sort,
      });
      return c.json({ riders, total, page, limit });
    } catch (e) {
      return c.json({
        error: "list_failed",
        message: e instanceof Error ? e.message : String(e),
      }, 500);
    }
  });

  admin.get("/riders/:userId", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const auth = serviceAuth();
    const { data: authData, error: authErr } = await auth.auth.admin.getUserById(userId);
    if (authErr || !authData.user) return c.json({ error: "not_found" }, 404);
    if (!isPassengerUser(authData.user) && !(await db.from(tables.rider_directory_stats).select("rider_user_id").eq("rider_user_id", userId).maybeSingle()).data) {
      return c.json({ error: "not_a_rider" }, 404);
    }

    const profile = await ensureProfile(db, tables, userId);
    const { data: stats } = await db.from(tables.rider_directory_stats).select("*").eq(
      "rider_user_id",
      userId,
    ).maybeSingle();

    const { data: notes } = await db.from(tables.rider_admin_notes)
      .select("id, body, author_user_id, created_at")
      .eq("rider_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: auditRows } = await db.from(tables.audit_events)
      .select("id, event_type, payload, actor_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    const activity = (auditRows ?? []).filter((e) => {
      const p = e.payload as Record<string, unknown> | null;
      const et = String(e.event_type ?? "");
      return p?.rider_user_id === userId || et.startsWith("admin_rider_");
    }).slice(0, 20);

    return c.json({
      rider: {
        user_id: userId,
        email: authData.user.email,
        phone: authData.user.phone ?? profile.phone,
        display_name: profile.display_name,
        account_status: profile.account_status ?? "active",
        suspended_at: profile.suspended_at,
        suspended_reason: profile.suspended_reason,
        suspended_by: profile.suspended_by,
        created_at: authData.user.created_at,
        last_sign_in_at: authData.user.last_sign_in_at,
        stats: stats ?? {
          total_trips: 0,
          completed_trips: 0,
          cancelled_trips: 0,
          last_ride_at: null,
          lifetime_spend_minor: 0,
        },
        recent_notes: notes ?? [],
        recent_activity: activity ?? [],
      },
      permissions: {
        can_write: RIDER_WRITE_ROLES.has(adminUser.role),
        can_ban: BAN_ROLES.has(adminUser.role),
        can_see_reset_link: isPlatformRole(adminUser.role),
      },
    });
  });

  admin.get("/riders/:userId/trips", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
    const offset = (page - 1) * limit;

    const { data, error, count } = await resolved.db.from(resolved.tables.ride_requests)
      .select("*", { count: "exact" })
      .eq("rider_user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    return c.json({ trips: data ?? [], total: count ?? 0, page, limit });
  });

  admin.get("/riders/:userId/notes", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { data, error } = await resolved.db.from(resolved.tables.rider_admin_notes)
      .select("*")
      .eq("rider_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return c.json({ error: "list_failed" }, 500);
    return c.json({ notes: data ?? [] });
  });

  admin.post("/riders/:userId/notes", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { body?: string };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return c.json({ error: "body_required" }, 400);

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    await ensureProfile(db, tables, userId);

    const { data, error } = await db.from(tables.rider_admin_notes).insert({
      rider_user_id: userId,
      author_user_id: adminUser.id,
      body: text,
    }).select("*").single();

    if (error) return c.json({ error: "insert_failed" }, 500);

    await db.from(tables.rider_profiles).update({
      admin_notes: text.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    await riderAudit(db, tables, adminUser.id, "admin_rider_note", {
      rider_user_id: userId,
      note_id: data.id,
    });

    return c.json({ note: data });
  });

  admin.patch("/riders/:userId", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === "string") patch.display_name = body.display_name.trim() || null;
    if (typeof body.phone === "string") patch.phone = body.phone.trim() || null;

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    await ensureProfile(db, tables, userId);

    const { data, error } = await db.from(tables.rider_profiles).update(patch).eq("user_id", userId)
      .select("*").single();
    if (error) return c.json({ error: "update_failed" }, 500);

    await riderAudit(db, tables, adminUser.id, "admin_rider_profile_updated", {
      rider_user_id: userId,
      patch,
    });

    return c.json({ profile: data });
  });

  admin.post("/riders/:userId/suspend", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return c.json({ error: "reason_required" }, 400);

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    await ensureProfile(db, tables, userId);

    const now = new Date().toISOString();
    await db.from(tables.rider_profiles).update({
      account_status: "suspended",
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);

    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "8760h" });

    await riderAudit(db, tables, adminUser.id, "admin_rider_suspend", {
      rider_user_id: userId,
      reason,
    });

    return c.json({ ok: true, account_status: "suspended" });
  });

  admin.post("/riders/:userId/unsuspend", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    await db.from(tables.rider_profiles).update({
      account_status: "active",
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "none" });

    await riderAudit(db, tables, adminUser.id, "admin_rider_unsuspend", {
      rider_user_id: userId,
    });

    return c.json({ ok: true, account_status: "active" });
  });

  admin.post("/riders/:userId/ban", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireBan(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "Banned by admin";

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;
    const now = new Date().toISOString();

    await ensureProfile(db, tables, userId);
    await db.from(tables.rider_profiles).update({
      account_status: "banned",
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);

    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

    await riderAudit(db, tables, adminUser.id, "admin_rider_ban", {
      rider_user_id: userId,
      reason,
    });

    return c.json({ ok: true, account_status: "banned" });
  });

  admin.post("/riders/:userId/reset-password", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const auth = serviceAuth();
    const { data: userData, error } = await auth.auth.admin.getUserById(userId);
    if (error || !userData.user?.email) return c.json({ error: "not_found" }, 404);

    const { data: linkData, error: linkErr } = await auth.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
    });

    if (linkErr) return c.json({ error: "reset_failed", message: linkErr.message }, 500);

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    await riderAudit(resolved.db, resolved.tables, adminUser.id, "admin_rider_reset_password", {
      rider_user_id: userId,
    });

    const payload: Record<string, unknown> = {
      ok: true,
      message: "Password recovery initiated",
      email: userData.user.email,
    };
    if (isPlatformRole(adminUser.role) && linkData.properties?.action_link) {
      payload.recovery_link = linkData.properties.action_link;
    }

    return c.json(payload);
  });

  admin.post("/riders/:userId/sign-out", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const auth = serviceAuth();
    const { error } = await auth.auth.admin.signOut(userId, "global");
    if (error) return c.json({ error: "sign_out_failed", message: error.message }, 500);

    const resolved = await riderDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    await riderAudit(resolved.db, resolved.tables, adminUser.id, "admin_rider_sign_out", {
      rider_user_id: userId,
    });

    return c.json({ ok: true });
  });
}
