/**
 * Jamaica intl mailbox pipeline routes — facilities, suites, packages, scans,
 * manifests, customs, hub, fulfillment, client fleet, public POD.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import {
  requireEnterpriseAccess,
  requireSeatPermission,
  serviceClient,
  type EnterpriseAccessUser,
} from "../_shared/enterpriseAccess.ts";
import {
  hasActiveLink,
  linkedCourierOrgIds,
} from "../_shared/warehouseCourierAccess.ts";
import { canTransitionPackage } from "./packageTransitions.ts";
import { notifyPackageContact } from "./notifyPackage.ts";
import {
  completeStopDelivery,
  issuePodToken,
  loadPodSessionByToken,
} from "./podService.ts";
import { uploadOrgFile } from "./orgFiles.ts";
import { evaluateManifestReadiness } from "./manifestReadiness.ts";
import { normalizeTrn, validateTrn } from "./validateTrn.ts";

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

function manifestNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = Math.floor(Math.random() * 1e4)
    .toString()
    .padStart(4, "0");
  return `MF-${d}-${n}`;
}

function batchNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = Math.floor(Math.random() * 1e4)
    .toString()
    .padStart(4, "0");
  return `DB-${d}-${n}`;
}

async function appendScan(input: {
  orgId: string;
  packageId: string;
  eventType: string;
  actorUserId?: string | null;
  facilityId?: string | null;
  barcode?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.idempotencyKey) {
    const { data: existing } = await freightDb()
      .from("package_scan_events")
      .select("*")
      .eq("organization_id", input.orgId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return { event: existing, duplicate: true };
  }

  const { data, error } = await freightDb()
    .from("package_scan_events")
    .insert({
      organization_id: input.orgId,
      package_id: input.packageId,
      facility_id: input.facilityId ?? null,
      event_type: input.eventType,
      barcode: input.barcode ?? null,
      note: input.note ?? null,
      actor_user_id: input.actorUserId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
      occurred_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { event: data, duplicate: false };
}

async function loadSuiteNotify(suiteId: string | null) {
  if (!suiteId) return null;
  const { data } = await freightDb()
    .from("suites")
    .select("suite_code, contact_phone, contact_email, contact_name")
    .eq("id", suiteId)
    .maybeSingle();
  return data;
}

async function maybeNotifyPackage(
  pkg: {
    id: string;
    suite_id: string | null;
    courier_tracking_number: string | null;
  },
  template: Parameters<typeof notifyPackageContact>[1],
  extra: Record<string, unknown> = {},
) {
  const suite = await loadSuiteNotify(pkg.suite_id);
  if (!suite?.contact_phone) return;
  await notifyPackageContact(suite.contact_phone, template, {
    suite_code: suite.suite_code,
    tracking: pkg.courier_tracking_number || pkg.id.slice(0, 8),
    ...extra,
  });
  await freightDb()
    .from("packages")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", pkg.id);
}

const assigneeType = z.enum([
  "roam_marketplace",
  "org_fleet",
  "client_fleet",
  "third_party",
]);

/** Reject marketplace only on execute paths that lack a matching adapter yet (intl batches). */
function marketplaceRejectPayload(
  type: string | null | undefined,
): { error: string; message: string } | null {
  if (type === "roam_marketplace") {
    return {
      error: "marketplace_not_enabled",
      message:
        "Auto-dispatch for mailbox delivery batches is not available yet. Use the Dispatch Board for domestic freight, or assign org/client/3PL fleet here.",
    };
  }
  return null;
}

const fulfillmentMode = z.enum(["pickup", "door_delivery"]);

