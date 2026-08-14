/**
 * Enterprise Admin: freight-forwarder + courier company catalogs + claim queue.
 * Gated with requireProductAdmin("enterprise").
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "./product_admin_guard.ts";

const BASE = "/make-server-37f42386/enterprise-admin";

const WRITE_ROLES = new Set([
  "platform_owner",
  "superadmin",
  "enterprise_admin",
  "enterprise_ops",
]);

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function freightDb() {
  return serviceClient().schema("freight");
}

function slugCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function timezoneForCountry(cc: string): string {
  if (cc === "JM") return "America/Jamaica";
  if (cc === "CN") return "Asia/Shanghai";
  return "America/New_York";
}

function assertWrite(auth: ProductAdminUser): Response | null {
  if (!WRITE_ROLES.has(auth.role) && !auth.isPlatformRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function parseCatalogBody(body: Record<string, unknown>, partial: boolean) {
  const name = body.name != null ? String(body.name).trim() : "";
  // Code is server-owned; clients may omit it. Slug from name when creating.
  const codeRaw = body.code != null ? String(body.code) : name;
  const code = slugCode(codeRaw || name);
  const addressLine = String(body.addressLine ?? body.address_line ?? "").trim();
  const city = String(body.city ?? "").trim();
  const state = String(body.state ?? "").trim().slice(0, 80);
  const postalCode = String(body.postalCode ?? body.postal_code ?? "").trim();
  const countryCode = String(body.countryCode ?? body.country_code ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const timezone = String(body.timezone ?? "").trim() || timezoneForCountry(countryCode);
  if (!partial) {
    if (!name || !addressLine || !city || !postalCode || !countryCode || !timezone) {
      return {
        error: "name, addressLine, city, postalCode, countryCode, and timezone are required",
      };
    }
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!partial || body.name != null) row.name = name;
  // Never accept client code on patch; create path sets unique code separately.
  if (!partial) row.code = code || slugCode(name) || "COMPANY";
  if (!partial || body.addressLine != null || body.address_line != null) {
    row.address_line = addressLine;
  }
  if (!partial || body.city != null) row.city = city;
  if (!partial || body.state != null) row.state = state;
  if (!partial || body.postalCode != null || body.postal_code != null) {
    row.postal_code = postalCode;
  }
  if (!partial || body.countryCode != null || body.country_code != null) {
    row.country_code = countryCode;
  }
  if (!partial || body.timezone != null) row.timezone = timezone;
  if (body.status === "active" || body.status === "inactive") row.status = body.status;
  else if (!partial) row.status = "active";

  if (
    Object.prototype.hasOwnProperty.call(body, "linkedCourierCatalogId") ||
    Object.prototype.hasOwnProperty.call(body, "linked_courier_catalog_id")
  ) {
    const raw = body.linkedCourierCatalogId ?? body.linked_courier_catalog_id;
    row.linked_courier_catalog_id =
      raw === null || raw === "" || raw === undefined ? null : String(raw);
  }
  return { row };
}

async function withLinkedCouriers(warehouses: Record<string, unknown>[]) {
  const courierIds = [
    ...new Set(
      warehouses
        .map((w) => w.linked_courier_catalog_id)
        .filter((id): id is string => typeof id === "string" && !!id),
    ),
  ];
  if (!courierIds.length) {
    return warehouses.map((w) => ({
      ...w,
      linked_courier_name: null,
    }));
  }
  const { data: couriers, error } = await serviceClient()
    .from("intake_courier_catalog")
    .select("id, name, code")
    .in("id", courierIds);
  if (error) throw new Error(error.message);
  const byId = Object.fromEntries(
    (couriers ?? []).map((c: { id: string; name: string; code: string }) => [c.id, c]),
  );
  return warehouses.map((w) => {
    const linked = w.linked_courier_catalog_id
      ? byId[String(w.linked_courier_catalog_id)]
      : null;
    return {
      ...w,
      linked_courier_name: linked?.name ?? null,
      linked_courier_code: linked?.code ?? null,
    };
  });
}

async function withClaimInfo(warehouses: Record<string, unknown>[]) {
  const ids = warehouses.map((w) => String(w.id)).filter(Boolean);
  if (!ids.length) {
    return warehouses.map((w) => ({
      ...w,
      claimed_by_org_id: null,
      claimed_by_org_name: null,
    }));
  }
  const { data: facilities, error } = await freightDb()
    .from("facilities")
    .select("intake_catalog_id, organization_id")
    .eq("facility_type", "warehouse")
    .in("intake_catalog_id", ids);
  if (error) throw new Error(error.message);
  const orgIds = [
    ...new Set((facilities ?? []).map((r: { organization_id: string }) => r.organization_id)),
  ];
  const orgs = orgIds.length
    ? (
        await serviceClient()
          .from("organizations")
          .select("id, name")
          .in("id", orgIds)
      ).data ?? []
    : [];
  const orgName = Object.fromEntries(
    orgs.map((o: { id: string; name: string }) => [o.id, o.name]),
  );
  const byCatalog = Object.fromEntries(
    (facilities ?? []).map((r: { intake_catalog_id: string; organization_id: string }) => [
      r.intake_catalog_id,
      r.organization_id,
    ]),
  );
  return warehouses.map((w) => {
    const orgId = byCatalog[String(w.id)] ?? null;
    return {
      ...w,
      claimed_by_org_id: orgId,
      claimed_by_org_name: orgId ? orgName[orgId] || orgId : null,
    };
  });
}

async function uniqueCatalogCode(base: string): Promise<string> {
  const supabase = serviceClient();
  let code = slugCode(base) || "FF_COMPANY";
  for (let i = 0; i < 12; i++) {
    const tryCode = i === 0 ? code : `${code.slice(0, 32)}_${i + 1}`;
    const { data } = await supabase
      .from("intake_warehouse_catalog")
      .select("id")
      .eq("code", tryCode)
      .maybeSingle();
    if (!data) return tryCode;
  }
  return `${code.slice(0, 28)}_${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
}

async function uniqueCourierCatalogCode(base: string): Promise<string> {
  const supabase = serviceClient();
  let code = slugCode(base) || "COURIER";
  for (let i = 0; i < 12; i++) {
    const tryCode = i === 0 ? code : `${code.slice(0, 32)}_${i + 1}`;
    const { data } = await supabase
      .from("intake_courier_catalog")
      .select("id")
      .eq("code", tryCode)
      .maybeSingle();
    if (!data) return tryCode;
  }
  return `${code.slice(0, 28)}_${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
}

async function attachWarehouseFacility(
  orgId: string,
  catalog: {
    id: string;
    name: string;
    code: string;
    address_line: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
    timezone: string;
  },
) {
  const { data: existing } = await freightDb()
    .from("facilities")
    .select("id")
    .eq("organization_id", orgId)
    .eq("facility_type", "warehouse")
    .eq("intake_catalog_id", catalog.id)
    .maybeSingle();
  if (existing) return existing;

  const claimed = await freightDb()
    .from("facilities")
    .select("id, organization_id")
    .eq("facility_type", "warehouse")
    .eq("intake_catalog_id", catalog.id)
    .maybeSingle();
  if (claimed.data && claimed.data.organization_id !== orgId) {
    throw new Error("This company listing is already claimed by another account.");
  }

  const orgCode = `${String(catalog.code).slice(0, 24)}-INTAKE`;
  const { data, error } = await freightDb()
    .from("facilities")
    .insert({
      organization_id: orgId,
      name: String(catalog.name),
      code: orgCode,
      facility_type: "warehouse",
      intake_catalog_id: catalog.id,
      address_line: String(catalog.address_line),
      city: `${String(catalog.city)}, ${String(catalog.state)} ${String(catalog.postal_code)}`.trim(),
      country_code: String(catalog.country_code || "US"),
      timezone: String(catalog.timezone || "America/New_York"),
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export function registerEnterpriseIntakeAdminRoutes(app: Hono) {
  app.get(`${BASE}/intake-warehouses`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const { data, error } = await serviceClient()
      .from("intake_warehouse_catalog")
      .select("*")
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    try {
      const withClaims = await withClaimInfo(data ?? []);
      return c.json({ warehouses: await withLinkedCouriers(withClaims) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.post(`${BASE}/intake-warehouses`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCatalogBody(body, false);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    parsed.row.code = await uniqueCatalogCode(String(parsed.row.name || parsed.row.code || ""));
    const { data, error } = await serviceClient()
      .from("intake_warehouse_catalog")
      .insert(parsed.row)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    try {
      const [warehouse] = await withLinkedCouriers(await withClaimInfo([data]));
      return c.json({ warehouse }, 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.patch(`${BASE}/intake-warehouses/:id`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCatalogBody(body, true);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    delete parsed.row.code;
    const { data, error } = await serviceClient()
      .from("intake_warehouse_catalog")
      .update(parsed.row)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    try {
      const [warehouse] = await withLinkedCouriers(await withClaimInfo([data]));
      return c.json({ warehouse });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  /** Drop exclusive claim so the listing shows again on Freight Forwarder Setup. */
  app.post(`${BASE}/intake-warehouses/:id/release`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const id = c.req.param("id");
    const { data: catalog, error: catErr } = await serviceClient()
      .from("intake_warehouse_catalog")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (catErr) return c.json({ error: catErr.message }, 500);
    if (!catalog) return c.json({ error: "Company not found" }, 404);
    const { error } = await freightDb()
      .from("facilities")
      .update({ intake_catalog_id: null })
      .eq("facility_type", "warehouse")
      .eq("intake_catalog_id", id);
    if (error) return c.json({ error: error.message }, 500);
    try {
      const [warehouse] = await withLinkedCouriers(await withClaimInfo([catalog]));
      return c.json({ warehouse });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get(`${BASE}/intake-couriers`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const { data, error } = await serviceClient()
      .from("intake_courier_catalog")
      .select("*")
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ couriers: data ?? [] });
  });

  app.post(`${BASE}/intake-couriers`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCatalogBody(body, false);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    delete parsed.row.linked_courier_catalog_id;
    parsed.row.code = await uniqueCourierCatalogCode(String(parsed.row.name || parsed.row.code || ""));
    const { data, error } = await serviceClient()
      .from("intake_courier_catalog")
      .insert(parsed.row)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ courier: data }, 201);
  });

  app.patch(`${BASE}/intake-couriers/:id`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseCatalogBody(body, true);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    delete parsed.row.code;
    delete parsed.row.linked_courier_catalog_id;
    const { data, error } = await serviceClient()
      .from("intake_courier_catalog")
      .update(parsed.row)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ courier: data });
  });

  app.get(`${BASE}/intake-claims`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const status = c.req.query("status");
    let q = freightDb()
      .from("intake_claim_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status === "pending" || status === "approved" || status === "rejected") {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const rows = data ?? [];
    const orgIds = [...new Set(rows.map((r: { organization_id: string }) => r.organization_id))];
    const orgs = orgIds.length
      ? (
          await serviceClient()
            .from("organizations")
            .select("id, name")
            .in("id", orgIds)
        ).data ?? []
      : [];
    const orgName = Object.fromEntries(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));
    return c.json({
      requests: rows.map((r: Record<string, unknown>) => ({
        ...r,
        organization_name: orgName[String(r.organization_id)] || "",
      })),
    });
  });

  app.post(`${BASE}/intake-claims/:id/approve`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const id = c.req.param("id");
    const supabase = serviceClient();
    const { data: reqRow, error: loadErr } = await freightDb()
      .from("intake_claim_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!reqRow) return c.json({ error: "Request not found" }, 404);
    if (reqRow.status !== "pending") {
      return c.json({ error: "This request is no longer pending." }, 409);
    }

    const proposed = {
      name: String(reqRow.proposed_name),
      address_line: String(reqRow.proposed_address_line),
      city: String(reqRow.proposed_city),
      state: String(reqRow.proposed_state || ""),
      postal_code: String(reqRow.proposed_postal_code),
      country_code: String(reqRow.proposed_country_code || "US"),
      timezone: String(reqRow.proposed_timezone || timezoneForCountry(String(reqRow.proposed_country_code))),
    };

    let catalog: Record<string, unknown> | null = null;
    try {
      if (reqRow.kind === "join") {
        const catalogId = String(reqRow.catalog_id || "");
        const { data: listed, error: listErr } = await supabase
          .from("intake_warehouse_catalog")
          .select("*")
          .eq("id", catalogId)
          .maybeSingle();
        if (listErr) return c.json({ error: listErr.message }, 500);
        if (!listed || listed.status !== "active") {
          return c.json({ error: "That company listing is not available." }, 404);
        }
        catalog = listed;
      } else if (reqRow.kind === "claim_edit") {
        const catalogId = String(reqRow.catalog_id || "");
        const { data: updated, error: updErr } = await supabase
          .from("intake_warehouse_catalog")
          .update({
            name: proposed.name,
            address_line: proposed.address_line,
            city: proposed.city,
            state: proposed.state,
            postal_code: proposed.postal_code,
            country_code: proposed.country_code,
            timezone: proposed.timezone,
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", catalogId)
          .select("*")
          .single();
        if (updErr) return c.json({ error: updErr.message }, 500);
        catalog = updated;
      } else {
        const code = await uniqueCatalogCode(proposed.name);
        const { data: created, error: insErr } = await supabase
          .from("intake_warehouse_catalog")
          .insert({
            name: proposed.name,
            code,
            address_line: proposed.address_line,
            city: proposed.city,
            state: proposed.state,
            postal_code: proposed.postal_code,
            country_code: proposed.country_code,
            timezone: proposed.timezone,
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (insErr) return c.json({ error: insErr.message }, 500);
        catalog = created;
      }

      if (!catalog) return c.json({ error: "Could not save company listing." }, 500);

      await attachWarehouseFacility(String(reqRow.organization_id), {
        id: String(catalog.id),
        name: String(catalog.name),
        code: String(catalog.code),
        address_line: String(catalog.address_line),
        city: String(catalog.city),
        state: String(catalog.state || ""),
        postal_code: String(catalog.postal_code),
        country_code: String(catalog.country_code || "US"),
        timezone: String(catalog.timezone || "America/New_York"),
      });

      await supabase
        .from("organizations")
        .update({ name: proposed.name })
        .eq("id", reqRow.organization_id);

      const { data: done, error: doneErr } = await freightDb()
        .from("intake_claim_requests")
        .update({
          status: "approved",
          catalog_id: catalog.id,
          reviewed_by: auth.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      if (doneErr) return c.json({ error: doneErr.message }, 500);
      return c.json({ request: done, warehouse: catalog });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.post(`${BASE}/intake-claims/:id/reject`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const note = String(body.note ?? body.review_note ?? "").trim();
    const { data: reqRow, error: loadErr } = await freightDb()
      .from("intake_claim_requests")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!reqRow) return c.json({ error: "Request not found" }, 404);
    if (reqRow.status !== "pending") {
      return c.json({ error: "This request is no longer pending." }, 409);
    }
    const { data, error } = await freightDb()
      .from("intake_claim_requests")
      .update({
        status: "rejected",
        review_note: note || null,
        reviewed_by: auth.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ request: data });
  });

  app.get(`${BASE}/links`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const { data, error } = await freightDb()
      .from("warehouse_courier_links")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return c.json({ error: error.message }, 500);
    const links = data ?? [];
    const orgIds = [
      ...new Set(links.flatMap((l: { warehouse_org_id: string; courier_org_id: string }) => [
        l.warehouse_org_id,
        l.courier_org_id,
      ])),
    ];
    const orgs = orgIds.length
      ? (
          await serviceClient()
            .from("organizations")
            .select("id, name, business_type, is_external, contact_email")
            .in("id", orgIds)
        ).data ?? []
      : [];
    const byId = new Map(orgs.map((o: { id: string }) => [o.id, o]));
    return c.json({
      links: links.map((l: Record<string, unknown>) => ({
        ...l,
        warehouse_org: byId.get(String(l.warehouse_org_id)) ?? null,
        courier_org: byId.get(String(l.courier_org_id)) ?? null,
        is_self: l.warehouse_org_id === l.courier_org_id,
      })),
    });
  });

  app.post(`${BASE}/links/:id/status`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    const next = String(body.status || "");
    if (!["active", "paused", "revoked"].includes(next)) {
      return c.json({ error: "status must be active, paused, or revoked" }, 400);
    }
    const patch: Record<string, unknown> = {
      status: next,
      updated_at: new Date().toISOString(),
    };
    if (next === "active") patch.accepted_at = new Date().toISOString();
    const { data, error } = await freightDb()
      .from("warehouse_courier_links")
      .update(patch)
      .eq("id", c.req.param("id"))
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ link: data });
  });

  app.get(`${BASE}/external-orgs`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const { data, error } = await serviceClient()
      .from("organizations")
      .select("id, name, business_type, contact_email, contact_phone, created_by_org_id, external_contact, created_at, is_external")
      .eq("is_external", true)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return c.json({ error: error.message }, 500);
    const rows = data ?? [];
    const creatorIds = [
      ...new Set(rows.map((r: { created_by_org_id: string | null }) => r.created_by_org_id).filter(Boolean)),
    ] as string[];
    const creators = creatorIds.length
      ? (
          await serviceClient()
            .from("organizations")
            .select("id, name")
            .in("id", creatorIds)
        ).data ?? []
      : [];
    const creatorName = Object.fromEntries(creators.map((o: { id: string; name: string }) => [o.id, o.name]));
    return c.json({
      organizations: rows.map((r: Record<string, unknown>) => ({
        ...r,
        created_by_org_name: creatorName[String(r.created_by_org_id)] || "",
      })),
    });
  });

  app.post(`${BASE}/external-orgs/:id/convert`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const denied = assertWrite(auth);
    if (denied) return denied;
    const orgId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; name?: string };
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return c.json({ error: "A login email is required to invite this partner onto Roam" }, 400);
    }
    const supabase = serviceClient();
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .eq("is_external", true)
      .maybeSingle();
    if (orgErr) return c.json({ error: orgErr.message }, 500);
    if (!org) return c.json({ error: "External partner not found" }, 404);

    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(9)))
      .map((b: number) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 12);
    const displayName = String(body.name || org.name);
    const businessType = String(org.business_type || "warehouse");

    const { data: created, error: userErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      user_metadata: {
        name: displayName,
        role: "admin",
        businessType,
        productLine: "enterprise",
        organizationId: orgId,
      },
      app_metadata: {
        role: "admin",
        businessType,
        productLine: "enterprise",
        organizationId: orgId,
      },
      email_confirm: true,
    });
    if (userErr) {
      if (
        userErr.message?.includes("already been registered") ||
        userErr.message?.includes("already exists")
      ) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      return c.json({ error: userErr.message }, 400);
    }
    const userId = created.user.id;

    const { error: updErr } = await supabase
      .from("organizations")
      .update({
        owner_id: userId,
        is_external: false,
        contact_email: email,
        name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({
      success: true,
      organizationId: orgId,
      userId,
      temporaryPassword: tempPassword,
      message: `Login created for ${displayName}. Share the temporary password securely.`,
    });
  });

  app.get(`${BASE}/storage-billing`, async (c) => {
    const auth = await requireProductAdmin(c, "enterprise");
    if (auth instanceof Response) return auth;
    const { data: invoices, error: invErr } = await freightDb()
      .from("warehouse_storage_invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (invErr) return c.json({ error: invErr.message }, 500);
    const { data: openLines, error: lineErr } = await freightDb()
      .from("warehouse_storage_ledger")
      .select("warehouse_org_id, courier_org_id, unit_amount_minor, quantity, currency")
      .is("invoice_id", null)
      .limit(2000);
    if (lineErr) return c.json({ error: lineErr.message }, 500);

    const outstanding: Record<string, { warehouse_org_id: string; courier_org_id: string; totalMinor: number; currency: string }> = {};
    for (const row of openLines ?? []) {
      const key = `${row.warehouse_org_id}:${row.courier_org_id}`;
      if (!outstanding[key]) {
        outstanding[key] = {
          warehouse_org_id: row.warehouse_org_id as string,
          courier_org_id: row.courier_org_id as string,
          totalMinor: 0,
          currency: String(row.currency || "USD"),
        };
      }
      outstanding[key].totalMinor += Number(row.unit_amount_minor || 0) * Number(row.quantity || 0);
    }

    const orgIds = [
      ...new Set(
        [
          ...(invoices ?? []).flatMap((i: { warehouse_org_id: string; courier_org_id: string }) => [
            i.warehouse_org_id,
            i.courier_org_id,
          ]),
          ...Object.values(outstanding).flatMap((o) => [o.warehouse_org_id, o.courier_org_id]),
        ],
      ),
    ];
    const orgs = orgIds.length
      ? (
          await serviceClient()
            .from("organizations")
            .select("id, name, is_external")
            .in("id", orgIds)
        ).data ?? []
      : [];
    const orgName = Object.fromEntries(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));

    return c.json({
      invoices: (invoices ?? []).map((i: Record<string, unknown>) => ({
        ...i,
        warehouse_name: orgName[String(i.warehouse_org_id)] || "",
        courier_name: orgName[String(i.courier_org_id)] || "",
      })),
      outstanding: Object.values(outstanding).map((o) => ({
        ...o,
        warehouse_name: orgName[o.warehouse_org_id] || "",
        courier_name: orgName[o.courier_org_id] || "",
      })),
    });
  });
}
