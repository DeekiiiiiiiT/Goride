/**
 * Maintenance rebuild step 7 (MER-11, MER-12): "Fill in history" for one car.
 *
 *   GET  /maintenance/vehicles/:vehicleId/history   the car's scheduled parts and when each was last done
 *   POST /maintenance/vehicles/:vehicleId/history   save last-done km/date, or "Check at next service"
 *
 * A part nobody has dated reads "History unknown" in fleet.maintenance_due_v. The save goes through
 * public.mm_fill_part_history, which never overwrites a logged service, recomputes each part from the date
 * given, and writes fleet.maintenance_audit_log.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { fleetDb } from "./repos/baseRepo.ts";

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
};

const AS_NEEDED_REASON = "As needed: done only when a job calls for it";

export type HistoryPart = {
  schedule_id: string;
  category_id: string;
  category_name: string;
  position: string | null;
  last_km: number | null;
  last_date: string | null;
  /** work_order / service_log = a logged service (read-only here); manual = filled in by a person. */
  last_source: "work_order" | "service_log" | "manual" | null;
  /** The garage of the logged service, when Roam can find it. */
  from_service_vendor: string | null;
  check_next_service: boolean;
  history_unknown: boolean;
};

/** Plain words for a database refusal, so the dialog never shows SQL. */
export function plainHistoryError(message: string): string {
  const m = message.replace(/^.*?ERROR:\s*/i, "").trim();
  if (/is not on this car/i.test(m)) return "One of these parts is no longer on this car. Close and open the list again.";
  if (/more than the car's odometer/i.test(m)) return m.replace(/^last done/i, "Last done").replace(/\s*\(/, " (") + ".";
  if (/in the future/i.test(m)) return "A last-done date can't be in the future.";
  if (/below 0/i.test(m)) return "A km reading can't be below 0.";
  return m || "Roam could not save the history. Try again.";
}

/** The rows a person can fill: scheduled parts only (not retired, not "no rule", not as-needed). */
export function fillableParts(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.filter((r) => {
    const st = String(r.schedule_status ?? "");
    if (st === "no_rule") return false;
    if (st === "retired") return false;
    if (String(r.retired_reason ?? "") === AS_NEEDED_REASON) return false;
    return r.rule_id != null || st === "manual_override";
  });
}

export function registerMaintenanceHistoryFillRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.get("/maintenance/vehicles/:vehicleId/history", requireAuth(), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const vehicleId = c.req.param("vehicleId");

      const { data: veh, error: vehErr } = await fleetDb()
        .from("fleet_vehicles")
        .select("id, license_plate, make, model, year")
        .eq("organization_id", orgId)
        .eq("id", vehicleId)
        .maybeSingle();
      if (vehErr) throw vehErr;
      if (!veh) return c.json({ error: "Car not found" }, 404);

      const { data: odo } = await fleetDb()
        .from("fleet_vehicle_current_odometer_v")
        .select("reading, reading_date")
        .eq("vehicle_id", vehicleId)
        .maybeSingle();

      const { data: rows, error } = await supabase
        .from("vehicle_component_schedule")
        .select(
          "id, category_id, position, schedule_status, retired_reason, rule_id, last_performed_km, last_performed_date, last_performed_source, history_check_at_next_service, category:maintenance_service_categories(name)",
        )
        .eq("organization_id", orgId)
        .eq("vehicle_id", vehicleId);
      if (error) throw error;

      const parts = fillableParts((rows || []) as Array<Record<string, unknown>>);

      // The garage of each logged service: the completed work order on that car and date.
      const loggedDates = [
        ...new Set(
          parts
            .filter((p) => p.last_performed_source === "work_order" || p.last_performed_source === "service_log")
            .map((p) => String(p.last_performed_date ?? "").slice(0, 10))
            .filter(Boolean),
        ),
      ];
      const vendorByDate = new Map<string, string>();
      if (loggedDates.length) {
        const { data: wos } = await supabase
          .from("maintenance_work_orders")
          .select("performed_at_date, vendor_id")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .eq("status", "completed")
          .is("voided_at", null)
          .in("performed_at_date", loggedDates);
        const vendorIds = [...new Set((wos || []).map((w) => w.vendor_id).filter(Boolean))] as string[];
        const nameById = new Map<string, string>();
        if (vendorIds.length) {
          const { data: vendors } = await fleetDb().from("fleet_platform_vendors").select("id, name").in("id", vendorIds);
          for (const v of vendors || []) nameById.set(String(v.id), String(v.name ?? "").trim());
        }
        for (const w of wos || []) {
          const d = String(w.performed_at_date ?? "").slice(0, 10);
          const name = w.vendor_id ? nameById.get(String(w.vendor_id)) : "";
          if (d && name && !vendorByDate.has(d)) vendorByDate.set(d, name);
        }
      }

      const out: HistoryPart[] = parts
        .map((p) => {
          const source = (p.last_performed_source ?? null) as HistoryPart["last_source"];
          const lastKm = p.last_performed_km != null ? Number(p.last_performed_km) : null;
          const lastDate = p.last_performed_date != null ? String(p.last_performed_date).slice(0, 10) : null;
          const cat = p.category as { name?: string } | null;
          return {
            schedule_id: String(p.id),
            category_id: String(p.category_id),
            category_name: String(cat?.name ?? "Part"),
            position: p.position != null ? String(p.position) : null,
            last_km: lastKm,
            last_date: lastDate,
            last_source: source,
            from_service_vendor:
              (source === "work_order" || source === "service_log") && lastDate ? vendorByDate.get(lastDate) ?? null : null,
            check_next_service: p.history_check_at_next_service === true,
            history_unknown: lastKm == null && lastDate == null,
          };
        })
        // Unknown first, so the parts that need an answer are at the top; then by name.
        .sort((a, b) =>
          Number(b.history_unknown) - Number(a.history_unknown) ||
          a.category_name.localeCompare(b.category_name) ||
          String(a.position ?? "").localeCompare(String(b.position ?? ""))
        );

      return c.json({
        vehicle: {
          id: String(veh.id),
          licensePlate: veh.license_plate ?? null,
          make: veh.make ?? null,
          model: veh.model ?? null,
          year: veh.year ?? null,
          odometer: odo?.reading != null ? Number(odo.reading) : null,
          odometerDate: odo?.reading_date ?? null,
        },
        parts: out,
        unknownCount: out.filter((p) => p.history_unknown).length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post(
    "/maintenance/vehicles/:vehicleId/history",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const body = (await c.req.json().catch(() => ({}))) as { rows?: unknown };
        const raw = Array.isArray(body.rows) ? body.rows : [];
        const rows = raw
          .map((r) => (r ?? {}) as Record<string, unknown>)
          .filter((r) => typeof r.schedule_id === "string" && r.schedule_id)
          .map((r) => ({
            schedule_id: String(r.schedule_id),
            last_km: r.last_km === "" || r.last_km == null ? null : Number(r.last_km),
            last_date: r.last_date ? String(r.last_date).slice(0, 10) : null,
            check_next_service: r.check_next_service === true,
          }));
        if (!rows.length) return c.json({ error: "Nothing to save." }, 400);
        if (rows.some((r) => r.last_km != null && !Number.isFinite(r.last_km))) {
          return c.json({ error: "A km reading must be a number." }, 400);
        }

        const actorId = (c.get("rbacUser") as { userId?: string } | undefined)?.userId ?? null;
        const { data, error } = await supabase.rpc("mm_fill_part_history", {
          p_org: orgId,
          p_vehicle_id: vehicleId,
          p_rows: rows,
          p_actor: actorId,
        });
        if (error) return c.json({ error: plainHistoryError(error.message) }, 400);

        const results = (data || []) as Array<{ schedule_id: string; result: string }>;
        const filled = results.filter((r) => r.result === "filled").length;
        const ticked = results.filter((r) => r.result === "check_next_service").length;
        const kept = results.filter((r) => r.result === "kept_logged_service").length;
        return c.json({ success: true, filled, ticked, kept, results });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: plainHistoryError(msg) }, 500);
      }
    },
  );
}
