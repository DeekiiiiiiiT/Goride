/**
 * M-12 split: alerts, integrity, KPI routes (extracted from maintenance_routes.ts).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Context } from "npm:hono@4.3.11";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac_middleware.ts";
import { getOrgId } from "../org_scope.ts";
import { loadLatestMaintenanceJobRun, insertMaintenanceAuditLog } from "../maintenance_logging_helpers.ts";
import { fleetDb } from "../repos/baseRepo.ts";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

export function registerMaintenanceAlertsKpiRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.get(
    "/maintenance-alerts",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await fleetDb()
          .from("fleet_maintenance_alerts")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-integrity-report",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await supabase.rpc("maintenance_integrity_report", {
          p_organization_id: orgId,
        });
        if (error) throw error;
        return c.json({ checks: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-kpi-monthly",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await fleetDb()
          .from("maintenance_kpi_monthly_v")
          .select("*")
          .eq("organization_id", orgId)
          .order("month_start", { ascending: false })
          .limit(12);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-job-runs/latest",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const run = await loadLatestMaintenanceJobRun(orgId);
        return c.json({ run: run ?? null });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-driver-notifications",
    requireAuth(),
    async (c: Context) => {
      try {
        const rbacUser = c.get("rbacUser") as { userId?: string } | undefined;
        const driverId = rbacUser?.userId?.trim();
        if (!driverId) return c.json({ error: "Unauthorized" }, 401);
        const orgId = getOrgId(c);
        const q = fleetDb()
          .from("driver_maintenance_notifications")
          .select("*")
          .eq("driver_user_id", driverId)
          .order("created_at", { ascending: false })
          .limit(50);
        const { data, error } = orgId
          ? await q.eq("organization_id", orgId)
          : await q;
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/maintenance-driver-notifications/:id/read",
    requireAuth(),
    async (c: Context) => {
      try {
        const rbacUser = c.get("rbacUser") as { userId?: string } | undefined;
        const driverId = rbacUser?.userId?.trim();
        if (!driverId) return c.json({ error: "Unauthorized" }, 401);
        const id = c.req.param("id");
        const { data, error } = await fleetDb()
          .from("driver_maintenance_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", id)
          .eq("driver_user_id", driverId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/maintenance-vehicles/:vehicleId/clear-do-not-drive",
    requireAuth(),
    requireAnyPermission("vehicles.edit", "maintenance.approve"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId")?.trim() ?? "";
        if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const reason = String(body.reason ?? "").trim();
        if (!reason) return c.json({ error: "reason is required" }, 400);
        const actorId = (c.get("rbacUser") as { userId?: string } | undefined)?.userId ?? null;

        const { data: before } = await fleetDb()
          .from("vehicles")
          .select("do_not_drive, do_not_drive_reason, do_not_drive_set_at")
          .eq("id", vehicleId)
          .eq("organization_id", orgId)
          .maybeSingle();

        const { data: updated, error } = await fleetDb()
          .from("vehicles")
          .update({
            do_not_drive: false,
            do_not_drive_reason: null,
            do_not_drive_set_at: null,
          })
          .eq("id", vehicleId)
          .eq("organization_id", orgId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!updated) return c.json({ error: "Not found" }, 404);

        await insertMaintenanceAuditLog(supabase, {
          organizationId: orgId,
          entityType: "fleet.vehicles",
          entityId: vehicleId,
          actorId,
          reason,
          before: (before ?? {}) as Record<string, unknown>,
          after: updated as Record<string, unknown>,
        });

        return c.json({ item: updated });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
