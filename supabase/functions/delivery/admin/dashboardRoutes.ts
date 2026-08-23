/**
 * Role-aware unified dashboard stats for Rush Ops Console.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import {
  requireProductAdmin,
  type ProductAdminUser,
} from "../../_shared/productAdmin.ts";
import { getDb } from "./merchantAdminShared.ts";
import {
  computeComplianceBlockers,
  isInComplianceQueue,
  type ComplianceAssetInput,
  type ComplianceProfileInput,
} from "./complianceLogic.ts";

const SLA_HOURS = 48;
const ONLINE_STALE_MS = 5 * 60 * 1000;

const DASH_ROLES = new Set([
  "dash_admin", "dash_ops", "platform_owner", "platform_support", "platform_analyst", "superadmin",
]);
const COURIER_ROLES = new Set(["courier_admin", "courier_ops"]);

function isCourierOnlyScope(roles: string[]): boolean {
  const hasDash = roles.some((r) => DASH_ROLES.has(r));
  const hasCourier = roles.some((r) => COURIER_ROLES.has(r));
  return hasCourier && !hasDash;
}

function profileInput(row: Record<string, unknown>): ComplianceProfileInput {
  return {
    status: (row.status as ComplianceProfileInput["status"]) ?? "pending",
    onboarding_complete: Boolean(row.onboarding_complete),
    background_check_status: (row.background_check_status as string | null) ?? null,
  };
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

async function fetchPlatformStats() {
  const sb = getDb();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const slaCutoff = new Date(now.getTime() - SLA_HOURS * 60 * 60 * 1000).toISOString();

  const [
    { data: merchants },
    { data: ordersToday },
    { data: liveOrders },
    { data: slaPending },
  ] = await Promise.all([
    sb.from("merchants").select("verification_status, operational_status, onboarding_status"),
    sb.from("orders").select("id, total").gte("placed_at", todayStart),
    sb.from("orders").select("id").in("status", [
      "placed", "accepted", "preparing", "ready", "picked_up", "in_transit",
    ]),
    sb.from("merchants").select("id")
      .eq("onboarding_status", "submitted")
      .in("verification_status", ["pending", "in_review", "docs_requested"])
      .lt("submitted_at", slaCutoff),
  ]);

  const verificationCounts: Record<string, number> = {
    pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
  };
  const operationalCounts: Record<string, number> = {
    active: 0, suspended: 0, deactivated: 0,
  };
  for (const m of merchants ?? []) {
    const row = m as Record<string, unknown>;
    if (row.onboarding_status === "draft") continue;
    const vs = row.verification_status as string;
    const os = row.operational_status as string;
    if (vs && vs in verificationCounts) verificationCounts[vs]++;
    if (os && os in operationalCounts) operationalCounts[os]++;
  }

  const todayGmv = (ordersToday ?? []).reduce(
    (sum, o) => sum + Number((o as Record<string, unknown>).total ?? 0),
    0,
  );

  return {
    merchants: {
      total: (merchants ?? []).filter((m) => (m as Record<string, unknown>).onboarding_status !== "draft").length,
      verification: verificationCounts,
      operational: operationalCounts,
    },
    orders: {
      todayCount: (ordersToday ?? []).length,
      todayGmv,
      liveCount: (liveOrders ?? []).length,
    },
    sla: {
      staleVerifications: (slaPending ?? []).length,
    },
  };
}

async function fetchCourierStats() {
  const db = getDb();
  const { count: totalCouriers } = await db.from("courier_profiles")
    .select("*", { count: "exact", head: true });

  const { data: profiles } = await db.from("courier_profiles")
    .select("user_id, status, onboarding_complete, background_check_status");

  let pendingCompliance = 0;
  for (const p of profiles ?? []) {
    const assets = await fetchCourierAssets(db, p.user_id as string);
    const blockers = computeComplianceBlockers(profileInput(p), assets);
    const status = profileInput(p).status ?? "pending";
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

  return {
    total_couriers: totalCouriers ?? 0,
    active_couriers: activeCouriers ?? 0,
    pending_compliance: pendingCompliance,
    online_now: onlineNow,
    on_delivery_now: onDeliveryNow,
  };
}

export function registerDashboardAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.get("/dashboard/stats", async (c) => {
    const dashResult = await requireProductAdmin(c, "dash");
    const adminUser = dashResult instanceof Response
      ? await requireProductAdmin(c, "courier")
      : dashResult;

    if (adminUser instanceof Response) return adminUser;

    const user = adminUser as ProductAdminUser;
    const scope = isCourierOnlyScope(user.roles) ? "courier" : "platform";

    if (scope === "courier") {
      const courier = await fetchCourierStats();
      return c.json({ scope: "courier", courier });
    }

    const platform = await fetchPlatformStats();
    return c.json({ scope: "platform", platform });
  });

  app.route("/admin", admin);
}
