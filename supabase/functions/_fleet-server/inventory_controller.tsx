/**
 * Fleet inventory & asset management HTTP surface (audit §6.5).
 * Mounted under /make-server-37f42386/inventory by fleet-core.
 */
import { Hono, type Context } from "npm:hono@4.3.11";
import {
  requireAuth,
  requirePermission,
  PLATFORM_RESOLVED_ROLES,
  type RbacUser,
} from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { invDb, invRpcName } from "./inventory_db.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { registerInventoryExtendedRoutes } from "./inventory_controller_extended.ts";
import {
  handleDriverCarKitGet,
  handleDriverKitCheckPost,
  handleDriverReportPost,
  handleDriverReportsGet,
} from "./inventory_driver_portal.ts";

type InvEnv = {
  Variables: {
    rbacUser?: RbacUser;
  };
};
type InvCtx = Context<InvEnv>;

const app = new Hono<InvEnv>();
app.use("*", requireAuth({ strict: true }));

const PREFIX = "/make-server-37f42386/inventory";
const PAGE = 50;

function fleetDb() {
  return invDb();
}

function platformUser(c: InvCtx): boolean {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return Boolean(user && PLATFORM_RESOLVED_ROLES.has(user.resolvedRole));
}

function orgOrForbid(c: InvCtx): string | Response {
  const orgId = getOrgId(c);
  if (!orgId && !platformUser(c)) {
    return c.json({ error: "Organization required" }, 403);
  }
  if (!orgId) {
    return c.json({ error: "Organization required" }, 403);
  }
  return orgId;
}

function readIdempotencyKey(c: InvCtx): string | null {
  const raw = c.req.header("Idempotency-Key") || c.req.header("idempotency-key");
  const key = raw?.trim();
  return key || null;
}

function requireIdempotencyKey(c: InvCtx): string | Response {
  const key = readIdempotencyKey(c);
  if (!key) {
    return c.json({ error: "Idempotency-Key header required" }, 400);
  }
  return key;
}

function pageParams(c: InvCtx): { limit: number; offset: number } {
  const limit = Math.min(PAGE, Math.max(1, Number(c.req.query("limit") || PAGE) || PAGE));
  const cursor = Math.max(0, Number(c.req.query("cursor") || 0) || 0);
  return { limit, offset: cursor };
}

function pagedResponse<T>(
  items: T[],
  offset: number,
  limit: number,
  extra?: Record<string, unknown>,
) {
  const nextCursor = items.length === limit ? String(offset + limit) : null;
  return { items, nextCursor, limit, offset, ...extra };
}

async function rpcJson(
  c: InvCtx,
  fn: string,
  args: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { data, error } = await fleetDb().rpc(invRpcName(fn), args);
  if (error) {
    const msg = error.message || String(error);
    if (/not found|forbidden org/i.test(msg)) {
      return c.json({ error: msg }, 404);
    }
    if (/reason required|must be positive|insufficient/i.test(msg)) {
      return c.json({ error: msg }, 409);
    }
    console.error(`[inventory] rpc ${fn} failed:`, msg);
    return c.json({ error: msg }, 500);
  }
  return (data ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Overview / stock
// ---------------------------------------------------------------------------

app.get(`${PREFIX}/overview`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const db = fleetDb();

    const [stockKpis, alerts, chain] = await Promise.all([
      db.from("fleet_inv_v_stock_kpis").select("*").eq("organization_id", org).maybeSingle(),
      db.from("fleet_inv_v_alerts_tiles").select("*").eq("organization_id", org).maybeSingle(),
      db.from("fleet_inv_chain_check").select("*").eq("organization_id", org)
        .order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const { data: compliance } = await db.from("fleet_inv_v_kit_compliance").select("vehicle_id, line_status")
      .eq("organization_id", org);

    const vehicles = new Set((compliance ?? []).map((r) => String(r.vehicle_id)));
    const lines = compliance ?? [];
    const okLines = lines.filter((r) => String(r.line_status) === "ok").length;
    const avgScore = lines.length ? Math.round((okLines / lines.length) * 1000) / 10 : null;

    return c.json({
      stockKpis: stockKpis.data ?? null,
      alerts: alerts.data ?? null,
      chainCheck: chain.data ?? null,
      kitCompleteness: {
        activeVehicles: vehicles.size,
        averageScorePct: avgScore,
      },
    });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.overview");
  }
});

app.get(`${PREFIX}/stock`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { limit, offset } = pageParams(c);
    const locationId = c.req.query("location_id");
    const q = c.req.query("q");

    let query = fleetDb().from("fleet_inv_v_stock").select("*", { count: "exact" })
      .eq("organization_id", org)
      .order("sku", { ascending: true })
      .range(offset, offset + limit - 1);

    if (locationId) query = query.eq("location_id", locationId);
    if (q) query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) return c.json({ error: error.message }, 500);

    return c.json(pagedResponse(data ?? [], offset, limit, { total: count ?? undefined }));
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.stock");
  }
});

