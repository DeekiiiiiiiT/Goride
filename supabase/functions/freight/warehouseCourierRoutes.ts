/**
 * Warehouse ↔ Courier partnership API (marketplace links + search + self-link).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import {
  requireEnterpriseAccess,
  requireSeatPermission,
  serviceClient,
} from "../_shared/enterpriseAccess.ts";
import {
  createExternalOrg,
  ensureSelfLink,
  inviteLink,
  listLinksForOrg,
  searchEnterpriseOrgs,
  setLinkStatus,
  updateLinkTerms,
} from "../_shared/warehouseCourierAccess.ts";

type FreightApp = Hono;

export function registerWarehouseCourierRoutes(app: FreightApp) {
  /**
   * Pre-alert destinations: own warehouse buildings + active/invited partner FF buildings.
   * Invoice ship-to matching uses this list (not only the courier's own facilities).
   */
  app.get("/destination-warehouses", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    try {
      const links = await listLinksForOrg(user.organizationId);
      const usable = links.filter(
        (l) =>
          l.courier_org_id === user.organizationId &&
          (l.status === "active" || l.status === "invited"),
      );
      const selfActive = usable.some((l) => l.warehouse_org_id === l.courier_org_id);
      const partnerOrgIds = [
        ...new Set(
          usable
            .filter((l) => l.warehouse_org_id !== l.courier_org_id)
            .map((l) => l.warehouse_org_id),
        ),
      ];

      const freight = serviceClient().schema("freight");
      const { data: ownRows, error: ownErr } = await freight
        .from("facilities")
        .select(
          "id, name, code, address_line, city, country_code, organization_id, status",
        )
        .eq("organization_id", user.organizationId)
        .eq("facility_type", "warehouse")
        .eq("status", "active")
        .order("name");
      if (ownErr) return c.json({ error: ownErr.message }, 500);

      let partnerRows: Record<string, unknown>[] = [];
      if (partnerOrgIds.length) {
        const { data, error } = await freight
          .from("facilities")
          .select(
            "id, name, code, address_line, city, country_code, organization_id, status",
          )
          .in("organization_id", partnerOrgIds)
          .eq("facility_type", "warehouse")
          .eq("status", "active")
          .order("name");
        if (error) return c.json({ error: error.message }, 500);
        partnerRows = (data ?? []) as Record<string, unknown>[];
      }

      const orgIds = [...new Set(partnerRows.map((r) => String(r.organization_id)))];
      const { data: orgs } = orgIds.length
        ? await serviceClient()
          .from("organizations")
          .select("id, name")
          .in("id", orgIds)
        : { data: [] as { id: string; name: string }[] };
      const orgName = new Map((orgs || []).map((o) => [o.id as string, o.name as string]));

      const own = selfActive || (ownRows?.length ?? 0) > 0
        ? (ownRows ?? []).map((f) => ({
          ...f,
          source: "own" as const,
          partner_name: null,
        }))
        : [];

      const partner = partnerRows.map((f) => ({
        ...f,
        source: "partner" as const,
        partner_name: orgName.get(String(f.organization_id)) ?? String(f.name || ""),
      }));

      return c.json({
        warehouses: [...own, ...partner],
        hasOwnWarehouse: own.length > 0,
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 500);
    }
  });

  app.get("/warehouse-courier-links", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    try {
      const links = await listLinksForOrg(user.organizationId);
      const orgIds = [
        ...new Set(
          links.flatMap((l) => [l.warehouse_org_id, l.courier_org_id]),
        ),
      ];
      const { data: orgs } = await serviceClient()
        .from("organizations")
        .select("id, name, business_type, is_external, contact_email")
        .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((orgs || []).map((o) => [o.id as string, o]));
      return c.json({
        links: links.map((l) => ({
          ...l,
          warehouse_org: byId.get(l.warehouse_org_id) ?? null,
          courier_org: byId.get(l.courier_org_id) ?? null,
          is_self: l.warehouse_org_id === l.courier_org_id,
        })),
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 500);
    }
  });

  app.get("/warehouse-courier-links/search-orgs", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const q = c.req.query("q") || "";
    try {
      const orgs = (await searchEnterpriseOrgs(q, 30)).filter(
        (o) => o.id !== user.organizationId,
      );
      return c.json({ organizations: orgs });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 500);
    }
  });

  const inviteBody = z.object({
    counterpartyOrgId: z.string().uuid(),
    roleAs: z.enum(["warehouse", "courier"]),
  });

  app.post("/warehouse-courier-links", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = inviteBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      const link = await inviteLink({
        callerOrgId: user.organizationId,
        callerUserId: user.id,
        counterpartyOrgId: parsed.data.counterpartyOrgId,
        roleAs: parsed.data.roleAs,
      });
      return c.json({ link }, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 400);
    }
  });

  const externalBody = z.object({
    roleAs: z.enum(["warehouse", "courier"]),
    name: z.string().min(2).max(160),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    contactName: z.string().max(120).optional().nullable(),
  });

  app.post("/warehouse-courier-links/external", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = externalBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      const result = await createExternalOrg({
        callerOrgId: user.organizationId,
        callerUserId: user.id,
        roleAs: parsed.data.roleAs,
        name: parsed.data.name,
        contact: {
          name: parsed.data.contactName ?? undefined,
          email: parsed.data.email ?? undefined,
          phone: parsed.data.phone ?? undefined,
        },
      });
      return c.json(result, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 400);
    }
  });

  const termsBody = z.object({
    free_days: z.number().int().min(0).max(365).optional(),
    per_day_minor: z.number().int().min(0).max(10_000_000).optional(),
    currency: z.string().min(3).max(3).optional(),
    handling_minor: z.number().int().min(0).max(10_000_000).optional(),
  });

  app.post("/warehouse-courier-links/:id/terms", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = termsBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      const link = await updateLinkTerms({
        linkId: c.req.param("id"),
        callerOrgId: user.organizationId,
        terms: parsed.data,
      });
      return c.json({ link });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      const code = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 400;
      return c.json({ error: msg }, code);
    }
  });

  app.post("/warehouse-courier-links/ensure-self", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    try {
      const link = await ensureSelfLink(user.organizationId, user.id);
      // Ensure org subscribed_products includes warehouse
      const svc = serviceClient();
      const { data: org } = await svc
        .from("organizations")
        .select("id, subscribed_products")
        .eq("id", user.organizationId)
        .maybeSingle();
      const products = Array.isArray(org?.subscribed_products)
        ? [...org!.subscribed_products as string[]]
        : [];
      if (!products.includes("warehouse")) {
        products.push("warehouse");
        if (!products.includes("courier")) products.push("courier");
        await svc
          .from("organizations")
          .update({ subscribed_products: products })
          .eq("id", user.organizationId);
      }
      return c.json({ link });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed" }, 500);
    }
  });

  const statusBody = z.object({
    status: z.enum(["active", "paused", "revoked", "invited"]),
  });

  app.post("/warehouse-courier-links/:id/status", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = statusBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      const link = await setLinkStatus({
        linkId: c.req.param("id"),
        callerOrgId: user.organizationId,
        next: parsed.data.status,
      });
      return c.json({ link });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      const code = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 400;
      return c.json({ error: msg }, code);
    }
  });

  app.get("/warehouse-billing/statement", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const courierOrgId = c.req.query("courierOrgId");
    const openOnly = c.req.query("open") === "1";
    let q = serviceClient()
      .schema("freight")
      .from("warehouse_storage_ledger")
      .select("*")
      .or(
        `warehouse_org_id.eq.${user.organizationId},courier_org_id.eq.${user.organizationId}`,
      )
      .order("occurred_on", { ascending: false })
      .limit(500);
    if (courierOrgId) q = q.eq("courier_org_id", courierOrgId);
    if (openOnly) q = q.is("invoice_id", null);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const totalMinor = (data || []).reduce(
      (sum, row) => sum + Number(row.unit_amount_minor || 0) * Number(row.quantity || 0),
      0,
    );
    return c.json({ lines: data || [], totalMinor, currency: "USD" });
  });

  app.post("/warehouse-billing/accrue", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const { data, error } = await serviceClient().rpc("accrue_storage_days", {
      p_on: new Date().toISOString().slice(0, 10),
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ inserted: data ?? 0 });
  });

  app.get("/warehouse-billing/invoices", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const { data, error } = await serviceClient()
      .schema("freight")
      .from("warehouse_storage_invoices")
      .select("*")
      .or(
        `warehouse_org_id.eq.${user.organizationId},courier_org_id.eq.${user.organizationId}`,
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ invoices: data || [] });
  });

  const issueBody = z.object({
    courierOrgId: z.string().uuid(),
    periodStart: z.string().min(8).max(10),
    periodEnd: z.string().min(8).max(10),
  });

  app.post("/warehouse-billing/invoices", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = issueBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const db = serviceClient().schema("freight");
    const { courierOrgId, periodStart, periodEnd } = parsed.data;

    const { data: lines, error: lineErr } = await db
      .from("warehouse_storage_ledger")
      .select("*")
      .eq("warehouse_org_id", user.organizationId)
      .eq("courier_org_id", courierOrgId)
      .is("invoice_id", null)
      .gte("occurred_on", periodStart)
      .lte("occurred_on", periodEnd)
      .order("occurred_on");
    if (lineErr) return c.json({ error: lineErr.message }, 500);
    if (!lines?.length) {
      return c.json({ error: "No unbilled storage lines in that period" }, 400);
    }

    const totalMinor = lines.reduce(
      (sum, row) => sum + Number(row.unit_amount_minor || 0) * Number(row.quantity || 0),
      0,
    );
    const stamp = periodEnd.replace(/-/g, "");
    const invoiceNumber = `WS-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const currency = String(lines[0].currency || "USD");

    const { data: invoice, error: invErr } = await db
      .from("warehouse_storage_invoices")
      .insert({
        warehouse_org_id: user.organizationId,
        courier_org_id: courierOrgId,
        invoice_number: invoiceNumber,
        status: "issued",
        currency,
        period_start: periodStart,
        period_end: periodEnd,
        total_minor: totalMinor,
        issued_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (invErr) return c.json({ error: invErr.message }, 500);

    const invoiceLines = lines.map((row, i) => ({
      invoice_id: invoice.id,
      ledger_id: row.id,
      code: String(row.event_type),
      label: `${String(row.event_type).replace(/_/g, " ")} · ${row.occurred_on}`,
      quantity: row.quantity,
      amount_minor: Number(row.unit_amount_minor || 0) * Number(row.quantity || 0),
      sort_order: i + 1,
    }));
    const { error: insLinesErr } = await db
      .from("warehouse_storage_invoice_lines")
      .insert(invoiceLines);
    if (insLinesErr) return c.json({ error: insLinesErr.message }, 500);

    const ids = lines.map((r) => r.id as string);
    const { error: markErr } = await db
      .from("warehouse_storage_ledger")
      .update({ invoice_id: invoice.id })
      .in("id", ids);
    if (markErr) return c.json({ error: markErr.message }, 500);

    return c.json({ invoice, lines: invoiceLines }, 201);
  });

  app.post("/warehouse-billing/invoices/:id/mark-paid", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const { data: invoice, error: findErr } = await serviceClient()
      .schema("freight")
      .from("warehouse_storage_invoices")
      .select("*")
      .eq("id", c.req.param("id"))
      .eq("warehouse_org_id", user.organizationId)
      .maybeSingle();
    if (findErr) return c.json({ error: findErr.message }, 500);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);
    if (invoice.status === "void") return c.json({ error: "Invoice is void" }, 409);
    const { data, error } = await serviceClient()
      .schema("freight")
      .from("warehouse_storage_invoices")
      .update({
        status: "paid_offline",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ invoice: data });
  });

  app.get("/warehouse-bins", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const facilityId = c.req.query("facilityId");
    let q = serviceClient()
      .schema("freight")
      .from("warehouse_bins")
      .select("*")
      .eq("warehouse_org_id", user.organizationId)
      .order("code");
    if (facilityId) q = q.eq("facility_id", facilityId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ bins: data || [] });
  });

  const binBody = z.object({
    facilityId: z.string().uuid(),
    code: z.string().min(1).max(40),
    zone: z.string().max(80).optional().nullable(),
  });

  app.post("/warehouse-bins", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const seatGate = requireSeatPermission(user, "freight.mailbox.write");
    if (seatGate instanceof Response) return seatGate;
    const parsed = binBody.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { data, error } = await serviceClient()
      .schema("freight")
      .from("warehouse_bins")
      .insert({
        warehouse_org_id: user.organizationId,
        facility_id: parsed.data.facilityId,
        code: parsed.data.code.trim().toUpperCase(),
        zone: parsed.data.zone ?? null,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ bin: data }, 201);
  });
}
