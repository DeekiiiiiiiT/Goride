/**
 * Ledger query/summary read routes — peeled from index.tsx / behavior unchanged
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { buildStatementCards } from "./statement_summary_build.ts";

const PREFIX = "/make-server-37f42386";

/**
 * Roam UUID + linked Uber/InDrive IDs + lowercase variants — matches ledger `driverId` storage (see driver-overview).
 */
export async function expandStatementSummaryDriverIds(raw: string | undefined | null): Promise<string[]> {
  const trimmed = raw != null && String(raw).trim() ? String(raw).trim() : "";
  if (!trimmed) return [];
  const ids: string[] = [trimmed];
  try {
    const driverRecord = await kv.get(`driver:${trimmed}`);
    if (driverRecord && typeof driverRecord === "object") {
      const dr = driverRecord as Record<string, unknown>;
      if (dr.uberDriverId) ids.push(String(dr.uberDriverId).trim());
      if (dr.inDriveDriverId) ids.push(String(dr.inDriveDriverId).trim());
    }
  } catch {
    /* ignore KV errors */
  }
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    out.push(id);
    const lc = id.toLowerCase();
    if (lc !== id) out.push(lc);
  }
  return [...new Set(out)];
}

function applyStatementSummaryDriverFilter<
  T extends { eq(column: string, value: string): T; or(filter: string): T },
>(q: T, variants: string[]): T {
  if (variants.length === 0) return q;
  if (variants.length === 1) return q.eq("value->>driverId", variants[0]);
  return q.or(variants.map((id) => `value->>driverId.eq.${id}`).join(","));
}

