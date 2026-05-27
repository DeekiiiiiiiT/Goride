/**
 * Driver admin — user directory (Uber-style metrics + live status).
 * Includes lifecycle actions: suspend, unsuspend, deactivate, reactivate, sign-out, delete.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isPlatformRole,
  requireProductAdmin,
  type ProductAdminUser,
} from "../../_shared/productAdmin.ts";
import { getJwtRoles, jwtPrimaryRole } from "../../_shared/authEdge.ts";
import {
  getDriverAdminDb,
  type DriverAdminTables,
} from "../../_shared/driverAdminDb.ts";
import { getRiderAdminDb } from "../../_shared/ridesAdminDb.ts";
import { listDriverRideRequests } from "../../_shared/driverRideQueries.ts";
import {
  aggregateLedgerLinesForTrips,
  listPlatformLedgerLines,
} from "../../_shared/platformLedgerQueries.ts";

type DriverAdminDb = Awaited<ReturnType<typeof getDriverAdminDb>>;

// ---------------------------------------------------------------------------
// Permission Role Sets
// ---------------------------------------------------------------------------

/** Roles allowed to perform write actions (suspend, unsuspend, sign-out) */
const DRIVER_WRITE_ROLES = new Set([
  "driver_admin",
  "platform_owner",
  "platform_support",
  "superadmin",
]);

/** Roles allowed to delete driver profiles (destructive action) */
const DRIVER_DELETE_ROLES = new Set([
  "platform_owner",
  "superadmin",
]);

// ---------------------------------------------------------------------------
// Permission Helpers
// ---------------------------------------------------------------------------