export function registerPipelineRoutes(app: FreightApp) {
  // -------------------------------------------------------------------------
  // Facilities
  // -------------------------------------------------------------------------
  const facilityBody = z.object({
    name: z.string().min(1).max(200).optional(),
    code: z.string().min(1).max(40).optional(),
    facilityType: z.enum(["warehouse", "ja_hub", "branch"]),
    intakeCatalogId: z.string().uuid().optional().nullable(),
    addressLine: z.string().max(500).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    countryCode: z.string().length(2).optional(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    timezone: z.string().max(64).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  });

  /** Active master warehouses for Enterprise Facilities picker (any country). */
  app.get("/intake-warehouses", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await serviceClient()
      .from("intake_warehouse_catalog")
      .select(
        "id, name, code, address_line, city, state, postal_code, country_code, timezone, status",
      )
      .eq("status", "active")
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ warehouses: data ?? [] });
  });

  app.get("/facilities", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const type = c.req.query("type");
    let q = freightDb()
      .from("facilities")
      .select("*")
      .eq("organization_id", user.organizationId)
      .order("name");
    if (type) q = q.eq("facility_type", type);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ facilities: data ?? [] });
  });

  app.post("/facilities", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = facilityBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    if (b.facilityType === "warehouse") {
      if (!b.intakeCatalogId) {
        return c.json(
          { error: "Warehouse must be selected from the Dominion master catalog" },
          400,
        );
      }
      const { data: catalog, error: catErr } = await serviceClient()
        .from("intake_warehouse_catalog")
        .select("*")
        .eq("id", b.intakeCatalogId)
        .eq("status", "active")
        .maybeSingle();
      if (catErr) return c.json({ error: catErr.message }, 500);
      if (!catalog) return c.json({ error: "Intake warehouse not found or inactive" }, 404);

      const orgCode =
        (b.code?.toUpperCase().trim()) ||
        `${String(catalog.code).slice(0, 24)}-INTAKE`;

      const { data, error } = await freightDb()
        .from("facilities")
        .insert({
          organization_id: user.organizationId,
          name: b.name?.trim() || String(catalog.name),
          code: orgCode,
          facility_type: "warehouse",
          intake_catalog_id: catalog.id,
          address_line: String(catalog.address_line),
          city: `${String(catalog.city)}, ${String(catalog.state)} ${String(catalog.postal_code)}`.trim(),
          country_code: String(catalog.country_code || "US"),
          lat: b.lat ?? null,
          lng: b.lng ?? null,
          timezone: String(catalog.timezone || "America/New_York"),
          status: b.status ?? "active",
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ facility: data }, 201);
    }

    const name = b.name?.trim();
    const code = b.code?.toUpperCase().trim();
    if (!name || !code) {
      return c.json({ error: "name and code are required for hub/branch facilities" }, 400);
    }

    const { data, error } = await freightDb()
      .from("facilities")
      .insert({
        organization_id: user.organizationId,
        name,
        code,
        facility_type: b.facilityType,
        address_line: b.addressLine || null,
        city: b.city || null,
        country_code: b.countryCode ?? "JM",
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        timezone: b.timezone ?? "America/Jamaica",
        status: b.status ?? "active",
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ facility: data }, 201);
  });

  app.patch("/facilities/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

    const { data: existing, error: loadErr } = await freightDb()
      .from("facilities")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!existing) return c.json({ error: "Facility not found" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) return c.json({ error: "name cannot be empty" }, 400);
      patch.name = name;
    }
    if (body.code != null) {
      const code = String(body.code).trim().toUpperCase();
      if (!code) return c.json({ error: "code cannot be empty" }, 400);
      patch.code = code;
    }
    if (body.status === "active" || body.status === "inactive") patch.status = body.status;
    if (body.lat !== undefined) patch.lat = body.lat;
    if (body.lng !== undefined) patch.lng = body.lng;
    if (body.timezone != null) patch.timezone = String(body.timezone).trim();

    if (existing.facility_type === "warehouse") {
      const nextCatalogId =
        body.intakeCatalogId != null
          ? String(body.intakeCatalogId)
          : existing.intake_catalog_id
            ? String(existing.intake_catalog_id)
            : null;
      if (body.intakeCatalogId != null || !existing.intake_catalog_id) {
        if (!nextCatalogId) {
          return c.json({ error: "Warehouse requires a Dominion catalog selection" }, 400);
        }
        const { data: catalog, error: catErr } = await serviceClient()
          .from("intake_warehouse_catalog")
          .select("*")
          .eq("id", nextCatalogId)
          .eq("status", "active")
          .maybeSingle();
        if (catErr) return c.json({ error: catErr.message }, 500);
        if (!catalog) return c.json({ error: "Intake warehouse not found or inactive" }, 404);
        patch.intake_catalog_id = catalog.id;
        patch.address_line = String(catalog.address_line);
        patch.city = `${String(catalog.city)}, ${String(catalog.state)} ${String(catalog.postal_code)}`.trim();
        patch.country_code = String(catalog.country_code || "US");
        patch.timezone = String(catalog.timezone || "America/New_York");
        if (body.name == null && body.intakeCatalogId != null) {
          patch.name = String(catalog.name);
        }
      }
    } else {
      if (body.addressLine !== undefined || body.address_line !== undefined) {
        const v = body.addressLine ?? body.address_line;
        patch.address_line = v == null || v === "" ? null : String(v);
      }
      if (body.city !== undefined) {
        patch.city = body.city == null || body.city === "" ? null : String(body.city);
      }
      if (body.countryCode != null || body.country_code != null) {
        patch.country_code = String(body.countryCode ?? body.country_code)
          .trim()
          .toUpperCase()
          .slice(0, 2);
      }
    }

    const { data, error } = await freightDb()
      .from("facilities")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ facility: data });
  });

  app.delete("/facilities/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: existing, error: loadErr } = await freightDb()
      .from("facilities")
      .select("id")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!existing) return c.json({ error: "Facility not found" }, 404);

    const { error } = await freightDb()
      .from("facilities")
      .delete()
      .eq("id", id)
      .eq("organization_id", user.organizationId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  app.post("/facilities/seed-defaults", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const defaults = [
      {
        name: "Miami Warehouse",
        code: "MIA-WH",
        facility_type: "warehouse",
        city: "Miami",
        country_code: "US",
        timezone: "America/New_York",
      },
      {
        name: "Kingston Hub",
        code: "KIN-HUB",
        facility_type: "ja_hub",
        city: "Kingston",
        country_code: "JM",
        timezone: "America/Jamaica",
      },
      {
        name: "Kingston Branch",
        code: "KIN-BR",
        facility_type: "branch",
        city: "Kingston",
        country_code: "JM",
        timezone: "America/Jamaica",
      },
    ];
    const created = [];
    for (const row of defaults) {
      const { data } = await freightDb()
        .from("facilities")
        .upsert(
          {
            organization_id: user.organizationId,
            ...row,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,code" },
        )
        .select("*")
        .single();
      if (data) created.push(data);
    }
    return c.json({ facilities: created });
  });

  // -------------------------------------------------------------------------
  // Suites
  // -------------------------------------------------------------------------
  const suiteBody = z.object({
    clientId: z.string().uuid().optional().nullable(),
    suiteCode: z.string().min(2).max(40).optional(),
    contactName: z.string().max(200).optional().nullable(),
    contactPhone: z.string().max(50).optional().nullable(),
    contactEmail: z.string().email().optional().nullable().or(z.literal("")),
    trn: z.string().max(40).optional().nullable(),
    defaultFulfillmentMode: fulfillmentMode.optional(),
    defaultAssigneeType: assigneeType.optional(),
    defaultPickupFacilityId: z.string().uuid().optional().nullable(),
    deliveryAddress: z.string().max(500).optional().nullable(),
    deliveryLat: z.number().optional().nullable(),
    deliveryLng: z.number().optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
  });

  app.get("/suites", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("suites")
      .select("*, clients(name), facilities:default_pickup_facility_id(name, code)")
      .eq("organization_id", user.organizationId)
      .order("suite_code");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ suites: data ?? [] });
  });

  app.post("/suites", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = suiteBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    let suiteCode = b.suiteCode?.toUpperCase().trim();
    if (!suiteCode) {
      const { count } = await freightDb()
        .from("suites")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId);
      suiteCode = `JA-${String((count ?? 0) + 1001).padStart(4, "0")}`;
    }

    const trnCheck = b.trn ? validateTrn(b.trn) : { valid: false, normalized: "" };
    if (b.trn && !trnCheck.valid) {
      return c.json({ error: trnCheck.error || "Invalid TRN" }, 400);
    }

    const { data, error } = await freightDb()
      .from("suites")
      .insert({
        organization_id: user.organizationId,
        client_id: b.clientId || null,
        suite_code: suiteCode,
        contact_name: b.contactName || null,
        contact_phone: b.contactPhone || null,
        contact_email: b.contactEmail || null,
        trn: trnCheck.normalized || null,
        trn_valid: Boolean(trnCheck.valid && trnCheck.normalized),
        default_fulfillment_mode: b.defaultFulfillmentMode ?? "pickup",
        default_assignee_type: b.defaultAssigneeType ?? "org_fleet",
        default_pickup_facility_id: b.defaultPickupFacilityId || null,
        delivery_address: b.deliveryAddress || null,
        delivery_lat: b.deliveryLat ?? null,
        delivery_lng: b.deliveryLng ?? null,
        status: b.status ?? "active",
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ suite: data }, 201);
  });

  /** Bulk CSV import — upsert by (organization_id, suite_code). */
  const suiteImportBody = z.object({
    rows: z
      .array(
        z.object({
          suiteCode: z.string().min(2).max(40),
          contactName: z.string().max(200).optional().nullable(),
          contactPhone: z.string().max(50).optional().nullable(),
          contactEmail: z.string().email().optional().nullable().or(z.literal("")),
          trn: z.string().max(40).optional().nullable(),
          /** Optional client label — matched to freight.clients.name (case-insensitive). */
          clientName: z.string().max(200).optional().nullable(),
          /** Optional branch label — matched to facilities.name or facilities.code. */
          pickupBranch: z.string().max(200).optional().nullable(),
          defaultFulfillmentMode: fulfillmentMode.optional(),
          defaultAssigneeType: assigneeType.optional(),
          deliveryAddress: z.string().max(500).optional().nullable(),
        }),
      )
      .min(1)
      .max(500),
  });

  app.post("/suites/import", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = suiteImportBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const warnings: string[] = [];
    const now = new Date().toISOString();

    // Resolve optional client / branch labels once per distinct value
    const clientNameKeys = [
      ...new Set(
        parsed.data.rows
          .map((r) => (r.clientName || "").trim())
          .filter(Boolean)
          .map((n) => n.toLowerCase()),
      ),
    ];
    const branchKeys = [
      ...new Set(
        parsed.data.rows
          .map((r) => (r.pickupBranch || "").trim())
          .filter(Boolean)
          .map((n) => n.toLowerCase()),
      ),
    ];

    const clientByName = new Map<string, string>();
    if (clientNameKeys.length) {
      const { data: clients } = await freightDb()
        .from("clients")
        .select("id, name")
        .eq("organization_id", user.organizationId);
      for (const cl of clients ?? []) {
        clientByName.set(String(cl.name).trim().toLowerCase(), String(cl.id));
      }
    }

    const facilityByKey = new Map<string, string>();
    if (branchKeys.length) {
      const { data: facilities } = await freightDb()
        .from("facilities")
        .select("id, name, code, facility_type")
        .eq("organization_id", user.organizationId);
      for (const f of facilities ?? []) {
        const id = String(f.id);
        facilityByKey.set(String(f.name).trim().toLowerCase(), id);
        if (f.code) facilityByKey.set(String(f.code).trim().toLowerCase(), id);
      }
    }

    const payloads = parsed.data.rows.map((b) => {
      const trnCheck = b.trn ? validateTrn(b.trn) : { valid: false, normalized: "" };
      const suiteCode = b.suiteCode.toUpperCase().trim();

      let clientId: string | null = null;
      const clientLabel = (b.clientName || "").trim();
      if (clientLabel) {
        clientId = clientByName.get(clientLabel.toLowerCase()) ?? null;
        if (!clientId) {
          warnings.push(
            `${suiteCode}: client "${clientLabel}" not found — suite saved without client link.`,
          );
        }
      }

      let pickupFacilityId: string | null = null;
      const branchLabel = (b.pickupBranch || "").trim();
      if (branchLabel) {
        pickupFacilityId = facilityByKey.get(branchLabel.toLowerCase()) ?? null;
        if (!pickupFacilityId) {
          warnings.push(
            `${suiteCode}: pickup branch "${branchLabel}" not found — suite saved without branch.`,
          );
        }
      }

      return {
        organization_id: user.organizationId,
        client_id: clientId,
        suite_code: suiteCode,
        contact_name: b.contactName || null,
        contact_phone: b.contactPhone || null,
        contact_email: b.contactEmail || null,
        trn: trnCheck.normalized || null,
        trn_valid: Boolean(trnCheck.valid),
        default_fulfillment_mode: b.defaultFulfillmentMode ?? "pickup",
        default_assignee_type: b.defaultAssigneeType ?? "org_fleet",
        default_pickup_facility_id: pickupFacilityId,
        delivery_address: b.deliveryAddress || null,
        status: "active",
        updated_at: now,
      };
    });

    // Dedupe within payload (last wins) so upsert batch is valid
    const byCode = new Map<string, (typeof payloads)[number]>();
    for (const p of payloads) byCode.set(p.suite_code, p);
    const unique = [...byCode.values()];

    const existingCodes = new Set<string>();
    {
      const codes = unique.map((p) => p.suite_code);
      const { data: existing } = await freightDb()
        .from("suites")
        .select("suite_code")
        .eq("organization_id", user.organizationId)
        .in("suite_code", codes);
      for (const e of existing ?? []) existingCodes.add(String(e.suite_code));
    }

    const { data, error } = await freightDb()
      .from("suites")
      .upsert(unique, { onConflict: "organization_id,suite_code" })
      .select("id, suite_code");
    if (error) return c.json({ error: error.message }, 500);

    let created = 0;
    let updated = 0;
    for (const row of data ?? []) {
      if (existingCodes.has(String(row.suite_code))) updated++;
      else created++;
    }

    return c.json({
      created,
      updated,
      total: (data ?? []).length,
      suites: data ?? [],
      warnings,
    });
  });

  app.patch("/suites/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = suiteBody.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const { data, error } = await freightDb()
      .from("suites")
      .update({
        ...(b.clientId !== undefined ? { client_id: b.clientId || null } : {}),
        ...(b.contactName !== undefined ? { contact_name: b.contactName } : {}),
        ...(b.contactPhone !== undefined ? { contact_phone: b.contactPhone } : {}),
        ...(b.contactEmail !== undefined ? { contact_email: b.contactEmail || null } : {}),
        ...(b.trn !== undefined
          ? (() => {
              if (!b.trn) return { trn: null, trn_valid: false };
              const check = validateTrn(b.trn);
              return {
                trn: check.valid ? check.normalized : normalizeTrn(b.trn),
                trn_valid: check.valid,
              };
            })()
          : {}),
        ...(b.defaultFulfillmentMode !== undefined
          ? { default_fulfillment_mode: b.defaultFulfillmentMode }
          : {}),
        ...(b.defaultAssigneeType !== undefined
          ? { default_assignee_type: b.defaultAssigneeType }
          : {}),
        ...(b.defaultPickupFacilityId !== undefined
          ? { default_pickup_facility_id: b.defaultPickupFacilityId || null }
          : {}),
        ...(b.deliveryAddress !== undefined
          ? { delivery_address: b.deliveryAddress }
          : {}),
        ...(b.deliveryLat !== undefined ? { delivery_lat: b.deliveryLat } : {}),
        ...(b.deliveryLng !== undefined ? { delivery_lng: b.deliveryLng } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ suite: data });
  });

  // -------------------------------------------------------------------------
  // Packages
  // -------------------------------------------------------------------------
  const packageBody = z.object({
    suiteId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    courierTrackingNumber: z.string().max(120).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    weightLbs: z.number().nonnegative().optional().nullable(),
    lengthIn: z.number().nonnegative().optional().nullable(),
    widthIn: z.number().nonnegative().optional().nullable(),
    heightIn: z.number().nonnegative().optional().nullable(),
    declaredValueUsdMinor: z.number().int().nonnegative().optional().nullable(),
    fulfillmentMode: fulfillmentMode.optional().nullable(),
    preferredAssigneeType: assigneeType.optional().nullable(),
    pickupFacilityId: z.string().uuid().optional().nullable(),
    deliveryAddress: z.string().max(500).optional().nullable(),
    deliveryLat: z.number().optional().nullable(),
    deliveryLng: z.number().optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    invoiceStoragePath: z.string().optional().nullable(),
    invoiceFileName: z.string().optional().nullable(),
    intendedFacilityId: z.string().uuid().optional().nullable(),
    retailer: z.string().max(120).optional().nullable(),
  });

  app.get("/packages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const status = c.req.query("status");
    const intendedFacilityId = c.req.query("intendedFacilityId");
    const ownerOrgId = c.req.query("ownerOrgId");
    const scope = c.req.query("scope"); // owner | warehouse | all
    let q = freightDb()
      .from("packages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (scope === "warehouse") {
      q = q.eq("operating_warehouse_org_id", user.organizationId);
    } else if (scope === "owner") {
      q = q.eq("owner_org_id", user.organizationId);
    } else {
      // Dual ownership: owner OR operating warehouse (covers in-house)
      q = q.or(
        `owner_org_id.eq.${user.organizationId},operating_warehouse_org_id.eq.${user.organizationId},organization_id.eq.${user.organizationId}`,
      );
    }
    if (ownerOrgId) q = q.eq("owner_org_id", ownerOrgId);
    if (status) q = q.eq("status", status);
    if (intendedFacilityId === "external") {
      q = q.is("intended_facility_id", null);
    } else if (intendedFacilityId) {
      q = q.eq("intended_facility_id", intendedFacilityId);
    }
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const suiteIds = [
      ...new Set(
        (data ?? [])
          .map((p: { suite_id?: string | null }) => p.suite_id)
          .filter(Boolean) as string[],
      ),
    ];
    const suiteMap: Record<
      string,
      { suite_code?: string; contact_name?: string; contact_phone?: string }
    > = {};
    if (suiteIds.length) {
      const { data: suites } = await freightDb()
        .from("suites")
        .select("id, suite_code, contact_name, contact_phone")
        .in("id", suiteIds);
      for (const s of suites ?? []) {
        suiteMap[s.id] = s;
      }
    }
    const packages = (data ?? []).map((p: { suite_id?: string | null; retail_order_id?: string | null }) => ({
      ...p,
      suites: p.suite_id ? suiteMap[p.suite_id] ?? null : null,
    }));

    const orderIds = [
      ...new Set(
        packages
          .map((p: { retail_order_id?: string | null }) => p.retail_order_id)
          .filter(Boolean) as string[],
      ),
    ];
    const orderMap: Record<
      string,
      {
        id: string;
        external_order_number?: string | null;
        retailer?: string | null;
        invoice_storage_path?: string | null;
        invoice_file_name?: string | null;
        invoice_verified_at?: string | null;
        invoice_unobtainable_at?: string | null;
      }
    > = {};
    if (orderIds.length) {
      const { data: orders } = await freightDb()
        .from("retail_orders")
        .select(
          "id, external_order_number, retailer, invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at",
        )
        .in("id", orderIds);
      for (const o of orders ?? []) orderMap[o.id] = o;
    }

    return c.json({
      packages: packages.map((p: { retail_order_id?: string | null }) => ({
        ...p,
        retail_orders: p.retail_order_id ? orderMap[p.retail_order_id] ?? null : null,
      })),
    });
  });

  app.get("/packages/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const db = freightDb();
    const { data: pkg, error } = await db
      .from("packages")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!pkg) return c.json({ error: "Not found" }, 404);

    let suite = null;
    if (pkg.suite_id) {
      const { data: s } = await db.from("suites").select("*").eq("id", pkg.suite_id).maybeSingle();
      suite = s;
    }
    let facility = null;
    if (pkg.current_facility_id) {
      const { data: f } = await db
        .from("facilities")
        .select("name, code, facility_type")
        .eq("id", pkg.current_facility_id)
        .maybeSingle();
      facility = f;
    }
    let retailOrder = null;
    if (pkg.retail_order_id) {
      const { data: o } = await db
        .from("retail_orders")
        .select(
          "id, external_order_number, retailer, order_total_usd_minor, invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at",
        )
        .eq("id", pkg.retail_order_id)
        .maybeSingle();
      retailOrder = o;
    }

    const { data: scans } = await db
      .from("package_scan_events")
      .select("*")
      .eq("package_id", id)
      .order("occurred_at", { ascending: false });
    return c.json({
      package: {
        ...pkg,
        suites: suite,
        facilities: facility,
        retail_orders: retailOrder,
      },
      scanEvents: scans ?? [],
    });
  });

  app.post("/packages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = packageBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    let clientId = b.clientId || null;
    let fulfillmentModeVal = b.fulfillmentMode ?? null;
    let assignee = b.preferredAssigneeType ?? null;
    let pickupFacilityId = b.pickupFacilityId || null;
    let deliveryAddress = b.deliveryAddress || null;
    let deliveryLat = b.deliveryLat ?? null;
    let deliveryLng = b.deliveryLng ?? null;

    if (b.suiteId) {
      const { data: suite } = await freightDb()
        .from("suites")
        .select("*")
        .eq("id", b.suiteId)
        .eq("organization_id", user.organizationId)
        .maybeSingle();
      if (suite) {
        clientId = clientId || suite.client_id;
        fulfillmentModeVal = fulfillmentModeVal || suite.default_fulfillment_mode;
        assignee = assignee || suite.default_assignee_type;
        pickupFacilityId = pickupFacilityId || suite.default_pickup_facility_id;
        deliveryAddress = deliveryAddress || suite.delivery_address;
        deliveryLat = deliveryLat ?? suite.delivery_lat;
        deliveryLng = deliveryLng ?? suite.delivery_lng;
      }
    }

    const { data, error } = await freightDb()
      .from("packages")
      .insert({
        organization_id: user.organizationId,
        owner_org_id: user.organizationId,
        operating_warehouse_org_id: null,
        suite_id: b.suiteId || null,
        client_id: clientId,
        courier_tracking_number: b.courierTrackingNumber?.trim() || null,
        description: b.description || null,
        status: "expected",
        weight_lbs: b.weightLbs ?? null,
        length_in: b.lengthIn ?? null,
        width_in: b.widthIn ?? null,
        height_in: b.heightIn ?? null,
        declared_value_usd_minor: b.declaredValueUsdMinor ?? null,
        invoice_storage_path: b.invoiceStoragePath || null,
        invoice_file_name: b.invoiceFileName || null,
        fulfillment_mode: fulfillmentModeVal,
        preferred_assignee_type: assignee,
        pickup_facility_id: pickupFacilityId,
        delivery_address: deliveryAddress,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        notes: b.notes || null,
        intended_facility_id: b.intendedFacilityId || null,
        retailer: b.retailer?.trim() || null,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await appendScan({
      orgId: user.organizationId,
      packageId: data.id,
      eventType: "pre_alert",
      actorUserId: user.id,
      note: "Ops pre-alert created",
    });

    return c.json({ package: data }, 201);
  });

  app.patch("/packages/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = packageBody.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const { data, error } = await freightDb()
      .from("packages")
      .update({
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.weightLbs !== undefined ? { weight_lbs: b.weightLbs } : {}),
        ...(b.lengthIn !== undefined ? { length_in: b.lengthIn } : {}),
        ...(b.widthIn !== undefined ? { width_in: b.widthIn } : {}),
        ...(b.heightIn !== undefined ? { height_in: b.heightIn } : {}),
        ...(b.declaredValueUsdMinor !== undefined
          ? { declared_value_usd_minor: b.declaredValueUsdMinor }
          : {}),
        ...(b.fulfillmentMode !== undefined
          ? { fulfillment_mode: b.fulfillmentMode }
          : {}),
        ...(b.preferredAssigneeType !== undefined
          ? { preferred_assignee_type: b.preferredAssigneeType }
          : {}),
        ...(b.pickupFacilityId !== undefined
          ? { pickup_facility_id: b.pickupFacilityId || null }
          : {}),
        ...(b.deliveryAddress !== undefined
          ? { delivery_address: b.deliveryAddress }
          : {}),
        ...(b.deliveryLat !== undefined ? { delivery_lat: b.deliveryLat } : {}),
        ...(b.deliveryLng !== undefined ? { delivery_lng: b.deliveryLng } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.invoiceStoragePath !== undefined
          ? { invoice_storage_path: b.invoiceStoragePath }
          : {}),
        ...(b.invoiceFileName !== undefined
          ? { invoice_file_name: b.invoiceFileName }
          : {}),
        ...(b.courierTrackingNumber !== undefined
          ? { courier_tracking_number: b.courierTrackingNumber?.trim() || null }
          : {}),
        ...(b.intendedFacilityId !== undefined
          ? { intended_facility_id: b.intendedFacilityId || null }
          : {}),
        ...(b.retailer !== undefined ? { retailer: b.retailer?.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ package: data });
  });

  /** Ops remove bad pre-alerts / floor mistakes. Locked once on sealed intl path. */
  const PACKAGE_DELETE_LOCKED = new Set([
    "manifested",
    "in_transit_intl",
    "customs_hold",
    "customs_cleared",
  ]);

  app.delete("/packages/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");

    const { data: existing, error: loadErr } = await freightDb()
      .from("packages")
      .select("id, status, courier_tracking_number, organization_id, owner_org_id")
      .eq("id", id)
      .or(
        `organization_id.eq.${user.organizationId},owner_org_id.eq.${user.organizationId}`,
      )
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (PACKAGE_DELETE_LOCKED.has(String(existing.status))) {
      return c.json(
        {
          error:
            "This package is already on a sealed / customs path. Remove it from the manifesto first, or keep it for history.",
        },
        409,
      );
    }

    const { error } = await freightDb()
      .from("packages")
      .delete()
      .eq("id", id)
      .or(
        `organization_id.eq.${user.organizationId},owner_org_id.eq.${user.organizationId}`,
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      ok: true,
      tracking: existing.courier_tracking_number,
    });
  });

  // -------------------------------------------------------------------------
  // Miami / generic scan station
  // -------------------------------------------------------------------------
  const scanBody = z.object({
    barcode: z.string().min(1).max(120),
    facilityId: z.string().uuid(),
    suiteCode: z.string().max(40).optional().nullable(),
    weightLbs: z.number().nonnegative().optional().nullable(),
    lengthIn: z.number().nonnegative().optional().nullable(),
    widthIn: z.number().nonnegative().optional().nullable(),
    heightIn: z.number().nonnegative().optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    declaredValueUsdMinor: z.number().int().nonnegative().optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
    binLocation: z.string().max(80).optional().nullable(),
    invoiceRequiredFromCustomer: z.boolean().optional(),
    /** Courier that owns the goods (required for unknown scans at a 3rd-party warehouse). */
    ownerOrgId: z.string().uuid().optional().nullable(),
  });

  app.post("/scans", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = scanBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const idem =
      c.req.header("Idempotency-Key") ||
      `scan:${user.organizationId}:${b.facilityId}:${b.barcode}`;

    const { data: facility } = await freightDb()
      .from("facilities")
      .select("*")
      .eq("id", b.facilityId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!facility) return c.json({ error: "Facility not found" }, 404);

    const operatingWarehouseOrgId = user.organizationId;
    const courierIds = await linkedCourierOrgIds(operatingWarehouseOrgId);

    const { data: existingScan } = await freightDb()
      .from("package_scan_events")
      .select("*, packages(*)")
      .eq("idempotency_key", idem)
      .in("organization_id", courierIds)
      .maybeSingle();
    if (existingScan) {
      return c.json({
        package: existingScan.packages,
        scanEvent: existingScan,
        duplicate: true,
      });
    }

    let pkg = (
      await freightDb()
        .from("packages")
        .select("*")
        .eq("courier_tracking_number", b.barcode.trim())
        .in("owner_org_id", courierIds)
        .maybeSingle()
    ).data;

    // Fallback for rows not yet backfilled with owner_org_id
    if (!pkg) {
      pkg = (
        await freightDb()
          .from("packages")
          .select("*")
          .eq("courier_tracking_number", b.barcode.trim())
          .in("organization_id", courierIds)
          .maybeSingle()
      ).data;
    }

    let createdUnknown = false;

    if (!pkg && facility.facility_type === "warehouse") {
      const ownerOrgId = b.ownerOrgId || user.organizationId;
      if (!courierIds.includes(ownerOrgId)) {
        return c.json(
          { error: "No active link with that courier. Connect warehouses first." },
          403,
        );
      }
      const okLink = await hasActiveLink(operatingWarehouseOrgId, ownerOrgId);
      if (!okLink) {
        return c.json({ error: "Warehouse↔courier link is not active" }, 403);
      }

      let suiteId: string | null = null;
      let clientId: string | null = null;
      let fulfillmentModeVal: string | null = "pickup";
      let assignee: string | null = "org_fleet";
      let pickupFacilityId: string | null = null;
      let deliveryAddress: string | null = null;
      let deliveryLat: number | null = null;
      let deliveryLng: number | null = null;

      if (b.suiteCode) {
        const { data: suite } = await freightDb()
          .from("suites")
          .select("*")
          .eq("organization_id", ownerOrgId)
          .ilike("suite_code", b.suiteCode.trim())
          .maybeSingle();
        if (suite) {
          suiteId = suite.id;
          clientId = suite.client_id;
          fulfillmentModeVal = suite.default_fulfillment_mode;
          assignee = suite.default_assignee_type;
          pickupFacilityId = suite.default_pickup_facility_id;
          deliveryAddress = suite.delivery_address;
          deliveryLat = suite.delivery_lat;
          deliveryLng = suite.delivery_lng;
        }
      }

      const { data: created, error } = await freightDb()
        .from("packages")
        .insert({
          organization_id: ownerOrgId,
          owner_org_id: ownerOrgId,
          operating_warehouse_org_id: operatingWarehouseOrgId,
          suite_id: suiteId,
          client_id: clientId,
          courier_tracking_number: b.barcode.trim(),
          description: b.description || "Unknown pre-alert — invoice needed",
          status: "received_at_warehouse",
          weight_lbs: b.weightLbs ?? null,
          weight_kg:
            b.weightLbs != null
              ? Math.round(Number(b.weightLbs) * 0.45359237 * 1000) / 1000
              : null,
          bin_location: b.binLocation ?? null,
          length_in: b.lengthIn ?? null,
          width_in: b.widthIn ?? null,
          height_in: b.heightIn ?? null,
          declared_value_usd_minor: b.declaredValueUsdMinor ?? null,
          current_facility_id: facility.id,
          fulfillment_mode: fulfillmentModeVal,
          preferred_assignee_type: assignee,
          pickup_facility_id: pickupFacilityId,
          delivery_address: deliveryAddress,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
          notes: b.note || null,
          invoice_required_from_customer: Boolean(b.invoiceRequiredFromCustomer),
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      pkg = created;
      createdUnknown = true;

      // Scaffold storage ledger line on receive
      await freightDb().from("warehouse_storage_ledger").insert({
        warehouse_org_id: operatingWarehouseOrgId,
        courier_org_id: ownerOrgId,
        package_id: pkg.id,
        event_type: "receive",
        quantity: 1,
        unit_amount_minor: 0,
      });
    }

    if (!pkg) {
      return c.json(
        { error: "No matching package. Provide suiteCode for unknown Miami intake." },
        404,
      );
    }

    // Hub inbound path
    if (facility.facility_type === "ja_hub" || facility.facility_type === "branch") {
      const next =
        facility.facility_type === "ja_hub" ? "received_hub" : pkg.status;
      if (facility.facility_type === "ja_hub") {
        if (!canTransitionPackage(pkg.status, "received_hub") &&
          pkg.status !== "received_hub" &&
          pkg.status !== "ready_for_fulfillment") {
          // allow from customs_cleared / in_transit / customs_hold after clear
          if (!["customs_cleared", "in_transit_intl", "customs_hold", "received_hub", "ready_for_fulfillment"].includes(pkg.status)) {
            return c.json({
              error: `Cannot hub-scan from status ${pkg.status}`,
            }, 409);
          }
        }
        const { data: updated, error } = await freightDb()
          .from("packages")
          .update({
            status: pkg.status === "ready_for_fulfillment" ? pkg.status : "received_hub",
            current_facility_id: facility.id,
            weight_lbs: b.weightLbs ?? pkg.weight_lbs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pkg.id)
          .select("*")
          .single();
        if (error) return c.json({ error: error.message }, 500);
        pkg = updated;
        const scan = await appendScan({
          orgId: pkg.owner_org_id || pkg.organization_id || user.organizationId,
          packageId: pkg.id,
          eventType: "hub_inbound",
          actorUserId: user.id,
          facilityId: facility.id,
          barcode: b.barcode,
          note: b.note,
          idempotencyKey: idem,
        });
        return c.json({ package: pkg, scanEvent: scan.event, duplicate: scan.duplicate });
      }
    }

    // Miami / warehouse receive
    if (facility.facility_type === "warehouse") {
      if (!createdUnknown && pkg.status === "expected") {
        if (!canTransitionPackage(pkg.status, "received_at_warehouse")) {
          return c.json({ error: `Illegal transition ${pkg.status} → received_at_warehouse` }, 409);
        }
      } else if (!createdUnknown && pkg.status !== "received_at_warehouse") {
        // re-scan while already received — update weights only
      } else if (!createdUnknown && pkg.status === "received_at_warehouse") {
        // ok
      } else if (!createdUnknown) {
        return c.json({ error: `Package already past Miami (${pkg.status})` }, 409);
      }

      const { data: updated, error } = await freightDb()
        .from("packages")
        .update({
          status: "received_at_warehouse",
          current_facility_id: facility.id,
          operating_warehouse_org_id: operatingWarehouseOrgId,
          weight_lbs: b.weightLbs ?? pkg.weight_lbs,
          weight_kg:
            b.weightLbs != null
              ? Math.round(Number(b.weightLbs) * 0.45359237 * 1000) / 1000
              : pkg.weight_kg,
          bin_location: b.binLocation ?? pkg.bin_location,
          length_in: b.lengthIn ?? pkg.length_in,
          width_in: b.widthIn ?? pkg.width_in,
          height_in: b.heightIn ?? pkg.height_in,
          description: b.description || pkg.description,
          declared_value_usd_minor: b.declaredValueUsdMinor ?? pkg.declared_value_usd_minor,
          invoice_required_from_customer:
            typeof b.invoiceRequiredFromCustomer === "boolean"
              ? b.invoiceRequiredFromCustomer
              : pkg.invoice_required_from_customer,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pkg.id)
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      pkg = updated;

      const scan = await appendScan({
        orgId: pkg.owner_org_id || pkg.organization_id || user.organizationId,
        packageId: pkg.id,
        eventType: "received_at_warehouse",
        actorUserId: user.id,
        facilityId: facility.id,
        barcode: b.barcode,
        note: b.note || (createdUnknown ? "Unknown pre-alert created on scan" : null),
        idempotencyKey: idem,
        metadata: { createdUnknown, operatingWarehouseOrgId },
      });

      if (!scan.duplicate) {
        await maybeNotifyPackage(pkg, "received_at_warehouse");
      }

      let suiteInfo: { suite_code?: string; contact_name?: string } | null = null;
      if (pkg.suite_id) {
        const { data: s } = await freightDb()
          .from("suites")
          .select("suite_code, contact_name")
          .eq("id", pkg.suite_id)
          .maybeSingle();
        suiteInfo = s;
      }

      return c.json({
        package: { ...pkg, suites: suiteInfo },
        scanEvent: scan.event,
        createdUnknown,
        duplicate: scan.duplicate,
        matchedPreAlert: !createdUnknown && !scan.duplicate,
      });
    }

    return c.json({ error: "Unsupported facility type for scan" }, 400);
  });

  // Hub sort → ready_for_fulfillment
  const sortBody = z.object({
    packageId: z.string().uuid(),
    facilityId: z.string().uuid(),
    sortZone: z.string().max(80).optional().nullable(),
    fulfillmentMode: fulfillmentMode.optional().nullable(),
  });

  app.post("/hub/sort", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = sortBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    const { data: pkg } = await freightDb()
      .from("packages")
      .select("*")
      .eq("id", b.packageId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!pkg) return c.json({ error: "Package not found" }, 404);

    if (!["received_hub", "ready_for_fulfillment", "customs_cleared"].includes(pkg.status)) {
      if (!canTransitionPackage(pkg.status, "ready_for_fulfillment") &&
        !canTransitionPackage(pkg.status, "received_hub")) {
        return c.json({ error: `Cannot sort from ${pkg.status}` }, 409);
      }
    }

    const mode = b.fulfillmentMode || pkg.fulfillment_mode || "pickup";
    const nextStatus = "ready_for_fulfillment";

    const { data: updated, error } = await freightDb()
      .from("packages")
      .update({
        status: nextStatus,
        current_facility_id: b.facilityId,
        sort_zone: b.sortZone || null,
        fulfillment_mode: mode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pkg.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await appendScan({
      orgId: user.organizationId,
      packageId: pkg.id,
      eventType: "sorted",
      actorUserId: user.id,
      facilityId: b.facilityId,
      note: b.sortZone ? `Zone ${b.sortZone}` : null,
    });
    await appendScan({
      orgId: user.organizationId,
      packageId: pkg.id,
      eventType: "ready_fulfillment",
      actorUserId: user.id,
      facilityId: b.facilityId,
    });

    // Ensure fulfillment order shell
    await freightDb().from("fulfillment_orders").upsert(
      {
        organization_id: user.organizationId,
        package_id: pkg.id,
        mode,
        status: "open",
        pickup_facility_id: mode === "pickup"
          ? (updated.pickup_facility_id || b.facilityId)
          : null,
        assignee_type: updated.preferred_assignee_type,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "package_id" },
    );

    if (mode === "pickup") {
      const { data: fac } = await freightDb()
        .from("facilities")
        .select("name")
        .eq("id", updated.pickup_facility_id || b.facilityId)
        .maybeSingle();
      await maybeNotifyPackage(updated, "ready_pickup", {
        branch: fac?.name || "our branch",
      });
      await freightDb()
        .from("packages")
        .update({
          status: "awaiting_pickup",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pkg.id);
      updated.status = "awaiting_pickup";
    }

    return c.json({ package: updated });
  });

  // -------------------------------------------------------------------------
  // Manifests
  // -------------------------------------------------------------------------
  const manifestBody = z.object({
    carrierName: z.string().max(200).optional().nullable(),
    shipmentType: z.enum(["air", "sea"]).default("air"),
    originFacilityId: z.string().uuid().optional().nullable(),
    destinationFacilityId: z.string().uuid().optional().nullable(),
    awbOrBl: z.string().max(120).optional().nullable(),
    estimatedArrival: z.string().optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  });

  app.get("/manifests", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const status = c.req.query("status");
    let q = freightDb()
      .from("manifests")
      .select("*")
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ manifests: data ?? [] });
  });

  app.get("/manifests/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: manifest, error } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!manifest) return c.json({ error: "Not found" }, 404);
    const { data: lines } = await freightDb()
      .from("manifest_packages")
      .select("*, packages(*, suites(suite_code, trn, contact_name))")
      .eq("manifest_id", id)
      .order("line_number");
    const { data: customs } = await freightDb()
      .from("customs_cases")
      .select("*")
      .eq("manifest_id", id)
      .maybeSingle();
    return c.json({
      manifest,
      lines: lines ?? [],
      customsCase: customs,
    });
  });

  app.post("/manifests", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = manifestBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const { data, error } = await freightDb()
      .from("manifests")
      .insert({
        organization_id: user.organizationId,
        manifest_number: manifestNumber(),
        carrier_name: b.carrierName || null,
        shipment_type: b.shipmentType,
        status: "open",
        origin_facility_id: b.originFacilityId || null,
        destination_facility_id: b.destinationFacilityId || null,
        awb_or_bl: b.awbOrBl || null,
        estimated_arrival: b.estimatedArrival || null,
        notes: b.notes || null,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await freightDb().from("customs_cases").insert({
      organization_id: user.organizationId,
      manifest_id: data.id,
      status: "pending",
    });

    return c.json({ manifest: data }, 201);
  });

  app.patch("/manifests/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const parsed = manifestBody.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data: existing, error: loadErr } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.status !== "open") {
      return c.json({ error: "Only open manifesto details can be edited" }, 409);
    }

    const b = parsed.data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.carrierName !== undefined) patch.carrier_name = b.carrierName || null;
    if (b.shipmentType != null) patch.shipment_type = b.shipmentType;
    if (b.originFacilityId !== undefined) {
      patch.origin_facility_id = b.originFacilityId || null;
    }
    if (b.destinationFacilityId !== undefined) {
      patch.destination_facility_id = b.destinationFacilityId || null;
    }
    if (b.awbOrBl !== undefined) patch.awb_or_bl = b.awbOrBl || null;
    if (b.estimatedArrival !== undefined) {
      patch.estimated_arrival = b.estimatedArrival || null;
    }
    if (b.notes !== undefined) patch.notes = b.notes || null;

    const { data, error } = await freightDb()
      .from("manifests")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ manifest: data });
  });

  app.delete("/manifests/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");

    const { data: existing, error: loadErr } = await freightDb()
      .from("manifests")
      .select("id, status, manifest_number")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.status !== "open") {
      return c.json(
        { error: "Only open manifesto can be deleted. Sealed shipments stay for customs history." },
        409,
      );
    }

    // Clear package → manifesto link (FK SET NULL also covers this)
    await freightDb()
      .from("packages")
      .update({ manifest_id: null, updated_at: new Date().toISOString() })
      .eq("organization_id", user.organizationId)
      .eq("manifest_id", id);

    const { error } = await freightDb()
      .from("manifests")
      .delete()
      .eq("id", id)
      .eq("organization_id", user.organizationId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, manifestNumber: existing.manifest_number });
  });

  /**
   * Creates open manifesto + packages (match suite by mailbox code; create missing packages).
   */
  app.post("/manifests/import-warehouse", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        carrierName: z.string().max(200).optional().nullable(),
        shipmentType: z.enum(["air", "sea"]).default("air"),
        originFacilityId: z.string().uuid().optional().nullable(),
        destinationFacilityId: z.string().uuid().optional().nullable(),
        awbOrBl: z.string().max(120).optional().nullable(),
        estimatedArrival: z.string().optional().nullable(),
        notes: z.string().max(4000).optional().nullable(),
        rows: z
          .array(
            z.object({
              suiteCode: z.string().min(1).max(64),
              contactName: z.string().max(200).optional().nullable(),
              trn: z.string().max(64).optional().nullable(),
              courierTrackingNumber: z.string().min(1).max(120),
              description: z.string().max(2000).optional().nullable(),
              weightLbs: z.number().optional().nullable(),
              lengthIn: z.number().optional().nullable(),
              widthIn: z.number().optional().nullable(),
              heightIn: z.number().optional().nullable(),
              declaredValueUsd: z.number().optional().nullable(),
              invoiceFileName: z.string().max(260).optional().nullable(),
            }),
          )
          .min(1)
          .max(500),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;
    const db = freightDb();
    const warnings: string[] = [];

    const { data: manifest, error: mErr } = await db
      .from("manifests")
      .insert({
        organization_id: user.organizationId,
        manifest_number: manifestNumber(),
        carrier_name: b.carrierName || null,
        shipment_type: b.shipmentType,
        status: "open",
        origin_facility_id: b.originFacilityId || null,
        destination_facility_id: b.destinationFacilityId || null,
        awb_or_bl: b.awbOrBl || null,
        estimated_arrival: b.estimatedArrival || null,
        notes: b.notes || null,
      })
      .select("*")
      .single();
    if (mErr) return c.json({ error: mErr.message }, 500);

    await db.from("customs_cases").insert({
      organization_id: user.organizationId,
      manifest_id: manifest.id,
      status: "pending",
    });

    const suiteCodes = [...new Set(b.rows.map((r) => r.suiteCode.trim().toUpperCase()))];
    const { data: suites } = await db
      .from("suites")
      .select("id, suite_code, client_id, default_fulfillment_mode, default_assignee_type, default_pickup_facility_id, delivery_address, delivery_lat, delivery_lng")
      .eq("organization_id", user.organizationId)
      .in("suite_code", suiteCodes);
    const suiteByCode = new Map(
      (suites ?? []).map((s) => [String(s.suite_code).toUpperCase(), s]),
    );

    const trackings = b.rows.map((r) => r.courierTrackingNumber.trim());
    const { data: existingPkgs } = await db
      .from("packages")
      .select("*")
      .eq("organization_id", user.organizationId)
      .in("courier_tracking_number", trackings);
    const pkgByTracking = new Map(
      (existingPkgs ?? [])
        .filter((p) => p.courier_tracking_number)
        .map((p) => [String(p.courier_tracking_number).toUpperCase(), p]),
    );

    let line = 1;
    let added = 0;
    let createdPackages = 0;
    let linkedExisting = 0;
    const blockedStatuses = new Set([
      "manifested",
      "in_transit_intl",
      "customs_hold",
      "customs_cleared",
      "received_hub",
      "ready_for_fulfillment",
      "out_for_delivery",
      "awaiting_pickup",
      "delivered",
      "collected",
    ]);

    for (const row of b.rows) {
      const suiteCode = row.suiteCode.trim().toUpperCase();
      const tracking = row.courierTrackingNumber.trim();
      const trackKey = tracking.toUpperCase();
      const suite = suiteByCode.get(suiteCode);
      if (!suite) {
        warnings.push(`Skipped ${tracking}: suite ${suiteCode} not found — import suites first.`);
        continue;
      }

      let pkg = pkgByTracking.get(trackKey) ?? null;
      const valueMinor =
        row.declaredValueUsd != null && Number.isFinite(row.declaredValueUsd)
          ? Math.round(row.declaredValueUsd * 100)
          : null;

      if (pkg) {
        if (blockedStatuses.has(String(pkg.status))) {
          warnings.push(
            `Skipped ${tracking}: package already ${pkg.status} — cannot re-add to a new manifesto.`,
          );
          continue;
        }
        const { data: updated, error: uErr } = await db
          .from("packages")
          .update({
            suite_id: suite.id,
            client_id: suite.client_id,
            description: row.description ?? pkg.description,
            weight_lbs: row.weightLbs ?? pkg.weight_lbs,
            length_in: row.lengthIn ?? pkg.length_in,
            width_in: row.widthIn ?? pkg.width_in,
            height_in: row.heightIn ?? pkg.height_in,
            declared_value_usd_minor: valueMinor ?? pkg.declared_value_usd_minor,
            invoice_file_name: row.invoiceFileName ?? pkg.invoice_file_name,
            status: "received_at_warehouse",
            current_facility_id: b.originFacilityId || pkg.current_facility_id,
            fulfillment_mode: pkg.fulfillment_mode || suite.default_fulfillment_mode,
            preferred_assignee_type: pkg.preferred_assignee_type || suite.default_assignee_type,
            pickup_facility_id: pkg.pickup_facility_id || suite.default_pickup_facility_id,
            delivery_address: pkg.delivery_address || suite.delivery_address,
            delivery_lat: pkg.delivery_lat ?? suite.delivery_lat,
            delivery_lng: pkg.delivery_lng ?? suite.delivery_lng,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pkg.id)
          .select("*")
          .single();
        if (uErr || !updated) {
          warnings.push(`Skipped ${tracking}: ${uErr?.message || "update failed"}`);
          continue;
        }
        pkg = updated;
        linkedExisting += 1;
      } else {
        const { data: created, error: cErr } = await db
          .from("packages")
          .insert({
            organization_id: user.organizationId,
            suite_id: suite.id,
            client_id: suite.client_id,
            courier_tracking_number: tracking,
            description: row.description || null,
            status: "received_at_warehouse",
            weight_lbs: row.weightLbs ?? null,
            length_in: row.lengthIn ?? null,
            width_in: row.widthIn ?? null,
            height_in: row.heightIn ?? null,
            declared_value_usd_minor: valueMinor,
            invoice_file_name: row.invoiceFileName || null,
            current_facility_id: b.originFacilityId || null,
            fulfillment_mode: suite.default_fulfillment_mode,
            preferred_assignee_type: suite.default_assignee_type,
            pickup_facility_id: suite.default_pickup_facility_id,
            delivery_address: suite.delivery_address,
            delivery_lat: suite.delivery_lat,
            delivery_lng: suite.delivery_lng,
          })
          .select("*")
          .single();
        if (cErr || !created) {
          warnings.push(`Skipped ${tracking}: ${cErr?.message || "create failed"}`);
          continue;
        }
        pkg = created;
        pkgByTracking.set(trackKey, created);
        createdPackages += 1;
        await appendScan({
          orgId: user.organizationId,
          packageId: created.id,
          eventType: "received_at_warehouse",
          facilityId: b.originFacilityId || null,
          actorUserId: user.id,
          note: "Imported from warehouse manifesto CSV",
        });
      }

      const { error: lineErr } = await db.from("manifest_packages").insert({
        organization_id: user.organizationId,
        manifest_id: manifest.id,
        package_id: pkg.id,
        line_number: line++,
      });
      if (lineErr) {
        warnings.push(`Skipped line for ${tracking}: ${lineErr.message}`);
        continue;
      }
      await db
        .from("packages")
        .update({
          manifest_id: manifest.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pkg.id);
      added += 1;
    }

    if (added === 0) {
      await db.from("customs_cases").delete().eq("manifest_id", manifest.id);
      await db.from("manifests").delete().eq("id", manifest.id);
      return c.json(
        {
          error: "No packages could be imported",
          warnings,
        },
        400,
      );
    }

    return c.json({
      manifestId: manifest.id,
      manifestNumber: manifest.manifest_number,
      added,
      createdPackages,
      linkedExisting,
      warnings,
    }, 201);
  });

  app.post("/manifests/:id/packages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({ packageIds: z.array(z.string().uuid()).min(1) })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const id = c.req.param("id");

    const { data: manifest } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);
    if (manifest.status !== "open") {
      return c.json({ error: "Manifest is sealed" }, 409);
    }

    const { data: existing } = await freightDb()
      .from("manifest_packages")
      .select("line_number")
      .eq("manifest_id", id)
      .order("line_number", { ascending: false })
      .limit(1);
    let line = (existing?.[0]?.line_number ?? 0) + 1;
    const added = [];

    for (const packageId of body.data.packageIds) {
      const { data: pkg } = await freightDb()
        .from("packages")
        .select("*")
        .eq("id", packageId)
        .eq("organization_id", user.organizationId)
        .maybeSingle();
      if (!pkg || pkg.status !== "received_at_warehouse") continue;

      const { data: row, error } = await freightDb()
        .from("manifest_packages")
        .insert({
          organization_id: user.organizationId,
          manifest_id: id,
          package_id: packageId,
          line_number: line++,
        })
        .select("*")
        .single();
      if (error) continue;
      await freightDb()
        .from("packages")
        .update({
          manifest_id: id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", packageId);
      added.push(row);
    }
    return c.json({ added });
  });

  app.post("/manifests/:id/seal", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const idem =
      c.req.header("Idempotency-Key") ||
      `seal:${user.organizationId}:${id}`;

    const { data: manifest } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);
    if (manifest.status !== "open") {
      return c.json({ manifest, skipped: true });
    }

    const { data: lines } = await freightDb()
      .from("manifest_packages")
      .select(
        "package_id, packages(*, suites(suite_code, trn, trn_valid, contact_name), retail_orders(invoice_storage_path, invoice_file_name, invoice_verified_at, invoice_unobtainable_at))",
      )
      .eq("manifest_id", id);
    if (!lines?.length) {
      return c.json({ error: "Add packages before sealing" }, 400);
    }

    const readiness = evaluateManifestReadiness(
      lines.map((l) => (l.packages ?? {}) as Parameters<typeof evaluateManifestReadiness>[0][number]),
    );
    if (!readiness.canSeal) {
      return c.json(
        {
          error: "validation_failed",
          message: "Resolve TRN, invoice, and weight blockers before sealing",
          ...readiness,
        },
        400,
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await freightDb()
      .from("manifests")
      .update({
        status: "sealed",
        sealed_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    for (const line of lines) {
      await freightDb()
        .from("packages")
        .update({
          status: "manifested",
          updated_at: now,
        })
        .eq("id", line.package_id);
      await appendScan({
        orgId: user.organizationId,
        packageId: line.package_id,
        eventType: "manifested",
        actorUserId: user.id,
        note: `Sealed on ${manifest.manifest_number}`,
        idempotencyKey: `${idem}:${line.package_id}`,
      });
      const { data: pkg } = await freightDb()
        .from("packages")
        .select("*")
        .eq("id", line.package_id)
        .single();
      if (pkg) await maybeNotifyPackage(pkg, "manifested");
    }

    return c.json({ manifest: updated });
  });

  app.post("/manifests/:id/transition", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        status: z.enum(["shipped", "arrived_ja", "cleared"]),
        awbOrBl: z.string().max(120).optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const id = c.req.param("id");
    const { data: manifest } = await freightDb()
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);

    const allowed: Record<string, string[]> = {
      sealed: ["shipped"],
      shipped: ["arrived_ja"],
      arrived_ja: ["cleared"],
      cleared: [],
    };
    if (!(allowed[manifest.status] ?? []).includes(body.data.status)) {
      return c.json({
        error: `Illegal ${manifest.status} → ${body.data.status}`,
      }, 409);
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: body.data.status,
      updated_at: now,
    };
    if (body.data.awbOrBl) patch.awb_or_bl = body.data.awbOrBl;
    if (body.data.status === "shipped") {
      patch.shipped_at = now;
    }
    if (body.data.status === "arrived_ja") patch.arrived_at = now;
    if (body.data.status === "cleared") patch.cleared_at = now;

    const { data: updated, error } = await freightDb()
      .from("manifests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    const { data: lines } = await freightDb()
      .from("manifest_packages")
      .select("package_id")
      .eq("manifest_id", id);

    const pkgStatus =
      body.data.status === "shipped"
        ? "in_transit_intl"
        : body.data.status === "arrived_ja"
        ? "in_transit_intl"
        : "customs_cleared";
    const scanType =
      body.data.status === "shipped"
        ? "shipped"
        : body.data.status === "arrived_ja"
        ? "arrived_ja"
        : "customs_cleared";

    for (const line of lines ?? []) {
      await freightDb()
        .from("packages")
        .update({ status: pkgStatus, updated_at: now })
        .eq("id", line.package_id);
      await appendScan({
        orgId: user.organizationId,
        packageId: line.package_id,
        eventType: scanType,
        actorUserId: user.id,
      });
      if (body.data.status === "cleared") {
        const { data: pkg } = await freightDb()
          .from("packages")
          .select("*")
          .eq("id", line.package_id)
          .single();
        if (pkg) await maybeNotifyPackage(pkg, "customs_cleared");
      }
    }

    if (body.data.status === "cleared") {
      await freightDb()
        .from("customs_cases")
        .update({
          status: "cleared",
          release_at: now,
          updated_at: now,
        })
        .eq("manifest_id", id);
    }

    return c.json({ manifest: updated });
  });

  app.get("/manifests/:id/customs-export", async (c) => {
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

    const { data: lines } = await freightDb()
      .from("manifest_packages")
      .select("line_number, packages(*, suites(suite_code, trn, contact_name, contact_phone))")
      .eq("manifest_id", id)
      .order("line_number");

    const header = [
      "line_number",
      "suite_code",
      "contact_name",
      "trn",
      "courier_tracking_number",
      "description",
      "weight_lbs",
      "length_in",
      "width_in",
      "height_in",
      "declared_value_usd",
      "invoice_file_name",
      "invoice_storage_path",
    ];
    const rows = (lines ?? []).map((line) => {
      const p = line.packages as Record<string, unknown> | null;
      const s = (p?.suites as Record<string, unknown> | null) || {};
      const valueMinor = Number(p?.declared_value_usd_minor ?? 0);
      return [
        line.line_number,
        s.suite_code ?? "",
        s.contact_name ?? "",
        s.trn ?? "",
        p?.courier_tracking_number ?? "",
        csvEscape(String(p?.description ?? "")),
        p?.weight_lbs ?? "",
        p?.length_in ?? "",
        p?.width_in ?? "",
        p?.height_in ?? "",
        (valueMinor / 100).toFixed(2),
        p?.invoice_file_name ?? "",
        p?.invoice_storage_path ?? "",
      ].join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    return c.json({
      manifestNumber: manifest.manifest_number,
      shipmentType: manifest.shipment_type,
      awbOrBl: manifest.awb_or_bl,
      csv,
      invoicePaths: (lines ?? [])
        .map((l) => (l.packages as Record<string, unknown> | null)?.invoice_storage_path)
        .filter(Boolean),
    });
  });

  /**
   * Courier submits cargo manifesto toward Jamaica Customs:
   * download electronic file (CSV) + mark customs case submitted.
   * No live ASYCUDA/PCS call.
   */
  app.post("/manifests/:id/submit-customs", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const body = z
      .object({
        brokerRef: z.string().max(120).optional().nullable(),
        awbOrBl: z.string().max(120).optional().nullable(),
        flightOrVoyage: z.string().max(120).optional().nullable(),
        estimatedArrival: z.string().optional().nullable(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;

    const db = freightDb();
    const { data: manifest } = await db
      .from("manifests")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!manifest) return c.json({ error: "Not found" }, 404);

    const allowed = new Set(["sealed", "shipped", "arrived_ja"]);
    if (!allowed.has(String(manifest.status))) {
      return c.json(
        { error: "Seal the cargo manifesto before submitting to Customs" },
        409,
      );
    }

    const now = new Date().toISOString();
    const manifestPatch: Record<string, unknown> = { updated_at: now };
    if (b.awbOrBl !== undefined) manifestPatch.awb_or_bl = b.awbOrBl || null;
    if (b.estimatedArrival !== undefined) {
      manifestPatch.estimated_arrival = b.estimatedArrival || null;
    }
    if (b.flightOrVoyage != null && String(b.flightOrVoyage).trim()) {
      const tag = `Flight/voyage: ${String(b.flightOrVoyage).trim()}`;
      const prev = manifest.notes ? String(manifest.notes) : "";
      if (!prev.includes(tag)) {
        manifestPatch.notes = prev ? `${prev}\n${tag}` : tag;
      }
    }
    if (Object.keys(manifestPatch).length > 1) {
      await db.from("manifests").update(manifestPatch).eq("id", id);
    }

    const { data: lines } = await db
      .from("manifest_packages")
      .select("line_number, packages(*, suites(suite_code, trn, contact_name, contact_phone))")
      .eq("manifest_id", id)
      .order("line_number");
    if (!lines?.length) {
      return c.json({ error: "No packages on manifesto" }, 400);
    }

    const header = [
      "line_number",
      "suite_code",
      "contact_name",
      "trn",
      "courier_tracking_number",
      "description",
      "weight_lbs",
      "length_in",
      "width_in",
      "height_in",
      "declared_value_usd",
      "invoice_file_name",
      "invoice_storage_path",
    ];
    const rows = lines.map((line) => {
      const p = line.packages as Record<string, unknown> | null;
      const s = (p?.suites as Record<string, unknown> | null) || {};
      const valueMinor = Number(p?.declared_value_usd_minor ?? 0);
      return [
        line.line_number,
        s.suite_code ?? "",
        s.contact_name ?? "",
        s.trn ?? "",
        p?.courier_tracking_number ?? "",
        csvEscape(String(p?.description ?? "")),
        p?.weight_lbs ?? "",
        p?.length_in ?? "",
        p?.width_in ?? "",
        p?.height_in ?? "",
        (valueMinor / 100).toFixed(2),
        p?.invoice_file_name ?? "",
        p?.invoice_storage_path ?? "",
      ].join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");

    const submitNote = `Submitted for Customs ${now.slice(0, 10)} (electronic file generated in Roam; not a live ASYCUDA API call).`;
    const { data: existingCase } = await db
      .from("customs_cases")
      .select("*")
      .eq("manifest_id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();

    const casePatch = {
      status: "submitted",
      broker_ref: b.brokerRef ?? existingCase?.broker_ref ?? null,
      notes: existingCase?.notes
        ? `${existingCase.notes}\n${submitNote}`
        : submitNote,
      updated_at: now,
    };

    let customsCase = existingCase;
    if (existingCase) {
      const { data: updated, error: uErr } = await db
        .from("customs_cases")
        .update(casePatch)
        .eq("id", existingCase.id)
        .select("*")
        .single();
      if (uErr) return c.json({ error: uErr.message }, 500);
      customsCase = updated;
    } else {
      const { data: created, error: cErr } = await db
        .from("customs_cases")
        .insert({
          organization_id: user.organizationId,
          manifest_id: id,
          ...casePatch,
        })
        .select("*")
        .single();
      if (cErr) return c.json({ error: cErr.message }, 500);
      customsCase = created;
    }

    return c.json({
      manifestNumber: manifest.manifest_number,
      shipmentType: manifest.shipment_type,
      awbOrBl: b.awbOrBl ?? manifest.awb_or_bl,
      csv,
      invoicePaths: lines
        .map((l) => (l.packages as Record<string, unknown> | null)?.invoice_storage_path)
        .filter(Boolean),
      customsCase,
      message: "File ready for broker / Customs submission.",
    });
  });

  // -------------------------------------------------------------------------
  // Customs board
  // -------------------------------------------------------------------------
  app.get("/customs-cases", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("customs_cases")
      .select("*, manifests(manifest_number, status, shipment_type, awb_or_bl)")
      .eq("organization_id", user.organizationId)
      .order("updated_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ customsCases: data ?? [] });
  });

  app.patch("/customs-cases/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        brokerRef: z.string().max(120).optional().nullable(),
        channel: z.enum(["green", "yellow", "red"]).optional().nullable(),
        status: z.enum(["pending", "submitted", "hold", "cleared", "released"]).optional(),
        holdReason: z.string().max(2000).optional().nullable(),
        notes: z.string().max(4000).optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const b = body.data;
    const now = new Date().toISOString();

    const { data: existing } = await freightDb()
      .from("customs_cases")
      .select("*")
      .eq("id", c.req.param("id"))
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const { data: updated, error } = await freightDb()
      .from("customs_cases")
      .update({
        ...(b.brokerRef !== undefined ? { broker_ref: b.brokerRef } : {}),
        ...(b.channel !== undefined ? { channel: b.channel } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.holdReason !== undefined ? { hold_reason: b.holdReason } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.status === "cleared" || b.status === "released"
          ? { release_at: now }
          : {}),
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    const { data: lines } = await freightDb()
      .from("manifest_packages")
      .select("package_id")
      .eq("manifest_id", existing.manifest_id);

    if (b.status === "hold") {
      for (const line of lines ?? []) {
        await freightDb()
          .from("packages")
          .update({ status: "customs_hold", updated_at: now })
          .eq("id", line.package_id);
        await appendScan({
          orgId: user.organizationId,
          packageId: line.package_id,
          eventType: "customs_hold",
          actorUserId: user.id,
          note: b.holdReason || null,
        });
      }
    }

    if (b.status === "cleared" || b.status === "released") {
      for (const line of lines ?? []) {
        await freightDb()
          .from("packages")
          .update({ status: "customs_cleared", updated_at: now })
          .eq("id", line.package_id);
        await appendScan({
          orgId: user.organizationId,
          packageId: line.package_id,
          eventType: "customs_cleared",
          actorUserId: user.id,
        });
        const { data: pkg } = await freightDb()
          .from("packages")
          .select("*")
          .eq("id", line.package_id)
          .single();
        if (pkg) await maybeNotifyPackage(pkg, "customs_cleared");
      }
      await freightDb()
        .from("manifests")
        .update({ status: "cleared", cleared_at: now, updated_at: now })
        .eq("id", existing.manifest_id);
    }

    return c.json({ customsCase: updated });
  });

  // -------------------------------------------------------------------------
  // Client fleet
  // -------------------------------------------------------------------------
  const clientFleetBody = z.object({
    clientId: z.string().uuid(),
    driverName: z.string().min(1).max(200),
    driverPhone: z.string().max(50).optional().nullable(),
    vehiclePlate: z.string().max(40).optional().nullable(),
    vehicleLabel: z.string().max(120).optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
  });

  app.get("/client-fleet", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const clientId = c.req.query("clientId");
    let q = freightDb()
      .from("client_fleet_assets")
      .select("*, clients(name)")
      .eq("organization_id", user.organizationId)
      .order("driver_name");
    if (clientId) q = q.eq("client_id", clientId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ assets: data ?? [] });
  });

  app.post("/client-fleet", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const parsed = clientFleetBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const { data, error } = await freightDb()
      .from("client_fleet_assets")
      .insert({
        organization_id: user.organizationId,
        client_id: b.clientId,
        driver_name: b.driverName,
        driver_phone: b.driverPhone || null,
        vehicle_plate: b.vehiclePlate || null,
        vehicle_label: b.vehicleLabel || null,
        status: b.status ?? "active",
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ asset: data }, 201);
  });

  // -------------------------------------------------------------------------
  // Fulfillment desk
  // -------------------------------------------------------------------------
  app.get("/fulfillment/ready", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("packages")
      .select("*, suites(suite_code, contact_name, contact_phone), fulfillment_orders(*)")
      .eq("organization_id", user.organizationId)
      .in("status", ["ready_for_fulfillment", "awaiting_pickup", "out_for_delivery"])
      .order("updated_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ packages: data ?? [] });
  });

  app.post("/fulfillment/pickup/collect", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const body = z
      .object({
        packageId: z.string().uuid(),
        barcode: z.string().optional().nullable(),
        note: z.string().max(500).optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const { data: pkg } = await freightDb()
      .from("packages")
      .select("*")
      .eq("id", body.data.packageId)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!pkg) return c.json({ error: "Not found" }, 404);
    if (!["awaiting_pickup", "ready_for_fulfillment"].includes(pkg.status)) {
      return c.json({ error: `Cannot collect from ${pkg.status}` }, 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await freightDb()
      .from("packages")
      .update({ status: "collected", updated_at: now })
      .eq("id", pkg.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await freightDb()
      .from("fulfillment_orders")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("package_id", pkg.id);

    await appendScan({
      orgId: user.organizationId,
      packageId: pkg.id,
      eventType: "picked_up",
      actorUserId: user.id,
      barcode: body.data.barcode,
      note: body.data.note,
    });
    await maybeNotifyPackage(updated, "collected");
    return c.json({ package: updated });
  });

  const buildBatchBody = z.object({
    packageIds: z.array(z.string().uuid()).min(1),
    assigneeType: assigneeType,
    assigneeDriverId: z.string().uuid().optional().nullable(),
    assigneeVehicleId: z.string().uuid().optional().nullable(),
    clientFleetAssetId: z.string().uuid().optional().nullable(),
    thirdPartyCarrierId: z.string().uuid().optional().nullable(),
    hubFacilityId: z.string().uuid().optional().nullable(),
    offerNow: z.boolean().optional(),
  });

  app.post("/fulfillment/batches", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const seat = requireSeatPermission(user, "freight.fulfillment.write");
    if (seat instanceof Response) return seat;
    const parsed = buildBatchBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const mkt = marketplaceRejectPayload(b.assigneeType);
    if (mkt) return c.json(mkt, 400);

    const { data: pkgs } = await freightDb()
      .from("packages")
      .select("*")
      .eq("organization_id", user.organizationId)
      .in("id", b.packageIds);
    if (!pkgs?.length) return c.json({ error: "No packages" }, 400);

    // Geo cluster sort: nearest-neighbor from hub/mean
    const withCoords = pkgs.map((p) => ({
      ...p,
      lat: p.delivery_lat ?? 18.0,
      lng: p.delivery_lng ?? -76.8,
    }));
    const meanLat =
      withCoords.reduce((s, p) => s + Number(p.lat), 0) / withCoords.length;
    const meanLng =
      withCoords.reduce((s, p) => s + Number(p.lng), 0) / withCoords.length;
    const ordered = nearestNeighborOrder(withCoords, meanLat, meanLng);

    const { token, expiresAt: expires } = issuePodToken();
    const now = new Date().toISOString();

    const { data: batch, error } = await freightDb()
      .from("delivery_batches")
      .insert({
        organization_id: user.organizationId,
        batch_number: batchNumber(),
        status: b.offerNow ? "offered" : "draft",
        assignee_type: b.assigneeType,
        assignee_driver_id: b.assigneeDriverId || null,
        assignee_vehicle_id: b.assigneeVehicleId || null,
        client_fleet_asset_id: b.clientFleetAssetId || null,
        third_party_carrier_id: b.thirdPartyCarrierId || null,
        hub_facility_id: b.hubFacilityId || null,
        pod_token: token,
        pod_token_expires_at: expires,
        offered_at: b.offerNow ? now : null,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    let order = 1;
    for (const pkg of ordered) {
      await freightDb().from("delivery_batch_stops").insert({
        organization_id: user.organizationId,
        batch_id: batch.id,
        package_id: pkg.id,
        stop_order: order++,
        address: pkg.delivery_address,
        lat: pkg.delivery_lat,
        lng: pkg.delivery_lng,
        status: "pending",
      });

      await freightDb()
        .from("packages")
        .update({
          status: "out_for_delivery",
          fulfillment_mode: "door_delivery",
          preferred_assignee_type: b.assigneeType,
          updated_at: now,
        })
        .eq("id", pkg.id);

      await freightDb().from("fulfillment_orders").upsert(
        {
          organization_id: user.organizationId,
          package_id: pkg.id,
          mode: "door_delivery",
          status: "assigned",
          delivery_batch_id: batch.id,
          assignee_type: b.assigneeType,
          assignee_driver_id: b.assigneeDriverId || null,
          assignee_vehicle_id: b.assigneeVehicleId || null,
          client_fleet_asset_id: b.clientFleetAssetId || null,
          third_party_carrier_id: b.thirdPartyCarrierId || null,
          updated_at: now,
        },
        { onConflict: "package_id" },
      );

      await appendScan({
        orgId: user.organizationId,
        packageId: pkg.id,
        eventType: "out_for_delivery",
        actorUserId: user.id,
        note: `Batch ${batch.batch_number}`,
      });
      await maybeNotifyPackage(pkg, "out_for_delivery");
    }

    // Client fleet: SMS POD link
    if (b.assigneeType === "client_fleet" && b.clientFleetAssetId) {
      const { data: asset } = await freightDb()
        .from("client_fleet_assets")
        .select("*")
        .eq("id", b.clientFleetAssetId)
        .maybeSingle();
      if (asset?.driver_phone) {
        const base =
          Deno.env.get("ENTERPRISE_PUBLIC_URL") ||
          Deno.env.get("ROAM_ENTERPRISE_URL") ||
          "https://roamenterprise.co";
        await notifyPackageContact(asset.driver_phone, "pod_link", {
          url: `${base.replace(/\/$/, "")}/pod/${token}`,
          suite_code: batch.batch_number,
          tracking: batch.batch_number,
        });
      }
    }

    return c.json({ batch, podToken: token });
  });

  app.get("/fulfillment/batches", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("delivery_batches")
      .select("*")
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ batches: data ?? [] });
  });

  app.get("/fulfillment/batches/:id", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    const { data: batch } = await freightDb()
      .from("delivery_batches")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!batch) return c.json({ error: "Not found" }, 404);
    const { data: stops } = await freightDb()
      .from("delivery_batch_stops")
      .select("*, packages(*, suites(suite_code, contact_name, contact_phone))")
      .eq("batch_id", id)
      .order("stop_order");
    return c.json({ batch, stops: stops ?? [] });
  });

  app.post("/fulfillment/batches/:id/load", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const seat = requireSeatPermission(user, "freight.fulfillment.write");
    if (seat instanceof Response) return seat;
    const body = z
      .object({ packageId: z.string().uuid(), barcode: z.string().optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const id = c.req.param("id");

    const { data: stop, error } = await freightDb()
      .from("delivery_batch_stops")
      .update({ status: "loaded", updated_at: new Date().toISOString() })
      .eq("batch_id", id)
      .eq("package_id", body.data.packageId)
      .eq("organization_id", user.organizationId)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await appendScan({
      orgId: user.organizationId,
      packageId: body.data.packageId,
      eventType: "loaded_vehicle",
      actorUserId: user.id,
      barcode: body.data.barcode,
    });

    await freightDb()
      .from("delivery_batches")
      .update({
        status: "in_progress",
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .in("status", ["draft", "offered"]);

    return c.json({ stop });
  });

  app.post("/fulfillment/batches/:id/deliver-stop", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const seat = requireSeatPermission(user, "freight.fulfillment.write");
    if (seat instanceof Response) return seat;
    const body = z
      .object({
        packageId: z.string().uuid(),
        podNote: z.string().max(500).optional().nullable(),
        podPhotoPath: z.string().optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const id = c.req.param("id");

    const result = await completeStopDelivery({
      batchId: id,
      organizationId: user.organizationId,
      packageId: body.data.packageId,
      podNote: body.data.podNote,
      podPhotoPath: body.data.podPhotoPath,
      actorUserId: user.id,
      defaultNote: "Confirmed by ops",
    });
    if (!result.ok) return c.json({ error: result.error }, 500);
    return c.json({
      stop: result.stop,
      package: result.package,
      batchCompleted: result.batchCompleted,
    });
  });

  // -------------------------------------------------------------------------
  // Public POD (token) — no enterprise auth
  // -------------------------------------------------------------------------
  app.get("/public/pod/:token", async (c) => {
    const token = c.req.param("token");
    const session = await loadPodSessionByToken(token);
    if (!session.ok) return c.json({ error: session.error }, session.status);
    return c.json({
      batchNumber: session.batch.batch_number,
      status: session.batch.status,
      stops: session.stops,
    });
  });

  /** Token-gated POD photo upload → org Files (no enterprise auth). */
  app.post("/public/pod/:token/upload", async (c) => {
    const token = c.req.param("token");
    const session = await loadPodSessionByToken(token);
    if (!session.ok) return c.json({ error: session.error }, session.status);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    const packageId = form.packageId ? String(form.packageId) : null;

    const result = await uploadOrgFile({
      organizationId: session.batch.organization_id,
      file,
      kind: "pod",
      sourceType: packageId ? "package" : "delivery_batch",
      sourceId: packageId || session.batch.id,
      uploadedBy: null,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ file: result.file }, 201);
  });

  app.post("/public/pod/:token/deliver", async (c) => {
    const token = c.req.param("token");
    const body = z
      .object({
        packageId: z.string().uuid(),
        podNote: z.string().max(500).optional().nullable(),
        podPhotoPath: z.string().optional().nullable(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);

    const session = await loadPodSessionByToken(token);
    if (!session.ok) return c.json({ error: session.error }, session.status);

    const result = await completeStopDelivery({
      batchId: session.batch.id,
      organizationId: session.batch.organization_id,
      packageId: body.data.packageId,
      podNote: body.data.podNote,
      podPhotoPath: body.data.podPhotoPath,
      actorUserId: null,
      defaultNote: "Confirmed via POD link",
    });
    if (!result.ok) return c.json({ error: result.error }, 500);
    return c.json({
      stop: result.stop,
      package: result.package,
      batchCompleted: result.batchCompleted,
    });
  });

  // Pipeline dashboard counts
  app.get("/pipeline/dashboard", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    const { data, error } = await freightDb()
      .from("packages")
      .select("status")
      .eq("organization_id", user.organizationId);
    if (error) return c.json({ error: error.message }, 500);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return c.json({ counts, timezone: "America/Jamaica" });
  });
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function nearestNeighborOrder<T extends { lat: number; lng: number }>(
  points: T[],
  startLat: number,
  startLng: number,
): T[] {
  const remaining = [...points];
  const ordered: T[] = [];
  let curLat = startLat;
  let curLng = startLng;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d =
        (Number(remaining[i].lat) - curLat) ** 2 +
        (Number(remaining[i].lng) - curLng) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = Number(next.lat);
    curLng = Number(next.lng);
  }
  return ordered;
}
