/**
 * Roam Fleet product-admin — Maintenance schedule ledger APIs (roamfleet.co/admin).
 * Cross-customer ops view of service truth (not finance). requireProductAdmin only.
 */
import type { Context } from "npm:hono";
import { requireProductAdmin } from "./product_admin_guard.ts";
import { analyzeComponentRowStatus } from "./maintenance_service_ledger_core.ts";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type OrgMaintRollup = {
  orgId: string;
  vehicleCount: number;
  ledgerEntries: number;
  outstandingCount: number;
  overdueCount: number;
  scheduleRows: number;
};

function emptyRollup(orgId: string): OrgMaintRollup {
  return {
    orgId,
    vehicleCount: 0,
    ledgerEntries: 0,
    outstandingCount: 0,
    overdueCount: 0,
    scheduleRows: 0,
  };
}

/** Best-effort odometer map for vehicles belonging to an org (KV). */
async function loadOrgVehicleOdo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any,
  orgId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const list: unknown[] = (await kv.getByPrefix("vehicle:")) || [];
    for (const raw of list) {
      const v = raw as Record<string, unknown>;
      if (!v || typeof v !== "object") continue;
      const vid = String(v.id ?? "");
      if (!vid) continue;
      const org = String(v.organizationId ?? v.organization_id ?? "");
      if (org && org !== orgId) continue;
      if (!org) continue; // require org stamp for admin attribution
      const odo = Number((v.metrics as { odometer?: number } | undefined)?.odometer ?? v.odometer ?? 0);
      out.set(vid, Number.isFinite(odo) ? odo : 0);
    }
  } catch {
    /* ignore — date-based outstanding still works */
  }
  return out;
}

async function buildByOrgMaintenanceRollup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ orgs: OrgMaintRollup[]; totals: Omit<OrgMaintRollup, "orgId"> }> {
  const today = todayIso();
  const orgs = new Map<string, OrgMaintRollup>();
  const ensure = (orgId: string) => {
    let row = orgs.get(orgId);
    if (!row) {
      row = emptyRollup(orgId);
      orgs.set(orgId, row);
    }
    return row;
  };

  const { data: ledgerRows } = await supabase
    .from("maintenance_service_ledger")
    .select("organization_id, vehicle_id")
    .is("voided_at", null);

  const vehiclesByOrg = new Map<string, Set<string>>();
  for (const r of ledgerRows || []) {
    const orgId = String(r.organization_id ?? "").trim();
    if (!orgId) continue;
    const row = ensure(orgId);
    row.ledgerEntries += 1;
    const vid = String(r.vehicle_id ?? "");
    if (!vid) continue;
    if (!vehiclesByOrg.has(orgId)) vehiclesByOrg.set(orgId, new Set());
    vehiclesByOrg.get(orgId)!.add(vid);
  }

  const { data: scheduleRows } = await supabase
    .from("vehicle_component_schedule")
    .select(
      "organization_id, vehicle_id, next_due_miles, next_due_miles_max, next_due_date, schedule_status, last_performed_miles",
    );

  for (const r of scheduleRows || []) {
    const orgId = String(r.organization_id ?? "").trim();
    if (!orgId) continue;
    const row = ensure(orgId);
    row.scheduleRows += 1;
    const vid = String(r.vehicle_id ?? "");
    if (vid) {
      if (!vehiclesByOrg.has(orgId)) vehiclesByOrg.set(orgId, new Set());
      vehiclesByOrg.get(orgId)!.add(vid);
    }
    // Prefer date; for miles use last_performed as weak floor only when no date
    const proxyOdo =
      r.last_performed_miles != null && Number.isFinite(Number(r.last_performed_miles))
        ? Number(r.last_performed_miles)
        : 0;
    const st = analyzeComponentRowStatus(proxyOdo, today, {
      next_due_miles: r.next_due_miles != null ? Number(r.next_due_miles) : null,
      next_due_miles_max: r.next_due_miles_max != null ? Number(r.next_due_miles_max) : null,
      next_due_date: r.next_due_date != null ? String(r.next_due_date) : null,
      schedule_status: r.schedule_status != null ? String(r.schedule_status) : null,
    });
    // Miles-only rows with proxyOdo == last_performed will almost never show due;
    // rely on next_due_date when present. Also flag date overdue/pending.
    if (st === "overdue") {
      row.overdueCount += 1;
      row.outstandingCount += 1;
    } else if (st === "pending") {
      row.outstandingCount += 1;
    } else if (r.next_due_date == null && r.next_due_miles != null) {
      // Miles due unknown without live odo — count as tracked only
    }
  }

  for (const [orgId, vids] of vehiclesByOrg) {
    ensure(orgId).vehicleCount = vids.size;
  }

  const list = [...orgs.values()].sort((a, b) => b.outstandingCount - a.outstandingCount);
  const totals = {
    vehicleCount: list.reduce((s, r) => s + r.vehicleCount, 0),
    ledgerEntries: list.reduce((s, r) => s + r.ledgerEntries, 0),
    outstandingCount: list.reduce((s, r) => s + r.outstandingCount, 0),
    overdueCount: list.reduce((s, r) => s + r.overdueCount, 0),
    scheduleRows: list.reduce((s, r) => s + r.scheduleRows, 0),
  };
  return { orgs: list, totals };
}

export function registerFleetAdminMaintenanceLedgerRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any,
) {
  app.get("/make-server-37f42386/fleet-admin/maintenance-ledger/overview", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const rollup = await buildByOrgMaintenanceRollup(supabase);
      return c.json({
        status: rollup.totals.overdueCount > 0 ? "attention" : "healthy",
        ...rollup.totals,
        customerCount: rollup.orgs.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/make-server-37f42386/fleet-admin/maintenance-ledger/by-org", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      return c.json(await buildByOrgMaintenanceRollup(supabase));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get(
    "/make-server-37f42386/fleet-admin/maintenance-ledger/orgs/:orgId",
    async (c: Context) => {
      try {
        const auth = await requireProductAdmin(c, "fleet");
        if (auth instanceof Response) return auth;
        const orgId = String(c.req.param("orgId") || "").trim();
        if (!orgId) return c.json({ error: "orgId required" }, 400);
        const today = todayIso();
        const odoMap = await loadOrgVehicleOdo(kv, orgId);

        const { data: schedules, error: schErr } = await supabase
          .from("vehicle_component_schedule")
          .select(
            "id, vehicle_id, category_id, position, last_performed_miles, last_performed_date, next_due_miles, next_due_miles_max, next_due_date, schedule_status, category:maintenance_service_categories(id, code, name)",
          )
          .eq("organization_id", orgId);
        if (schErr) throw schErr;

        const outstanding = [];
        for (const r of schedules || []) {
          const vid = String(r.vehicle_id);
          const odo =
            odoMap.get(vid) ??
            (r.last_performed_miles != null ? Number(r.last_performed_miles) : 0);
          const st = analyzeComponentRowStatus(odo, today, {
            next_due_miles: r.next_due_miles != null ? Number(r.next_due_miles) : null,
            next_due_miles_max: r.next_due_miles_max != null ? Number(r.next_due_miles_max) : null,
            next_due_date: r.next_due_date != null ? String(r.next_due_date) : null,
            schedule_status: r.schedule_status != null ? String(r.schedule_status) : null,
          });
          if (st !== "pending" && st !== "overdue") continue;
          const cat = r.category as { code?: string; name?: string } | null;
          outstanding.push({
            vehicleId: vid,
            categoryId: String(r.category_id),
            categoryCode: cat?.code ?? "",
            categoryName: cat?.name ?? "",
            position: r.position != null ? String(r.position) : null,
            status: st,
            lastPerformedDate: r.last_performed_date
              ? String(r.last_performed_date).slice(0, 10)
              : null,
            lastPerformedMiles:
              r.last_performed_miles != null ? Number(r.last_performed_miles) : null,
            nextDueMiles: r.next_due_miles != null ? Number(r.next_due_miles) : null,
            nextDueDate: r.next_due_date != null ? String(r.next_due_date).slice(0, 10) : null,
          });
        }

        const { data: history, error: histErr } = await supabase
          .from("maintenance_service_ledger")
          .select(
            "id, vehicle_id, performed_at_date, performed_at_miles, category_code, category_name, position, action, created_at",
          )
          .eq("organization_id", orgId)
          .is("voided_at", null)
          .order("performed_at_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100);
        if (histErr) throw histErr;

        const vehicles = new Set<string>();
        for (const r of schedules || []) vehicles.add(String(r.vehicle_id));
        for (const r of history || []) vehicles.add(String(r.vehicle_id));

        return c.json({
          orgId,
          vehicleCount: vehicles.size,
          outstanding,
          history: (history || []).map((r: Record<string, unknown>) => ({
            id: r.id,
            vehicleId: r.vehicle_id,
            performedAtDate: r.performed_at_date,
            performedAtMiles: r.performed_at_miles != null ? Number(r.performed_at_miles) : null,
            categoryCode: r.category_code,
            categoryName: r.category_name,
            position: r.position,
            action: r.action,
            createdAt: r.created_at,
          })),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
