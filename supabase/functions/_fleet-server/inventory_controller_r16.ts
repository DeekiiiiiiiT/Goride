/**
 * R16 gap-screen HTTP routes (audit Rev 16, Rev 52 cutdown).
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import { requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { invDb } from "./inventory_db.ts";
import { safeErrorResponse } from "./safe_error.ts";

type InvEnv = { Variables: { rbacUser?: RbacUser } };
type InvCtx = Context<InvEnv>;

const PREFIX = "/make-server-37f42386/inventory";

function fleetDb() {
  return invDb();
}

function orgOrForbid(c: InvCtx): string | Response {
  const orgId = getOrgId(c);
  if (!orgId) return c.json({ error: "Organization required" }, 403);
  return orgId;
}

async function hasStockAtLocation(org: string, locationId: string): Promise<boolean> {
  const { data } = await fleetDb().from("fleet_inv_balance").select("on_hand")
    .eq("organization_id", org).eq("location_id", locationId).gt("on_hand", 0).limit(1);
  return (data?.length ?? 0) > 0;
}

export function registerInventoryR16Routes(app: Hono<InvEnv>) {
  app.get(`${PREFIX}/settings`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_settings").select("*")
      .eq("organization_id", org).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data ?? null });
  });

  app.put(`${PREFIX}/settings`, requirePermission("inventory.adjust"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const body = await c.req.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["safety_notice_text", "fleet_support_phone"]) {
        if (key in body) patch[key] = body[key];
      }
      const { data, error } = await fleetDb().from("fleet_inv_settings").update(patch)
        .eq("organization_id", org).select("*").maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ settings: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.settings.put");
    }
  });

  app.get(`${PREFIX}/categories`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_category").select("*")
      .eq("organization_id", org).is("archived_at", null).order("sort_order");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/categories`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const { data, error } = await fleetDb().from("fleet_inv_category").insert({
      organization_id: org,
      name: String(body.name ?? "Category"),
      parent_id: body.parent_id ?? null,
      sort_order: Number(body.sort_order ?? 0),
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ category: data });
  });

  app.patch(`${PREFIX}/categories/:id`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const id = c.req.param("id");
    const body = await c.req.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("name" in body) patch.name = body.name;
    if ("sort_order" in body) patch.sort_order = body.sort_order;
    if (body.archive === true) patch.archived_at = new Date().toISOString();
    if (body.archive === false) patch.archived_at = null;
    const { data, error } = await fleetDb().from("fleet_inv_category").update(patch)
      .eq("organization_id", org).eq("id", id).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ category: data });
  });

  app.get(`${PREFIX}/locations`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data: locations, error } = await fleetDb().from("fleet_inv_location").select("*")
      .eq("organization_id", org).eq("is_active", true);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ locations: locations ?? [], bins: [] });
  });

  app.post(`${PREFIX}/locations`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const { data, error } = await fleetDb().from("fleet_inv_location").insert({
      organization_id: org,
      code: String(body.code ?? "").toUpperCase(),
      name: String(body.name ?? body.code ?? "Location"),
      kind: body.kind ?? "warehouse",
      address: body.address ?? null,
      is_active: true,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ location: data });
  });

  app.patch(`${PREFIX}/locations/:id`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const id = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      if (body.is_active === false || body.archive === true) {
        if (await hasStockAtLocation(org, id)) {
          return c.json({ error: "Cannot archive location while stock remains" }, 409);
        }
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["name", "code", "address", "kind", "is_active", "is_secure"]) {
        if (key in body) patch[key] = body[key];
      }
      if (body.archive === true) patch.is_active = false;
      const { data, error } = await fleetDb().from("fleet_inv_location").update(patch)
        .eq("organization_id", org).eq("id", id).select("*").maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ location: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.locations.patch");
    }
  });

  app.get(`${PREFIX}/alert-rules`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_alert_rule").select("*")
      .eq("organization_id", org).order("alert_type");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ rules: data ?? [] });
  });

  app.put(`${PREFIX}/alert-rules`, requirePermission("inventory.adjust"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const body = await c.req.json() as { rules?: Record<string, unknown>[] };
      const rules = body.rules ?? [];
      for (const row of rules) {
        const alertType = String(row.alert_type ?? "");
        if (!alertType) continue;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ("can_snooze" in row) patch.can_snooze = row.can_snooze;
        if ("default_snooze_days" in row) patch.default_snooze_days = row.default_snooze_days;
        if ("severity" in row) patch.severity = row.severity;
        const { error } = await fleetDb().from("fleet_inv_alert_rule").update(patch)
          .eq("organization_id", org).eq("alert_type", alertType);
        if (error) return c.json({ error: error.message }, 500);
      }
      const { data, error: readErr } = await fleetDb().from("fleet_inv_alert_rule").select("*")
        .eq("organization_id", org).order("alert_type");
      if (readErr) return c.json({ error: readErr.message }, 500);
      return c.json({ rules: data ?? [] });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.alert-rules.put");
    }
  });
}

export async function assertAlertSnoozeAllowed(org: string, alertId: string): Promise<string | null> {
  const { data: alert } = await fleetDb().from("fleet_inv_alert").select("type").eq("organization_id", org).eq("id", alertId).maybeSingle();
  if (!alert?.type) return null;
  const { data: rule } = await fleetDb().from("fleet_inv_alert_rule").select("can_snooze")
    .eq("organization_id", org).eq("alert_type", alert.type).maybeSingle();
  if (rule && rule.can_snooze === false) return "This alert type cannot be snoozed";
  return null;
}
