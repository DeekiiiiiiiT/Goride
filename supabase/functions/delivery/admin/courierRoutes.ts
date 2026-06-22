/**
 * Courier admin routes — workforce directory, compliance, presence, ledger, support.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "../../_shared/authEdge.ts";
import {
  isPlatformRole,
  requireProductAdmin,
  type ProductAdminUser,
} from "../../_shared/productAdmin.ts";
import {
  canForceApprove,
  canStrictApprove,
  computeComplianceBlockers,
  isInComplianceQueue,
  validateApproveRequest,
  type ComplianceAssetInput,
  type ComplianceProfileInput,
  type CourierComplianceBlocker,
} from "./complianceLogic.ts";
import {
  COURIER_DELETE_ROLES,
  COURIER_WRITE_ROLES,
  hasAnyCourierRole,
  requireDelete,
  requireWrite,
} from "./permissions.ts";
import {
  generateRecoveryLink,
  recoveryRedirectForProduct,
} from "../../_shared/authRecoveryRedirects.ts";

const ONLINE_STALE_MS = 5 * 60 * 1000;

type CourierAccountStatus = "active" | "pending" | "suspended" | "deactivated";
type CourierLiveStatus = "online" | "offline" | "on_delivery";

function getDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isCourierUser(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  if (getJwtRoles(user).includes("courier")) return true;
  const surface = user.user_metadata?.surface;
  if (surface === "courier") return true;
  return jwtPrimaryRole(user) === "courier";
}

function profileInput(row: Record<string, unknown>): ComplianceProfileInput {
  return {
    status: (row.status as ComplianceProfileInput["status"]) ?? "pending",
    onboarding_complete: Boolean(row.onboarding_complete),
    background_check_status: (row.background_check_status as string | null) ?? null,
  };
}

function computeLiveStatus(
  avail: {
    is_online?: boolean;
    last_location_update?: string | null;
    active_order_id?: string | null;
  } | null | undefined,
): CourierLiveStatus {
  if (avail?.active_order_id) return "on_delivery";
  if (avail?.is_online && avail.last_location_update) {
    const age = Date.now() - new Date(avail.last_location_update).getTime();
    if (age <= ONLINE_STALE_MS) return "online";
  }
  return "offline";
}

async function courierAudit(
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
  courierUserId?: string,
) {
  try {
    const db = getDb();
    await db.from("courier_audit_events").insert({
      actor_id: actorId,
      courier_user_id: courierUserId ?? null,
      action,
      payload,
    });
  } catch (e) {
    console.error("[courierAudit] Failed:", e);
  }
}

async function fetchCourierAssets(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<ComplianceAssetInput> {
  const [{ data: docs }, { data: vehicles }] = await Promise.all([
    db.from("courier_documents").select("doc_type, status").eq("user_id", userId),
    db.from("courier_vehicles").select("id").eq("user_id", userId).limit(1),
  ]);
  const approved = (type: string) =>
    (docs ?? []).some((d) => d.doc_type === type && d.status === "approved");
  return {
    hasLicense: approved("drivers_license"),
    hasVehicle: (vehicles ?? []).length > 0,
    hasInsurance: approved("insurance"),
  };
}

async function fetchAvailabilityMap(db: ReturnType<typeof getDb>) {
  const { data } = await db.from("courier_availability")
    .select("driver_id, is_online, current_lat, current_lng, last_location_update, active_order_id");
  return new Map((data ?? []).map((r) => [r.driver_id as string, r]));
}

function buildComplianceRow(
  profile: Record<string, unknown> | null,
  assets: ComplianceAssetInput,
  email: string,
  adminRoles: string[],
  userId: string,
) {
  const input = profile ? profileInput(profile) : null;
  const blockers = computeComplianceBlockers(input, assets);
  const status = input?.status ?? "pending";
  return {
    courier_id: userId,
    courier_name: profile ? ((profile.display_name as string | null) ?? null) : null,
    courier_email: email,
    account_status: status,
    onboarding_complete: input?.onboarding_complete ?? false,
    background_check_status: input?.background_check_status ?? null,
    has_license: assets.hasLicense,
    has_vehicle: assets.hasVehicle,
    has_insurance: assets.hasInsurance,
    blockers,
    can_strict_approve: canStrictApprove(blockers, status),
    can_force_approve: canForceApprove(adminRoles, blockers, status),
    created_at: profile ? ((profile.created_at as string | null) ?? null) : null,
  };
}

export function registerCourierAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "courier");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  const couriers = new Hono();

  couriers.get("/stats", async (c) => {
    const db = getDb();
    const { count: totalCouriers } = await db.from("courier_profiles")
      .select("*", { count: "exact", head: true });

    const { data: profiles } = await db.from("courier_profiles")
      .select("user_id, status, onboarding_complete, background_check_status");

    let pendingCompliance = 0;
    for (const p of profiles ?? []) {
      const assets = await fetchCourierAssets(db, p.user_id as string);
      const blockers = computeComplianceBlockers(profileInput(p), assets);
      const status = (p.status as CourierAccountStatus) ?? "pending";
      if (isInComplianceQueue(blockers, status)) pendingCompliance += 1;
    }

    const { count: activeCouriers } = await db.from("courier_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("onboarding_complete", true);

    const { data: availability } = await db.from("courier_availability")
      .select("driver_id, is_online, last_location_update, active_order_id");

    const now = Date.now();
    let onlineNow = 0;
    let onDeliveryNow = 0;
    for (const a of availability ?? []) {
      if (a.active_order_id) {
        onDeliveryNow += 1;
        continue;
      }
      if (a.is_online && a.last_location_update) {
        const age = now - new Date(a.last_location_update as string).getTime();
        if (age <= ONLINE_STALE_MS) onlineNow += 1;
      }
    }

    return c.json({
      total_couriers: totalCouriers ?? 0,
      active_couriers: activeCouriers ?? 0,
      pending_compliance: pendingCompliance,
      online_now: onlineNow,
      on_delivery_now: onDeliveryNow,
    });
  });

  couriers.get("/compliance", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const queueOnly = c.req.query("queue") !== "false";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);

    const db = getDb();
    const { data: profiles, error } = await db.from("courier_profiles")
      .select(
        "user_id, display_name, phone, onboarding_complete, background_check_status, status, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return c.json({ couriers: [], total: 0, error: error.message }, 500);
    }

    const auth = serviceAuth();
    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
    const rows: Record<string, unknown>[] = [];

    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      const assets = await fetchCourierAssets(db, uid);
      const blockers = computeComplianceBlockers(profileInput(p), assets);
      const status = (p.status as CourierAccountStatus) ?? "pending";

      if (queueOnly && !isInComplianceQueue(blockers, status)) continue;

      const { data: u } = await auth.auth.admin.getUserById(uid);
      rows.push(buildComplianceRow(p, assets, u?.user?.email ?? "", adminUser.roles, uid));
    }

    if (queueOnly) {
      let page = 1;
      const perPage = 200;
      for (;;) {
        const { data: list, error: listErr } = await auth.auth.admin.listUsers({ page, perPage });
        if (listErr || !list?.users?.length) break;
        for (const u of list.users) {
          if (!isCourierUser(u)) continue;
          if (profileByUser.has(u.id)) continue;
          rows.push({
            ...buildComplianceRow(null, {
              hasLicense: false,
              hasVehicle: false,
              hasInsurance: false,
            }, u.email ?? "", adminUser.roles, u.id),
            blockers: ["no_profile"] as CourierComplianceBlocker[],
            can_strict_approve: false,
            can_force_approve: false,
          });
        }
        if (list.users.length < perPage) break;
        page++;
        if (page > 25) break;
      }
    }

    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    return c.json({ couriers: rows.slice(offset, offset + limit), total, limit, offset });
  });

  couriers.patch("/compliance/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const db = getDb();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const bgValues = new Set(["pending", "approved", "rejected", "expired"]);
    if (typeof body.background_check === "string") {
      if (!bgValues.has(body.background_check)) {
        return c.json({
          ok: false,
          error: "invalid_background_check",
          message: "background_check must be pending, approved, rejected, or expired",
        }, 400);
      }
      patch.background_check_status = body.background_check;
    }

    if (Object.keys(patch).length <= 1) {
      return c.json({ ok: false, error: "no_updates", message: "No valid fields to update" }, 400);
    }

    const { data: profile, error } = await db.from("courier_profiles")
      .update(patch)
      .eq("user_id", userId)
      .select(
        "user_id, display_name, onboarding_complete, background_check_status, status, created_at",
      )
      .maybeSingle();

    if (error) return c.json({ ok: false, error: error.message }, 400);
    if (!profile) {
      return c.json({ ok: false, error: "not_found", message: "Courier profile not found" }, 404);
    }

    const assets = await fetchCourierAssets(db, userId);
    const auth = serviceAuth();
    const { data: u } = await auth.auth.admin.getUserById(userId);

    await courierAudit(adminUser.id, "admin_courier_compliance_updated", {
      courier_user_id: userId,
      updates: body,
      admin_email: adminUser.email,
    }, userId);

    return c.json({
      ok: true,
      courier: buildComplianceRow(profile, assets, u?.user?.email ?? "", adminUser.roles, userId),
    });
  });

  couriers.get("/presence", async (c) => {
    const onlineOnly = c.req.query("online_only") === "true";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const db = getDb();

    const availMap = await fetchAvailabilityMap(db);
    const { data: profiles } = await db.from("courier_profiles")
      .select("user_id, display_name, phone, email");

    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    for (const [uid, avail] of availMap) {
      seen.add(uid);
      const profile = profileByUser.get(uid);
      const live_status = computeLiveStatus(avail);
      const lat = Number(avail.current_lat);
      const lng = Number(avail.current_lng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

      let orderStatus: string | null = null;
      let deliveryAddress: string | null = null;
      if (avail.active_order_id) {
        const { data: order } = await db.from("orders")
          .select("status, delivery_address")
          .eq("id", avail.active_order_id as string)
          .maybeSingle();
        orderStatus = (order?.status as string | null) ?? null;
        deliveryAddress = (order?.delivery_address as string | null) ?? null;
      }

      rows.push({
        courier_id: uid,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        is_online: Boolean(avail.is_online),
        last_seen: avail.last_location_update as string | null,
        live_status,
        order_status: orderStatus,
        order_id: avail.active_order_id as string | null,
        delivery_address: deliveryAddress,
        display_name: (profile?.display_name as string | null) ?? null,
        email: (profile?.email as string | null) ?? null,
        phone: (profile?.phone as string | null) ?? null,
      });
    }

    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      if (seen.has(uid)) continue;
      rows.push({
        courier_id: uid,
        lat: null,
        lng: null,
        is_online: false,
        last_seen: null,
        live_status: "offline",
        order_status: null,
        order_id: null,
        delivery_address: null,
        display_name: (p.display_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
      });
    }

    let filtered = rows;
    if (onlineOnly) {
      filtered = rows.filter((r) =>
        r.live_status === "online" || r.live_status === "on_delivery"
      );
    }

    filtered.sort((a, b) => {
      const rank = (s: string) => (s === "on_delivery" ? 0 : s === "online" ? 1 : 2);
      const dr = rank(a.live_status as string) - rank(b.live_status as string);
      if (dr !== 0) return dr;
      const ta = a.last_seen ? new Date(a.last_seen as string).getTime() : 0;
      const tb = b.last_seen ? new Date(b.last_seen as string).getTime() : 0;
      return tb - ta;
    });

    return c.json({ couriers: filtered.slice(0, limit), total: filtered.length });
  });

  couriers.get("/ledger/deliveries", async (c) => {
    const db = getDb();
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const offset = (page - 1) * limit;
    const status = c.req.query("status")?.trim();
    const courierUserId = c.req.query("courier_user_id")?.trim();
    const q = c.req.query("q")?.trim().toLowerCase();

    let query = db.from("orders")
      .select(
        "id, order_number, status, courier_id, total, delivery_fee, tip, payment_method, placed_at, delivered_at, delivery_address, merchant:merchants(name)",
        { count: "exact" },
      )
      .order("placed_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (courierUserId) query = query.eq("courier_id", courierUserId);
    if (q) query = query.ilike("delivery_address", `%${q}%`);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);

    const courierIds = [
      ...new Set((data ?? []).map((o) => o.courier_id as string).filter(Boolean)),
    ];
    const names: Record<string, string> = {};
    if (courierIds.length) {
      const { data: profiles } = await db.from("courier_profiles")
        .select("user_id, display_name")
        .in("user_id", courierIds);
      for (const p of profiles ?? []) {
        const name = p.display_name as string | null;
        if (name) names[p.user_id as string] = name;
      }
    }

    const deliveries = (data ?? []).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      courier_id: o.courier_id,
      courier_display_name: o.courier_id ? names[o.courier_id as string] ?? null : null,
      merchant_name: (o.merchant as { name?: string } | null)?.name ?? null,
      total: Number(o.total),
      delivery_fee: Number(o.delivery_fee),
      tip: Number(o.tip ?? 0),
      payment_method: o.payment_method as string | null,
      placed_at: o.placed_at as string | null,
      delivered_at: o.delivered_at as string | null,
      delivery_address: o.delivery_address as string | null,
    }));

    return c.json({ deliveries, total: count ?? 0, page, limit });
  });

  couriers.get("/", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const q = (c.req.query("q") ?? c.req.query("search") ?? "").trim().toLowerCase();
    const statusFilter = c.req.query("status")?.trim();
    const liveFilter = c.req.query("live_status")?.trim();

    const db = getDb();
    const availMap = await fetchAvailabilityMap(db);
    const { data: profiles } = await db.from("courier_profiles").select("*");
    const byId = new Map<string, Record<string, unknown>>();

    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      const avail = availMap.get(uid);
      const assets = await fetchCourierAssets(db, uid);
      const blockers = computeComplianceBlockers(profileInput(p), assets);
      byId.set(uid, {
        user_id: uid,
        display_name: (p.display_name as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        status: (p.status as CourierAccountStatus) ?? "pending",
        live_status: computeLiveStatus(avail),
        vehicle_type: (p.vehicle_type as string | null) ?? null,
        onboarding_complete: Boolean(p.onboarding_complete),
        background_check_status: (p.background_check_status as string | null) ?? null,
        compliance_blockers_count: blockers.length,
        total_deliveries: Number(p.total_deliveries ?? 0),
        acceptance_rate_pct: p.acceptance_rate_pct != null ? Number(p.acceptance_rate_pct) : null,
        completion_rate_pct: p.completion_rate_pct != null ? Number(p.completion_rate_pct) : null,
        rating: p.rating != null ? Number(p.rating) : null,
        last_delivery_at: null,
        last_online_at: (avail?.last_location_update as string | null) ?? null,
        created_at: (p.created_at as string | null) ?? null,
        last_sign_in_at: null,
      });
    }

    const auth = serviceAuth();
    let authPage = 1;
    for (;;) {
      const { data: list, error } = await auth.auth.admin.listUsers({ page: authPage, perPage: 200 });
      if (error || !list?.users?.length) break;
      for (const u of list.users) {
        if (!isCourierUser(u)) continue;
        if (byId.has(u.id)) {
          const row = byId.get(u.id)!;
          row.email = row.email ?? u.email ?? null;
          row.last_sign_in_at = u.last_sign_in_at ?? null;
          row.created_at = row.created_at ?? u.created_at ?? null;
          continue;
        }
        const avail = availMap.get(u.id);
        byId.set(u.id, {
          user_id: u.id,
          display_name: null,
          phone: (u.phone as string | null) ?? null,
          email: u.email ?? null,
          status: "pending",
          live_status: computeLiveStatus(avail),
          vehicle_type: null,
          onboarding_complete: false,
          background_check_status: null,
          compliance_blockers_count: 1,
          total_deliveries: 0,
          acceptance_rate_pct: null,
          completion_rate_pct: null,
          rating: null,
          last_delivery_at: null,
          last_online_at: (avail?.last_location_update as string | null) ?? null,
          created_at: u.created_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
      if (list.users.length < 200) break;
      authPage++;
      if (authPage > 25) break;
    }

    let rows = Array.from(byId.values());
    if (statusFilter && statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (liveFilter && liveFilter !== "all") {
      rows = rows.filter((r) => r.live_status === liveFilter);
    }
    if (q) {
      const uuidLike = /^[0-9a-f-]{8,}$/i.test(q);
      rows = rows.filter((r) => {
        if (uuidLike) return String(r.user_id).toLowerCase().startsWith(q);
        const hay = [r.email, r.display_name, r.phone, r.user_id].filter(Boolean).join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const offset = (page - 1) * limit;
    return c.json({ couriers: rows.slice(offset, offset + limit), total, page, limit });
  });

  couriers.get("/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const userId = c.req.param("userId");
    const db = getDb();
    const auth = serviceAuth();

    const { data: authData, error: authErr } = await auth.auth.admin.getUserById(userId);
    if (authErr || !authData.user) return c.json({ error: "not_found" }, 404);

    const { data: profile } = await db.from("courier_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: avail } = await db.from("courier_availability")
      .select("*")
      .eq("driver_id", userId)
      .maybeSingle();

    const assets = await fetchCourierAssets(db, userId);
    const blockers = profile
      ? computeComplianceBlockers(profileInput(profile), assets)
      : (["no_profile"] as const);
    const accountStatus = (profile?.status as CourierAccountStatus) ?? "pending";

    const { data: vehicles } = await db.from("courier_vehicles")
      .select("id, make, model, year, license_plate, is_primary, status")
      .eq("user_id", userId);

    const { data: documents } = await db.from("courier_documents")
      .select("id, doc_type, status, expiry_date")
      .eq("user_id", userId);

    const { data: recentDeliveries } = await db.from("orders")
      .select("id, order_number, status, total, placed_at, delivered_at, delivery_address")
      .eq("courier_id", userId)
      .order("placed_at", { ascending: false })
      .limit(10);

    return c.json({
      courier: {
        user_id: userId,
        email: authData.user.email,
        phone: (profile?.phone as string | null) ?? authData.user.phone ?? null,
        display_name: (profile?.display_name as string | null) ?? null,
        status: accountStatus,
        live_status: computeLiveStatus(avail ?? undefined),
        vehicle_type: (profile?.vehicle_type as string | null) ?? null,
        onboarding_complete: Boolean(profile?.onboarding_complete),
        background_check_status: (profile?.background_check_status as string | null) ?? null,
        documents_verified_at: (profile?.documents_verified_at as string | null) ?? null,
        approved_at: (profile?.approved_at as string | null) ?? null,
        approved_by: (profile?.approved_by as string | null) ?? null,
        rating: profile?.rating != null ? Number(profile.rating) : null,
        total_deliveries: Number(profile?.total_deliveries ?? 0),
        acceptance_rate_pct: profile?.acceptance_rate_pct != null
          ? Number(profile.acceptance_rate_pct)
          : null,
        completion_rate_pct: profile?.completion_rate_pct != null
          ? Number(profile.completion_rate_pct)
          : null,
        created_at: (profile?.created_at as string | null) ?? authData.user.created_at,
        last_sign_in_at: authData.user.last_sign_in_at,
        location: avail
          ? {
            user_id: userId,
            lat: avail.current_lat != null ? Number(avail.current_lat) : null,
            lng: avail.current_lng != null ? Number(avail.current_lng) : null,
            is_online: Boolean(avail.is_online),
            updated_at: avail.last_location_update as string | null,
            active_order_id: avail.active_order_id as string | null,
          }
          : null,
        suspended_at: (profile?.suspended_at as string | null) ?? null,
        suspended_reason: (profile?.suspended_reason as string | null) ?? null,
        suspended_by: (profile?.suspended_by as string | null) ?? null,
        deactivated_at: (profile?.deactivated_at as string | null) ?? null,
        deactivated_reason: (profile?.deactivated_reason as string | null) ?? null,
        deactivated_by: (profile?.deactivated_by as string | null) ?? null,
        recent_deliveries: recentDeliveries ?? [],
        vehicles: vehicles ?? [],
        documents: documents ?? [],
        compliance: {
          blockers: [...blockers],
          can_strict_approve: canStrictApprove([...blockers], accountStatus),
          can_force_approve: canForceApprove(adminUser.roles, [...blockers], accountStatus),
        },
      },
      permissions: {
        can_write: hasAnyCourierRole(adminUser.roles, COURIER_WRITE_ROLES),
        can_delete: hasAnyCourierRole(adminUser.roles, COURIER_DELETE_ROLES),
        can_see_reset_link: isPlatformRole(adminUser.role),
      },
    });
  });

  couriers.get("/:userId/deliveries", async (c) => {
    const userId = c.req.param("userId");
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
    const offset = (page - 1) * limit;
    const db = getDb();

    const { data, error, count } = await db.from("orders")
      .select("*", { count: "exact" })
      .eq("courier_id", userId)
      .order("placed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ deliveries: data ?? [], total: count ?? 0, page, limit });
  });

  couriers.post("/:userId/approve", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { force?: boolean; reason?: string };
    const db = getDb();

    const { data: profile } = await db.from("courier_profiles")
      .select("user_id, status, onboarding_complete, background_check_status")
      .eq("user_id", userId)
      .maybeSingle();

    const assets = await fetchCourierAssets(db, userId);
    const blockers = profile
      ? computeComplianceBlockers(profileInput(profile), assets)
      : (["no_profile"] as const);
    const status = (profile?.status as CourierAccountStatus) ?? "pending";

    if (status === "active") {
      return c.json({
        ok: true,
        status: "active",
        approved_at: new Date().toISOString(),
        force: false,
        blockers_at_approval: blockers,
        already_active: true,
      });
    }

    const validation = validateApproveRequest(body, [...blockers], status, adminUser.roles);
    if (!validation.ok) {
      return c.json({ error: validation.error, message: validation.message }, validation.httpStatus);
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await db.from("courier_profiles").update({
      status: "active",
      approved_at: now,
      approved_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);

    if (updateErr) {
      return c.json({ error: "update_failed", message: updateErr.message }, 500);
    }

    await courierAudit(adminUser.id, "admin_courier_approved", {
      courier_user_id: userId,
      force: validation.force,
      reason: validation.reason ?? null,
      blockers_at_approval: blockers,
      admin_email: adminUser.email,
    }, userId);

    return c.json({
      ok: true,
      status: "active",
      approved_at: now,
      force: validation.force,
      blockers_at_approval: blockers,
    });
  });

  couriers.post("/:userId/suspend", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return c.json({ error: "reason_required", message: "Suspension reason is required" }, 400);
    }
    const db = getDb();
    const now = new Date().toISOString();
    const { error } = await db.from("courier_profiles").update({
      status: "suspended",
      suspended_at: now,
      suspended_reason: reason,
      suspended_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);
    if (error) return c.json({ error: error.message }, 500);
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "8760h" });
    await courierAudit(adminUser.id, "admin_courier_suspend", { courier_user_id: userId, reason }, userId);
    return c.json({ ok: true, status: "suspended" });
  });

  couriers.post("/:userId/unsuspend", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const db = getDb();
    const now = new Date().toISOString();
    const { error } = await db.from("courier_profiles").update({
      status: "active",
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: now,
    }).eq("user_id", userId);
    if (error) return c.json({ error: error.message }, 500);
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "none" });
    await courierAudit(adminUser.id, "admin_courier_unsuspend", { courier_user_id: userId }, userId);
    return c.json({ ok: true, status: "active" });
  });

  couriers.post("/:userId/deactivate", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return c.json({ error: "reason_required", message: "Deactivation reason is required" }, 400);
    }
    const db = getDb();
    const now = new Date().toISOString();
    const { error } = await db.from("courier_profiles").update({
      status: "deactivated",
      deactivated_at: now,
      deactivated_reason: reason,
      deactivated_by: adminUser.id,
      updated_at: now,
    }).eq("user_id", userId);
    if (error) return c.json({ error: error.message }, 500);
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    await courierAudit(adminUser.id, "admin_courier_deactivate", { courier_user_id: userId, reason }, userId);
    return c.json({ ok: true, status: "deactivated" });
  });

  couriers.post("/:userId/reactivate", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const db = getDb();
    const now = new Date().toISOString();
    const { error } = await db.from("courier_profiles").update({
      status: "active",
      deactivated_at: null,
      deactivated_reason: null,
      deactivated_by: null,
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: now,
    }).eq("user_id", userId);
    if (error) return c.json({ error: error.message }, 500);
    const auth = serviceAuth();
    await auth.auth.admin.updateUserById(userId, { ban_duration: "none" });
    await courierAudit(adminUser.id, "admin_courier_reactivate", { courier_user_id: userId }, userId);
    return c.json({ ok: true, status: "active" });
  });

  couriers.post("/:userId/sign-out", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const auth = serviceAuth();
    const { error } = await auth.auth.admin.signOut(userId, "global");
    if (error) return c.json({ error: error.message }, 500);
    await courierAudit(adminUser.id, "admin_courier_sign_out", { courier_user_id: userId }, userId);
    return c.json({ ok: true });
  });

  couriers.post("/:userId/reset-password", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;
    const userId = c.req.param("userId");
    const auth = serviceAuth();
    const { data: userData, error: userErr } = await auth.auth.admin.getUserById(userId);
    if (userErr || !userData.user?.email) {
      return c.json({ error: "user_not_found", message: "Could not find user email" }, 404);
    }
    const { data: linkData, error: linkErr } = await generateRecoveryLink(
      auth,
      userData.user.email,
      recoveryRedirectForProduct("courier"),
    );
    if (linkErr) return c.json({ error: linkErr.message }, 500);
    await courierAudit(adminUser.id, "admin_courier_reset_password", { courier_user_id: userId }, userId);
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

  couriers.delete("/:userId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDelete(adminUser);
    if (denied) return denied;

    const userId = c.req.param("userId");
    const db = getDb();

    await db.from("courier_documents").delete().eq("user_id", userId);
    await db.from("courier_vehicles").delete().eq("user_id", userId);
    const { error } = await db.from("courier_profiles").delete().eq("user_id", userId);
    if (error) return c.json({ error: error.message }, 500);

    const auth = serviceAuth();
    await auth.auth.admin.signOut(userId, "global");
    await courierAudit(adminUser.id, "admin_courier_deleted", { courier_user_id: userId }, userId);

    return c.json({
      ok: true,
      message: "Courier profile deleted. User can re-signup as a new courier.",
    });
  });

  admin.route("/couriers", couriers);

  app.route("/admin", admin);
}
