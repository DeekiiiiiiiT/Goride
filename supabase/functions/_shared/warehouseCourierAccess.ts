/**
 * Dual-ownership + warehouse↔courier link helpers for the freight edge.
 * See docs/products/WAREHOUSE_COURIER_MODEL.md
 */
import type { EnterpriseAccessUser } from "./enterpriseAccess.ts";
import { serviceClient } from "./enterpriseAccess.ts";

export type LinkStatus = "invited" | "active" | "paused" | "revoked";

export type WarehouseCourierLink = {
  id: string;
  warehouse_org_id: string;
  courier_org_id: string;
  status: LinkStatus;
  initiated_by: "warehouse" | "courier";
  invited_by_user_id: string | null;
  accepted_at: string | null;
  terms: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type StorageTerms = {
  free_days: number;
  per_day_minor: number;
  currency: string;
  handling_minor: number;
};

export const DEFAULT_STORAGE_TERMS: StorageTerms = {
  free_days: 7,
  per_day_minor: 0,
  currency: "USD",
  handling_minor: 0,
};

export function parseStorageTerms(raw: unknown): StorageTerms {
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, fallback: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : fallback;
  };
  return {
    free_days: Math.floor(n(t.free_days, DEFAULT_STORAGE_TERMS.free_days)),
    per_day_minor: Math.floor(n(t.per_day_minor, DEFAULT_STORAGE_TERMS.per_day_minor)),
    currency: String(t.currency || DEFAULT_STORAGE_TERMS.currency).slice(0, 3).toUpperCase(),
    handling_minor: Math.floor(n(t.handling_minor, DEFAULT_STORAGE_TERMS.handling_minor)),
  };
}

export async function getLinkTerms(
  warehouseOrgId: string,
  courierOrgId: string,
): Promise<StorageTerms> {
  if (warehouseOrgId === courierOrgId) return DEFAULT_STORAGE_TERMS;
  const { data } = await freight()
    .from("warehouse_courier_links")
    .select("terms")
    .eq("warehouse_org_id", warehouseOrgId)
    .eq("courier_org_id", courierOrgId)
    .maybeSingle();
  return parseStorageTerms(data?.terms);
}

function freight() {
  return serviceClient().schema("freight");
}

function publicDb() {
  return serviceClient();
}

/** Active partnership, including in-house self-link. */
export async function hasActiveLink(
  warehouseOrgId: string,
  courierOrgId: string,
): Promise<boolean> {
  if (warehouseOrgId === courierOrgId) return true;
  const { data } = await freight()
    .from("warehouse_courier_links")
    .select("id")
    .eq("warehouse_org_id", warehouseOrgId)
    .eq("courier_org_id", courierOrgId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data);
}

/** Caller is package owner (courier) or operating warehouse. */
export function isPackageParty(
  pkg: { owner_org_id?: string | null; organization_id?: string | null; operating_warehouse_org_id?: string | null },
  orgId: string,
): boolean {
  const owner = pkg.owner_org_id || pkg.organization_id;
  if (owner === orgId) return true;
  if (pkg.operating_warehouse_org_id === orgId) return true;
  return false;
}

