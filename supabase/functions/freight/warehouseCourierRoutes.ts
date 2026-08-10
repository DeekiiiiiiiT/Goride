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
  ensureSelfLink,
  inviteLink,
  listLinksForOrg,
  searchEnterpriseOrgs,
  setLinkStatus,
} from "../_shared/warehouseCourierAccess.ts";

type FreightApp = Hono;

export function registerWarehouseCourierRoutes(app: FreightApp) {
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
        .select("id, name, business_type")
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

  /** Read-only warehouse storage statement scaffold. */
  app.get("/warehouse-billing/statement", async (c) => {
    const user = await requireEnterpriseAccess(c);
    if (user instanceof Response) return user;
    const courierOrgId = c.req.query("courierOrgId");
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
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const totalMinor = (data || []).reduce(
      (sum, row) => sum + Number(row.unit_amount_minor || 0) * Number(row.quantity || 0),
      0,
    );
    return c.json({ lines: data || [], totalMinor, currency: "USD" });
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