export function registerLedgerQuerySummaryRoutes(app: Hono) {
  // ─── GET /ledger — Query with filters + pagination (`ledger_event:*` only) ──
  // Phase 2: Use requireOrg to ensure organization context for data isolation
  app.get(`${PREFIX}/ledger`, requireAuth({ requireOrg: true }), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required", code: "ORG_REQUIRED" }, 403);

      const driverId = c.req.query("driverId");
      const driverIdsParam = c.req.query("driverIds");
      const vehicleId = c.req.query("vehicleId");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const eventType = c.req.query("eventType");
      const eventTypesParam = c.req.query("eventTypes");
      const direction = c.req.query("direction");
      const platform = c.req.query("platform");
      const isReconciledParam = c.req.query("isReconciled");
      const batchId = c.req.query("batchId");
      const searchTerm = c.req.query("searchTerm");
      const limitParam = c.req.query("limit");
      const afterEffectiveAt = c.req.query("afterEffectiveAt") || undefined;
      const afterId = c.req.query("afterId") || undefined;
      const minAmountParam = c.req.query("minAmount");
      const maxAmountParam = c.req.query("maxAmount");

      const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) : 50, 1), 200);
      const minAmount = minAmountParam ? parseFloat(minAmountParam) : undefined;
      const maxAmount = maxAmountParam ? parseFloat(maxAmountParam) : undefined;

      const { ledgerPage, mapPageRowToCanonical } = await import("../_shared/unifiedLedger/readApi.ts");
      const { thisWeekRange } = await import("../_shared/unifiedLedger/dateRange.ts");
      const defaults = thisWeekRange();
      const from = startDate || defaults.from;
      const to = endDate || defaults.to;

      const types = eventTypesParam
        ? String(eventTypesParam).split(",").map((x) => x.trim()).filter(Boolean)
        : eventType
          ? [eventType]
          : undefined;

      const driverIds = driverIdsParam
        ? String(driverIdsParam).split(",").map((x) => x.trim()).filter(Boolean)
        : driverId
          ? [driverId]
          : [];

      const page = await ledgerPage({
        organizationId: orgId,
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
        entryTypes: types,
        products: ["roam_driver", "roam_fleet"],
        platform: platform || undefined,
        direction: direction || undefined,
        driverIds: driverIds.length ? driverIds : undefined,
        batchId: batchId || undefined,
        vehicleId: vehicleId || undefined,
        reconciled:
          isReconciledParam !== undefined && isReconciledParam !== null && isReconciledParam !== ""
            ? isReconciledParam === "true" || isReconciledParam === "1"
            : undefined,
        search: searchTerm || undefined,
        amountMinMinor: minAmount !== undefined && Number.isFinite(minAmount) ? Math.round(minAmount * 100) : undefined,
        amountMaxMinor: maxAmount !== undefined && Number.isFinite(maxAmount) ? Math.round(maxAmount * 100) : undefined,
        afterEffectiveAt,
        afterId,
        limit,
      });

      let mapped = page.rows.map(mapPageRowToCanonical);
      mapped = filterByOrg(mapped, c);
      mapped.forEach((e: any) => {
        if (e.platform === "GoRide") e.platform = "Roam";
        if (typeof e.description === "string") e.description = e.description.replace(/GoRide/g, "Roam");
      });

      return c.json({
        data: mapped,
        limit,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        meta: { source: "ledger.entries" as const },
      });
    } catch (e: any) {
      console.log(`[Ledger GET] Error: ${e.message}`);
      return c.json({ error: `Ledger query failed: ${e.message}` }, 500);
    }
  });


  app.get(`${PREFIX}/ledger/count`, requireAuth({ requireOrg: true }), async (c) => {
    try {
      const orgId = getOrgId(c);
      const { unifiedLedgerClient } = await import("../_shared/unifiedLedger/postEntry.ts");
      const ul = unifiedLedgerClient();
      let ledgerQ = ul.from("ledger_entries").select("id", { count: "exact", head: true });
      if (orgId) ledgerQ = ledgerQ.eq("organization_id", orgId);

      let tripQ = fromKvStore()
        .select("*", { count: "estimated", head: true })
        .like("key", "trip:%");
      let txQ = fromKvStore()
        .select("*", { count: "estimated", head: true })
        .like("key", "transaction:%");
      if (orgId) {
        tripQ = tripQ.eq("value->>organizationId", orgId);
        txQ = txQ.eq("value->>organizationId", orgId);
      }
      const [{ count: ledgerCount }, { count: tripCount }, { count: txCount }] =
        await Promise.all([ledgerQ, tripQ, txQ]);

      return c.json({
        ledgerEntries: ledgerCount || 0,
        trips: tripCount || 0,
        transactions: txCount || 0,
      });
    } catch (e: any) {
      console.log(`[Ledger Count] Error: ${e.message}`);
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /ledger/summary — Aggregate totals via range_summary (exact window) ──
  app.get(`${PREFIX}/ledger/summary`, requireAuth(), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required", code: "ORG_REQUIRED" }, 403);

      const driverId = c.req.query("driverId");
      const driverIdsParam = c.req.query("driverIds");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const eventType = c.req.query("eventType");
      const direction = c.req.query("direction");
      const platform = c.req.query("platform");

      const { rangeSummary } = await import("../_shared/unifiedLedger/readApi.ts");
      const { thisWeekRange } = await import("../_shared/unifiedLedger/dateRange.ts");
      const defaults = thisWeekRange();
      const fromYmd = String(startDate || defaults.from).slice(0, 10);
      const toYmd = String(endDate || defaults.to).slice(0, 10);

      const driverIds = driverIdsParam
        ? String(driverIdsParam).split(",").map((x) => x.trim()).filter(Boolean)
        : driverId
          ? [driverId]
          : [];

      const rows = await rangeSummary({
        organizationId: orgId,
        from: `${fromYmd}T00:00:00.000Z`,
        to: `${toYmd}T23:59:59.999Z`,
        entryTypes: eventType ? [eventType] : undefined,
        driverIds: driverIds.length ? driverIds : undefined,
        platform: platform || undefined,
        direction: direction || undefined,
        products: ["roam_driver", "roam_fleet"],
      });
      filterByOrg(
        rows.map((r) => ({ organizationId: r.organization_id })),
        c,
      );

      let totalInflow = 0;
      let totalOutflow = 0;
      let totalEntries = 0;
      const byEventType: Record<string, { count: number; total: number }> = {};
      const byPlatform: Record<string, { count: number; total: number }> = {};

      for (const r of rows) {
        const net = Number(r.sum_minor) / 100;
        const count = Number(r.entry_count) || 0;
        totalEntries += count;

        const dir = String(r.direction || "");
        if (dir === "inflow" || net > 0) totalInflow += Math.abs(net);
        else totalOutflow += Math.abs(net);

        const et = String(r.entry_type || "other");
        if (!byEventType[et]) byEventType[et] = { count: 0, total: 0 };
        byEventType[et].count += count;
        byEventType[et].total += net;

        const plRaw = String(r.platform || "Unknown");
        const pl = plRaw === "GoRide" ? "Roam" : plRaw;
        if (!byPlatform[pl]) byPlatform[pl] = { count: 0, total: 0 };
        byPlatform[pl].count += count;
        byPlatform[pl].total += net;
      }

      return c.json({
        success: true,
        summary: {
          totalInflow: Number(totalInflow.toFixed(2)),
          totalOutflow: Number(totalOutflow.toFixed(2)),
          netBalance: Number((totalInflow - totalOutflow).toFixed(2)),
          totalEntries,
          entryCount: totalEntries,
          reconciledCount: 0,
          unreconciledCount: 0,
          byEventType,
          byPlatform,
        },
        meta: { source: "ledger.range_summary" as const },
      });
    } catch (e: any) {
      console.log(`[Ledger Summary] Error: ${e.message}`);
      return c.json({ error: `Ledger summary failed: ${e.message}` }, 500);
    }
  });

  // ─── GET /ledger/statement-summary — Universal Statement Summary per platform ──
  // All platforms (Uber, Roam, InDrive): fare_earning, tip, promotion, toll_* from ledger.entries.
  // Uber also uses payout_cash/payout_bank for actual cash/bank totals from org import.
  app.get(`${PREFIX}/ledger/statement-summary`, requireAuth({ requireOrg: true }), async (c) => {
    try {
      const platform = c.req.query("platform"); // Uber, Roam, InDrive, or 'all'
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const driverIdParam = c.req.query("driverId");
      const organizationId = getOrgId(c) || String(c.req.query("organizationId") || "").trim();

      if (!startDate || !endDate) {
        return c.json({ error: "startDate and endDate are required" }, 400);
      }
      if (!organizationId) {
        return c.json({ error: "Organization is required", code: "ORG_REQUIRED" }, 403);
      }

      const platforms =
        platform === "all" || !platform
          ? (["Uber", "Roam", "InDrive"] as const)
          : ([platform] as ("Uber" | "Roam" | "InDrive")[]);

      const built = await buildOrgStatementSummaries(c, {
        startDate,
        endDate,
        platforms: [...platforms],
        driverId: driverIdParam,
        organizationId,
      });

      return c.json({
        success: true,
        summaries: built.summaries,
        drivers: built.drivers,
        periodStart: startDate,
        periodEnd: endDate,
        meta: { source: built.rollupSource, weekClosed: built.weekClosed },
      });
    } catch (e: any) {
      console.error("[Statement Summary] Error: " + (e.message || e));
      return c.json({ error: "Statement summary failed: " + (e.message || e) }, 500);
    }
  });
}

/** Shared statement builder — Ledgers and Earnings read the same cards. */
export async function buildOrgStatementSummaries(
  c: { get?: (k: string) => unknown },
  opts: {
    startDate: string;
    endDate: string;
    platforms?: string[];
    driverId?: string | null;
    organizationId?: string | null;
  },
) {
  const driverIdParam = opts.driverId;
  const driverIdVariants =
    driverIdParam && String(driverIdParam).trim()
      ? await expandStatementSummaryDriverIds(driverIdParam)
      : [];
  return buildStatementCards(c, {
    startDate: opts.startDate,
    endDate: opts.endDate,
    platforms: opts.platforms,
    driverId: driverIdParam,
    driverIdVariants,
    organizationId: opts.organizationId,
  });
}