function requireWrite(admin: ProductAdminUser): Response | null {
  if (!DRIVER_WRITE_ROLES.has(admin.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "driver_admin or platform role required for write actions" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

function requireDelete(admin: ProductAdminUser): Response | null {
  if (!DRIVER_DELETE_ROLES.has(admin.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "platform_owner or superadmin required for delete actions" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Audit Helper
// ---------------------------------------------------------------------------

async function driverAudit(
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    const ridesDb = await getRiderAdminDb();
    await ridesDb.db.from(ridesDb.tables.audit_events).insert({
      ride_request_id: null,
      actor_user_id: actorId,
      event_type: eventType,
      payload,
    });
  } catch (e) {
    console.error("[driverAudit] Failed to log audit event:", e);
  }
}

const ACTIVE_TRIP_STATUSES = [
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
] as const;

const ONLINE_STALE_MS = 5 * 60 * 1000;

type DriverAccountStatus = "active" | "pending" | "suspended" | "deactivated";
type DriverLiveStatus = "online" | "offline" | "on_trip";

type DirectoryRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  status: DriverAccountStatus;
  live_status: DriverLiveStatus;
  mode: string;
  fleet_id: string | null;
  onboarding_complete: boolean;
  background_check_status: string | null;
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  offers_sent: number;
  offers_accepted: number;
  offers_declined: number;
  acceptance_rate_pct: number | null;
  completion_rate_pct: number | null;
  lifetime_earnings_minor: number;
  last_ride_at: string | null;
  last_online_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

async function driverDbOrResponse(
  c: { json: (body: unknown, status?: number) => Response },
): Promise<DriverAdminDb | Response> {
  try {
    return await getDriverAdminDb();
  } catch (e) {
    const message = e instanceof Error
      ? e.message
      : "Driver admin database is not available";
    return c.json({ error: "driver_admin_db_unavailable", message }, 503);
  }
}

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isDriverUser(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  if (getJwtRoles(user).includes("driver")) return true;
  const surface = user.user_metadata?.surface;
  if (surface === "driver") return true;
  return jwtPrimaryRole(user) === "driver";
}

function computeLiveStatus(
  userId: string,
  location: { available_for_rides?: boolean; updated_at?: string } | undefined,
  onTripDriverIds: Set<string>,
): DriverLiveStatus {
  if (onTripDriverIds.has(userId)) return "on_trip";
  if (location?.available_for_rides && location.updated_at) {
    const age = Date.now() - new Date(location.updated_at).getTime();
    if (age <= ONLINE_STALE_MS) return "online";
  }
  return "offline";
}

async function fetchOnTripDriverIds(db: SupabaseClient, tables: DriverAdminTables): Promise<Set<string>> {
  const { data } = await db.from(tables.ride_requests)
    .select("assigned_driver_user_id")
    .in("status", [...ACTIVE_TRIP_STATUSES])
    .not("assigned_driver_user_id", "is", null);
  return new Set(
    (data ?? [])
      .map((r) => r.assigned_driver_user_id as string)
      .filter(Boolean),
  );
}

async function enrichAuth(row: DirectoryRow): Promise<DirectoryRow> {
  const auth = serviceAuth();
  const { data, error } = await auth.auth.admin.getUserById(row.user_id);
  if (error || !data.user) return row;
  return {
    ...row,
    email: data.user.email ?? row.email,
    created_at: data.user.created_at ?? row.created_at,
    last_sign_in_at: data.user.last_sign_in_at ?? row.last_sign_in_at,
  };
}

async function buildDirectory(
  resolved: DriverAdminDb,
  opts: {
    status?: string;
    live_status?: string;
    mode?: string;
    onboarding?: string;
    q?: string;
    sort?: string;
    page: number;
    limit: number;
  },
): Promise<{ drivers: DirectoryRow[]; total: number }> {
  const { db, tables } = resolved;
  const q = (opts.q ?? "").trim().toLowerCase();
  const statusFilter = opts.status?.trim();
  const liveFilter = opts.live_status?.trim();
  const modeFilter = opts.mode?.trim();
  const onboardingFilter = opts.onboarding?.trim();

  const [
    { data: profileRows },
    { data: statsRows },
    { data: locationRows },
    onTripIds,
  ] = await Promise.all([
    db.from(tables.driver_profiles).select("*"),
    db.from(tables.driver_directory_stats).select("*"),
    db.from(tables.driver_locations).select("user_id, available_for_rides, updated_at"),
    fetchOnTripDriverIds(db, tables),
  ]);

  const statsByUser = new Map(
    (statsRows ?? []).map((s) => [s.driver_user_id as string, s]),
  );
  const locByUser = new Map(
    (locationRows ?? []).map((l) => [l.user_id as string, l]),
  );

  const byId = new Map<string, DirectoryRow>();

  for (const p of profileRows ?? []) {
    const uid = p.user_id as string;
    const s = statsByUser.get(uid);
    const loc = locByUser.get(uid);
    const live_status = computeLiveStatus(uid, loc, onTripIds);

    byId.set(uid, {
      user_id: uid,
      display_name: (p.display_name as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
      email: null,
      status: (p.status as DriverAccountStatus) ?? "pending",
      live_status,
      mode: (p.mode as string) ?? "independent",
      fleet_id: (p.fleet_id as string | null) ?? null,
      onboarding_complete: Boolean(p.onboarding_complete),
      background_check_status: (p.background_check_status as string | null) ?? null,
      total_trips: Number(s?.total_trips ?? 0),
      completed_trips: Number(s?.completed_trips ?? 0),
      cancelled_trips: Number(s?.cancelled_trips ?? 0),
      offers_sent: Number(s?.offers_sent ?? 0),
      offers_accepted: Number(s?.offers_accepted ?? 0),
      offers_declined: Number(s?.offers_declined ?? 0),
      acceptance_rate_pct: s?.acceptance_rate_pct != null
        ? Number(s.acceptance_rate_pct)
        : null,
      completion_rate_pct: s?.completion_rate_pct != null
        ? Number(s.completion_rate_pct)
        : null,
      lifetime_earnings_minor: Number(s?.lifetime_earnings_minor ?? 0),
      last_ride_at: (s?.last_ride_at as string | null) ?? null,
      last_online_at: (s?.last_online_at as string | null) ?? (loc?.updated_at as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
      last_sign_in_at: null,
    });
  }

  const auth = serviceAuth();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: list, error } = await auth.auth.admin.listUsers({ page, perPage });
    if (error || !list?.users?.length) break;
    for (const u of list.users) {
      if (!isDriverUser(u)) continue;
      if (!byId.has(u.id)) {
        const loc = locByUser.get(u.id);
        byId.set(u.id, {
          user_id: u.id,
          display_name: null,
          phone: (u.phone as string | null) ?? null,
          email: u.email ?? null,
          status: "pending",
          live_status: computeLiveStatus(u.id, loc, onTripIds),
          mode: "independent",
          fleet_id: null,
          onboarding_complete: false,
          background_check_status: null,
          total_trips: 0,
          completed_trips: 0,
          cancelled_trips: 0,
          offers_sent: 0,
          offers_accepted: 0,
          offers_declined: 0,
          acceptance_rate_pct: null,
          completion_rate_pct: null,
          lifetime_earnings_minor: 0,
          last_ride_at: null,
          last_online_at: (loc?.updated_at as string | null) ?? null,
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
    rows = rows.filter((r) => r.status === statusFilter);
  }
  if (liveFilter && liveFilter !== "all") {
    rows = rows.filter((r) => r.live_status === liveFilter);
  }
  if (modeFilter && modeFilter !== "all") {
    rows = rows.filter((r) => r.mode === modeFilter);
  }
  if (onboardingFilter === "complete") {
    rows = rows.filter((r) => r.onboarding_complete);
  } else if (onboardingFilter === "incomplete") {
    rows = rows.filter((r) => !r.onboarding_complete);
  }

  if (q) {
    const uuidLike = /^[0-9a-f-]{8,}$/i.test(q);
    if (uuidLike) {
      rows = rows.filter((r) => r.user_id.toLowerCase().startsWith(q));
    } else {
      rows = rows.filter((r) => {
        const hay = [r.email, r.display_name, r.phone, r.user_id].filter(Boolean).join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
  }

  const sort = opts.sort ?? "last_ride";
  rows.sort((a, b) => {
    if (sort === "trips") return b.total_trips - a.total_trips || a.user_id.localeCompare(b.user_id);
    if (sort === "acceptance") {
      const aa = a.acceptance_rate_pct ?? -1;
      const ab = b.acceptance_rate_pct ?? -1;
      return ab - aa || a.user_id.localeCompare(b.user_id);
    }
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
    pageRows.map(async (r) => (r.email ? r : enrichAuth(r))),
  );

  return { drivers: enriched, total };
}

export function registerDriverUserAdminRoutes(admin: Hono) {
  admin.get("/drivers", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;

    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));

    try {
      const { drivers, total } = await buildDirectory(resolved, {
        page,
        limit,
        q: c.req.query("q") ?? undefined,
        status: c.req.query("status") ?? undefined,
        live_status: c.req.query("live_status") ?? undefined,
        mode: c.req.query("mode") ?? undefined,
        onboarding: c.req.query("onboarding") ?? undefined,
        sort: c.req.query("sort") ?? undefined,
      });
      return c.json({ drivers, total, page, limit });
    } catch (e) {
      return c.json({
        error: "list_failed",
        message: e instanceof Error ? e.message : String(e),
      }, 500);
    }
  });

  admin.get("/drivers/:userId", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const auth = serviceAuth();
    const { data: authData, error: authErr } = await auth.auth.admin.getUserById(userId);
    if (authErr || !authData.user) return c.json({ error: "not_found" }, 404);
    if (!isDriverUser(authData.user)) {
      const { data: profileCheck } = await db.from(tables.driver_profiles)
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!profileCheck) return c.json({ error: "not_a_driver" }, 404);
    }

    const { data: profile } = await db.from(tables.driver_profiles)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: stats } = await db.from(tables.driver_directory_stats)
      .select("*")
      .eq("driver_user_id", userId)
      .maybeSingle();

    const { data: location } = await db.from(tables.driver_locations)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const onTripIds = await fetchOnTripDriverIds(db, tables);
    const live_status = computeLiveStatus(userId, location ?? undefined, onTripIds);

    const { data: recentTrips } = await db.from(tables.ride_requests)
      .select("*")
      .eq("assigned_driver_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: recentOffers } = await db.from(tables.driver_offers)
      .select("*")
      .eq("driver_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: vehicles } = profile?.id
      ? await db.from("driver_vehicles")
        .select("id, make, model, year, license_plate, is_primary, status")
        .eq("driver_profile_id", profile.id as string)
        .limit(5)
      : { data: [] };

    return c.json({
      driver: {
        user_id: userId,
        email: authData.user.email,
        phone: (profile?.phone as string | null) ?? authData.user.phone ?? null,
        display_name: (profile?.display_name as string | null) ?? null,
        status: (profile?.status as DriverAccountStatus) ?? "pending",
        live_status,
        mode: (profile?.mode as string) ?? "independent",
        fleet_id: (profile?.fleet_id as string | null) ?? null,
        onboarding_complete: Boolean(profile?.onboarding_complete),
        onboarding_step: (profile?.onboarding_step as string | null) ?? null,
        background_check_status: (profile?.background_check_status as string | null) ?? null,
        background_check_date: (profile?.background_check_date as string | null) ?? null,
        insurance_expiry: (profile?.insurance_expiry as string | null) ?? null,
        created_at: authData.user.created_at,
        last_sign_in_at: authData.user.last_sign_in_at,
        location: location ?? null,
        // Suspend/deactivate metadata
        suspended_at: (profile?.suspended_at as string | null) ?? null,
        suspended_reason: (profile?.suspended_reason as string | null) ?? null,
        suspended_by: (profile?.suspended_by as string | null) ?? null,
        deactivated_at: (profile?.deactivated_at as string | null) ?? null,
        deactivated_reason: (profile?.deactivated_reason as string | null) ?? null,
        deactivated_by: (profile?.deactivated_by as string | null) ?? null,
        stats: stats ?? {
          total_trips: 0,
          completed_trips: 0,
          cancelled_trips: 0,
          offers_sent: 0,
          offers_accepted: 0,
          offers_declined: 0,
          acceptance_rate_pct: null,
          completion_rate_pct: null,
          lifetime_earnings_minor: 0,
          last_ride_at: null,
          last_online_at: null,
        },
        recent_trips: recentTrips ?? [],
        recent_offers: recentOffers ?? [],
        vehicles: vehicles ?? [],
      },
      permissions: {
        can_write: DRIVER_WRITE_ROLES.has(adminUser.role),
        can_delete: DRIVER_DELETE_ROLES.has(adminUser.role),
        can_see_reset_link: isPlatformRole(adminUser.role),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Suspend
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/suspend", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return c.json({ error: "reason_required", message: "Suspension reason is required" }, 400);

    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    // Verify driver profile exists
    const { data: profile } = await db.from(tables.driver_profiles)
      .select("user_id, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return c.json({ error: "not_found", message: "Driver profile not found" }, 404);

    const now = new Date().toISOString();
    const { error: updateErr } = await db.from(tables.driver_profiles).update({
      status: "suspended",
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);

    if (updateErr) {
      return c.json({ error: "update_failed", message: updateErr.message }, 500);
    }

    // Apply auth-level ban (1 year = 8760 hours)
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "8760h" });

    await driverAudit(adminUser.id, "admin_driver_suspend", {
      driver_user_id: userId,
      reason,
    });

    return c.json({ ok: true, status: "suspended" });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Unsuspend
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/unsuspend", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const now = new Date().toISOString();
    const { error: updateErr } = await db.from(tables.driver_profiles).update({
      status: "active",
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: now,
    }).eq("user_id", userId);

    if (updateErr) {
      return c.json({ error: "update_failed", message: updateErr.message }, 500);
    }

    // Remove auth-level ban
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "none" });

    await driverAudit(adminUser.id, "admin_driver_unsuspend", {
      driver_user_id: userId,
    });

    return c.json({ ok: true, status: "active" });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Deactivate (permanent, stronger than suspend)
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/deactivate", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return c.json({ error: "reason_required", message: "Deactivation reason is required" }, 400);

    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data: profile } = await db.from(tables.driver_profiles)
      .select("user_id, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return c.json({ error: "not_found", message: "Driver profile not found" }, 404);

    const now = new Date().toISOString();
    const { error: updateErr } = await db.from(tables.driver_profiles).update({
      status: "deactivated",
      deactivated_at: now,
      deactivated_reason: reason,
      deactivated_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);

    if (updateErr) {
      return c.json({ error: "update_failed", message: updateErr.message }, 500);
    }

    // Apply long-term auth-level ban (~100 years)
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

    await driverAudit(adminUser.id, "admin_driver_deactivate", {
      driver_user_id: userId,
      reason,
    });

    return c.json({ ok: true, status: "deactivated" });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Reactivate (from deactivated state)
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/reactivate", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const now = new Date().toISOString();
    const { error: updateErr } = await db.from(tables.driver_profiles).update({
      status: "active",
      deactivated_at: null,
      deactivated_reason: null,
      deactivated_by: null,
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: now,
    }).eq("user_id", userId);

    if (updateErr) {
      return c.json({ error: "update_failed", message: updateErr.message }, 500);
    }

    // Remove auth-level ban
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "none" });

    await driverAudit(adminUser.id, "admin_driver_reactivate", {
      driver_user_id: userId,
    });

    return c.json({ ok: true, status: "active" });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Sign Out (force logout all devices)
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/sign-out", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const auth = serviceAuth();
    const { error } = await auth.auth.admin.signOut(userId, "global");
    if (error) {
      return c.json({ error: "sign_out_failed", message: error.message }, 500);
    }

    await driverAudit(adminUser.id, "admin_driver_sign_out", {
      driver_user_id: userId,
    });

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Reset Password
  // ---------------------------------------------------------------------------

  admin.post("/drivers/:userId/reset-password", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const auth = serviceAuth();
    
    const { data: userData, error: userErr } = await auth.auth.admin.getUserById(userId);
    if (userErr || !userData.user?.email) {
      return c.json({ error: "user_not_found", message: "Could not find user email" }, 404);
    }

    const { data: linkData, error: linkErr } = await auth.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
    });
    if (linkErr) {
      return c.json({ error: "reset_failed", message: linkErr.message }, 500);
    }

    await driverAudit(adminUser.id, "admin_driver_reset_password", {
      driver_user_id: userId,
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

  // ---------------------------------------------------------------------------
  // Lifecycle Actions: Delete (removes driver_profiles row, keeps auth.users)
  // ---------------------------------------------------------------------------

  admin.delete("/drivers/:userId", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;
    const denied = requireDelete(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    // Verify profile exists
    const { data: profile } = await db.from(tables.driver_profiles)
      .select("id, user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) {
      return c.json({ error: "not_found", message: "Driver profile not found" }, 404);
    }

    // Delete related data first (driver_vehicles, etc.)
    if (profile.id) {
      await db.from("driver_vehicles").delete().eq("driver_profile_id", profile.id);
      await db.from("driver_platform_connections").delete().eq("driver_profile_id", profile.id);
    }

    // Delete the driver profile
    const { error: deleteErr } = await db.from(tables.driver_profiles)
      .delete()
      .eq("user_id", userId);

    if (deleteErr) {
      return c.json({ error: "delete_failed", message: deleteErr.message }, 500);
    }

    // Force sign out from all devices
    const auth = serviceAuth();
    await auth.auth.admin.signOut(userId, "global");

    await driverAudit(adminUser.id, "admin_driver_deleted", {
      driver_user_id: userId,
      profile_id: profile.id,
    });

    return c.json({ ok: true, message: "Driver profile deleted. User can re-signup as a new driver." });
  });

  admin.get("/drivers/:userId/trips", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));

    const ridesDb = resolved.ridesDb ?? createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { db: { schema: "rides" } },
    );

    const result = await listDriverRideRequests(ridesDb, resolved.db, {
      driverUserId: userId,
      page,
      limit,
    });

    if ("error" in result) {
      return c.json({ error: "list_failed", message: result.error }, 500);
    }
    return c.json({ trips: result.trips, total: result.total, page: result.page, limit: result.limit });
  });

  admin.get("/ledger/trips", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;

    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
    const driverUserId = c.req.query("driver_user_id")?.trim() || undefined;
    const status = c.req.query("status")?.trim() || undefined;
    const payment_method = c.req.query("payment_method")?.trim() as "cash" | "card" | undefined;
    const from = c.req.query("from")?.trim() || undefined;
    const to = c.req.query("to")?.trim() || undefined;
    const q = c.req.query("q")?.trim() || undefined;
    const grain = c.req.query("grain")?.trim() === "line" ? "line" as const : "trip" as const;

    const ridesDb = resolved.ridesDb ?? createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { db: { schema: "rides" } },
    );

    if (grain === "line") {
      const lineResult = await listPlatformLedgerLines(ridesDb, {
        driverUserId,
        page,
        limit,
        from,
        to,
      });
      if ("error" in lineResult) {
        return c.json({ error: "list_failed", message: lineResult.error }, 500);
      }
      return c.json({
        lines: lineResult.lines,
        total: lineResult.total,
        page: lineResult.page,
        limit: lineResult.limit,
      });
    }

    const result = await listDriverRideRequests(ridesDb, resolved.db, {
      driverUserId,
      page,
      limit,
      status,
      payment_method: payment_method === "cash" || payment_method === "card" ? payment_method : undefined,
      from,
      to,
      q,
      dateField: "completed_at",
    });

    if ("error" in result) {
      return c.json({ error: "list_failed", message: result.error }, 500);
    }

    const driverIds = [
      ...new Set(
        result.trips
          .map((t) => t.assigned_driver_user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const driverNames: Record<string, string> = {};
    if (driverIds.length > 0) {
      const { data: profiles } = await resolved.db.from(resolved.tables.driver_profiles)
        .select("user_id, display_name, first_name, last_name")
        .in("user_id", driverIds);
      for (const p of profiles ?? []) {
        const uid = p.user_id as string;
        const name = (p.display_name as string | null) ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          null;
        if (name) driverNames[uid] = name;
      }
    }

    const trips = result.trips.map((t) => ({
      ...t,
      driver_display_name: t.assigned_driver_user_id
        ? driverNames[t.assigned_driver_user_id as string] ?? null
        : null,
    }));

    const rideIds = trips.map((t) => String(t.id));
    const linesByRide = await aggregateLedgerLinesForTrips(ridesDb, rideIds);
    const tripsWithLedger = trips.map((t) => ({
      ...t,
      ledger_lines: linesByRide[String(t.id)] ?? [],
      ledger_line_count: (linesByRide[String(t.id)] ?? []).length,
    }));

    return c.json({
      trips: tripsWithLedger,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  });
}
