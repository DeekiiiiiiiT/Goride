/**
 * Courier OS additive routes — HS tariffs, duty, readiness, AWBOLDS, JCA, clearance, billing.
 * Registered alongside pipeline without modifying existing endpoint contracts.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import { requireEnterpriseAccess } from "../_shared/enterpriseAccess.ts";
import { serviceClient } from "../_shared/enterpriseAccess.ts";
import { canTransitionPackage } from "./packageTransitions.ts";
import { computeLandedCost, DEFAULT_FX_USD_JMD } from "./landedCost.ts";
import { resolveImportGctRateFraction } from "./resolveImportGctRate.ts";
import { evaluateManifestReadiness } from "./manifestReadiness.ts";
import { buildAwboldsXml, sha256Hex } from "./awboldsXml.ts";
import { submitAwboldsToJca } from "./jcaSubmit.ts";
import {
  buildDualLedgerInvoice,
  computeDutyFromPackageRow,
} from "./dualLedgerBilling.ts";
import { isValidJamaicaTrn, normalizeTrn, validateTrn } from "./validateTrn.ts";
import { notifyPackageContact } from "./notifyPackage.ts";
import { uploadOrgFile } from "./orgFiles.ts";

type FreightApp = Hono;

function freightDb() {
  return serviceClient().schema("freight");
}

async function requireUser(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}) {
  return requireEnterpriseAccess(c);
}

function invoiceNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = Math.floor(Math.random() * 1e4).toString().padStart(4, "0");
  return `INV-${d}-${n}`;
}

async function loadManifestPackages(orgId: string, manifestId: string) {
  const { data: lines } = await freightDb()
    .from("manifest_packages")
    .select(
      "line_number, package_id, packages(*, suites(suite_code, trn, trn_valid, contact_name), retail_orders(invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at))",
    )
    .eq("manifest_id", manifestId)
    .eq("organization_id", orgId)
    .order("line_number");
  return (lines ?? []).map((l) => {
    const p = (l.packages ?? {}) as Record<string, unknown>;
    return {
      lineNumber: l.line_number as number,
      package: {
        ...p,
        suites: p.suites as {
          suite_code?: string | null;
          trn?: string | null;
          trn_valid?: boolean | null;
          contact_name?: string | null;
        } | null,
        retail_orders: p.retail_orders as {
          invoice_storage_path?: string | null;
          invoice_file_name?: string | null;
          invoice_verified_at?: string | null;
          invoice_unobtainable_at?: string | null;
        } | null,
      },
    };
  });
}

function lbsToKg(lbs: number | null | undefined): number {
  const n = Number(lbs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 0.45359237 * 1000) / 1000;
}

export function registerCourierOsRoutes(app: FreightApp) {
  // ---- Pipeline funnel dashboard ----
  app.get("/pipeline/command", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data: pkgs } = await freightDb()
      .from("packages")
      .select(
        "status, created_at, updated_at, invoice_required_from_customer, invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at, retail_order_id",
      )
      .eq("organization_id", user.organizationId);

    const nowMs = Date.now();
    const counts: Record<string, number> = {};
    const oldestByStatus: Record<string, string | null> = {};

    type PkgRow = {
      status?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      invoice_required_from_customer?: boolean | null;
      invoice_storage_path?: string | null;
      invoice_file_name?: string | null;
      invoice_verified_at?: string | null;
      invoice_unobtainable_at?: string | null;
      retail_order_id?: string | null;
    };

    const orderIds = [
      ...new Set(
        ((pkgs ?? []) as PkgRow[])
          .map((p) => p.retail_order_id)
          .filter(Boolean) as string[],
      ),
    ];
    const orderInvoiceMap = new Map<
      string,
      {
        invoice_storage_path?: string | null;
        invoice_file_name?: string | null;
        invoice_verified_at?: string | null;
        invoice_unobtainable_at?: string | null;
      }
    >();
    if (orderIds.length) {
      const { data: orders } = await freightDb()
        .from("retail_orders")
        .select(
          "id, invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at",
        )
        .in("id", orderIds);
      for (const o of orders ?? []) orderInvoiceMap.set(String(o.id), o);
    }

    const packageHasInvoice = (p: PkgRow) => {
      const order = p.retail_order_id
        ? orderInvoiceMap.get(p.retail_order_id)
        : null;
      const hasCustomer = Boolean(
        p.invoice_storage_path ||
          p.invoice_file_name ||
          order?.invoice_storage_path ||
          order?.invoice_file_name,
      );
      const unobtainable = Boolean(
        p.invoice_unobtainable_at || order?.invoice_unobtainable_at,
      );
      const verified = Boolean(
        p.invoice_verified_at || order?.invoice_verified_at,
      );
      return { hasCustomer, unobtainable, verified };
    };

    const byStatus: Record<string, PkgRow[]> = {};
    for (const p of (pkgs ?? []) as PkgRow[]) {
      const s = String(p.status ?? "");
      counts[s] = (counts[s] ?? 0) + 1;
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push(p);
      const created = p.created_at || null;
      if (created) {
        const prev = oldestByStatus[s];
        if (!prev || created < prev) oldestByStatus[s] = created;
      } else if (oldestByStatus[s] === undefined) {
        oldestByStatus[s] = null;
      }
    }

    const ageHoursFrom = (iso: string | null): number | null => {
      if (!iso) return null;
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return null;
      return Math.max(0, Math.round(((nowMs - t) / 3_600_000) * 10) / 10);
    };

    const oldestAmong = (rows: PkgRow[], useUpdated = false): string | null => {
      let oldest: string | null = null;
      for (const r of rows) {
        const iso = useUpdated
          ? r.updated_at || r.created_at || null
          : r.created_at || r.updated_at || null;
        if (!iso) continue;
        if (!oldest || iso < oldest) oldest = iso;
      }
      return oldest;
    };

    // Needs invoice = no customer file yet (order-level upload counts). Verified/unobtainable/on-file are not missing.
    const invoiceEligibleStatuses = new Set([
      "expected",
      "received_at_warehouse",
      "exception",
    ]);
    const needsInvoiceRows = ((pkgs ?? []) as PkgRow[]).filter((p) => {
      if (!invoiceEligibleStatuses.has(String(p.status ?? ""))) return false;
      const { hasCustomer, unobtainable, verified } = packageHasInvoice(p);
      if (verified || unobtainable || hasCustomer) return false;
      return true;
    });

    const { data: dutyRows } = await freightDb()
      .from("package_duty")
      .select("total_duty_jmd_minor, created_at, package_id")
      .eq("organization_id", user.organizationId);
    const dutyOutstandingJmdMinor = (dutyRows ?? []).reduce(
      (a, r) => a + Number(r.total_duty_jmd_minor ?? 0),
      0,
    );
    let oldestDutyAt: string | null = null;
    for (const r of dutyRows ?? []) {
      if (Number(r.total_duty_jmd_minor ?? 0) <= 0) continue;
      const iso = (r as { created_at?: string | null }).created_at || null;
      if (!iso) continue;
      if (!oldestDutyAt || iso < oldestDutyAt) oldestDutyAt = iso;
    }

    type NeedsYouItem = {
      key: string;
      label: string;
      count: number;
      oldestAt: string | null;
      ageHours: number | null;
      href: string;
      actionLabel: string;
    };

    const candidates: NeedsYouItem[] = [];

    const pushStatusNeed = (
      key: string,
      label: string,
      status: string,
      href: string,
      actionLabel: string,
    ) => {
      const rows = byStatus[status] ?? [];
      const count = rows.length;
      if (count === 0) return;
      const oldestAt = oldestAmong(rows);
      candidates.push({
        key,
        label,
        count,
        oldestAt,
        ageHours: ageHoursFrom(oldestAt),
        href,
        actionLabel,
      });
    };

    if (needsInvoiceRows.length > 0) {
      const oldestAt = oldestAmong(needsInvoiceRows, true);
      candidates.push({
        key: "needs_invoice",
        label: "Needs invoice",
        count: needsInvoiceRows.length,
        oldestAt,
        ageHours: ageHoursFrom(oldestAt),
        href: "/app/packages?tab=needs-invoice",
        actionLabel: "Open invoice queue",
      });
    }

    {
      const { count: unassignedCount } = await freightDb()
        .from("retail_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId)
        .is("package_id", null);
      if ((unassignedCount ?? 0) > 0) {
        candidates.push({
          key: "unassigned_order_lines",
          label: "Items not on a package",
          count: unassignedCount ?? 0,
          oldestAt: null,
          ageHours: null,
          href: "/app/packages?tab=expected",
          actionLabel: "Review pre-alerts",
        });
      }
    }

    pushStatusNeed(
      "expected",
      "Expected",
      "expected",
      "/app/packages?tab=expected",
      "Review pre-alerts",
    );
    pushStatusNeed(
      "customs_hold",
      "Customs hold",
      "customs_hold",
      "/app/customs?tab=lanes",
      "Work customs hold",
    );

    if (dutyOutstandingJmdMinor > 0) {
      candidates.push({
        key: "duty",
        label: "Duty outstanding",
        count: (dutyRows ?? []).filter((r) => Number(r.total_duty_jmd_minor ?? 0) > 0)
          .length || 1,
        oldestAt: oldestDutyAt,
        ageHours: ageHoursFrom(oldestDutyAt),
        href: "/app/billing",
        actionLabel: "Review duty billing",
      });
    }

    pushStatusNeed(
      "received_hub",
      "At hub",
      "received_hub",
      "/app/hub",
      "Mark ready on hub",
    );
    pushStatusNeed(
      "ready_for_fulfillment",
      "Ready for fulfillment",
      "ready_for_fulfillment",
      "/app/fulfillment",
      "Assign last mile",
    );
    pushStatusNeed(
      "exception",
      "Exception",
      "exception",
      "/app/packages",
      "Resolve exceptions",
    );

    const needsYou = candidates.slice(0, 6);

    return c.json({
      counts,
      dutyOutstandingJmdMinor,
      oldestDutyAt,
      oldestByStatus,
      needsYou,
    });
  });

  // ---- HS tariffs ----
  app.get("/hs-tariffs", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("hs_tariff_codes")
      .select("*")
      .eq("organization_id", user.organizationId)
      .order("code");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ tariffs: data ?? [] });
  });

  app.post("/hs-tariffs", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        code: z.string().min(2).max(32),
        description: z.string().max(500).default(""),
        category: z.string().max(80).default("General"),
        cetRate: z.number().min(0).max(1),
        active: z.boolean().optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;
    const { data, error } = await freightDb()
      .from("hs_tariff_codes")
      .insert({
        organization_id: user.organizationId,
        code: b.code.trim(),
        description: b.description,
        category: b.category,
        cet_rate: b.cetRate,
        active: b.active ?? true,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ tariff: data }, 201);
  });

  app.patch("/hs-tariffs/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        description: z.string().max(500).optional(),
        category: z.string().max(80).optional(),
        cetRate: z.number().min(0).max(1).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.data.description !== undefined) patch.description = body.data.description;
    if (body.data.category !== undefined) patch.category = body.data.category;
    if (body.data.cetRate !== undefined) patch.cet_rate = body.data.cetRate;
    if (body.data.active !== undefined) patch.active = body.data.active;
    const { data, error } = await freightDb()
      .from("hs_tariff_codes")
      .update(patch)
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    return c.json({ tariff: data });
  });

  // ---- Invoice audit queue ----
  app.get("/packages/pre-alerts/export", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const intendedFacilityId = c.req.query("intendedFacilityId");
    let q = freightDb()
      .from("packages")
      .select(
        "courier_tracking_number, retailer, description, declared_value_usd_minor, weight_lbs, length_in, width_in, height_in, invoice_storage_path, invoice_file_name, intended_facility_id, suites(suite_code, contact_name, contact_phone)",
      )
      .eq("organization_id", user.organizationId)
      .eq("status", "expected")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (intendedFacilityId === "external") {
      q = q.is("intended_facility_id", null);
    } else if (intendedFacilityId) {
      q = q.eq("intended_facility_id", intendedFacilityId);
    }
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const header = [
      "tracking",
      "suite_code",
      "contact_name",
      "contact_phone",
      "retailer",
      "description",
      "declared_value_usd",
      "weight_lbs",
      "length_in",
      "width_in",
      "height_in",
      "invoice_on_file",
    ];
    const esc = (s: string) => {
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [header.join(",")];
    for (const row of data ?? []) {
      const suite = (row.suites ?? {}) as {
        suite_code?: string;
        contact_name?: string;
        contact_phone?: string;
      };
      const declared =
        row.declared_value_usd_minor != null
          ? (Number(row.declared_value_usd_minor) / 100).toFixed(2)
          : "";
      lines.push(
        [
          esc(String(row.courier_tracking_number ?? "")),
          esc(String(suite.suite_code ?? "")),
          esc(String(suite.contact_name ?? "")),
          esc(String(suite.contact_phone ?? "")),
          esc(String(row.retailer ?? "")),
          esc(String(row.description ?? "")),
          esc(declared),
          esc(row.weight_lbs != null ? String(row.weight_lbs) : ""),
          esc(row.length_in != null ? String(row.length_in) : ""),
          esc(row.width_in != null ? String(row.width_in) : ""),
          esc(row.height_in != null ? String(row.height_in) : ""),
          esc(
            row.invoice_storage_path || row.invoice_file_name ? "yes" : "no",
          ),
        ].join(","),
      );
    }
    return c.json({
      csv: lines.join("\n") + "\n",
      count: (data ?? []).length,
    });
  });

  app.get("/packages/invoice-audit", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const tab = c.req.query("tab") || "missing";
    const { data, error } = await freightDb()
      .from("packages")
      .select(
        "id, courier_tracking_number, declared_value_usd_minor, weight_lbs, invoice_storage_path, invoice_file_name, invoice_verified_at, warehouse_invoice_storage_path, warehouse_invoice_file_name, invoice_required_from_customer, invoice_unobtainable_at, invoice_unobtainable_note, status, retail_order_id, suites(suite_code), retail_orders(invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at)",
      )
      .eq("organization_id", user.organizationId)
      .in("status", ["expected", "received_at_warehouse", "exception"])
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);

    type AuditTab = "required" | "missing" | "mismatch" | "unobtainable" | "ready";
    const classify = (p: (typeof data)[number]): AuditTab | null => {
      const order = (p as {
        retail_orders?: {
          invoice_storage_path?: string | null;
          invoice_file_name?: string | null;
          invoice_verified_at?: string | null;
          invoice_unobtainable_at?: string | null;
        } | null;
      }).retail_orders;
      const hasCustomer = Boolean(
        p.invoice_storage_path ||
          p.invoice_file_name ||
          order?.invoice_storage_path ||
          order?.invoice_file_name,
      );
      const unobtainable = Boolean(
        p.invoice_unobtainable_at || order?.invoice_unobtainable_at,
      );
      const verified = Boolean(p.invoice_verified_at || order?.invoice_verified_at);
      const required = Boolean(p.invoice_required_from_customer);
      if (verified) return "ready";
      if (unobtainable) return "unobtainable";
      if (required && !hasCustomer) return "required";
      if (!hasCustomer) return "missing";
      return "mismatch";
    };

    const counts: Record<AuditTab, number> = {
      required: 0,
      missing: 0,
      mismatch: 0,
      unobtainable: 0,
      ready: 0,
    };
    for (const p of data ?? []) {
      const bucket = classify(p);
      if (bucket) counts[bucket] += 1;
    }

    const filtered = (data ?? []).filter((p) => classify(p) === tab);
    return c.json({ packages: filtered, counts });
  });

  /** Multipart invoice attach — slot=warehouse|customer (default customer). */
  app.post("/packages/:id/invoice", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: existing } = await freightDb()
      .from("packages")
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
    const slotRaw = String(form.slot || "customer").toLowerCase();
    const slot = slotRaw === "warehouse" ? "warehouse" : "customer";

    const upload = await uploadOrgFile({
      organizationId: user.organizationId,
      file,
      kind: "invoice",
      sourceType: "package",
      sourceId: id,
      uploadedBy: user.id,
      fileName: form.fileName ? String(form.fileName) : null,
    });
    if (!upload.ok) return c.json({ error: upload.error }, upload.status);

    const now = new Date().toISOString();
    const patch =
      slot === "warehouse"
        ? {
            warehouse_invoice_storage_path: upload.file.storage_path,
            warehouse_invoice_file_name: upload.file.file_name,
            updated_at: now,
          }
        : {
            invoice_storage_path: upload.file.storage_path,
            invoice_file_name: upload.file.file_name,
            // New customer file invalidates prior verification / unobtainable
            invoice_verified_at: null,
            invoice_verified_by: null,
            invoice_unobtainable_at: null,
            invoice_unobtainable_by: null,
            invoice_unobtainable_note: null,
            invoice_required_from_customer: false,
            updated_at: now,
          };

    const { data: pkg, error } = await freightDb()
      .from("packages")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ package: pkg, file: upload.file, slot });
  });

  /** Warehouse / courier invoice workflow flags. */
  app.post("/packages/:id/invoice-flags", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        invoiceRequiredFromCustomer: z.boolean().optional(),
        invoiceUnobtainable: z.boolean().optional(),
        unobtainableNote: z.string().max(1000).optional().nullable(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const id = c.req.param("id");
    const { data: current } = await freightDb()
      .from("packages")
      .select("id")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!current) return c.json({ error: "Not found" }, 404);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (typeof body.data.invoiceRequiredFromCustomer === "boolean") {
      patch.invoice_required_from_customer = body.data.invoiceRequiredFromCustomer;
    }
    if (typeof body.data.invoiceUnobtainable === "boolean") {
      if (body.data.invoiceUnobtainable) {
        patch.invoice_unobtainable_at = now;
        patch.invoice_unobtainable_by = user.id;
        patch.invoice_unobtainable_note = body.data.unobtainableNote ?? null;
        patch.invoice_required_from_customer = false;
      } else {
        patch.invoice_unobtainable_at = null;
        patch.invoice_unobtainable_by = null;
        patch.invoice_unobtainable_note = null;
      }
    }

    const { data: pkg, error } = await freightDb()
      .from("packages")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ package: pkg });
  });

  app.post("/packages/:id/verify-invoice", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({ note: z.string().max(1000).optional().nullable() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const { data: current } = await freightDb()
      .from("packages")
      .select("id, invoice_storage_path, invoice_file_name, retail_order_id")
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!current) return c.json({ error: "Not found" }, 404);

    let storagePath = current.invoice_storage_path as string | null;
    let fileName = current.invoice_file_name as string | null;
    if (!storagePath && !fileName && current.retail_order_id) {
      const { data: order } = await freightDb()
        .from("retail_orders")
        .select("invoice_storage_path, invoice_file_name")
        .eq("id", current.retail_order_id)
        .eq("organization_id", user.organizationId)
        .maybeSingle();
      storagePath = (order?.invoice_storage_path as string | null) ?? null;
      fileName = (order?.invoice_file_name as string | null) ?? null;
    }
    if (!storagePath && !fileName) {
      return c.json(
        { error: "Upload a customer commercial invoice before verifying" },
        400,
      );
    }

    const now = new Date().toISOString();
    const { data: pkg, error } = await freightDb()
      .from("packages")
      .update({
        invoice_storage_path: storagePath,
        invoice_file_name: fileName,
        invoice_verified_at: now,
        invoice_verified_by: user.id,
        invoice_unobtainable_at: null,
        invoice_unobtainable_by: null,
        invoice_unobtainable_note: null,
        invoice_required_from_customer: false,
        notes: body.data.note ?? undefined,
        updated_at: now,
      })
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!pkg) return c.json({ error: "Not found" }, 404);

    if (current.retail_order_id) {
      await freightDb()
        .from("retail_orders")
        .update({
          invoice_verified_at: now,
          invoice_verified_by: user.id,
          invoice_unobtainable_at: null,
          invoice_unobtainable_by: null,
          invoice_unobtainable_note: null,
          updated_at: now,
        })
        .eq("id", current.retail_order_id)
        .eq("organization_id", user.organizationId);
    }

    return c.json({ package: pkg });
  });

  // ---- Duty compute ----
  app.post("/packages/:id/compute-duty", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: pkg } = await freightDb()
      .from("packages")
      .select("*, hs_tariff_codes(cet_rate)")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!pkg) return c.json({ error: "Not found" }, 404);
    const cet = Number(
      (pkg.hs_tariff_codes as { cet_rate?: number } | null)?.cet_rate ?? 0.2,
    );
    const gctRate = await resolveImportGctRateFraction(serviceClient());
    const result = computeLandedCost({
      itemCostUsdMinor: Number(pkg.declared_value_usd_minor ?? 0),
      freightUsdMinor: pkg.freight_fee_usd_minor,
      insuranceUsdMinor: pkg.insurance_usd_minor,
      cetRate: cet,
      gctRate,
    });
    const row = {
      organization_id: user.organizationId,
      package_id: id,
      item_cost_usd_minor: result.itemCostUsdMinor,
      freight_usd_minor: result.freightUsdMinor,
      insurance_usd_minor: result.insuranceUsdMinor,
      cif_usd_minor: result.cifUsdMinor,
      above_threshold: result.aboveThreshold,
      cet_rate: result.cetRate,
      import_duty_usd_minor: result.importDutyUsdMinor,
      scf_usd_minor: result.scfUsdMinor,
      env_usd_minor: result.envUsdMinor,
      gct_usd_minor: result.gctUsdMinor,
      stamp_jmd_minor: result.stampJmdMinor,
      caf_jmd_minor: result.cafJmdMinor,
      total_duty_usd_minor: result.totalDutyUsdMinor,
      total_duty_jmd_minor: result.totalDutyJmdMinor,
      fx_usd_jmd: result.fxUsdJmd,
      breakdown: result.breakdown,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await freightDb()
      .from("package_duty")
      .upsert(row, { onConflict: "package_id" })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ duty: data, result });
  });

  app.get("/packages/:id/duty", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data } = await freightDb()
      .from("package_duty")
      .select("*")
      .eq("package_id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    return c.json({ duty: data });
  });

  // ---- Manifest readiness / AWBOLDS / JCA ----
  app.get("/manifests/:id/readiness", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const lines = await loadManifestPackages(user.organizationId, c.req.param("id"));
    const packages = lines.map((l) => l.package as Parameters<typeof evaluateManifestReadiness>[0][number]);
    return c.json(evaluateManifestReadiness(packages));
  });

  app.post("/manifests/:id/awbolds", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: manifest } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);

    const lines = await loadManifestPackages(user.organizationId, id);
    const packages = lines.map((l) => l.package as Parameters<typeof evaluateManifestReadiness>[0][number]);
    const readiness = evaluateManifestReadiness(packages);
    // Open manifests must be seal-ready. Already sealed / in transit / arrived may still
    // export AWBOLDS even if historical package rows fail today's readiness checks.
    if (!readiness.canSeal && manifest.status === "open") {
      return c.json(
        {
          error: "validation_failed",
          message: "Resolve TRN, invoice, and weight blockers before AWBOLDS export",
          ...readiness,
        },
        400,
      );
    }

    const xml = buildAwboldsXml({
      mawb: String(manifest.awb_or_bl || manifest.manifest_number),
      carrierName: String(manifest.carrier_name || "Unknown"),
      shipmentType: (manifest.shipment_type as "air" | "sea") || "air",
      estimatedArrival: manifest.estimated_arrival,
      packages: lines.map((l, i) => {
        const p = l.package;
        const kg =
          Number(p.weight_kg) > 0
            ? Number(p.weight_kg)
            : lbsToKg(Number(p.weight_lbs));
        return {
          lineNumber: l.lineNumber || i + 1,
          hawb: String(p.courier_tracking_number || p.id),
          suiteCode: String(p.suites?.suite_code || ""),
          consigneeName: String(p.suites?.contact_name || ""),
          trn: String(p.suites?.trn || ""),
          description: String(p.description || "General merchandise"),
          weightKg: kg,
          declaredValueUsd: Number(p.declared_value_usd_minor ?? 0) / 100,
          invoiceFileName: (p.invoice_file_name as string | null) || null,
        };
      }),
    });
    const checksum = await sha256Hex(xml);
    const now = new Date().toISOString();
    const { data: filing, error } = await freightDb()
      .from("customs_filings")
      .insert({
        organization_id: user.organizationId,
        manifest_id: id,
        format: "awbolds",
        payload: xml,
        checksum,
        status: "generated",
        metadata: { packageCount: lines.length },
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ filing, xml, checksum });
  });

  app.post("/manifests/:id/submit-jca", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: manifest } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);

    let { data: filing } = await freightDb()
      .from("customs_filings")
      .select("*")
      .eq("manifest_id", id)
      .eq("organization_id", user.organizationId)
      .eq("format", "awbolds")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!filing?.payload) {
      return c.json({ error: "Generate AWBOLDS before submitting" }, 400);
    }

    const result = await submitAwboldsToJca({
      xml: String(filing.payload),
      checksum: String(filing.checksum || ""),
      mawb: String(manifest.awb_or_bl || manifest.manifest_number),
      organizationId: user.organizationId,
    });

    const now = new Date().toISOString();
    const { data: updated, error } = await freightDb()
      .from("customs_filings")
      .update({
        status: result.status,
        jca_ref: result.jcaRef,
        error: result.error,
        submitted_at: now,
        updated_at: now,
      })
      .eq("id", filing.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    // Mirror customs_case submitted if present
    await freightDb()
      .from("customs_cases")
      .upsert(
        {
          organization_id: user.organizationId,
          manifest_id: id,
          status: result.status === "rejected" ? "hold" : "submitted",
          broker_ref: result.jcaRef,
          updated_at: now,
        },
        { onConflict: "organization_id,manifest_id" },
      );

    return c.json({ filing: updated, result });
  });

  app.get("/manifests/:id/filings", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("customs_filings")
      .select("id, format, checksum, status, jca_ref, submitted_at, error, created_at")
      .eq("manifest_id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ filings: data ?? [] });
  });

  // ---- Clearance events ----
  app.get("/clearance-events", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const channel = c.req.query("channel");
    let q = freightDb()
      .from("clearance_events")
      .select("*, packages(id, courier_tracking_number, status)")
      .eq("organization_id", user.organizationId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (channel) q = q.eq("channel", channel);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ events: data ?? [] });
  });

  app.post("/clearance-events", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        packageId: z.string().uuid(),
        manifestId: z.string().uuid().optional().nullable(),
        channel: z.enum(["green", "yellow", "red"]),
        source: z.enum(["manual", "feed", "webhook"]).optional(),
        note: z.string().max(1000).optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;

    const { data: pkg } = await freightDb()
      .from("packages")
      .select("*")
      .eq("id", b.packageId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!pkg) return c.json({ error: "Package not found" }, 404);

    const now = new Date().toISOString();
    const { data: event, error } = await freightDb()
      .from("clearance_events")
      .insert({
        organization_id: user.organizationId,
        package_id: b.packageId,
        manifest_id: b.manifestId ?? pkg.manifest_id ?? null,
        channel: b.channel,
        source: b.source ?? "manual",
        note: b.note ?? null,
        actor_user_id: user.id,
        occurred_at: now,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    // Auto-transition: green -> customs_cleared; yellow/red -> customs_hold
    const target =
      b.channel === "green" ? "customs_cleared" : "customs_hold";
    if (canTransitionPackage(String(pkg.status), target)) {
      await freightDb()
        .from("packages")
        .update({ status: target, updated_at: now })
        .eq("id", pkg.id);
      await freightDb().from("package_scan_events").insert({
        organization_id: user.organizationId,
        package_id: pkg.id,
        event_type: target,
        note: `Lane ${b.channel}`,
        actor_user_id: user.id,
        metadata: { channel: b.channel, source: b.source ?? "manual" },
        occurred_at: now,
      });
      if (pkg.suite_id) {
        const { data: suite } = await freightDb()
          .from("suites")
          .select("contact_phone, suite_code")
          .eq("id", pkg.suite_id)
          .maybeSingle();
        if (suite?.contact_phone) {
          await notifyPackageContact(
            suite.contact_phone,
            target === "customs_cleared" ? "customs_cleared" : "customs_hold",
            {
              suite_code: suite.suite_code,
              tracking: pkg.courier_tracking_number || pkg.id.slice(0, 8),
            },
          );
        }
      }
    }

    return c.json({ event, packageStatus: target });
  });

  // ---- Dual-ledger billing ----
  app.get("/billing/invoices", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const packageId = c.req.query("packageId");
    let q = freightDb()
      .from("consolidated_invoices")
      .select("*")
      .eq("organization_id", user.organizationId)
      .order("issued_at", { ascending: false })
      .limit(50);
    if (packageId) q = q.eq("package_id", packageId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ invoices: data ?? [] });
  });

  app.post("/billing/invoices", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        packageId: z.string().uuid(),
        handlingUsdMinor: z.number().int().optional(),
        deliveryUsdMinor: z.number().int().optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const { data: pkg } = await freightDb()
      .from("packages")
      .select("*, hs_tariff_codes(cet_rate), suites(id)")
      .eq("id", body.data.packageId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!pkg) return c.json({ error: "Not found" }, 404);

    let { data: duty } = await freightDb()
      .from("package_duty")
      .select("*")
      .eq("package_id", pkg.id)
      .maybeSingle();

    if (!duty) {
      const cet = Number(
        (pkg.hs_tariff_codes as { cet_rate?: number } | null)?.cet_rate ?? 0.2,
      );
      const computed = await computeDutyFromPackageRow({
        declared_value_usd_minor: pkg.declared_value_usd_minor,
        freight_fee_usd_minor: pkg.freight_fee_usd_minor,
        insurance_usd_minor: pkg.insurance_usd_minor,
        cetRate: cet,
      }, serviceClient());
      const upsert = {
        organization_id: user.organizationId,
        package_id: pkg.id,
        item_cost_usd_minor: computed.itemCostUsdMinor,
        freight_usd_minor: computed.freightUsdMinor,
        insurance_usd_minor: computed.insuranceUsdMinor,
        cif_usd_minor: computed.cifUsdMinor,
        above_threshold: computed.aboveThreshold,
        cet_rate: computed.cetRate,
        import_duty_usd_minor: computed.importDutyUsdMinor,
        scf_usd_minor: computed.scfUsdMinor,
        env_usd_minor: computed.envUsdMinor,
        gct_usd_minor: computed.gctUsdMinor,
        stamp_jmd_minor: computed.stampJmdMinor,
        caf_jmd_minor: computed.cafJmdMinor,
        total_duty_usd_minor: computed.totalDutyUsdMinor,
        total_duty_jmd_minor: computed.totalDutyJmdMinor,
        fx_usd_jmd: computed.fxUsdJmd,
        breakdown: computed.breakdown,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: saved } = await freightDb()
        .from("package_duty")
        .upsert(upsert, { onConflict: "package_id" })
        .select("*")
        .single();
      duty = saved;
    }

    const gctRateForInvoice = await resolveImportGctRateFraction(serviceClient());
    const dutyResult = computeLandedCost({
      itemCostUsdMinor: Number(duty?.item_cost_usd_minor ?? 0),
      freightUsdMinor: Number(duty?.freight_usd_minor ?? 0),
      insuranceUsdMinor: Number(duty?.insurance_usd_minor ?? 0),
      cetRate: Number(duty?.cet_rate ?? 0),
      stampJmdMinor: Number(duty?.stamp_jmd_minor ?? 0),
      cafJmdMinor: Number(duty?.caf_jmd_minor ?? 0),
      fxUsdJmd: Number(duty?.fx_usd_jmd ?? DEFAULT_FX_USD_JMD),
      gctRate: gctRateForInvoice,
    });

    const invoice = buildDualLedgerInvoice({
      weightLbs: Number(pkg.weight_lbs ?? 0),
      freightFeeUsdMinor: pkg.freight_fee_usd_minor,
      handlingUsdMinor: body.data.handlingUsdMinor,
      deliveryUsdMinor: body.data.deliveryUsdMinor,
      duty: dutyResult,
      fxUsdJmd: dutyResult.fxUsdJmd,
    });

    const now = new Date().toISOString();
    const { data: inv, error } = await freightDb()
      .from("consolidated_invoices")
      .insert({
        organization_id: user.organizationId,
        invoice_number: invoiceNumber(),
        suite_id: pkg.suite_id,
        package_id: pkg.id,
        status: "issued",
        currency: "USD",
        fx_usd_jmd: invoice.fxUsdJmd,
        courier_total_usd_minor: invoice.courierTotalUsdMinor,
        government_total_usd_minor: invoice.governmentTotalUsdMinor,
        grand_total_usd_minor: invoice.grandTotalUsdMinor,
        issued_at: now,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    const lineRows = invoice.lines.map((l) => ({
      organization_id: user.organizationId,
      invoice_id: inv.id,
      ledger: l.ledger,
      code: l.code,
      label: l.label,
      amount_usd_minor: l.amountUsdMinor,
      amount_jmd_minor: l.amountJmdMinor,
      sort_order: l.sortOrder,
    }));
    const { data: lines, error: lineErr } = await freightDb()
      .from("invoice_lines")
      .insert(lineRows)
      .select("*");
    if (lineErr) return c.json({ error: lineErr.message }, 500);

    return c.json({ invoice: inv, lines: lines ?? [] });
  });

  app.get("/billing/invoices/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data: inv } = await freightDb()
      .from("consolidated_invoices")
      .select("*")
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!inv) return c.json({ error: "Not found" }, 404);
    const { data: lines } = await freightDb()
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("sort_order");
    return c.json({ invoice: inv, lines: lines ?? [] });
  });

  // ---- TRN helper (suites can call) ----
  app.post("/trn/validate", async (c) => {
    const body = z.object({ trn: z.string() }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    return c.json(validateTrn(body.data.trn));
  });
}

/** Shared helpers used by pipeline patches. */
export { isValidJamaicaTrn, normalizeTrn, validateTrn };