app.get(`${PREFIX}/stock/kpis`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_stock_kpis").select("*")
      .eq("organization_id", org).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ kpis: data ?? null });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.stock.kpis");
  }
});

// ---------------------------------------------------------------------------
// Items CRUD
// ---------------------------------------------------------------------------

app.get(`${PREFIX}/items`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { limit, offset } = pageParams(c);
    const q = c.req.query("q");

    let query = fleetDb().from("fleet_inv_item").select("*", { count: "exact" })
      .eq("organization_id", org)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json(pagedResponse(data ?? [], offset, limit, { total: count ?? undefined }));
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.items.list");
  }
});

app.get(`${PREFIX}/items/:id`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const id = c.req.param("id");
    const { data, error } = await fleetDb().from("fleet_inv_item").select("*")
      .eq("organization_id", org).eq("id", id).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ item: data });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.items.get");
  }
});

app.post(`${PREFIX}/items`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const row = {
      organization_id: org,
      sku: String(body.sku || "").trim(),
      name: String(body.name || "").trim(),
      description: body.description ?? null,
      tracking: body.tracking ?? body.tracking_mode ?? "quantity",
      category_id: body.category_id ?? null,
      idempotency_key: idem,
    };
    if (!row.sku || !row.name) {
      return c.json({ error: "sku and name required" }, 400);
    }
    const { data, error } = await fleetDb().from("fleet_inv_item").insert(row).select("*").single();
    if (error) return c.json({ error: error.message }, 409);
    return c.json({ item: data }, 201);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.items.create");
  }
});

app.patch(`${PREFIX}/items/:id`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const id = c.req.param("id");
    const body = await c.req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["name", "description", "tracking", "category_id", "min_qty", "reorder_qty"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await fleetDb().from("fleet_inv_item").update(patch)
      .eq("organization_id", org).eq("id", id).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ item: data });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.items.patch");
  }
});

app.delete(`${PREFIX}/items/:id`, requirePermission("inventory.adjust"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const id = c.req.param("id");
    const { data, error } = await fleetDb().from("fleet_inv_item").update({
      archived_at: new Date().toISOString(),
    }).eq("organization_id", org).eq("id", id).select("id").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ archived: true, id: data.id });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.items.delete");
  }
});

// ---------------------------------------------------------------------------
// Movements (read) + write RPCs
// ---------------------------------------------------------------------------

app.get(`${PREFIX}/movements`, requirePermission("inventory.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { limit, offset } = pageParams(c);
    const type = c.req.query("type");

    let query = fleetDb().from("fleet_inv_movement").select("*", { count: "exact" })
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (type) query = query.eq("type", type);

    const { data, error, count } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json(pagedResponse(data ?? [], offset, limit, { total: count ?? undefined }));
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.movements");
  }
});

app.post(`${PREFIX}/receive`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_receive", {
      p_org_id: org,
      p_receipt: body.receipt ?? {},
      p_lines: body.lines ?? [],
      p_costs: body.costs ?? [],
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.receive");
  }
});

app.post(`${PREFIX}/issue/preview`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_issue_to_vehicles", {
      p_org_id: org,
      p_source_location_id: body.source_location_id,
      p_lines: body.lines ?? [],
      p_vehicle_ids: body.vehicle_ids ?? [],
      p_issue_available_only: Boolean(body.issue_available_only),
      p_dry_run: true,
      p_idempotency_key: null,
    });
    if (result instanceof Response) return result;
    return c.json({ preview: result });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.issue.preview");
  }
});

app.post(`${PREFIX}/issue`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_issue_to_vehicles", {
      p_org_id: org,
      p_source_location_id: body.source_location_id,
      p_lines: body.lines ?? [],
      p_vehicle_ids: body.vehicle_ids ?? [],
      p_issue_available_only: Boolean(body.issue_available_only),
      p_dry_run: false,
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.issue");
  }
});

app.post(`${PREFIX}/transfer`, requirePermission("inventory.move"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_transfer", {
      p_org_id: org,
      p_item_id: body.item_id,
      p_from_location_id: body.from_location_id,
      p_to_location_id: body.to_location_id,
      p_bin_from: body.from_bin_id ?? null,
      p_bin_to: body.to_bin_id ?? null,
      p_qty: body.qty,
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.transfer");
  }
});

app.post(`${PREFIX}/adjust`, requirePermission("inventory.adjust"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_adjust", {
      p_org_id: org,
      p_item_id: body.item_id,
      p_location_id: body.location_id,
      p_bin_id: body.bin_id ?? null,
      p_qty_delta: body.qty_delta,
      p_unit_cost: body.unit_cost ?? null,
      p_reason: body.reason,
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.adjust");
  }
});

