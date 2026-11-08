/**
 * M-12 split: alerts, integrity, KPI routes (extracted from maintenance_routes.ts).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Context } from "npm:hono@4.3.11";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac_middleware.ts";
import { getOrgId } from "../org_scope.ts";
import { loadLatestMaintenanceJobRun, insertMaintenanceAuditLog } from "../maintenance_logging_helpers.ts";
import { fleetDb, fleetTable } from "../repos/baseRepo.ts";

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
        const status = String(c.req.query("status") ?? "").toLowerCase();
        let q = fleetDb()
          .from("fleet_maintenance_alerts")
          .select("*")
          .eq("organization_id", orgId);
        if (status === "open") q = q.eq("status", "open");
        else if (status === "closed") q = q.in("status", ["resolved", "superseded"]);
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const rows = (data || []) as Array<Record<string, unknown>>;
        const vehicleIds = [
          ...new Set(rows.map((r) => String(r.vehicle_id ?? "").trim()).filter(Boolean)),
        ];
        const categoryIds = [
          ...new Set(rows.map((r) => String(r.category_id ?? "").trim()).filter(Boolean)),
        ];
        const plateByVehicleId = new Map<string, string>();
        if (vehicleIds.length) {
          const { data: vehicles, error: vErr } = await fleetDb()
            .from("fleet_vehicles")
            .select("id, license_plate")
            .eq("organization_id", orgId)
            .in("id", vehicleIds);
          if (vErr) throw vErr;
          for (const v of vehicles || []) {
            const id = String((v as { id?: string }).id ?? "");
            const plate = String((v as { license_plate?: string }).license_plate ?? "").trim();
            if (id && plate) plateByVehicleId.set(id, plate);
          }
        }
        const categoryLabelById = new Map<string, string>();
        if (categoryIds.length) {
          const { data: cats, error: cErr } = await supabase
            .from("maintenance_service_categories")
            .select("id, name")
            .in("id", categoryIds);
          if (cErr) throw cErr;
          for (const cat of cats || []) {
            const id = String((cat as { id?: string }).id ?? "");
            const name = String((cat as { name?: string }).name ?? "").trim();
            if (id && name) categoryLabelById.set(id, name);
          }
        }
        const items = rows.map((row) => {
          const vehicleId = String(row.vehicle_id ?? "");
          const categoryId = String(row.category_id ?? "");
          return {
            ...row,
            license_plate: plateByVehicleId.get(vehicleId) ?? row.license_plate ?? null,
            category_name: categoryLabelById.get(categoryId) ?? row.category_name ?? null,
          };
        });
        return c.json({ items });
      } catch (e: unknown) {
        const msg = errorMessage(e);
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
        const msg = errorMessage(e);
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
          .from(fleetTable("maintenance_kpi_monthly_v"))
          .select("*")
          .eq("organization_id", orgId)
          .order("month_start", { ascending: false })
          .limit(12);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = errorMessage(e);
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
        const msg = errorMessage(e);
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
          .from(fleetTable("driver_maintenance_notifications"))
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
        const msg = errorMessage(e);
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
          .from(fleetTable("driver_maintenance_notifications"))
          .update({ read_at: new Date().toISOString() })
          .eq("id", id)
          .eq("driver_user_id", driverId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = errorMessage(e);
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
        const msg = errorMessage(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}

/** Database errors are plain objects, not Error; read their message. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}
