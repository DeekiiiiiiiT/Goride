/**
 * Extended inventory HTTP routes (audit R3-06 phases 2–8).
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import { requirePermission, PLATFORM_RESOLVED_ROLES, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { invDb, invRpcName } from "./inventory_db.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { registerInventoryR16Routes, assertAlertSnoozeAllowed } from "./inventory_controller_r16.ts";

type InvEnv = { Variables: { rbacUser?: RbacUser } };
type InvCtx = Context<InvEnv>;

const PREFIX = "/make-server-37f42386/inventory";

function fleetDb() {
  return invDb();
}

function orgOrForbid(c: InvCtx): string | Response {
  const orgId = getOrgId(c);
  const user = c.get("rbacUser") as RbacUser | undefined;
  const platform = Boolean(user && PLATFORM_RESOLVED_ROLES.has(user.resolvedRole));
  if (!orgId && !platform) return c.json({ error: "Organization required" }, 403);
  if (!orgId) return c.json({ error: "Organization required" }, 403);
  return orgId;
}

function requireIdempotencyKey(c: InvCtx): string | Response {
  const raw = c.req.header("Idempotency-Key") || c.req.header("idempotency-key");
  const key = raw?.trim();
  if (!key) return c.json({ error: "Idempotency-Key header required" }, 400);
  return key;
}

async function rpcJson(
  c: InvCtx,
  fn: string,
  args: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { data, error } = await fleetDb().rpc(invRpcName(fn), args);
  if (error) {
    const msg = error.message || String(error);
    if (/not found|forbidden org/i.test(msg)) return c.json({ error: msg }, 404);
    if (/reason required|must be positive|insufficient/i.test(msg)) {
      return c.json({ error: msg }, 409);
    }
    return c.json({ error: msg }, 500);
  }
  return (data ?? {}) as Record<string, unknown>;
}

function actorId(c: InvCtx): string | null {
  return (c.get("rbacUser") as RbacUser | undefined)?.userId ?? null;
}

async function loadAsset(
  c: InvCtx,
  org: string,
  assetId: string,
): Promise<{ asset: Record<string, unknown> } | { response: Response }> {
  const { data, error } = await fleetDb().from("fleet_inv_asset").select("*")
    .eq("organization_id", org).eq("id", assetId).maybeSingle();
  if (error) return { response: c.json({ error: error.message }, 500) };
  if (!data) return { response: c.json({ error: "Not found" }, 404) };
  return { asset: data as Record<string, unknown> };
}

async function insertAssetEvent(
  org: string,
  assetId: string,
  type: string,
  title: string,
  extra?: Record<string, unknown>,
) {
  return fleetDb().from("fleet_inv_asset_event").insert({
    organization_id: org,
    asset_id: assetId,
    type,
    title,
    body: extra?.body ?? null,
    vehicle_id: extra?.vehicle_id ?? null,
    actor: extra?.actor ?? null,
    place: extra?.place ?? null,
  }).select("*").single();
}

function minimalKitSpecPdf(title: string, lines: string[]): Uint8Array {
  const bodyLines = [title, ...lines].slice(0, 40);
  const yStart = 750;
  const textOps = bodyLines.map((line, i) => {
    const safe = String(line).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    return `1 0 0 1 50 ${yStart - i * 14} Tm (${safe}) Tj`;
  }).join("\n");
  const stream = `BT\n/F1 10 Tf\n${textOps}\nET`;
  const streamLen = stream.length;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>>>endobj
4 0 obj<</Length ${streamLen}>>stream
${stream}
endstream
endobj
xref
0 5
0000000000 65535 f 
trailer<</Size 5/Root 1 0 R>>
startxref
0
%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function updatePo(
  c: InvCtx,
  org: string,
  poId: string,
  patch: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { data, error } = await fleetDb().from("fleet_inv_purchase_order").update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", org).eq("id", poId).select("*").maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: "Not found" }, 404);
  return { po: data };
}

export function registerInventoryExtendedRoutes(app: Hono<InvEnv>) {
  app.post(`${PREFIX}/return`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const idem = requireIdempotencyKey(c);
      if (idem instanceof Response) return idem;
      const body = await c.req.json();
      const result = await rpcJson(c, "inv_return_from_vehicle", {
        p_org_id: org,
        p_item_id: body.item_id,
        p_vehicle_id: body.vehicle_id,
        p_to_location_id: body.to_location_id,
        p_qty: body.qty,
        p_idempotency_key: idem,
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.return");
    }
  });

  app.post(`${PREFIX}/write-off`, requirePermission("inventory.adjust"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const idem = requireIdempotencyKey(c);
      if (idem instanceof Response) return idem;
      const body = await c.req.json();
      const result = await rpcJson(c, "inv_write_off", {
        p_org_id: org,
        p_item_id: body.item_id,
        p_location_id: body.location_id,
        p_asset_id: body.asset_id ?? null,
        p_qty: body.qty,
        p_reason: body.reason,
        p_memo: body.memo ?? null,
        p_idempotency_key: idem,
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.write-off");
    }
  });

  app.post(`${PREFIX}/items/import`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const body = await c.req.json();
      const result = await rpcJson(c, "inv_import_items", {
        p_org_id: org,
        p_file: body.file ?? {},
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.items.import");
    }
  });

  app.get(`${PREFIX}/export.csv`, requirePermission("inventory.export"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const { data, error } = await fleetDb().from("fleet_inv_v_stock").select("*").eq("organization_id", org);
      if (error) return c.json({ error: error.message }, 500);
      const rows = data ?? [];
      const header = "sku,name,location_code,on_hand,reserved,stock_value";
      const lines = rows.map((r: Record<string, unknown>) =>
        [
          r.sku,
          r.name,
          r.location_code,
          r.on_hand,
          r.reserved,
          r.stock_value,
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
      );
      const csv = [header, ...lines].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="inventory-export.csv"',
        },
      });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.export.csv");
    }
  });

  app.get(`${PREFIX}/kits/templates`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_kit_template").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/kits/templates`, requirePermission("inventory.kits.manage"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const { data, error } = await fleetDb().from("fleet_inv_kit_template").insert({
      organization_id: org,
      name: body.name,
      code: body.code,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ template: data });
  });

  app.post(`${PREFIX}/kits/templates/:id/publish`, requirePermission("inventory.kits.manage"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_publish_kit_version", {
      p_org_id: org,
      p_template_id: c.req.param("id"),
      p_version_id: body.version_id,
      p_idempotency_key: body.idempotency_key ?? null,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  });

  app.get(`${PREFIX}/kits/compare`, requirePermission("inventory.view"), async (c) => {
    return c.json({
      added: [],
      removed: [],
      changed: [],
      leftVersion: c.req.query("left"),
      rightVersion: c.req.query("right"),
    });
  });

  app.get(`${PREFIX}/kits/compliance.csv`, requirePermission("inventory.export"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const { data, error } = await fleetDb().from("fleet_inv_v_kit_compliance").select("*")
        .eq("organization_id", org);
      if (error) return c.json({ error: error.message }, 500);
      const rows = data ?? [];
      if (!rows.length) {
        return c.json({ stub: true, message: "No kit compliance rows yet" });
      }
      const header = "vehicle_id,license_plate,kit_code,item_id,qty_required,line_status,road_clear";
      const lines = rows.map((r: Record<string, unknown>) =>
        [
          r.vehicle_id,
          r.license_plate,
          r.kit_code,
          r.item_id,
          r.qty_required,
          r.line_status,
          r.road_clear,
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      );
      const csv = [header, ...lines].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="kit-compliance.csv"',
        },
      });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.kits.compliance.csv");
    }
  });

  app.get(`${PREFIX}/kits/spec.pdf`, requirePermission("inventory.export"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const templateId = c.req.query("template_id");
      let templatesQuery = fleetDb().from("fleet_inv_kit_template").select("id, code, name, compliance_text")
        .eq("organization_id", org);
      if (templateId) templatesQuery = templatesQuery.eq("id", templateId);
      const { data: templates, error: tErr } = await templatesQuery.limit(20);
      if (tErr) return c.json({ error: tErr.message }, 500);
      if (!templates?.length) {
        return c.json({ stub: true, message: "No kit templates to export" });
      }
      const specLines: string[] = [];
      for (const tpl of templates) {
        const { data: version } = await fleetDb().from("fleet_inv_kit_template_version").select("id, version, status")
          .eq("organization_id", org)
          .eq("template_id", tpl.id)
          .in("status", ["production", "pending_sync"])
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        specLines.push(`${tpl.code} — ${tpl.name} (v${version?.version ?? "?"})`);
        if (tpl.compliance_text) specLines.push(String(tpl.compliance_text));
        if (version?.id) {
          const { data: kitLines } = await fleetDb().from("fleet_inv_kit_template_line").select("qty_required, required, fleet_inv_item(sku, name)")
            .eq("organization_id", org).eq("version_id", version.id).order("sort_order", { ascending: true });
          for (const line of kitLines ?? []) {
            const item = (line as { inv_item?: { sku?: string; name?: string } }).inv_item;
            specLines.push(`  · ${item?.sku ?? "?"} ${item?.name ?? ""} × ${(line as { qty_required?: number }).qty_required}`);
          }
        }
        specLines.push("");
      }
      const pdf = minimalKitSpecPdf("Kit specification", specLines);
      return new Response(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="kit-spec.pdf"',
        },
      });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.kits.spec.pdf");
    }
  });

  app.get(`${PREFIX}/assets`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_asset").select("*").eq("organization_id", org).limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/assets`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const { data, error } = await fleetDb().from("fleet_inv_asset").insert({
      organization_id: org,
      item_id: body.item_id,
      serial_no: body.serial_no,
      status: body.status ?? "in_stock",
      location_id: body.location_id,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ asset: data });
  });

  app.get(`${PREFIX}/assets/:id/events`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const { data, error } = await fleetDb().from("fleet_inv_asset_event").select("*")
        .eq("organization_id", org).eq("asset_id", assetId)
        .order("created_at", { ascending: false }).limit(200);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ items: data ?? [], stub: false });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.events");
    }
  });

  app.get(`${PREFIX}/assets/:id/documents`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const { data, error } = await fleetDb().from("fleet_inv_document").select("*")
        .eq("organization_id", org).eq("entity_type", "asset").eq("entity_id", assetId)
        .order("created_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ items: data ?? [] });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.documents.list");
    }
  });

  app.post(`${PREFIX}/assets/:id/documents`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const filePath = String(body.file_path ?? "").trim();
      const name = String(body.name ?? "").trim();
      if (!filePath || !name) return c.json({ error: "file_path and name required" }, 400);
      const { data, error } = await fleetDb().from("fleet_inv_document").insert({
        organization_id: org,
        entity_type: "asset",
        entity_id: assetId,
        file_path: filePath,
        name,
        size_bytes: body.size_bytes ?? null,
        kind: body.kind ?? null,
      }).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ document: data }, 201);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.documents.create");
    }
  });

  app.post(`${PREFIX}/assets/:id/move`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.location_id !== undefined) patch.location_id = body.location_id;
      if (body.bin_id !== undefined) patch.bin_id = body.bin_id;
      if (body.vehicle_id) {
        patch.status = "installed";
        patch.installed_at = new Date().toISOString();
      }
      const { data, error } = await fleetDb().from("fleet_inv_asset").update(patch)
        .eq("organization_id", org).eq("id", assetId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      await insertAssetEvent(org, assetId, "move", "Asset moved", {
        body: body.note ?? null,
        vehicle_id: body.vehicle_id ?? null,
        actor: actorId(c),
        place: body.place ?? null,
      });
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.move");
    }
  });

  app.post(`${PREFIX}/assets/:id/repair`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const { data, error } = await fleetDb().from("fleet_inv_asset").update({
        status: "in_repair",
        updated_at: new Date().toISOString(),
      }).eq("organization_id", org).eq("id", assetId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      await insertAssetEvent(org, assetId, "repair", "Sent for repair", {
        body: body.note ?? null,
        actor: actorId(c),
      });
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.repair");
    }
  });

  app.post(`${PREFIX}/assets/:id/faulty`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const { data, error } = await fleetDb().from("fleet_inv_asset").update({
        status: "faulty",
        updated_at: new Date().toISOString(),
      }).eq("organization_id", org).eq("id", assetId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      await insertAssetEvent(org, assetId, "faulty", "Marked faulty", {
        body: body.note ?? null,
        actor: actorId(c),
      });
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.faulty");
    }
  });

  app.post(`${PREFIX}/assets/:id/retire`, requirePermission("inventory.adjust"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const { data, error } = await fleetDb().from("fleet_inv_asset").update({
        status: "retired",
        updated_at: new Date().toISOString(),
      }).eq("organization_id", org).eq("id", assetId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      await insertAssetEvent(org, assetId, "retire", "Asset retired", {
        body: body.reason ?? body.note ?? null,
        actor: actorId(c),
      });
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.retire");
    }
  });

  app.post(`${PREFIX}/assets/:id/serial`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const serial = String(body.serial_number ?? body.serial ?? "").trim();
      if (!serial) return c.json({ error: "serial_number required" }, 400);
      const { data, error } = await fleetDb().from("fleet_inv_asset").update({
        serial_number: serial,
        updated_at: new Date().toISOString(),
      }).eq("organization_id", org).eq("id", assetId).select("*").single();
      if (error) return c.json({ error: error.message }, 500);
      await insertAssetEvent(org, assetId, "serial", "Serial updated", { actor: actorId(c) });
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.serial");
    }
  });

  app.post(`${PREFIX}/assets/:id/qr-label`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const asset = loaded.asset;
      const payload = `roam:asset:${org}:${assetId}`;
      return c.json({
        stub: false,
        assetId,
        assetTag: asset.asset_tag,
        serialNumber: asset.serial_number ?? null,
        qrPayload: payload,
        labelText: `${asset.asset_tag}${asset.serial_number ? ` · ${asset.serial_number}` : ""}`,
      });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.qr-label");
    }
  });

  app.get(`${PREFIX}/purchase-orders`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_purchase_order").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/purchase-orders/:id/submit`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const result = await updatePo(c, org, poId, {
        status: "awaiting_approval",
        initiated_by: actorId(c),
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.submit");
    }
  });

  app.post(`${PREFIX}/purchase-orders/:id/authorize`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const result = await updatePo(c, org, poId, {
        approved_by: actorId(c),
        approved_at: new Date().toISOString(),
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.authorize");
    }
  });

  app.post(`${PREFIX}/purchase-orders/:id/order`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const result = await updatePo(c, org, poId, {
        status: "ordered",
        ordered_at: new Date().toISOString(),
      });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.order");
    }
  });

  app.post(`${PREFIX}/purchase-orders/:id/receive`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const idem = requireIdempotencyKey(c);
      if (idem instanceof Response) return idem;
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      if (Array.isArray(body.lines) && body.lines.length) {
        const rpcResult = await rpcJson(c, "inv_receive", {
          p_org_id: org,
          p_receipt: { po_id: poId, ...(body.receipt as Record<string, unknown> ?? {}) },
          p_lines: body.lines,
          p_costs: body.costs ?? [],
          p_idempotency_key: idem,
        });
        if (rpcResult instanceof Response) return rpcResult;
        const status = body.partial ? "part_received" : "received";
        const poResult = await updatePo(c, org, poId, { status });
        if (poResult instanceof Response) return poResult;
        return c.json({ ...rpcResult, po: (poResult as { po: unknown }).po });
      }
      const status = body.partial ? "part_received" : "received";
      const result = await updatePo(c, org, poId, { status });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.receive");
    }
  });

  app.post(`${PREFIX}/purchase-orders/:id/cancel`, requirePermission("inventory.purchasing"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const poId = c.req.param("id");
      const result = await updatePo(c, org, poId, { status: "cancelled" });
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.po.cancel");
    }
  });

  app.get(`${PREFIX}/vendors`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_vendor").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/reorder/suggestions`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_stock").select("*")
      .eq("organization_id", org).in("stock_status", ["low", "out"]);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/reorder/recompute`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const result = await rpcJson(c, "inv_recompute_reorder", { p_org_id: org });
    if (result instanceof Response) return result;
    return c.json(result);
  });

  app.get(`${PREFIX}/counts/sessions`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_count_session").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/counts/:id/submit`, requirePermission("inventory.adjust"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const sessionId = c.req.param("id");
    const { error } = await fleetDb().from("fleet_inv_count_session").update({ status: "submitted" })
      .eq("organization_id", org).eq("id", sessionId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ sessionId, status: "submitted" });
  });

  app.post(`${PREFIX}/counts/:id/recount`, requirePermission("inventory.adjust"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const sessionId = c.req.param("id");
      const { error: lineErr } = await fleetDb().from("fleet_inv_count_line").update({ line_status: "recount" })
        .eq("organization_id", org).eq("session_id", sessionId);
      if (lineErr) return c.json({ error: lineErr.message }, 500);
      const { error } = await fleetDb().from("fleet_inv_count_session").update({
        status: "open",
        submitted_at: null,
        submitted_by: null,
      }).eq("organization_id", org).eq("id", sessionId);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ sessionId, status: "open", recount: true });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.counts.recount");
    }
  });

  app.post(`${PREFIX}/counts/:id/reject`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const sessionId = c.req.param("id");
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const { error } = await fleetDb().from("fleet_inv_count_session").update({
        status: "open",
        submitted_at: null,
        approved_by: null,
      }).eq("organization_id", org).eq("id", sessionId);
      if (error) return c.json({ error: error.message }, 500);
      await fleetDb().from("fleet_inv_approval").update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        approved_by: actorId(c),
      }).eq("organization_id", org).eq("subject_type", "count").eq("subject_id", sessionId)
        .eq("status", "pending");
      return c.json({ sessionId, status: "open", rejected: true, reason: body.reason ?? null });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.counts.reject");
    }
  });

  app.post(`${PREFIX}/counts/:id/approve`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const sessionId = c.req.param("id");
      const { error } = await fleetDb().from("fleet_inv_count_session").update({
        status: "reconciled",
        approved_by: actorId(c),
      }).eq("organization_id", org).eq("id", sessionId);
      if (error) return c.json({ error: error.message }, 500);
      await fleetDb().from("fleet_inv_approval").update({
        status: "approved",
        decided_at: new Date().toISOString(),
        approved_by: actorId(c),
      }).eq("organization_id", org).eq("subject_type", "count").eq("subject_id", sessionId)
        .eq("status", "pending");
      return c.json({ sessionId, status: "reconciled" });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.counts.approve");
    }
  });

  app.get(`${PREFIX}/alerts`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_alert").select("*").eq("organization_id", org)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/alerts/:id/assign`, requirePermission("inventory.approve"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const { error } = await fleetDb().from("fleet_inv_alert").update({ assignee_id: body.user_id })
      .eq("organization_id", org).eq("id", c.req.param("id"));
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.post(`${PREFIX}/alerts/:id/snooze`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const alertId = c.req.param("id");
      const blocked = await assertAlertSnoozeAllowed(org, alertId);
      if (blocked) return c.json({ error: blocked }, 409);
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const days = Number(body.days ?? 7) || 7;
      const until = body.until
        ? new Date(String(body.until)).toISOString()
        : new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await fleetDb().from("fleet_inv_alert").update({ snoozed_until: until })
        .eq("organization_id", org).eq("id", c.req.param("id"));
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true, snoozedUntil: until });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.alerts.snooze");
    }
  });

  app.post(`${PREFIX}/alerts/:id/done`, requirePermission("inventory.approve"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const now = new Date().toISOString();
      const { error } = await fleetDb().from("fleet_inv_alert").update({
        status: "done",
        resolved_at: now,
        resolved_by: actorId(c),
      }).eq("organization_id", org).eq("id", c.req.param("id"));
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true, status: "done" });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.alerts.done");
    }
  });

  app.post(`${PREFIX}/alerts/:id/viewed`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const now = new Date().toISOString();
      const { error } = await fleetDb().from("fleet_inv_alert").update({ viewed_at: now })
        .eq("organization_id", org).eq("id", c.req.param("id"));
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true, viewedAt: now });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.alerts.viewed");
    }
  });

  app.get(`${PREFIX}/scanners`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const { data, error } = await fleetDb().from("fleet_inv_scan_device").select("*")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false });
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ items: data ?? [] });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.scanners.list");
    }
  });

  app.post(`${PREFIX}/scanners/pair`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const result = await rpcJson(c, "inv_pair_scanner", {
      p_org_id: org,
      p_pairing_code: body.pairing_code,
      p_device_label: body.label ?? null,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  });

  app.get(`${PREFIX}/requisitions`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_requisition").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/requisitions`, requirePermission("inventory.move"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json();
    const refNo = String(body.ref_no ?? `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
    const { data, error } = await fleetDb().from("fleet_inv_requisition").insert({
      organization_id: org,
      ref_no: refNo,
      requested_by: actorId(c),
      for_vehicle_id: body.for_vehicle_id ?? null,
      needed_by: body.needed_by ?? null,
      note: body.note ?? null,
      status: "open",
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ requisition: data });
  });

  app.get(`${PREFIX}/analytics/kit-reserve`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_kit_reserve").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/where-used`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const itemId = c.req.query("item_id");
    let q = fleetDb().from("fleet_inv_v_where_used").select("*").eq("organization_id", org);
    if (itemId) q = q.eq("item_id", itemId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/reorder-suggestions`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_reorder_suggestions").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/vendor-stats`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_vendor_stats").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/count-accuracy`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_count_accuracy").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/procurement-mtd`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_procurement_mtd").select("*").eq("organization_id", org).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ summary: data ?? null });
  });

  app.get(`${PREFIX}/analytics/report-sla`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_report_sla").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.get(`${PREFIX}/analytics/asset-kpis`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_asset_kpis").select("*").eq("organization_id", org).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ kpis: data ?? null });
  });

  app.post(`${PREFIX}/finance/post`, requirePermission("inventory.purchasing"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const sb = getServiceClient();
    const { data: flag } = await sb
      .from("platform_feature_flags")
      .select("enabled")
      .eq("name", "fleet_inventory_finance_posting")
      .maybeSingle();
    if (!flag?.enabled) {
      return c.json({ error: "Finance posting not enabled" }, 403);
    }
    return c.json(
      {
        error: "Inventory finance posting is not wired to Business Finance yet",
        code: "not_implemented",
        organizationId: org,
      },
      501,
    );
  });

  registerInventoryR16Routes(app);
}