app.post(`${PREFIX}/reverse`, requirePermission("inventory.approve"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_reverse", {
      p_org_id: org,
      p_movement_id: body.movement_id,
      p_reason: body.reason,
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.reverse");
  }
});

app.post(`${PREFIX}/opening-balance`, requirePermission("inventory.adjust"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_opening_balance", {
      p_org_id: org,
      p_lines: body.lines ?? [],
      p_idempotency_key: idem,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.opening-balance");
  }
});

app.post(`${PREFIX}/ledger/verify`, requirePermission("inventory.export"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const result = await rpcJson(c, "inv_verify_chain", { p_org_id: org });
    if (result instanceof Response) return result;
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.ledger.verify");
  }
});

// ---------------------------------------------------------------------------
// Kits / compliance stubs (Phase 3+)
// ---------------------------------------------------------------------------

app.get(`${PREFIX}/kits/compliance`, requirePermission("inventory.view"), async (c) => {
  const org = orgOrForbid(c);
  if (org instanceof Response) return org;
  const { limit, offset } = pageParams(c);
  const { data, error } = await fleetDb().from("fleet_inv_v_kit_compliance").select("*")
    .eq("organization_id", org)
    .range(offset, offset + limit - 1);
  if (error) return c.json({ error: error.message }, 500);
  return c.json(pagedResponse(data ?? [], offset, limit, { stub: false }));
});

app.get(`${PREFIX}/kits/compliance/timeline`, requirePermission("inventory.view"), async (c) => {
  const org = orgOrForbid(c);
  if (org instanceof Response) return org;
  return c.json({
    stub: true,
    organizationId: org,
    message: "Compliance timeline ships with fleet_inventory_phase3_kits",
    points: [],
  });
});

// ---------------------------------------------------------------------------
// Driver portal stubs
// ---------------------------------------------------------------------------

app.get(`${PREFIX}/driver/car-kit`, requirePermission("inventory.report"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    return await handleDriverCarKitGet(c, org);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.car-kit");
  }
});

app.get(`${PREFIX}/driver/reports`, requirePermission("inventory.report"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { limit, offset } = pageParams(c);
    return await handleDriverReportsGet(c, org, offset, limit);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.reports.list");
  }
});

app.post(`${PREFIX}/driver/reports`, requirePermission("inventory.report"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    return await handleDriverReportPost(c, org, idem);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.reports.create");
  }
});

app.post(`${PREFIX}/driver/reports/:id/resolve`, requirePermission("inventory.approve"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const reportId = c.req.param("id");
    const body = await c.req.json() as Record<string, unknown>;
    const mode = String(body.mode ?? "fixed_without_stock");
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: "fixed",
      fixed_at: now,
      fleet_reply: body.note ?? body.fleet_reply ?? null,
      driver_liability: Boolean(body.driver_liability),
    };
    const { data, error } = await invDb().from("fleet_inv_driver_report").update(patch)
      .eq("organization_id", org).eq("id", reportId).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({
      report: data,
      mode,
      payrollDeductionPosted: Boolean(body.payroll_deduction && body.driver_liability),
      liabilityLabel: body.payroll_deduction && body.driver_liability
        ? "Driver payroll deduction"
        : "Driver marked responsible",
    });
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.reports.resolve");
  }
});

app.post(`${PREFIX}/driver/reports/:id/updates`, requirePermission("inventory.report"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    const { handleDriverReportUpdatePost } = await import("./inventory_driver_portal.ts");
    return await handleDriverReportUpdatePost(c, org, c.req.param("id"), idem);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.reports.updates");
  }
});

app.post(`${PREFIX}/driver/kit-check`, requirePermission("inventory.report"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const idem = requireIdempotencyKey(c);
    if (idem instanceof Response) return idem;
    return await handleDriverKitCheckPost(c, org, idem);
  } catch (e) {
    return safeErrorResponse(c, e, "inventory.driver.kit-check");
  }
});

app.get(`${PREFIX}/assets/:id/diagnostics`, requirePermission("inventory.view"), async (c) => {
  const org = orgOrForbid(c);
  if (org instanceof Response) return org;
  const assetId = c.req.param("id");
  const { getTelematicsProvider } = await import("./inventory_telematics_provider.ts");
  const provider = getTelematicsProvider();
  const diagnostics = await provider.getDiagnostics(org, [assetId]);
  return c.json({
    assetId,
    rows: diagnostics[assetId] ?? [],
    connected: diagnostics[assetId]?.length > 0,
  });
});

registerInventoryExtendedRoutes(app);

export default app;
