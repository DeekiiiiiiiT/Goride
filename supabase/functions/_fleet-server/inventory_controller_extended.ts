/**
 * Extended inventory HTTP routes (Rev 52 cutdown — core stock, kits, assets, alerts).
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import { requirePermission, PLATFORM_RESOLVED_ROLES, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
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
    if (
      /reason required|must be positive|insufficient|version is not a draft|duplicate|already exists|kit template|organization_id required|archived|linked type|sort order/i.test(
        msg,
      )
    ) {
      return c.json({ error: msg }, 409);
    }
    if (/required|invalid asset status|destination must be/i.test(msg)) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500);
  }
  return (data ?? {}) as Record<string, unknown>;
}

function kitCodeFromName(name: string): string {
  const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "KIT";
}

async function uniqueKitTemplateCode(org: string, baseCode: string): Promise<string> {
  let code = baseCode;
  let suffix = 2;
  for (;;) {
    const { data } = await fleetDb().from("fleet_inv_kit_template").select("id")
      .eq("organization_id", org).ilike("code", code).limit(1);
    if (!data?.length) return code;
    code = `${baseCode}-${suffix}`;
    suffix += 1;
  }
}

async function loadKitVersionBundle(org: string, versionId: string) {
  const { data: version, error: vErr } = await fleetDb().from("fleet_inv_kit_template_version")
    .select("*").eq("organization_id", org).eq("id", versionId).maybeSingle();
  if (vErr || !version) return null;
  const { data: lines } = await fleetDb().from("fleet_inv_kit_template_line").select("*")
    .eq("organization_id", org).eq("version_id", versionId).order("sort_order", { ascending: true });
  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  const skus = new Map<string, string>();
  if (itemIds.length) {
    const { data: items } = await fleetDb().from("fleet_inv_item").select("id, name, sku")
      .eq("organization_id", org).in("id", itemIds);
    for (const row of items ?? []) {
      names.set(String(row.id), String(row.name));
      skus.set(String(row.id), String(row.sku));
    }
  }
  const enriched = (lines ?? []).map((line) => ({
    ...line,
    item_name: line.item_id ? names.get(String(line.item_id)) ?? null : null,
    name: line.item_id ? names.get(String(line.item_id)) ?? null : null,
    sku: line.item_id ? skus.get(String(line.item_id)) ?? null : null,
  }));
  return { ...version, lines: enriched };
}

async function loadKitTemplatesEnriched(org: string) {
  const { data: templates, error } = await fleetDb().from("fleet_inv_kit_template").select("*")
    .eq("organization_id", org);
  if (error) throw new Error(error.message);
  const items = [];
  for (const tpl of templates ?? []) {
    const templateId = String(tpl.id);
    const { data: versions } = await fleetDb().from("fleet_inv_kit_template_version").select("id, status, version")
      .eq("organization_id", org).eq("template_id", templateId);
    const draftRow = versions?.find((v) => v.status === "draft");
    const prodRow = versions?.find((v) => v.status === "production");
    const draftVersion = draftRow
      ? await loadKitVersionBundle(org, String(draftRow.id))
      : null;
    const productionVersion = prodRow
      ? await loadKitVersionBundle(org, String(prodRow.id))
      : null;
    const { data: vkRows, error: vkErr } = await fleetDb().from("fleet_inv_vehicle_kit")
      .select("vehicle_id")
      .eq("organization_id", org)
      .eq("template_id", templateId);
    if (vkErr) throw new Error(vkErr.message);
    const vehicleCount = vkRows?.length ?? 0;
    items.push({
      ...tpl,
      draft_version_id: draftRow?.id ?? null,
      vehicle_count: vehicleCount,
      draftVersion,
      productionVersion,
      lines: draftVersion?.lines ?? productionVersion?.lines ?? [],
    });
  }
  return items;
}

function actorId(c: InvCtx): string | null {
  return (c.get("rbacUser") as RbacUser | undefined)?.userId ?? null;
}

function parseAssetMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function buildDerivedAssetAlerts(org: string): Promise<Record<string, unknown>[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: assets, error } = await fleetDb().from("fleet_inv_asset").select("*")
    .eq("organization_id", org);
  if (error || !assets?.length) return [];

  const itemIds = [...new Set(assets.map((a) => a.item_id).filter(Boolean))] as string[];
  const itemsMap = new Map<string, { name: string; sku: string }>();
  if (itemIds.length) {
    const { data: items } = await fleetDb().from("fleet_inv_item").select("id, name, sku")
      .eq("organization_id", org).in("id", itemIds);
    for (const it of items ?? []) {
      itemsMap.set(String(it.id), { name: String(it.name), sku: String(it.sku) });
    }
  }

  const locIds = [...new Set(assets.map((a) => a.location_id).filter(Boolean))] as string[];
  const plateByLoc = new Map<string, string>();
  if (locIds.length) {
    const { data: locs } = await fleetDb().from("fleet_inv_location").select("id, vehicle_id")
      .eq("organization_id", org).in("id", locIds);
    const vehIds = [...new Set((locs ?? []).map((l) => l.vehicle_id).filter(Boolean))] as string[];
    const plateByVeh = new Map<string, string>();
    if (vehIds.length) {
      const { data: vehs } = await fleetDb().from("fleet_vehicles").select("id, license_plate")
        .in("id", vehIds);
      for (const v of vehs ?? []) {
        plateByVeh.set(String(v.id), String(v.license_plate ?? ""));
      }
    }
    for (const loc of locs ?? []) {
      if (loc.vehicle_id) {
        plateByLoc.set(String(loc.id), plateByVeh.get(String(loc.vehicle_id)) ?? "");
      }
    }
  }

  const derived: Record<string, unknown>[] = [];
  for (const a of assets) {
    const id = String(a.id);
    const status = String(a.status ?? "");
    const item = itemsMap.get(String(a.item_id));
    const label = String(a.serial_number ?? a.asset_tag ?? id.slice(0, 8));
    const sku = item?.sku ?? "";
    const plate = a.location_id ? plateByLoc.get(String(a.location_id)) ?? "" : "";

    if (status === "faulty" || status === "lost" || status === "in_repair") {
      const typeByStatus = {
        faulty: "asset_faulty",
        lost: "asset_lost",
        in_repair: "asset_in_repair",
      } as const;
      const alertType = typeByStatus[status as keyof typeof typeByStatus];
      derived.push({
        id: `derived:${alertType}:${id}`,
        organization_id: org,
        type: alertType,
        severity: status === "lost" ? "critical" : "high",
        title: `${label} — ${status.replace(/_/g, " ")}`,
        body: item?.name ? `${item.name} (${status.replace(/_/g, " ")})` : status,
        message: item?.name ? `${item.name} (${status.replace(/_/g, " ")})` : status,
        status: "open",
        entity_type: "asset",
        entity_id: id,
        asset_id: id,
        item_sku: sku,
        sku,
        vehicle_plate: plate,
        created_at: a.updated_at ?? a.created_at,
      });
    }

    const dueRaw = a.next_inspection_due;
    const due = dueRaw ? String(dueRaw).slice(0, 10) : null;
    if (due && due <= cutoffStr) {
      const past = due < today;
      derived.push({
        id: `derived:asset_inspection_due:${id}`,
        organization_id: org,
        type: "asset_inspection_due",
        severity: past ? "critical" : "medium",
        title: `${label} — check ${past ? "overdue" : "due within 30 days"}`,
        body: `Next check date: ${due}`,
        message: `Next check date: ${due}`,
        status: "open",
        entity_type: "asset",
        entity_id: id,
        asset_id: id,
        item_sku: sku,
        sku,
        vehicle_plate: plate,
        created_at: a.updated_at ?? a.created_at,
      });
    }
  }
  return derived;
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
  const row: Record<string, unknown> = {
    organization_id: org,
    asset_id: assetId,
    type,
    title,
    body: extra?.body ?? null,
    vehicle_id: extra?.vehicle_id ?? null,
    actor: extra?.actor ?? null,
    place: extra?.place ?? null,
  };
  if (Array.isArray(extra?.photo_paths)) {
    row.photo_paths = extra.photo_paths;
  }
  return fleetDb().from("fleet_inv_asset_event").insert(row).select("*").single();
}

function photoPathsFromBody(body: Record<string, unknown>): string[] | undefined {
  const raw = body.photo_paths ?? body.photoPaths;
  if (!Array.isArray(raw)) return undefined;
  const paths = raw.map(String).filter(Boolean);
  return paths.length ? paths : [];
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
    try {
      const items = await loadKitTemplatesEnriched(org);
      return c.json({ items });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.kits.templates.list");
    }
  });

  app.post(`${PREFIX}/kits/templates`, requirePermission("inventory.kits.manage"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const classification = String(body.classification ?? "").trim();
    if (!name) return c.json({ error: "name required" }, 400);
    if (!classification) return c.json({ error: "classification required" }, 400);
    if (!["rideshare", "delivery", "executive"].includes(classification)) {
      return c.json({ error: "classification must be rideshare, delivery, or executive" }, 400);
    }
    const baseCode = kitCodeFromName(name);
    const code = await uniqueKitTemplateCode(org, baseCode);
    const { data, error } = await fleetDb().from("fleet_inv_kit_template").insert({
      organization_id: org,
      name,
      code,
      classification,
    }).select("*").single();
    if (error) return c.json({ error: error.message }, 409);
    return c.json({ template: data });
  });

  app.put(`${PREFIX}/kits/templates/:id/draft`, requirePermission("inventory.kits.manage"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const result = await rpcJson(c, "inv_save_kit_draft", {
      p_org_id: org,
      p_template_id: c.req.param("id"),
      p_lines: body.lines ?? [],
      p_change_note: body.change_note ?? body.changeNote ?? "",
      p_author: actorId(c),
    });
    if (result instanceof Response) return result;
    return c.json(result);
  });

  app.post(`${PREFIX}/kits/templates/:id/publish`, requirePermission("inventory.kits.manage"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const body = await c.req.json() as Record<string, unknown>;
    const result = await rpcJson(c, "inv_publish_kit_version", {
      p_org_id: org,
      p_template_id: c.req.param("id"),
      p_version_id: body.version_id ?? body.versionId,
      p_move_vehicles: Boolean(body.move_vehicles ?? body.moveVehicles),
      p_idempotency_key: body.idempotency_key ?? null,
    });
    if (result instanceof Response) return result;
    return c.json(result);
  });

  app.get(`${PREFIX}/kits/compare`, requirePermission("inventory.view"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const left = c.req.query("left");
      const right = c.req.query("right");
      const { data: templates } = await fleetDb().from("fleet_inv_kit_template").select("id, code, name")
        .eq("organization_id", org).limit(5);
      const template = templates?.[0] ?? null;
      const { data: compliance } = await fleetDb().from("fleet_inv_v_kit_compliance").select("*")
        .eq("organization_id", org);
      const rows = compliance ?? [];
      const plates = [...new Set(rows.map((r: Record<string, unknown>) => String(r.license_plate ?? "")).filter(Boolean))];
      const templateName = template?.name != null ? String(template.name) : "—";
      const affectedVehicleCount = plates.length;
      const addedUnits = rows.reduce((sum: number, r: Record<string, unknown>) =>
        sum + Number(r.qty_required ?? 0), 0);
      const roadClear = rows.filter((r: Record<string, unknown>) => r.road_clear).length;
      const readinessPct = rows.length ? Math.round((roadClear / rows.length) * 100) : 0;
      return c.json({
        added: [],
        removed: [],
        changed: [],
        leftVersion: left ?? null,
        rightVersion: right ?? null,
        template_id: template?.id ?? null,
        template_name: templateName,
        affected_vehicle_count: affectedVehicleCount,
        affected_vehicle_plates: plates,
        affected_template_label: templateName,
        additional_units_required: addedUnits,
        fleet_readiness_pct: readinessPct,
        projected_readiness_pct: Math.max(0, readinessPct - 10),
        valuation_jmd: 0,
      });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.kits.compare");
    }
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
    const body = await c.req.json() as Record<string, unknown>;
    const itemId = body.item_id ?? body.itemId;
    if (!itemId) return c.json({ error: "item_id required" }, 400);
    const serial =
      body.serial_number ?? body.serial_no ?? body.serialNumber ?? null;
    const tagRaw = body.asset_tag ?? body.assetTag ?? body.tag;
    const assetTag =
      tagRaw != null && String(tagRaw).trim()
        ? String(tagRaw).trim()
        : `AST-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    const parseDate = (v: unknown) => {
      if (v == null || v === "") return null;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };
    const parseMoney = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const row = {
      organization_id: org,
      asset_tag: assetTag,
      item_id: itemId,
      serial_number: serial != null ? String(serial).trim() || null : null,
      status: body.status ?? "in_store",
      location_id: body.location_id ?? body.locationId ?? null,
      purchase_cost: parseMoney(body.purchase_cost ?? body.purchaseCost ?? body.cost),
      next_inspection_due: parseDate(
        body.next_inspection_due ?? body.nextInspectionDue ?? body.inspection_due,
      ),
    };
    const { data, error } = await fleetDb().from("fleet_inv_asset").insert(row).select("*").single();
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

  app.post(`${PREFIX}/assets/:id/events`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json();
      const type = String(body.type ?? "incident").trim() || "incident";
      const note = String(body.body ?? body.note ?? body.text ?? "").trim();
      if (!note) return c.json({ error: "body text required" }, 400);
      const title = String(body.title ?? (type === "incident" ? "Incident note" : "Asset event")).trim();
      const photo_paths = photoPathsFromBody(body as Record<string, unknown>);
      const { data, error } = await insertAssetEvent(org, assetId, type, title, {
        body: note,
        ...(photo_paths !== undefined ? { photo_paths } : {}),
      });
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ event: data }, 201);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.events.create");
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
      const body = await c.req.json() as Record<string, unknown>;
      const toVehicleId = body.to_vehicle_id ?? body.vehicle_id ?? null;
      if (toVehicleId) {
        const headerIdem = c.req.header("Idempotency-Key") || c.req.header("idempotency-key");
        const idem = String(body.idempotency_key ?? headerIdem ?? crypto.randomUUID()).trim();
        const rpcResult = await rpcJson(c, "inv_asset_move_vehicle", {
          p_org_id: org,
          p_asset_id: assetId,
          p_to_vehicle_id: toVehicleId,
          p_from_vehicle_id: body.from_vehicle_id ?? null,
          p_note: body.note ?? null,
          p_driver_id: body.driver_id ?? null,
          p_idempotency_key: idem,
        });
        if (rpcResult instanceof Response) return rpcResult;
        return c.json(rpcResult);
      }
      const toLocationId = body.location_id ?? body.to_location_id ?? body.locationId ?? null;
      if (toLocationId) {
        const headerIdem = c.req.header("Idempotency-Key") || c.req.header("idempotency-key");
        const idem = String(body.idempotency_key ?? headerIdem ?? crypto.randomUUID()).trim();
        const rpcResult = await rpcJson(c, "inv_asset_move_to_store", {
          p_org_id: org,
          p_asset_id: assetId,
          p_to_location_id: toLocationId,
          p_note: body.note ?? null,
          p_idempotency_key: idem,
        });
        if (rpcResult instanceof Response) return rpcResult;
        return c.json(rpcResult);
      }
      return c.json({ error: "to_vehicle_id or location_id required" }, 400);
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.move");
    }
  });

  app.post(`${PREFIX}/assets/:id/condition`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      const note = String(body.note ?? "").trim();
      if (!note) return c.json({ error: "note required" }, 400);
      const status = String(body.status ?? "").trim();
      if (!status) return c.json({ error: "status required" }, 400);
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const photo_paths = photoPathsFromBody(body);
      const rpcResult = await rpcJson(c, "inv_asset_set_condition", {
        p_org_id: org,
        p_asset_id: assetId,
        p_status: status,
        p_note: note,
        p_actor: actorId(c),
        p_photo_paths: photo_paths ?? [],
      });
      if (rpcResult instanceof Response) return rpcResult;
      const { data, error } = await fleetDb().from("fleet_inv_asset").select("*")
        .eq("organization_id", org).eq("id", assetId).single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ asset: data });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.condition");
    }
  });

  app.post(`${PREFIX}/assets/:id/repair`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json() as Record<string, unknown>;
      const description = String(body.description ?? body.note ?? "").trim();
      if (!description) return c.json({ error: "description required" }, 400);
      const nextStatus = body.set_status != null && String(body.set_status).trim()
        ? String(body.set_status).trim()
        : "in_repair";
      const costJmd = parseAssetMoney(body.cost_jmd ?? body.costJmd);
      const photo_paths = photoPathsFromBody(body);
      const rpcResult = await rpcJson(c, "inv_asset_log_repair", {
        p_org_id: org,
        p_asset_id: assetId,
        p_description: description,
        p_set_status: nextStatus,
        p_cost_jmd: costJmd,
        p_actor: actorId(c),
        p_photo_paths: photo_paths ?? [],
      });
      if (rpcResult instanceof Response) return rpcResult;
      const { data, error } = await fleetDb().from("fleet_inv_asset").select("*")
        .eq("organization_id", org).eq("id", assetId).single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ asset: data, ...rpcResult });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.repair");
    }
  });

  app.post(`${PREFIX}/assets/:id/next-inspection`, requirePermission("inventory.move"), async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      const assetId = c.req.param("id");
      const loaded = await loadAsset(c, org, assetId);
      if ("response" in loaded) return loaded.response;
      const body = await c.req.json() as Record<string, unknown>;
      const note = String(body.note ?? "").trim();
      if (!note) return c.json({ error: "note required" }, 400);
      const rawDue = body.next_inspection_due ?? body.nextInspectionDue ?? body.inspection_due;
      let due: string | null = null;
      if (rawDue != null && String(rawDue).trim() !== "") {
        const d = new Date(String(rawDue));
        if (Number.isNaN(d.getTime())) return c.json({ error: "invalid next_inspection_due" }, 400);
        due = d.toISOString().slice(0, 10);
      }
      const rpcResult = await rpcJson(c, "inv_asset_set_next_inspection", {
        p_org_id: org,
        p_asset_id: assetId,
        p_next_inspection_due: due,
        p_note: note,
        p_actor: actorId(c),
      });
      if (rpcResult instanceof Response) return rpcResult;
      const { data, error } = await fleetDb().from("fleet_inv_asset").select("*")
        .eq("organization_id", org).eq("id", assetId).single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ asset: data, ...rpcResult });
    } catch (e) {
      return safeErrorResponse(c, e, "inventory.assets.next_inspection");
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

  app.get(`${PREFIX}/alerts`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_alert").select("*").eq("organization_id", org)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return c.json({ error: error.message }, 500);
    const derived = await buildDerivedAssetAlerts(org);
    const merged = [...(data ?? []), ...derived];
    merged.sort((a, b) => {
      const ta = new Date(String(a.created_at ?? 0)).getTime();
      const tb = new Date(String(b.created_at ?? 0)).getTime();
      return tb - ta;
    });
    return c.json({ items: merged });
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

  app.get(`${PREFIX}/analytics/kit-reserve`, requirePermission("inventory.view"), async (c) => {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const { data, error } = await fleetDb().from("fleet_inv_v_kit_reserve").select("*").eq("organization_id", org);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  registerInventoryR16Routes(app);
}
