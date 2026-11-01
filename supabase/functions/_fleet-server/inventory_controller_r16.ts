/**
 * R16 gap-screen HTTP routes (audit Rev 16).
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

function actorId(c: InvCtx): string | null {
  return (c.get("rbacUser") as RbacUser | undefined)?.userId ?? null;
}

const OPEN_PO_STATUSES = ["draft", "awaiting_approval", "ordered", "part_received", "received", "staged"];

async function hasStockAtLocation(org: string, locationId: string): Promise<boolean> {
  const { data } = await fleetDb().from("fleet_inv_balance").select("on_hand")
    .eq("organization_id", org).eq("location_id", locationId).gt("on_hand", 0).limit(1);
  return (data?.length ?? 0) > 0;
}

async function hasStockAtBin(org: string, binId: string): Promise<boolean> {
  const { data } = await fleetDb().from("fleet_inv_balance").select("on_hand")
    .eq("organization_id", org).eq("bin_id", binId).gt("on_hand", 0).limit(1);
  return (data?.length ?? 0) > 0;
}

async function vendorHasOpenPo(org: string, vendorId: string): Promise<boolean> {
  const { data } = await fleetDb().from("fleet_inv_purchase_order").select("id")
    .eq("organization_id", org).eq("vendor_id", vendorId).in("status", OPEN_PO_STATUSES).limit(1);
  return (data?.length ?? 0) > 0;
}

async function loadApproval(org: string, id: string) {
  const { data, error } = await fleetDb().from("fleet_inv_approval").select("*")
    .eq("organization_id", org).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

function approverGuard(c: InvCtx, approval: Record<string, unknown>): Response | null {
  const actor = actorId(c);
  const requestedBy = approval.requested_by as string | null;
  if (actor && requestedBy && actor === requestedBy) {
    return c.json({ error: "Approver must differ from requester" }, 409);
  }
  return null;
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
      for (const key of [
        "safety_notice_text", "fleet_support_phone", "monthly_procurement_cap_jmd",
        "fiscal_year_start_month", "approval_threshold_jmd", "approval_rule_code",
        "approval_rule_name", "write_off_rule_code", "scrap_note",
      ]) {
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
    const { data: bins } = await fleetDb().from("fleet_inv_bin").select("*").eq("organization_id", org);
    return c.json({ locations: locations ?? [], bins: bins ?? [] });
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
      for (const key of ["name", "code", "address", "kind", "is_active"]) {
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

  app.post(`${PREFIX}/bins`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const { data, error } = await fleetDb().from("fleet_inv_bin").insert({
      organization_id: org,
      location_id: body.location_id,
      code: String(body.code ?? "").toUpperCase(),
      name: body.name ?? body.code ?? null,
      zone: body.zone ?? null,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ bin: data });
  });

  app.patch(`${PREFIX}/bins/:id`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const id = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      if (body.archive === true) {
        if (await hasStockAtBin(org, id)) {
          return c.json({ error: "Cannot archive bin while stock remains" }, 409);
        }
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["code", "name", "zone", "capacity_units"]) {
        if (key in body) patch[key] = body[key];
      }
      const { data, error } = await fleetDb().from("fleet_inv_bin").update(patch)
        .eq("organization_id", org).eq("id", id).select("*").maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ bin: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.bins.patch");
    }
  });

  app.post(`${PREFIX}/vendors`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const { data, error } = await fleetDb().from("fleet_inv_vendor").insert({
      organization_id: org,
      name: String(body.name ?? "Vendor"),
      phone: body.phone ?? null,
      email: body.email ?? null,
      description: body.description ?? null,
      tags: body.tags ?? [],
      is_active: true,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ vendor: data });
  });

  app.patch(`${PREFIX}/vendors/:id`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const id = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      if (body.is_active === false || body.archive === true) {
        if (await vendorHasOpenPo(org, id)) {
          return c.json({ error: "Cannot archive vendor while a purchase order is open" }, 409);
        }
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["name", "phone", "email", "description", "tags", "lead_time_days", "is_active"]) {
        if (key in body) patch[key] = body[key];
      }
      const { data, error } = await fleetDb().from("fleet_inv_vendor").update(patch)
        .eq("organization_id", org).eq("id", id).select("*").maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ vendor: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.vendors.patch");
    }
  });

  app.post(`${PREFIX}/purchase-orders`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const { data: po, error } = await fleetDb().from("fleet_inv_purchase_order").insert({
      organization_id: org,
      number: String(body.number ?? `PO-${suffix}`),
      vendor_id: body.vendor_id ?? null,
      ship_to_location_id: body.ship_to_location_id ?? null,
      status: "draft",
      initiated_by: actorId(c),
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    const lines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : [];
    if (lines.length) {
      await fleetDb().from("fleet_inv_purchase_order_line").insert(
        lines.map((line) => ({
          organization_id: org,
          po_id: po.id,
          item_id: line.item_id,
          qty_ordered: line.qty_ordered ?? line.qty ?? 1,
          unit_price: line.unit_price ?? null,
        })),
      );
    }
    return c.json({ po });
  });

  app.patch(`${PREFIX}/purchase-orders/:id`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const { data: existing, error: loadErr } = await fleetDb().from("fleet_inv_purchase_order").select("*")
        .eq("organization_id", org).eq("id", poId).maybeSingle();
      if (loadErr) return c.json({ error: loadErr.message }, 500);
      if (!existing) return c.json({ error: "Not found" }, 404);
      if (existing.status !== "draft") {
        return c.json({ error: "Only draft purchase orders can be edited" }, 409);
      }
      const body = await c.req.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["vendor_id", "ship_to_location_id", "expected_at"]) {
        if (key in body) patch[key] = body[key];
      }
      const { data: po, error } = await fleetDb().from("fleet_inv_purchase_order").update(patch)
        .eq("organization_id", org).eq("id", poId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      if (Array.isArray(body.lines)) {
        await fleetDb().from("fleet_inv_purchase_order_line").delete().eq("organization_id", org).eq("po_id", poId);
        const lines = body.lines as Record<string, unknown>[];
        if (lines.length) {
          await fleetDb().from("fleet_inv_purchase_order_line").insert(
            lines.map((line) => ({
              organization_id: org,
              po_id: poId,
              item_id: line.item_id,
              qty_ordered: line.qty_ordered ?? line.qty ?? 1,
              unit_price: line.unit_price ?? null,
            })),
          );
        }
      }
      if (Array.isArray(body.extra_costs)) {
        await fleetDb().from("fleet_inv_po_cost").delete().eq("organization_id", org).eq("po_id", poId);
        const costs = body.extra_costs as Record<string, unknown>[];
        if (costs.length) {
          await fleetDb().from("fleet_inv_po_cost").insert(
            costs.map((row) => ({
              organization_id: org,
              po_id: poId,
              kind: row.kind ?? "freight",
              label: row.label ?? null,
              payee: row.payee ?? null,
              amount: row.amount ?? 0,
            })),
          );
        }
      }
      return c.json({ po });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.patch");
    }
  });

  app.post(`${PREFIX}/counts`, requirePermission("inventory.adjust"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const code = String(body.code ?? `CNT-${Date.now().toString(36).toUpperCase()}`);
    const { data, error } = await fleetDb().from("fleet_inv_count_session").insert({
      organization_id: org,
      code,
      location_id: body.location_id,
      bins: body.bin_ids ?? body.bins ?? [],
      blind: body.blind ?? true,
      assignee_ids: body.assignee_ids ?? [],
      status: "open",
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ session: data });
  });

  app.put(`${PREFIX}/counts/:id/lines`, requirePermission("inventory.adjust"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const sessionId = c.req.param("id");
    const body = await c.req.json() as Record<string, unknown>;
    const lines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : [];
    for (const line of lines) {
      const row = {
        organization_id: org,
        session_id: sessionId,
        item_id: line.item_id,
        bin_id: line.bin_id ?? null,
        expected_qty: line.expected_qty ?? null,
        counted_qty: line.counted_qty ?? null,
        reason: line.reason ?? null,
      };
      if (line.id) {
        await fleetDb().from("fleet_inv_count_line").update(row)
          .eq("organization_id", org).eq("id", line.id);
      } else {
        await fleetDb().from("fleet_inv_count_line").insert(row);
      }
    }
    return c.json({ ok: true, sessionId, lineCount: lines.length });
  });

  app.get(`${PREFIX}/approvals`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const status = c.req.query("status") ?? "pending";
    const { data, error } = await fleetDb().from("fleet_inv_approval").select("*")
      .eq("organization_id", org).eq("status", status).order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/approvals/:id/approve`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const id = c.req.param("id");
      const approval = await loadApproval(org, id);
      if (!approval) return c.json({ error: "Not found" }, 404);
      if (approval.status !== "pending") return c.json({ error: "Not pending" }, 409);
      const guard = approverGuard(c, approval);
      if (guard) return guard;
      const now = new Date().toISOString();
      const { error } = await fleetDb().from("fleet_inv_approval").update({
        status: "approved",
        approved_by: actorId(c),
        decided_at: now,
      }).eq("organization_id", org).eq("id", id);
      if (error) return c.json({ error: error.message }, 500);
      const subjectType = String(approval.subject_type);
      const subjectId = String(approval.subject_id);
      if (subjectType === "count") {
        await fleetDb().from("fleet_inv_count_session").update({
          status: "reconciled",
          approved_by: actorId(c),
        }).eq("organization_id", org).eq("id", subjectId);
      }
      if (subjectType === "po") {
        await fleetDb().from("fleet_inv_purchase_order").update({
          status: "ordered",
          approved_by: actorId(c),
          approved_at: now,
        }).eq("organization_id", org).eq("id", subjectId);
      }
      return c.json({ ok: true, approvalId: id, status: "approved" });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.approvals.approve");
    }
  });

  app.post(`${PREFIX}/approvals/:id/reject`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const id = c.req.param("id");
      const approval = await loadApproval(org, id);
      if (!approval) return c.json({ error: "Not found" }, 404);
      if (approval.status !== "pending") return c.json({ error: "Not pending" }, 409);
      const guard = approverGuard(c, approval);
      if (guard) return guard;
      const { error } = await fleetDb().from("fleet_inv_approval").update({
        status: "rejected",
        approved_by: actorId(c),
        decided_at: new Date().toISOString(),
      }).eq("organization_id", org).eq("id", id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true, approvalId: id, status: "rejected" });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.approvals.reject");
    }
  });

  app.post(`${PREFIX}/requisitions/:id/approve`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_requisition").update({ status: "approved" })
      .eq("organization_id", org).eq("id", c.req.param("id")).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ requisition: data });
  });

  app.post(`${PREFIX}/requisitions/:id/reject`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_requisition").update({ status: "rejected" })
      .eq("organization_id", org).eq("id", c.req.param("id")).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ requisition: data });
  });

  app.post(`${PREFIX}/requisitions/:id/issue`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_requisition").update({ status: "issued" })
      .eq("organization_id", org).eq("id", c.req.param("id")).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ requisition: data, issueFlow: "open_issue_dialog" });
  });

  app.post(`${PREFIX}/scanners/:id/regenerate`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const id = c.req.param("id");
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const expires = new Date(Date.now() + 86400000).toISOString();
    const { data, error } = await fleetDb().from("fleet_inv_scan_device").update({
      pairing_code: code,
      pairing_expires_at: expires,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", org).eq("id", id).select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ device: data, pairingCode: code, pairingExpiresAt: expires });
  });

  app.delete(`${PREFIX}/scanners/:id`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { error } = await fleetDb().from("fleet_inv_scan_device").delete()
      .eq("organization_id", org).eq("id", c.req.param("id"));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.get(`${PREFIX}/alert-rules`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_alert_rule").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.put(`${PREFIX}/alert-rules`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const rules = Array.isArray(body.rules) ? body.rules as Record<string, unknown>[] : [];
    for (const rule of rules) {
      if (!rule.alert_type) continue;
      await fleetDb().from("fleet_inv_alert_rule").upsert({
        organization_id: org,
        alert_type: rule.alert_type,
        default_snooze_days: rule.default_snooze_days ?? 7,
        notify_roles: rule.notify_roles ?? [],
        can_snooze: rule.can_snooze ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,alert_type" });
    }
    const { data } = await fleetDb().from("fleet_inv_alert_rule").select("*").eq("organization_id", org);
    return c.json({ items: data ?? [] });
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
