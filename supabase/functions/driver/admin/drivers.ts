/**
 * Driver admin — user directory (Uber-style metrics + live status).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import {
  getDriverAdminDb,
  type DriverAdminTables,
} from "../../_shared/driverAdminDb.ts";

type DriverAdminDb = Awaited<ReturnType<typeof getDriverAdminDb>>;

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
  const role = (user.user_metadata?.role ?? user.app_metadata?.role) as string | undefined;
  return role === "driver";
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
        can_write: false,
      },
    });
  });

  admin.get("/drivers/:userId/trips", async (c) => {
    const adminUser = await requireProductAdmin(c, "driver");
    if (adminUser instanceof Response) return adminUser;

    const userId = c.req.param("userId");
    const resolved = await driverDbOrResponse(c);
    if (resolved instanceof Response) return resolved;

    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
    const offset = (page - 1) * limit;

    const { data, error, count } = await resolved.db.from(resolved.tables.ride_requests)
      .select("*", { count: "exact" })
      .eq("assigned_driver_user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    return c.json({ trips: data ?? [], total: count ?? 0, page, limit });
  });
}