/** Courier (owner) write path — manifests / customs / hub / fulfillment. */
export function requirePackageOwner(
  pkg: { owner_org_id?: string | null; organization_id?: string | null },
  user: EnterpriseAccessUser,
): Response | null {
  const owner = pkg.owner_org_id || pkg.organization_id;
  if (owner === user.organizationId || user.isPlatformRole) return null;
  return new Response(JSON.stringify({ error: "Forbidden: courier owner only" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export async function listLinksForOrg(orgId: string): Promise<WarehouseCourierLink[]> {
  const { data, error } = await freight()
    .from("warehouse_courier_links")
    .select("*")
    .or(`warehouse_org_id.eq.${orgId},courier_org_id.eq.${orgId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as WarehouseCourierLink[];
}

export async function ensureSelfLink(orgId: string, userId?: string): Promise<WarehouseCourierLink> {
  const { data: existing } = await freight()
    .from("warehouse_courier_links")
    .select("*")
    .eq("warehouse_org_id", orgId)
    .eq("courier_org_id", orgId)
    .maybeSingle();
  if (existing) {
    if (existing.status !== "active") {
      const { data: updated, error } = await freight()
        .from("warehouse_courier_links")
        .update({
          status: "active",
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated as WarehouseCourierLink;
    }
    return existing as WarehouseCourierLink;
  }
  const { data, error } = await freight()
    .from("warehouse_courier_links")
    .insert({
      warehouse_org_id: orgId,
      courier_org_id: orgId,
      status: "active",
      initiated_by: "courier",
      invited_by_user_id: userId ?? null,
      accepted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WarehouseCourierLink;
}

export async function inviteLink(input: {
  callerOrgId: string;
  callerUserId: string;
  counterpartyOrgId: string;
  roleAs: "warehouse" | "courier";
}): Promise<WarehouseCourierLink> {
  const warehouseOrgId =
    input.roleAs === "warehouse" ? input.callerOrgId : input.counterpartyOrgId;
  const courierOrgId =
    input.roleAs === "courier" ? input.callerOrgId : input.counterpartyOrgId;

  if (warehouseOrgId === courierOrgId) {
    return ensureSelfLink(warehouseOrgId, input.callerUserId);
  }

  const { data: counterparty } = await publicDb()
    .from("organizations")
    .select("id, product_line, business_type, is_external, created_by_org_id")
    .eq("id", input.counterpartyOrgId)
    .eq("product_line", "enterprise")
    .maybeSingle();
  if (!counterparty) throw new Error("Counterparty organization not found");
  if (
    counterparty.is_external &&
    counterparty.created_by_org_id !== input.callerOrgId
  ) {
    throw new Error("That off-platform partner belongs to another company");
  }

  const autoActive = Boolean(counterparty.is_external);
  const nextStatus: LinkStatus = autoActive ? "active" : "invited";

  const { data: existing } = await freight()
    .from("warehouse_courier_links")
    .select("*")
    .eq("warehouse_org_id", warehouseOrgId)
    .eq("courier_org_id", courierOrgId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "revoked" || existing.status === "paused") {
      const { data, error } = await freight()
        .from("warehouse_courier_links")
        .update({
          status: nextStatus,
          initiated_by: input.roleAs,
          invited_by_user_id: input.callerUserId,
          accepted_at: autoActive ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as WarehouseCourierLink;
    }
    return existing as WarehouseCourierLink;
  }

  const { data, error } = await freight()
    .from("warehouse_courier_links")
    .insert({
      warehouse_org_id: warehouseOrgId,
      courier_org_id: courierOrgId,
      status: nextStatus,
      initiated_by: input.roleAs,
      invited_by_user_id: input.callerUserId,
      accepted_at: autoActive ? new Date().toISOString() : null,
      terms: DEFAULT_STORAGE_TERMS,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WarehouseCourierLink;
}

function slugifyOrg(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "partner";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `ext-${base}-${suffix}`;
}

/** Off-platform partner: placeholder org + auto-active link. */
export async function createExternalOrg(input: {
  callerOrgId: string;
  callerUserId: string;
  roleAs: "warehouse" | "courier";
  name: string;
  contact?: { name?: string; email?: string; phone?: string };
}): Promise<{ org: Record<string, unknown>; link: WarehouseCourierLink }> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Company name is required");
  const contact = input.contact ?? {};
  const externalRole = input.roleAs === "courier" ? "warehouse" : "courier";
  const businessType = externalRole === "warehouse" ? "warehouse" : "freight_forwarding";
  const subscribed = externalRole === "warehouse" ? ["warehouse"] : ["courier"];

  const { data: org, error } = await publicDb()
    .from("organizations")
    .insert({
      owner_id: null,
      name,
      slug: slugifyOrg(name),
      product_line: "enterprise",
      business_type: businessType,
      status: "active",
      is_external: true,
      created_by_org_id: input.callerOrgId,
      contact_email: contact.email?.trim() || null,
      contact_phone: contact.phone?.trim() || null,
      external_contact: {
        name: contact.name?.trim() || null,
        email: contact.email?.trim() || null,
        phone: contact.phone?.trim() || null,
      },
      subscribed_products: subscribed,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const link = await inviteLink({
    callerOrgId: input.callerOrgId,
    callerUserId: input.callerUserId,
    counterpartyOrgId: org.id as string,
    roleAs: input.roleAs,
  });
  return { org, link };
}

export async function updateLinkTerms(input: {
  linkId: string;
  callerOrgId: string;
  terms: Partial<StorageTerms>;
}): Promise<WarehouseCourierLink> {
  const { data: link, error: findErr } = await freight()
    .from("warehouse_courier_links")
    .select("*")
    .eq("id", input.linkId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!link) throw new Error("Link not found");
  if (link.warehouse_org_id !== input.callerOrgId && link.courier_org_id !== input.callerOrgId) {
    throw new Error("Forbidden: not a party to this link");
  }
  if (link.warehouse_org_id !== input.callerOrgId) {
    throw new Error("Only the freight forwarder sets storage prices");
  }
  const next = {
    ...parseStorageTerms(link.terms),
    ...input.terms,
  };
  const { data, error } = await freight()
    .from("warehouse_courier_links")
    .update({
      terms: parseStorageTerms(next),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.linkId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WarehouseCourierLink;
}

export async function setLinkStatus(input: {
  linkId: string;
  callerOrgId: string;
  next: LinkStatus;
}): Promise<WarehouseCourierLink> {
  const { data: link, error: findErr } = await freight()
    .from("warehouse_courier_links")
    .select("*")
    .eq("id", input.linkId)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!link) throw new Error("Link not found");
  if (
    link.warehouse_org_id !== input.callerOrgId &&
    link.courier_org_id !== input.callerOrgId
  ) {
    throw new Error("Forbidden: not a party to this link");
  }

  const patch: Record<string, unknown> = {
    status: input.next,
    updated_at: new Date().toISOString(),
  };
  if (input.next === "active") {
    patch.accepted_at = new Date().toISOString();
  }

  const { data, error } = await freight()
    .from("warehouse_courier_links")
    .update(patch)
    .eq("id", input.linkId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WarehouseCourierLink;
}

/** Courier org IDs this warehouse may receive for. */
export async function linkedCourierOrgIds(warehouseOrgId: string): Promise<string[]> {
  const { data } = await freight()
    .from("warehouse_courier_links")
    .select("courier_org_id")
    .eq("warehouse_org_id", warehouseOrgId)
    .eq("status", "active");
  const ids = new Set<string>([warehouseOrgId]);
  for (const row of data || []) ids.add(row.courier_org_id as string);
  return [...ids];
}

/** Warehouse org IDs this courier may collect from. */
export async function linkedWarehouseOrgIds(courierOrgId: string): Promise<string[]> {
  const { data } = await freight()
    .from("warehouse_courier_links")
    .select("warehouse_org_id")
    .eq("courier_org_id", courierOrgId)
    .eq("status", "active");
  const ids = new Set<string>([courierOrgId]);
  for (const row of data || []) ids.add(row.warehouse_org_id as string);
  return [...ids];
}

export async function searchEnterpriseOrgs(q: string, limit = 20) {
  const term = q.trim();
  let query = publicDb()
    .from("organizations")
    .select("id, name, business_type, product_line, is_external")
    .eq("product_line", "enterprise")
    .eq("is_external", false)
    .limit(limit);
  if (term) {
    query = query.ilike("name", `%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}
