/**
 * Maintenance rebuild step 13 (MER-16, B6): what the Driver app's My car kit shows about the car.
 *
 *   GET /maintenance-driver-car[?vehicleId=]   the driver's assigned car: do-not-drive state, the next 3 due
 *                                              items, the calm "next" line, and the open work order if any
 *
 * Read only. The driver's car comes from their assignment (a vehicleId hint is only used to pick between
 * assignments, never to read another fleet's car).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Context } from "npm:hono@4.3.11";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { fleetDb } from "./repos/baseRepo.ts";
import { workOrderStage, garageName } from "./maintenance_work_order_board_routes.ts";

type RouteApp = { get: (path: string, ...handlers: unknown[]) => void };

export type DriverDueItem = {
  name: string;
  /** Plain line under the name: "The fleet has been told", "in about 870 km", "at the next service". */
  line: string;
  chip: "overdue" | "soon" | "next_visit";
};

function roundKm(km: number): string {
  const r = Math.round(km / 10) * 10;
  return r.toLocaleString("en-US");
}

function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The driver's list: overdue first, then due soon, then parts nobody has dated — at most 3. */
export function driverDueItems(rows: Array<Record<string, unknown>>): DriverDueItem[] {
  const rank: Record<string, number> = { overdue: 0, due_soon: 1, history_unknown: 2 };
  const out: Array<DriverDueItem & { order: number }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const st = String(r.due_status ?? "");
    if (!(st in rank)) continue;
    const label = String(r.category_name ?? r.category_code ?? "Service");
    // One line per part: four tyres or four brake pads read as one line for a driver.
    const key = `${st}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let line = "at the next service";
    let chip: DriverDueItem["chip"] = "next_visit";
    if (st === "overdue") {
      line = "The fleet has been told";
      chip = "overdue";
    } else if (st === "due_soon") {
      chip = "soon";
      const cur = r.current_odometer != null ? Number(r.current_odometer) : null;
      const next = r.next_due_km != null ? Number(r.next_due_km) : null;
      const date = r.next_due_date != null ? String(r.next_due_date) : null;
      line = cur != null && next != null && next > cur ? `in about ${roundKm(next - cur)} km` : date ? `by ${shortDate(date)}` : "soon";
    }
    out.push({ name: label, line, chip, order: rank[st] });
  }
  return out.sort((a, b) => a.order - b.order).slice(0, 3).map(({ order: _o, ...rest }) => rest);
}

/** The calm card's line when nothing is due: "Next: Engine oil in about 4,200 km". */
export function driverNextLine(rows: Array<Record<string, unknown>>): string | null {
  let best: { name: string; km: number } | null = null;
  for (const r of rows) {
    if (String(r.due_status ?? "") !== "ok") continue;
    const cur = r.current_odometer != null ? Number(r.current_odometer) : null;
    const next = r.next_due_km != null ? Number(r.next_due_km) : null;
    if (cur == null || next == null || next <= cur) continue;
    if (!best || next - cur < best.km) best = { name: String(r.category_name ?? "Service"), km: next - cur };
  }
  return best ? `Next: ${best.name} in about ${roundKm(best.km)} km` : null;
}

export function registerMaintenanceDriverCarRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.get("/maintenance-driver-car", requireAuth({ requireOrg: true }), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const userId = String((c.get("rbacUser") as { userId?: string } | undefined)?.userId ?? "").trim();
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const { resolveDriverVehicleAssignment } = await import("./driver_vehicle_assignment.ts");
      const hint = String(c.req.query("vehicleId") ?? "").trim();
      const resolved = await resolveDriverVehicleAssignment(userId, { organizationId: orgId, hintVehicleId: hint || undefined });
      const vehicleId = resolved.vehicleId;
      if (!vehicleId) return c.json({ vehicle: null, due: [], doNotDrive: false });

      const [{ data: veh }, { data: dueRows }, { data: wos }, { data: odo }] = await Promise.all([
        fleetDb()
          .from("fleet_vehicles")
          .select("id, license_plate, make, model, year, do_not_drive, do_not_drive_reason, do_not_drive_set_at")
          .eq("organization_id", orgId)
          .eq("id", vehicleId)
          .maybeSingle(),
        fleetDb().from("fleet_maintenance_due_v").select("*").eq("organization_id", orgId).eq("vehicle_id", vehicleId),
        supabase
          .from("maintenance_work_orders")
          .select("id, status, vendor_id, provider, off_road_at, opened_at")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .in("status", ["open", "scheduled", "in_shop", "awaiting_parts"])
          .is("voided_at", null)
          .order("opened_at", { ascending: false })
          .limit(1),
        fleetDb().from("fleet_vehicle_current_odometer_v").select("reading, reading_date").eq("vehicle_id", vehicleId).maybeSingle(),
      ]);

      const rows = (dueRows || []) as Array<Record<string, unknown>>;
      const wo = (wos || [])[0] as Record<string, unknown> | undefined;
      let workOrder: { stage: string; garage: string | null } | null = null;
      if (wo) {
        let vendorName: string | null = null;
        if (wo.vendor_id) {
          const { data: vend } = await fleetDb().from("fleet_platform_vendors").select("name").eq("id", String(wo.vendor_id)).maybeSingle();
          vendorName = (vend as { name?: string } | null)?.name ?? null;
        }
        workOrder = { stage: workOrderStage(String(wo.status)) ?? "waiting", garage: garageName(vendorName, wo.provider) };
      }

      const v = (veh ?? {}) as Record<string, unknown>;
      return c.json({
        vehicle: {
          id: vehicleId,
          plate: (v.license_plate as string | null) ?? vehicleId,
          make: (v.make as string | null) ?? null,
          model: (v.model as string | null) ?? null,
          year: v.year != null ? String(v.year) : null,
        },
        odometer: (odo as { reading?: number } | null)?.reading != null ? Number((odo as { reading: number }).reading) : null,
        odometerDate: (odo as { reading_date?: string } | null)?.reading_date ?? null,
        doNotDrive: v.do_not_drive === true,
        doNotDriveReason: (v.do_not_drive_reason as string | null) ?? null,
        doNotDriveSetAt: (v.do_not_drive_set_at as string | null) ?? null,
        due: driverDueItems(rows),
        nextLine: driverNextLine(rows),
        workOrder,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
