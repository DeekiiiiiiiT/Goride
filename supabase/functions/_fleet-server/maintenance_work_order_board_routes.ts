/**
 * Maintenance rebuild step 11 (MER-15): the Work orders tab.
 *
 *   GET /maintenance/work-orders/board   tiles, open work orders, done recently, cancelled
 *
 * A work order's stage, in the words the tab shows:
 *   draft (driver request)        Needs a decision
 *   open / scheduled              Waiting to go in
 *   in_shop / awaiting_parts      At the garage (days off the road from off_road_at)
 *   in_progress                   Being saved (a Log service save that has not finished)
 *   completed / closed            Done
 *   cancelled                     Cancelled
 * "planned" work orders are the Not done yet list and never show here; a deleted (voided) service never shows.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Context } from "npm:hono@4.3.11";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { fleetDb } from "./repos/baseRepo.ts";

type RouteApp = { get: (path: string, ...handlers: unknown[]) => void };

export type WorkOrderStage = "decision" | "waiting" | "garage" | "saving" | "done" | "cancelled";

export function workOrderStage(status: string): WorkOrderStage | null {
  switch (status) {
    case "draft":
      return "decision";
    case "open":
    case "scheduled":
      return "waiting";
    case "in_shop":
    case "awaiting_parts":
      return "garage";
    case "in_progress":
      return "saving";
    case "completed":
    case "closed":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return null; // planned and anything unknown
  }
}

export const STAGE_LABEL: Record<WorkOrderStage, string> = {
  decision: "Needs a decision",
  waiting: "Waiting to go in",
  garage: "At the garage",
  saving: "Being saved",
  done: "Done",
  cancelled: "Cancelled",
};

/** Whole days a car has been off the road (0 on the day it went in). */
export function daysOffRoad(offRoadAt: string | null | undefined, now: Date): number | null {
  if (!offRoadAt) return null;
  const t = Date.parse(offRoadAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** The garage's name: the chosen vendor, else the provider typed on the service (never "Driver Request"). */
export function garageName(vendorName: string | null | undefined, provider: unknown): string | null {
  if (vendorName && vendorName.trim()) return vendorName.trim();
  const p = String(provider ?? "").trim();
  if (!p || /^driver request$/i.test(p)) return null;
  return p;
}

export function registerMaintenanceWorkOrderBoardRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.get("/maintenance/work-orders/board", requireAuth(), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const now = new Date();

      const { data: wos, error } = await supabase
        .from("maintenance_work_orders")
        .select(
          "id, vehicle_id, status, opened_at, closed_at, performed_at_date, odometer, provider, vendor_id, total_cost, discount_amount, priority, off_road_at, back_on_road_at, approved_at, source, cancel_reason, maintenance_record_id, payload_json, notes, voided_at, version",
        )
        .eq("organization_id", orgId)
        .neq("status", "planned")
        .is("voided_at", null)
        .order("opened_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (wos || []) as Array<Record<string, unknown>>;

      const vehicleIds = [...new Set(rows.map((r) => String(r.vehicle_id ?? "")).filter(Boolean))];
      const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))] as string[];
      const woIds = rows.map((r) => String(r.id));
      const recordIds = [...new Set(rows.map((r) => r.maintenance_record_id).filter(Boolean))] as string[];

      const [vehRes, vendRes, lineRes, recRes] = await Promise.all([
        vehicleIds.length
          ? fleetDb().from("fleet_vehicles").select("id, license_plate, make, model, year").eq("organization_id", orgId).in("id", vehicleIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        vendorIds.length
          ? fleetDb().from("fleet_platform_vendors").select("id, name").in("id", vendorIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        woIds.length
          ? supabase
            .from("maintenance_work_order_lines")
            .select("work_order_id, component_name, recommended, voided_at, sort_order")
            .in("work_order_id", woIds)
            .order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        recordIds.length
          ? supabase.from("maintenance_records").select("id, status, service_type, notes, performed_at_date, performed_at_miles, payload_json, created_at").in("id", recordIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      const vehById = new Map((vehRes.data || []).map((v) => [String(v.id), v as Record<string, unknown>]));
      const vendorById = new Map((vendRes.data || []).map((v) => [String(v.id), String((v as Record<string, unknown>).name ?? "")]));
      const jobsByWo = new Map<string, string[]>();
      for (const l of (lineRes.data || []) as Array<Record<string, unknown>>) {
        if (l.voided_at != null || l.recommended === true) continue;
        const name = String(l.component_name ?? "").trim();
        if (!name) continue;
        const key = String(l.work_order_id);
        const list = jobsByWo.get(key) ?? [];
        if (!list.includes(name)) list.push(name);
        jobsByWo.set(key, list);
      }
      const recordById = new Map((recRes.data || []).map((r) => [String(r.id), r as Record<string, unknown>]));

      const cards = rows
        .map((r) => {
          const stage = workOrderStage(String(r.status ?? ""));
          if (!stage) return null;
          const v = vehById.get(String(r.vehicle_id ?? "")) ?? {};
          const rec = r.maintenance_record_id ? recordById.get(String(r.maintenance_record_id)) : undefined;
          const payload = (rec?.payload_json ?? r.payload_json ?? {}) as Record<string, unknown>;
          const fromRequest = r.source === "driver_request" || payload.source === "driver_service_request";
          return {
            id: String(r.id),
            status: String(r.status),
            stage,
            stageLabel: STAGE_LABEL[stage],
            vehicleId: String(r.vehicle_id ?? ""),
            plate: (v.license_plate as string | null) ?? null,
            make: (v.make as string | null) ?? null,
            model: (v.model as string | null) ?? null,
            year: v.year != null ? String(v.year) : null,
            garage: garageName(r.vendor_id ? vendorById.get(String(r.vendor_id)) : null, r.provider),
            openedAt: (r.opened_at as string | null) ?? null,
            offRoadAt: (r.off_road_at as string | null) ?? null,
            daysOffRoad: stage === "garage" ? daysOffRoad(r.off_road_at as string | null, now) : null,
            performedAtDate: r.performed_at_date ? String(r.performed_at_date).slice(0, 10) : null,
            closedAt: (r.closed_at as string | null) ?? null,
            odometer: r.odometer != null ? Number(r.odometer) : null,
            total: r.total_cost != null ? Number(r.total_cost) : null,
            priority: (r.priority as string | null) ?? null,
            cancelReason: (r.cancel_reason as string | null) ?? null,
            jobs: jobsByWo.get(String(r.id)) ?? [],
            request: fromRequest && rec
              ? {
                recordId: String(rec.id),
                recordStatus: String(rec.status ?? ""),
                type: (rec.service_type as string | null) ?? null,
                text: String(payload.description ?? rec.notes ?? "").trim() || null,
                priority: (payload.priority as string | null) ?? null,
                date: (rec.created_at as string | null) ?? (rec.performed_at_date as string | null) ?? null,
                photoUrl: (payload.photoUrl as string | null) ?? (payload.photo_url as string | null) ?? null,
                odometer: rec.performed_at_miles != null ? Number(rec.performed_at_miles) : null,
                performedAtDate: rec.performed_at_date ? String(rec.performed_at_date).slice(0, 10) : null,
                version: r.version != null ? Number(r.version) : null,
              }
              : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const doneThisMonth = cards.filter((w) => w.stage === "done" && (w.performedAtDate ?? "") >= monthStart).length;

      return c.json({
        tiles: {
          atGarage: cards.filter((w) => w.stage === "garage").length,
          waiting: cards.filter((w) => w.stage === "waiting").length,
          doneThisMonth,
          needsDecision: cards.filter((w) => w.stage === "decision").length,
        },
        open: cards.filter((w) => w.stage === "decision" || w.stage === "waiting" || w.stage === "garage" || w.stage === "saving"),
        done: cards.filter((w) => w.stage === "done").slice(0, 50),
        cancelled: cards.filter((w) => w.stage === "cancelled").slice(0, 50),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
