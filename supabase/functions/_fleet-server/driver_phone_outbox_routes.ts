/**
 * Fuel log offline-first — S1 / S2 (docs/fuel-log-offline-first-audit.md).
 *
 * S1  POST /fuel/phone-outbox   driver phone reports how many items still wait on it.
 * S2  GET  /fuel/phone-outbox   Fleet: drivers whose phones still hold items, oldest first.
 *
 * Storage: fleet.driver_phone_outbox via public.driver_phone_outbox_report (migration
 * 20261125133536). Server only — the table has no access for signed-in users.
 */
import type { Context, Hono } from "npm:hono@4.3.11";
import type { RbacUser } from "./rbac_middleware.ts";
import { requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { parseOutboxReport } from "./fuel_offline_fill.ts";

type Rec = Record<string, unknown>;

function isDriver(u: RbacUser | undefined): boolean {
  return !!u && (u.resolvedRole === "driver" || u.rawRole === "driver");
}

// deno-lint-ignore no-explicit-any
export function registerDriverPhoneOutboxRoutes(app: Hono<any>, BASE_PATH: string): void {
  app.post(`${BASE_PATH}/fuel/phone-outbox`, async (c: Context) => {
    const rbacUser = c.get("rbacUser") as RbacUser | undefined;
    if (!rbacUser) return c.json({ error: "Unauthorized: No user context" }, 401);
    if (!isDriver(rbacUser)) return c.json({ error: "Forbidden", message: "Only a driver's phone reports here." }, 403);

    const orgId = (rbacUser.organizationId || getOrgId(c) || "").trim();
    if (!orgId) return c.json({ error: "No company for this driver" }, 400);

    const body = await c.req.json().catch(() => ({}));
    const report = parseOutboxReport(body, Date.now());
    if ("error" in report) return c.json({ error: report.error }, 400);

    const { data, error } = await getServiceClient().rpc("driver_phone_outbox_report", {
      p_organization_id: orgId,
      p_driver_id: rbacUser.userId,
      p_device_id: report.deviceId,
      p_app_version: report.appVersion,
      p_pending_count: report.pendingCount,
      p_oldest_pending_at: report.oldestPendingAt,
      p_last_error: report.lastError,
    });
    if (error) {
      console.error("[phone-outbox] report failed", error.message);
      return c.json({ error: "Could not save the report" }, 500);
    }
    const row = (Array.isArray(data) ? data[0] : data) as Rec | null;
    return c.json({
      success: true,
      pendingCount: row?.pending_count ?? report.pendingCount,
      lastSeenAt: row?.last_seen_at ?? null,
    });
  });

  app.get(`${BASE_PATH}/fuel/phone-outbox`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = (getOrgId(c) || "").trim();
    if (!orgId) return c.json({ error: "No company selected" }, 400);
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from("fleet_driver_phone_outbox")
      .select("driver_id, device_id, app_version, pending_count, oldest_pending_at, last_error, last_seen_at")
      .eq("organization_id", orgId)
      .gt("pending_count", 0)
      .order("oldest_pending_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[phone-outbox] read failed", error.message);
      return c.json({ error: "Could not load waiting phones" }, 500);
    }
    const list = (rows || []) as Rec[];
    const ids = [...new Set(list.map((r) => String(r.driver_id)))];

    // Driver names + car: the driver row id is the sign-in id for most drivers; some carry it in user_id.
    const names = new Map<string, { name: string; vehicleId: string | null; driverRecordId: string }>();
    if (ids.length) {
      const inList = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      const { data: drivers } = await db
        .from("fleet_drivers")
        .select("id, user_id, name, assigned_vehicle_id")
        .eq("organization_id", orgId)
        .or(`id.in.(${inList}),user_id.in.(${inList})`);
      for (const d of (drivers || []) as Rec[]) {
        const entry = {
          name: String(d.name || ""),
          vehicleId: d.assigned_vehicle_id ? String(d.assigned_vehicle_id) : null,
          driverRecordId: String(d.id),
        };
        names.set(String(d.id), entry);
        if (d.user_id) names.set(String(d.user_id), entry);
      }
    }

    // One row per driver (a driver with two phones adds up both).
    const byDriver = new Map<string, Rec>();
    for (const r of list) {
      const id = String(r.driver_id);
      const who = names.get(id);
      const prev = byDriver.get(id);
      const count = Number(r.pending_count) || 0;
      if (!prev) {
        byDriver.set(id, {
          driverId: who?.driverRecordId ?? id,
          driverName: who?.name || null,
          vehicleId: who?.vehicleId ?? null,
          pendingCount: count,
          oldestPendingAt: r.oldest_pending_at,
          lastSeenAt: r.last_seen_at,
          appVersion: r.app_version ?? null,
          lastError: r.last_error ?? null,
          phones: 1,
        });
      } else {
        prev.pendingCount = (Number(prev.pendingCount) || 0) + count;
        prev.phones = (Number(prev.phones) || 1) + 1;
        if (String(r.last_seen_at) > String(prev.lastSeenAt)) {
          prev.lastSeenAt = r.last_seen_at;
          prev.appVersion = r.app_version ?? prev.appVersion;
        }
      }
    }

    const drivers = [...byDriver.values()];
    const totalPending = drivers.reduce((s, d) => s + (Number(d.pendingCount) || 0), 0);
    return c.json({ drivers, totalPending });
  });
}
