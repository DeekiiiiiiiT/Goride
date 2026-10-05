/**
 * Toll tags, plazas, and the official rate card.
 * Moved off the residual monolith so fleet-toll actually serves the URLs the apps call.
 * Tag documents stay in the fleet mirror. Assignment and balance are database operations.
 */
import { Hono, type Context } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, PLATFORM_RESOLVED_ROLES, type RbacUser } from "./rbac_middleware.ts";
import { belongsToOrgStrict, getOrgId, stampOrg } from "./org_scope.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import { getServiceClient } from "./service_client.ts";
import { requireCatalogMatched } from "./vehicle_catalog_gate.ts";
import { logAdminAction } from "./audit_log.ts";
import { loadTollPlazaStats, attachPlazaStats } from "./toll_plaza_stats.ts";
import {
  parseTollTagCreate,
  parseTollTagPatch,
  readConcurrencyToken,
  readOptionalClientId,
} from "../../../packages/toll-core/src/tollTagWrite.ts";

type TollInventoryEnv = {
  Variables: {
    rbacUser?: RbacUser;
    __cachedRequestBody?: Record<string, unknown> | null;
  };
};
type TollCtx = Context<TollInventoryEnv>;

const app = new Hono<TollInventoryEnv>();
app.use("*", requireAuth({ strict: true }));

const PAGE = 200;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 500;

type BalanceRow = {
  tag_id: string;
  ledger_count: number;
  balance: number | null;
  usage_amount: number | null;
  usage_count: number | null;
  span_days: number | null;
};

function platformUser(c: TollCtx): boolean {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return Boolean(user && PLATFORM_RESOLVED_ROLES.has(user.resolvedRole));
}

function orgOrForbid(c: TollCtx): string | null | Response {
  const orgId = getOrgId(c);
  if (!orgId && !platformUser(c)) return c.json({ error: "Organization required" }, 403);
  return orgId;
}

function thresholdFor(tag: Record<string, unknown>, orgDefault: number | null): number {
  const own = Number(tag.lowBalanceThreshold);
  if (Number.isFinite(own) && own > 0) return own;
  if (orgDefault != null && orgDefault > 0) return orgDefault;
  return DEFAULT_THRESHOLD;
}

function ringFor(balance: number | null, threshold: number): string {
  if (balance == null || !Number.isFinite(balance)) return "unknown";
  if (balance <= 0) return "empty";
  if (balance < threshold) return "low";
  if (balance < threshold * 2) return "watch";
  return "healthy";
}

function daysLeft(balance: number | null, usageAmount: number, usageCount: number, spanDays: number | null): number | null {
  if (balance == null) return null;
  if (balance <= 0) return 0;
  if (usageCount < 2 || spanDays == null || spanDays < 7 || !(usageAmount > 0)) return null;
  return Math.floor(balance / (usageAmount / spanDays));
}

function tripsLeft(balance: number | null, usageAmount: number, usageCount: number): number | null {
  if (balance == null || usageCount < 1 || !(usageAmount > 0)) return null;
  if (balance <= 0) return 0;
  return Math.floor(balance / (usageAmount / usageCount));
}

