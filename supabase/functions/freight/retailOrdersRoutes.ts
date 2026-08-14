/**
 * Retail order API — Order → line items → packages (shared commercial invoice).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import {
  requireEnterpriseAccess,
  serviceClient,
  type EnterpriseAccessUser,
} from "../_shared/enterpriseAccess.ts";
import { uploadOrgFile } from "./orgFiles.ts";

type FreightApp = Hono;

function freightDb() {
  return serviceClient().schema("freight");
}

async function requireUser(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<EnterpriseAccessUser | Response> {
  return requireEnterpriseAccess(c);
}

const lineBody = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().max(9999).optional(),
  unitValueUsdMinor: z.number().int().nonnegative().optional().nullable(),
  lineTotalUsdMinor: z.number().int().nonnegative().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

function trackingOrNull(raw?: string | null): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

const packageBody = z.object({
  courierTrackingNumber: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  weightLbs: z.number().nonnegative().optional().nullable(),
  lengthIn: z.number().nonnegative().optional().nullable(),
  widthIn: z.number().nonnegative().optional().nullable(),
  heightIn: z.number().nonnegative().optional().nullable(),
  declaredValueUsdMinor: z.number().int().nonnegative().optional().nullable(),
  intendedFacilityId: z.string().uuid().optional().nullable(),
  /** Indexes into the lines array sent with the same create (0-based). */
  lineIndexes: z.array(z.number().int().nonnegative()).optional(),
  /** Explicit line UUIDs when adding a package to an existing order. */
  lineIds: z.array(z.string().uuid()).optional(),
});

const orderCreateBody = z.object({
  suiteId: z.string().uuid(),
  retailer: z.string().max(200).optional().nullable(),
  externalOrderNumber: z.string().max(120).optional().nullable(),
  orderTotalUsdMinor: z.number().int().nonnegative().optional().nullable(),
  intendedFacilityId: z.string().uuid().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  lines: z.array(lineBody).max(100).optional(),
  packages: z.array(packageBody).max(40).optional(),
});

function lineTotalMinor(line: {
  quantity?: number;
  unitValueUsdMinor?: number | null;
  lineTotalUsdMinor?: number | null;
}): number | null {
  if (line.lineTotalUsdMinor != null) return line.lineTotalUsdMinor;
  if (line.unitValueUsdMinor == null) return null;
  const qty = line.quantity ?? 1;
  return Math.round(line.unitValueUsdMinor * qty);
}

function descriptionFromLines(
  lines: Array<{ description: string }>,
): string | null {
  if (!lines.length) return null;
  const labels = lines.map((l) => l.description.trim()).filter(Boolean);
  if (!labels.length) return null;
  return labels.slice(0, 3).join("; ") + (labels.length > 3 ? "; …" : "");
}

async function loadOrderDetail(orgId: string, orderId: string) {
  const db = freightDb();
  const { data: order, error } = await db
    .from("retail_orders")
    .select("*, suites(id, suite_code, contact_name, contact_phone, trn, trn_valid)")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;

  const { data: lines } = await db
    .from("retail_order_lines")
    .select("*")
    .eq("order_id", orderId)
    .eq("organization_id", orgId)
    .order("sort_order");

  const { data: packages } = await db
    .from("packages")
    .select(
      "id, courier_tracking_number, status, weight_lbs, declared_value_usd_minor, description, intended_facility_id, retail_order_id, created_at",
    )
    .eq("retail_order_id", orderId)
    .eq("organization_id", orgId)
    .order("created_at");

  const unassignedLineCount = (lines ?? []).filter((l) => !l.package_id).length;

  return {
    order,
    lines: lines ?? [],
    packages: packages ?? [],
    unassignedLineCount,
  };
}

export function registerRetailOrderRoutes(app: FreightApp) {
  app.get("/retail-orders", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const status = c.req.query("status");
    let q = freightDb()
      .from("retail_orders")
      .select(
        "*, suites(suite_code, contact_name), retail_order_lines(id, package_id)",
      )
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const orders = (data ?? []).map((row) => {
      const lines = (row.retail_order_lines ?? []) as Array<{
        id: string;
        package_id?: string | null;
      }>;
      const { retail_order_lines: _drop, ...order } = row as Record<
        string,
        unknown
      > & { retail_order_lines?: unknown };
      return {
        ...order,
        lineCount: lines.length,
        unassignedLineCount: lines.filter((l) => !l.package_id).length,
      };
    });
    return c.json({ orders });
  });

  app.get("/retail-orders/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    try {
      const detail = await loadOrderDetail(
        user.organizationId,
        c.req.param("id"),
      );
      if (!detail) return c.json({ error: "Not found" }, 404);
      return c.json(detail);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  /** Create order (+ optional lines + packages) in one wizard submit. */
  app.post("/retail-orders", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = orderCreateBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const db = freightDb();
    const now = new Date().toISOString();

    const { data: suite } = await db
      .from("suites")
      .select("id")
      .eq("id", b.suiteId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!suite) return c.json({ error: "Suite not found" }, 400);

    const { data: order, error: orderErr } = await db
      .from("retail_orders")
      .insert({
        organization_id: user.organizationId,
        owner_org_id: user.organizationId,
        suite_id: b.suiteId,
        retailer: b.retailer?.trim() || null,
        external_order_number: b.externalOrderNumber?.trim() || null,
        order_total_usd_minor: b.orderTotalUsdMinor ?? null,
        intended_facility_id: b.intendedFacilityId || null,
        notes: b.notes || null,
        status: "open",
        updated_at: now,
      })
      .select("*")
      .single();
    if (orderErr) return c.json({ error: orderErr.message }, 500);

    const lineInputs = b.lines ?? [];
    const lineRows = lineInputs.map((line, i) => {
      const total = lineTotalMinor(line);
      const qty = line.quantity ?? 1;
      return {
        organization_id: user.organizationId,
        order_id: order.id,
        description: line.description.trim(),
        quantity: qty,
        unit_value_usd_minor: line.unitValueUsdMinor ?? null,
        line_total_usd_minor: total,
        sort_order: line.sortOrder ?? i,
        package_id: null as string | null,
        updated_at: now,
      };
    });

    let insertedLines: Array<Record<string, unknown>> = [];
    if (lineRows.length) {
      const { data: lines, error: lineErr } = await db
        .from("retail_order_lines")
        .insert(lineRows)
        .select("*");
      if (lineErr) return c.json({ error: lineErr.message }, 500);
      insertedLines = lines ?? [];
    }

    const packagesOut: Array<Record<string, unknown>> = [];
    for (const pkgIn of b.packages ?? []) {
      const assignedLines =
        pkgIn.lineIndexes && pkgIn.lineIndexes.length
          ? pkgIn.lineIndexes
              .map((idx) => insertedLines[idx])
              .filter(Boolean)
          : [];

      const valueFromLines = assignedLines.reduce((sum, l) => {
        const v = Number(l.line_total_usd_minor);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);

      const declared =
        pkgIn.declaredValueUsdMinor != null
          ? pkgIn.declaredValueUsdMinor
          : assignedLines.length
            ? valueFromLines
            : null;

      const desc =
        pkgIn.description?.trim() ||
        descriptionFromLines(
          assignedLines.map((l) => ({
            description: String(l.description || ""),
          })),
        );

      const { data: pkg, error: pkgErr } = await db
        .from("packages")
        .insert({
          organization_id: user.organizationId,
          owner_org_id: user.organizationId,
          suite_id: b.suiteId,
          retail_order_id: order.id,
          courier_tracking_number: trackingOrNull(pkgIn.courierTrackingNumber),
          description: desc,
          retailer: b.retailer?.trim() || null,
          status: "expected",
          weight_lbs: pkgIn.weightLbs ?? null,
          length_in: pkgIn.lengthIn ?? null,
          width_in: pkgIn.widthIn ?? null,
          height_in: pkgIn.heightIn ?? null,
          declared_value_usd_minor: declared,
          intended_facility_id:
            pkgIn.intendedFacilityId || b.intendedFacilityId || null,
          updated_at: now,
        })
        .select("*")
        .single();
      if (pkgErr) return c.json({ error: pkgErr.message }, 500);

      await db.from("package_scan_events").insert({
        organization_id: user.organizationId,
        package_id: pkg.id,
        event_type: "pre_alert",
        actor_user_id: user.id,
        note: "Ops pre-alert via retail order",
        occurred_at: now,
      });

      if (assignedLines.length) {
        const ids = assignedLines.map((l) => String(l.id));
        await db
          .from("retail_order_lines")
          .update({ package_id: pkg.id, updated_at: now })
          .eq("organization_id", user.organizationId)
          .eq("order_id", order.id)
          .in("id", ids);
      }

      packagesOut.push(pkg);
    }

    try {
      const detail = await loadOrderDetail(user.organizationId, order.id);
      return c.json(detail, 201);
    } catch {
      return c.json(
        { order, lines: insertedLines, packages: packagesOut },
        201,
      );
    }
  });

  app.patch("/retail-orders/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        retailer: z.string().max(200).optional().nullable(),
        externalOrderNumber: z.string().max(120).optional().nullable(),
        orderTotalUsdMinor: z.number().int().nonnegative().optional().nullable(),
        intendedFacilityId: z.string().uuid().optional().nullable(),
        notes: z.string().max(4000).optional().nullable(),
        status: z.enum(["open", "closed"]).optional(),
        verifyInvoice: z.boolean().optional(),
        invoiceUnobtainable: z.boolean().optional(),
        unobtainableNote: z.string().max(1000).optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;
    const id = c.req.param("id");
    const now = new Date().toISOString();

    const { data: existing } = await freightDb()
      .from("retail_orders")
      .select("id")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const patch: Record<string, unknown> = { updated_at: now };
    if (b.retailer !== undefined) patch.retailer = b.retailer?.trim() || null;
    if (b.externalOrderNumber !== undefined) {
      patch.external_order_number = b.externalOrderNumber?.trim() || null;
    }
    if (b.orderTotalUsdMinor !== undefined) {
      patch.order_total_usd_minor = b.orderTotalUsdMinor;
    }
    if (b.intendedFacilityId !== undefined) {
      patch.intended_facility_id = b.intendedFacilityId || null;
    }
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.status !== undefined) patch.status = b.status;

    if (b.verifyInvoice === true) {
      patch.invoice_verified_at = now;
      patch.invoice_verified_by = user.id;
      patch.invoice_unobtainable_at = null;
      patch.invoice_unobtainable_by = null;
      patch.invoice_unobtainable_note = null;
    }
    if (typeof b.invoiceUnobtainable === "boolean") {
      if (b.invoiceUnobtainable) {
        patch.invoice_unobtainable_at = now;
        patch.invoice_unobtainable_by = user.id;
        patch.invoice_unobtainable_note = b.unobtainableNote ?? null;
      } else {
        patch.invoice_unobtainable_at = null;
        patch.invoice_unobtainable_by = null;
        patch.invoice_unobtainable_note = null;
      }
    }

    const { error } = await freightDb()
      .from("retail_orders")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", user.organizationId);
    if (error) return c.json({ error: error.message }, 500);

    const detail = await loadOrderDetail(user.organizationId, id);
    return c.json(detail);
  });

  app.post("/retail-orders/:id/invoice", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: existing } = await freightDb()
      .from("retail_orders")
      .select("id")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    const upload = await uploadOrgFile({
      organizationId: user.organizationId,
      file,
      kind: "invoice",
      sourceType: "retail_order",
      sourceId: id,
      uploadedBy: user.id,
      fileName: form.fileName ? String(form.fileName) : null,
    });
    if (!upload.ok) return c.json({ error: upload.error }, upload.status);

    const now = new Date().toISOString();
    const { data: order, error } = await freightDb()
      .from("retail_orders")
      .update({
        invoice_storage_path: upload.file.storage_path,
        invoice_file_name: upload.file.file_name,
        invoice_verified_at: null,
        invoice_verified_by: null,
        invoice_unobtainable_at: null,
        invoice_unobtainable_by: null,
        invoice_unobtainable_note: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);

    // Pre-alert invoice is order-scoped; seal UI / verify look at packages — keep them in sync.
    await freightDb()
      .from("packages")
      .update({
        invoice_storage_path: upload.file.storage_path,
        invoice_file_name: upload.file.file_name,
        invoice_verified_at: null,
        invoice_verified_by: null,
        invoice_unobtainable_at: null,
        invoice_unobtainable_by: null,
        invoice_unobtainable_note: null,
        updated_at: now,
      })
      .eq("retail_order_id", id)
      .eq("organization_id", user.organizationId)
      .is("invoice_storage_path", null);

    return c.json({ order, file: upload.file });
  });

  app.post("/retail-orders/:id/lines", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const orderId = c.req.param("id");
    const parsed = lineBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data: order } = await freightDb()
      .from("retail_orders")
      .select("id")
      .eq("id", orderId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!order) return c.json({ error: "Not found" }, 404);

    const line = parsed.data;
    const total = lineTotalMinor(line);
    const { data, error } = await freightDb()
      .from("retail_order_lines")
      .insert({
        organization_id: user.organizationId,
        order_id: orderId,
        description: line.description.trim(),
        quantity: line.quantity ?? 1,
        unit_value_usd_minor: line.unitValueUsdMinor ?? null,
        line_total_usd_minor: total,
        sort_order: line.sortOrder ?? 0,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ line: data }, 201);
  });

  app.patch("/retail-orders/:orderId/lines/:lineId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        description: z.string().min(1).max(500).optional(),
        quantity: z.number().positive().max(9999).optional(),
        unitValueUsdMinor: z.number().int().nonnegative().optional().nullable(),
        lineTotalUsdMinor: z.number().int().nonnegative().optional().nullable(),
        packageId: z.string().uuid().optional().nullable(),
        sortOrder: z.number().int().optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (b.description !== undefined) patch.description = b.description.trim();
    if (b.quantity !== undefined) patch.quantity = b.quantity;
    if (b.unitValueUsdMinor !== undefined) {
      patch.unit_value_usd_minor = b.unitValueUsdMinor;
    }
    if (b.lineTotalUsdMinor !== undefined) {
      patch.line_total_usd_minor = b.lineTotalUsdMinor;
    } else if (b.unitValueUsdMinor !== undefined || b.quantity !== undefined) {
      const { data: cur } = await freightDb()
        .from("retail_order_lines")
        .select("quantity, unit_value_usd_minor")
        .eq("id", c.req.param("lineId"))
        .eq("organization_id", user.organizationId)
        .maybeSingle();
      if (cur) {
        const qty = b.quantity ?? Number(cur.quantity) ?? 1;
        const unit =
          b.unitValueUsdMinor !== undefined
            ? b.unitValueUsdMinor
            : cur.unit_value_usd_minor;
        if (unit != null) patch.line_total_usd_minor = Math.round(Number(unit) * qty);
      }
    }
    if (b.packageId !== undefined) patch.package_id = b.packageId;
    if (b.sortOrder !== undefined) patch.sort_order = b.sortOrder;

    const { data, error } = await freightDb()
      .from("retail_order_lines")
      .update(patch)
      .eq("id", c.req.param("lineId"))
      .eq("order_id", c.req.param("orderId"))
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ line: data });
  });

  app.delete("/retail-orders/:orderId/lines/:lineId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { error } = await freightDb()
      .from("retail_order_lines")
      .delete()
      .eq("id", c.req.param("lineId"))
      .eq("order_id", c.req.param("orderId"))
      .eq("organization_id", user.organizationId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  /** Add another package (tracking) under an existing order. */
  app.post("/retail-orders/:id/packages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const orderId = c.req.param("id");
    const parsed = packageBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const db = freightDb();
    const now = new Date().toISOString();

    const { data: order } = await db
      .from("retail_orders")
      .select("*")
      .eq("id", orderId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!order) return c.json({ error: "Not found" }, 404);

    let assignedLines: Array<Record<string, unknown>> = [];
    if (b.lineIds?.length) {
      const { data: lines } = await db
        .from("retail_order_lines")
        .select("*")
        .eq("order_id", orderId)
        .eq("organization_id", user.organizationId)
        .in("id", b.lineIds)
        .is("package_id", null);
      assignedLines = lines ?? [];
    }

    const valueFromLines = assignedLines.reduce((sum, l) => {
      const v = Number(l.line_total_usd_minor);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const declared =
      b.declaredValueUsdMinor != null
        ? b.declaredValueUsdMinor
        : assignedLines.length
          ? valueFromLines
          : null;

    const desc =
      b.description?.trim() ||
      descriptionFromLines(
        assignedLines.map((l) => ({ description: String(l.description || "") })),
      );

    const { data: pkg, error: pkgErr } = await db
      .from("packages")
      .insert({
        organization_id: user.organizationId,
        owner_org_id: user.organizationId,
        suite_id: order.suite_id,
        retail_order_id: orderId,
        courier_tracking_number: trackingOrNull(b.courierTrackingNumber),
        description: desc,
        retailer: order.retailer,
        status: "expected",
        weight_lbs: b.weightLbs ?? null,
        length_in: b.lengthIn ?? null,
        width_in: b.widthIn ?? null,
        height_in: b.heightIn ?? null,
        declared_value_usd_minor: declared,
        intended_facility_id:
          b.intendedFacilityId || order.intended_facility_id || null,
        updated_at: now,
      })
      .select("*")
      .single();
    if (pkgErr) return c.json({ error: pkgErr.message }, 500);

    await db.from("package_scan_events").insert({
      organization_id: user.organizationId,
      package_id: pkg.id,
      event_type: "pre_alert",
      actor_user_id: user.id,
      note: "Ops pre-alert via retail order",
      occurred_at: now,
    });

    if (assignedLines.length) {
      await db
        .from("retail_order_lines")
        .update({ package_id: pkg.id, updated_at: now })
        .eq("organization_id", user.organizationId)
        .eq("order_id", orderId)
        .in(
          "id",
          assignedLines.map((l) => String(l.id)),
        );
    }

    const detail = await loadOrderDetail(user.organizationId, orderId);
    return c.json({ package: pkg, ...detail }, 201);
  });
}