async function orgDefaultThreshold(orgId: string | null): Promise<number | null> {
  if (!orgId) return null;
  const settings = await kv.get(`organization_settings:${orgId}`) as { tollLowBalanceDefaultJmd?: unknown } | null;
  const n = Number(settings?.tollLowBalanceDefaultJmd);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function balanceMap(orgId: string | null, tagId?: string): Promise<Map<string, BalanceRow>> {
  const map = new Map<string, BalanceRow>();
  if (!orgId) return map;
  const args: { p_org: string; p_tag_id?: string } = { p_org: orgId };
  if (tagId) args.p_tag_id = tagId;
  const { data, error } = await getServiceClient().rpc("fleet_toll_tag_balance_rows", args);
  if (error || !Array.isArray(data)) return map;
  for (const row of data as BalanceRow[]) {
    if (row?.tag_id) map.set(String(row.tag_id), row);
  }
  return map;
}

type PresentedTag = Record<string, unknown> & {
  id?: unknown;
  status?: unknown;
  tagNumber?: unknown;
  provider?: unknown;
  assignedVehicleId?: unknown;
  assignedVehicleName?: unknown;
  updatedAt?: unknown;
  lastCalculatedBalance: number | null;
  lastBalanceSyncedAt: string | null;
  resolvedLowBalanceThreshold: number;
  balanceStale: boolean;
};

function presentTag(tag: Record<string, unknown>, row: BalanceRow | undefined, orgDefault: number | null): PresentedTag {
  const cached = typeof tag.lastCalculatedBalance === "number" ? tag.lastCalculatedBalance : null;
  const fromLedger = row && Number(row.ledger_count) > 0 ? Number(row.balance) : null;
  const balance = fromLedger != null && Number.isFinite(fromLedger) ? fromLedger : cached;
  const asOf = fromLedger != null ? new Date().toISOString() : (typeof tag.lastBalanceSyncedAt === "string" ? tag.lastBalanceSyncedAt : null);
  const stale = asOf ? Date.now() - Date.parse(asOf) > STALE_MS : balance != null;
  return {
    ...tag,
    lastCalculatedBalance: balance,
    lastBalanceSyncedAt: asOf,
    resolvedLowBalanceThreshold: thresholdFor(tag, orgDefault),
    balanceStale: stale,
  } as PresentedTag;
}

async function listTags(
  c: TollCtx,
  orgId: string | null,
  offsetOverride?: number,
  shared?: { balances: Map<string, BalanceRow>; orgDefault: number | null },
) {
  const offset = offsetOverride ?? (Math.max(0, Number(c.req.query("cursor") || 0) || 0));
  const res = await queryFleet("toll_tags", {
    ...(orgId ? { org: orgId } : {}),
    filters: [{ op: "not", col: "organization_id", operator: "is", value: null }],
    order: { col: "updated_at", ascending: false },
    limit: PAGE,
    offset,
  });
  if (res.error) throw res.error;
  const tags = (res.data as Record<string, unknown>[]).filter((tag) => belongsToOrgStrict(tag, c) || platformUser(c));
  const balances = shared?.balances ?? await balanceMap(orgId);
  const orgDefault = shared ? shared.orgDefault : await orgDefaultThreshold(orgId);
  const presented = tags.map((tag) => presentTag(tag, balances.get(String(tag.id)), orgDefault));
  const nextCursor = tags.length === PAGE ? String(offset + PAGE) : null;
  return { tags: presented, nextCursor, orgDefault };
}

function rpcError(error: { message?: string } | null): { status: 404 | 409; error: string; reason: string } | null {
  const msg = error?.message || "";
  if (!msg) return null;
  if (msg.includes("tag_not_found") || msg.includes("vehicle_not_found")) {
    return { status: 404, error: "Not found", reason: "not_found" };
  }
  if (msg.includes("tag_assigned")) {
    return { status: 409, error: "Unassign this tag before retiring it", reason: "tag_assigned" };
  }
  if (msg.includes("stale_write")) {
    return { status: 409, error: "This tag was updated somewhere else. Refresh and try again.", reason: "stale_write" };
  }
  if (msg.includes("tag_retired")) {
    return { status: 409, error: "This tag is retired", reason: "tag_retired" };
  }
  return null;
}

async function mirrorPayloads(result: { tag?: Record<string, unknown>; vehicles?: Array<{ id?: string; kind?: string; payload?: Record<string, unknown> }> }) {
  if (result.tag?.id) await kv.set(`toll_tag:${result.tag.id}`, result.tag);
  for (const row of result.vehicles || []) {
    if (!row?.id || !row.payload) continue;
    const key = row.kind === "tag" ? `toll_tag:${row.id}` : `vehicle:${row.id}`;
    await kv.set(key, row.payload);
  }
}

app.get("/toll-tags/low-balance", requirePermission("toll.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const balances = await balanceMap(org);
    const orgDefault = await orgDefaultThreshold(org);
    const tags = [];
    for (let offset = 0; offset < PAGE * 50; offset += PAGE) {
      const page = await listTags(c, org, offset, { balances, orgDefault });
      tags.push(...page.tags);
      if (!page.nextCursor) break;
    }
    const items = [];
    for (const tag of tags) {
      const status = String(tag.status || "");
      if (status === "Inactive" || status === "Retired") continue;
      const threshold = Number(tag.resolvedLowBalanceThreshold) || DEFAULT_THRESHOLD;
      const balance = typeof tag.lastCalculatedBalance === "number" ? tag.lastCalculatedBalance : null;
      const ring = ringFor(balance, threshold);
      if (ring === "healthy" || ring === "watch") continue;
      const row = balances.get(String(tag.id));
      const usageAmount = Number(row?.usage_amount) || 0;
      const usageCount = Number(row?.usage_count) || 0;
      const spanDays = row?.span_days == null ? null : Number(row.span_days);
      items.push({
        id: tag.id,
        tagNumber: tag.tagNumber,
        provider: tag.provider,
        vehicleLabel: tag.assignedVehicleName || (tag.assignedVehicleId ? "Assigned" : "Unassigned"),
        assignedVehicleId: tag.assignedVehicleId || null,
        balance,
        balanceKnown: balance != null,
        threshold,
        ring,
        shortfall: balance == null ? null : Math.max(0, threshold - balance),
        daysToEmpty: daysLeft(balance, usageAmount, usageCount, spanDays),
        tripsRemaining: tripsLeft(balance, usageAmount, usageCount),
        balanceAsOf: tag.lastBalanceSyncedAt || null,
        stale: Boolean(tag.balanceStale),
        topupRequestedAt: tag.topupRequestedAt || null,
        updatedAt: tag.updatedAt || null,
      });
    }
    const rank = (ring: string) => (ring === "empty" ? 0 : ring === "low" ? 1 : 2);
    items.sort((a, b) => {
      const byRing = rank(a.ring) - rank(b.ring);
      if (byRing !== 0) return byRing;
      if (a.daysToEmpty != null && b.daysToEmpty != null && a.daysToEmpty !== b.daysToEmpty) return a.daysToEmpty - b.daysToEmpty;
      if (a.daysToEmpty == null && b.daysToEmpty != null) return 1;
      if (a.daysToEmpty != null && b.daysToEmpty == null) return -1;
      return (a.balance ?? Number.POSITIVE_INFINITY) - (b.balance ?? Number.POSITIVE_INFINITY);
    });
    return c.json({ items, refreshedAt: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-tags/:id", requirePermission("toll.view"), async (c) => {
  try {
    const id = c.req.param("id");
    const existing = await kv.get(`toll_tag:${id}`) as Record<string, unknown> | null;
    if (!existing || !belongsToOrgStrict(existing, c)) return c.json({ error: "Toll tag not found" }, 404);
    const org = getOrgId(c);
    const balances = await balanceMap(org, id);
    const orgDefault = await orgDefaultThreshold(org);
    return c.json(presentTag(existing, balances.get(id), orgDefault));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-tags", requirePermission("toll.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    return c.json(await listTags(c, org));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.post("/toll-tags", requirePermission("toll.manage"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    if (!org) return c.json({ error: "Organization required" }, 403);
    const body = await c.req.json().catch(() => null);
    const parsed = parseTollTagCreate(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const clientId = readOptionalClientId(body);
    const id = clientId ?? crypto.randomUUID();
    const existing = await kv.get(`toll_tag:${id}`) as Record<string, unknown> | null;
    if (existing) {
      if (!belongsToOrgStrict(existing, c)) return c.json({ error: "Toll tag not found" }, 404);
      return c.json({ error: "This tag already exists. Edit it instead.", reason: "exists" }, 409);
    }

    const dup = await queryFleet("toll_tags", {
      org,
      filters: [{ op: "eq", col: "tag_number", value: parsed.fields.tagNumber }],
      limit: 20,
    });
    const clash = (dup.data as Record<string, unknown>[]).find((row) =>
      String(row.status || "") !== "Retired" &&
      String(row.tagNumber || "").toLowerCase() === parsed.fields.tagNumber.toLowerCase()
    );
    if (clash) return c.json({ error: "A tag with this number is already in the fleet", reason: "duplicate_tag" }, 409);

    const now = new Date().toISOString();
    const record = stampOrg({
      id,
      ...parsed.fields,
      createdAt: now,
      updatedAt: now,
      dateAdded: parsed.fields.dateAdded || now,
    }, c);
    await kv.set(`toll_tag:${id}`, record);
    return c.json({ success: true, data: record });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique")) {
      return c.json({ error: "A tag with this number is already in the fleet", reason: "duplicate_tag" }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

app.patch("/toll-tags/:id", requirePermission("toll.manage"), async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const token = readConcurrencyToken(body);
    if (!token.ok) return c.json({ error: "Refresh this tag and try again", reason: "missing_concurrency_token" }, 409);
    const parsed = parseTollTagPatch(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const existing = await kv.get(`toll_tag:${id}`) as Record<string, unknown> | null;
    if (!existing || !belongsToOrgStrict(existing, c)) return c.json({ error: "Toll tag not found" }, 404);
    if (String(existing.status || "") === "Retired") return c.json({ error: "This tag is retired" }, 409);
    if (existing.updatedAt && String(existing.updatedAt) !== token.token) {
      return c.json({ error: "This tag was updated somewhere else. Refresh and try again.", reason: "stale_write", current: existing }, 409);
    }

    if (parsed.fields.tagNumber && String(parsed.fields.tagNumber).toLowerCase() !== String(existing.tagNumber || "").toLowerCase()) {
      const org = getOrgId(c);
      if (org) {
        const dup = await queryFleet("toll_tags", {
          org,
          filters: [{ op: "eq", col: "tag_number", value: parsed.fields.tagNumber }],
          limit: 20,
        });
        const clash = (dup.data as Record<string, unknown>[]).find((row) =>
          String(row.id) !== id &&
          String(row.status || "") !== "Retired" &&
          String(row.tagNumber || "").toLowerCase() === parsed.fields.tagNumber!.toLowerCase()
        );
        if (clash) return c.json({ error: "A tag with this number is already in the fleet", reason: "duplicate_tag" }, 409);
      }
    }

    const now = new Date().toISOString();
    const next = stampOrg({ ...existing, ...parsed.fields, id, updatedAt: now }, c);
    await kv.set(`toll_tag:${id}`, next);
    return c.json({ success: true, data: next });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.delete("/toll-tags/:id", requirePermission("toll.manage"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    if (!org) return c.json({ error: "Organization required" }, 403);
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const token = readConcurrencyToken(body);
    if (!token.ok) return c.json({ error: "Refresh this tag and try again", reason: "missing_concurrency_token" }, 409);
    const existing = await kv.get(`toll_tag:${id}`) as Record<string, unknown> | null;
    if (!existing || !belongsToOrgStrict(existing, c)) return c.json({ error: "Toll tag not found" }, 404);

    const reason = typeof (body as { reason?: unknown })?.reason === "string" ? (body as { reason: string }).reason.trim() : "";
    const { data, error } = await getServiceClient().rpc("fleet_retire_toll_tag", {
      p_org: org,
      p_tag_id: id,
      p_reason: reason || "Retired",
      p_expected: token.token,
    });
    const mapped = rpcError(error);
    if (mapped) return c.json({ error: mapped.error, reason: mapped.reason }, mapped.status);
    if (error) return c.json({ error: error.message }, 500);
    const result = data as { tag?: Record<string, unknown> };
    if (result?.tag) await kv.set(`toll_tag:${id}`, result.tag);
    const user = c.get("rbacUser") as RbacUser | undefined;
    await logAdminAction({
      actorId: user?.userId || "unknown",
      actorName: user?.email || user?.userId || "unknown",
      action: "toll_tag.retire",
      targetId: id,
      targetEmail: String(existing.tagNumber || id),
      details: reason || "Retired",
    });
    return c.json({ success: true, data: result?.tag || null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.post(
  "/toll-tags/assign",
  requirePermission("toll.manage"),
  requireCatalogMatched({
    label: "POST /toll-tags/assign",
    vehicleId: (_c, body) => {
      if (!body || typeof body !== "object") return null;
      const id = (body as { vehicleId?: unknown }).vehicleId;
      return typeof id === "string" && id.trim() ? id.trim() : null;
    },
  }),
  async (c) => {
    try {
      const org = orgOrForbid(c);
      if (org instanceof Response) return org;
      if (!org) return c.json({ error: "Organization required" }, 403);
      const body = (c.get("__cachedRequestBody") as Record<string, unknown> | null) ?? await c.req.json();
      const tagId = typeof body?.tagId === "string" ? body.tagId.trim() : "";
      const vehicleId = typeof body?.vehicleId === "string" ? body.vehicleId.trim() : "";
      if (!tagId || !vehicleId) return c.json({ error: "tagId and vehicleId are required" }, 400);

      const { data, error } = await getServiceClient().rpc("fleet_assign_toll_tag", {
        p_org: org,
        p_tag_id: tagId,
        p_vehicle_id: vehicleId,
      });
      const mapped = rpcError(error);
      if (mapped) return c.json({ error: mapped.error, reason: mapped.reason }, mapped.status);
      if (error) return c.json({ error: error.message }, 500);
      const result = (data || {}) as { tag?: Record<string, unknown>; vehicles?: Array<{ id?: string; kind?: string; payload?: Record<string, unknown> }> };
      await mirrorPayloads(result);
      void import("./toll_controller.tsx").then((m) => m.applyTagIdentityBackfill()).catch((err) => {
        console.log(`[TagBackfill] auto after assign failed: ${err?.message || err}`);
      });
      return c.json({ success: true, data: result.tag });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  },
);

app.post("/toll-tags/unassign", requirePermission("toll.manage"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    if (!org) return c.json({ error: "Organization required" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const tagId = typeof (body as { tagId?: unknown })?.tagId === "string" ? (body as { tagId: string }).tagId.trim() : "";
    if (!tagId) return c.json({ error: "tagId is required" }, 400);
    const { data, error } = await getServiceClient().rpc("fleet_unassign_toll_tag", {
      p_org: org,
      p_tag_id: tagId,
    });
    const mapped = rpcError(error);
    if (mapped) return c.json({ error: mapped.error, reason: mapped.reason }, mapped.status);
    if (error) return c.json({ error: error.message }, 500);
    const result = (data || {}) as { tag?: Record<string, unknown>; vehicles?: Array<{ id?: string; kind?: string; payload?: Record<string, unknown> }> };
    await mirrorPayloads(result);
    void import("./toll_controller.tsx").then((m) => m.applyTagIdentityBackfill()).catch((err) => {
      console.log(`[TagBackfill] auto after unassign failed: ${err?.message || err}`);
    });
    return c.json({ success: true, data: result.tag });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.post("/toll-tags/:id/topup-requested", requirePermission("toll.manage"), async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const token = readConcurrencyToken(body);
    if (!token.ok) return c.json({ error: "Refresh this tag and try again", reason: "missing_concurrency_token" }, 409);
    const existing = await kv.get(`toll_tag:${id}`) as Record<string, unknown> | null;
    if (!existing || !belongsToOrgStrict(existing, c)) return c.json({ error: "Toll tag not found" }, 404);
    if (existing.updatedAt && String(existing.updatedAt) !== token.token) {
      return c.json({ error: "This tag was updated somewhere else. Refresh and try again.", reason: "stale_write" }, 409);
    }
    const now = new Date().toISOString();
    const next = stampOrg({ ...existing, topupRequestedAt: now, updatedAt: now }, c);
    await kv.set(`toll_tag:${id}`, next);
    return c.json({ success: true, data: next });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-plazas", requirePermission("toll.view"), async (c) => {
  try {
    const org = orgOrForbid(c);
    if (org instanceof Response) return org;
    const filters = org
      ? [{ op: "or" as const, value: `organization_id.eq.${org},organization_id.is.null` }]
      : [{ op: "not" as const, col: "organization_id", operator: "is", value: null }];
    const res = await queryFleet("toll_plazas", {
      filters,
      order: { col: "updated_at", ascending: false },
      limit: 2000,
    });
    if (res.error) throw res.error;
    const scoped = (res.data as Record<string, unknown>[]).filter((plaza) => {
      if (!plaza.organizationId) return true;
      return belongsToOrgStrict(plaza, c) || platformUser(c);
    });
    const stats = await loadTollPlazaStats(org);
    return c.json(attachPlazaStats(scoped as never, stats));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-plazas/:id", requirePermission("toll.view"), async (c) => {
  try {
    const id = c.req.param("id");
    const plaza = await kv.get(`toll_plaza:${id}`) as Record<string, unknown> | null;
    if (!plaza) return c.json({ error: "Toll plaza not found" }, 404);
    if (plaza.organizationId && !belongsToOrgStrict(plaza, c)) return c.json({ error: "Toll plaza not found" }, 404);
    const stats = await loadTollPlazaStats(getOrgId(c));
    const [withStats] = attachPlazaStats([plaza as never], stats);
    return c.json(withStats);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.post("/toll-plazas", requirePermission("toll.manage"), async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Plaza details are required" }, 400);
    const incoming = { ...(body as Record<string, unknown>) };
    delete incoming.stats;
    delete incoming.organizationId;
    const now = new Date().toISOString();
    if (incoming.id) {
      const existing = await kv.get(`toll_plaza:${incoming.id}`) as Record<string, unknown> | null;
      if (!existing || (existing.organizationId && !belongsToOrgStrict(existing, c))) {
        return c.json({ error: "Toll plaza not found" }, 404);
      }
      const next = stampOrg({ ...existing, ...incoming, id: existing.id, createdAt: existing.createdAt || now, updatedAt: now }, c);
      await kv.set(`toll_plaza:${existing.id}`, next);
      const stats = await loadTollPlazaStats(getOrgId(c));
      const [saved] = attachPlazaStats([next as never], stats);
      return c.json({ success: true, data: saved });
    }
    const id = crypto.randomUUID();
    const next = stampOrg({ ...incoming, id, createdAt: now, updatedAt: now }, c);
    await kv.set(`toll_plaza:${id}`, next);
    const stats = await loadTollPlazaStats(getOrgId(c));
    const [saved] = attachPlazaStats([next as never], stats);
    return c.json({ success: true, data: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.delete("/toll-plazas/:id", requirePermission("toll.manage"), async (c) => {
  try {
    const id = c.req.param("id");
    const plaza = await kv.get(`toll_plaza:${id}`) as Record<string, unknown> | null;
    if (!plaza || (plaza.organizationId && !belongsToOrgStrict(plaza, c))) {
      return c.json({ error: "Toll plaza not found" }, 404);
    }
    const { data, error } = await getServiceClient()
      .from("fleet_toll_ledger")
      .select("id")
      .eq("plaza_id", id)
      .limit(1);
    if (error) return c.json({ error: error.message }, 500);
    if (Array.isArray(data) && data.length > 0) {
      return c.json({ error: "This plaza is still named on toll charges, so it stays on file" }, 409);
    }
    await kv.del(`toll_plaza:${id}`);
    return c.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-info", async (c) => {
  try {
    const { loadTollRateStore } = await import("./toll_rate_schedule.ts");
    const store = await loadTollRateStore();
    return c.json({ ...store.current, current: store.current, versions: store.versions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.post("/toll-info", requirePermission("toll.manage"), async (c) => {
  try {
    const { publishTollRates, saveTollRateStore, migrateToVersionedStore } = await import("./toll_rate_schedule.ts");
    const body = await c.req.json();
    const rbacUser = c.get("rbacUser") as { userId?: string; email?: string } | undefined;
    const publisher = rbacUser?.email || rbacUser?.userId || "unknown";
    if (body?.current && Array.isArray(body?.versions) && body?.__replaceStore === true) {
      const store = migrateToVersionedStore(body);
      await saveTollRateStore(store);
      return c.json({ success: true, store });
    }
    const { store, published } = await publishTollRates({
      effectiveDate: body.effectiveDate,
      effectiveFrom: body.effectiveFrom || body.effectiveDate,
      operator: body.operator,
      currency: body.currency,
      plazas: body.plazas || [],
      vehicleClasses: body.vehicleClasses || [],
      routeRateGroups: body.routeRateGroups || [],
      createdBy: publisher,
    });
    return c.json({ success: true, published, store, current: store.current, versions: store.versions });
  } catch (e) {
    const err = e as { name?: string; message?: string; reason?: string };
    if (err?.name === "TollRatePublishError") return c.json({ error: err.message, reason: err.reason }, 400);
    return c.json({ error: err?.message || "Failed to save toll rates" }, 500);
  }
});

app.post("/toll-info/impact-preview", requirePermission("toll.manage"), async (c) => {
  try {
    const { previewTollRateImpact, loadTollRateStore, toIsoDateKey } = await import("./toll_rate_schedule.ts");
    const body = await c.req.json();
    const store = await loadTollRateStore();
    const effectiveFrom = toIsoDateKey(body.effectiveFrom || body.effectiveDate);
    const impact = await previewTollRateImpact({
      ...store.current,
      id: "draft",
      effectiveFrom,
      effectiveDate: body.effectiveDate || store.current.effectiveDate,
      operator: body.operator ?? store.current.operator,
      currency: body.currency ?? store.current.currency,
      plazas: body.plazas || [],
      vehicleClasses: body.vehicleClasses || store.current.vehicleClasses,
      routeRateGroups: body.routeRateGroups || [],
    });
    return c.json({ success: true, impact, effectiveFrom });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-info/rate", async (c) => {
  try {
    const { lookupOfficialRate } = await import("./toll_rate_schedule.ts");
    const rate = await lookupOfficialRate({
      plazaId: c.req.query("plazaId") || undefined,
      plazaName: c.req.query("plazaName") || undefined,
      classId: c.req.query("classId") || c.req.query("tollClassId") || "class1",
      asOf: c.req.query("asOf") || undefined,
      paymentMethod: (c.req.query("paymentMethod") as "withTag" | "withoutTag") || "withTag",
      fromPlazaName: c.req.query("fromPlazaName") || undefined,
      toPlazaName: c.req.query("toPlazaName") || undefined,
    });
    return c.json({ success: true, rate });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

app.get("/toll-info/versions", async (c) => {
  try {
    const { loadTollRateStore } = await import("./toll_rate_schedule.ts");
    const store = await loadTollRateStore();
    return c.json({ success: true, current: store.current, versions: store.versions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: message }, 500);
  }
});

export default app;
