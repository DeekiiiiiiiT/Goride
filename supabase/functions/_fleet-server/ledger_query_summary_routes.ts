/**
 * Ledger query/summary read routes — peeled from index.tsx / behavior unchanged
 */
import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
// Static: CLI packager drops dynamic ./fleet_toll_statement_snapshot imports.
import { buildFleetTollSnapshotForRange } from "./fleet_toll_statement_snapshot.ts";
import {
  applyStatementTollEvent,
  emptyStatementTollBuckets,
  presentStatementToll,
  deriveStatementBankPlug,
  statementPayoutReconciliationGap,
  STATEMENT_TOLL_RECON_EPS,
} from "../../../packages/finance-core/src/statementTollNetting.ts";

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
      const sourceType = c.req.query("sourceType");
      const minAmountParam = c.req.query("minAmount");
      const maxAmountParam = c.req.query("maxAmount");
      const searchTerm = c.req.query("searchTerm");
      const limitParam = c.req.query("limit");
      const offsetParam = c.req.query("offset");
      const sortBy = c.req.query("sortBy") || "date";
      const sortDir = c.req.query("sortDir") || "desc";

      const limit = limitParam ? parseInt(limitParam) : 50;
      const offset = offsetParam ? parseInt(offsetParam) : 0;
      const minAmount = minAmountParam ? parseFloat(minAmountParam) : undefined;
      const maxAmount = maxAmountParam ? parseFloat(maxAmountParam) : undefined;

      const {
        listAllUnifiedCanonicalEvents,
        filterCanonicalEventsByPlatform,
      } = await import("../_shared/unifiedLedger/queries.ts");

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

      let mapped = await listAllUnifiedCanonicalEvents({
        products: ["roam_driver", "roam_fleet"],
        entryTypes: types,
        driverId: driverIds.length === 1 ? driverIds[0] : undefined,
        from: startDate ? `${startDate}T00:00:00.000Z` : undefined,
        to: endDate ? `${endDate}T23:59:59.999Z` : undefined,
        maxRows: 50_000,
      });

      if (driverIds.length > 1) {
        const want = new Set(driverIds.map((d) => d.toLowerCase()));
        mapped = mapped.filter((e) => want.has(String(e.driverId || "").toLowerCase()));
      }
      if (platform) mapped = filterCanonicalEventsByPlatform(mapped, platform);
      if (direction) mapped = mapped.filter((e) => String(e.direction || "") === direction);
      if (vehicleId) mapped = mapped.filter((e) => String(e.vehicleId || "") === vehicleId);
      if (batchId) mapped = mapped.filter((e) => String(e.batchId || "") === batchId);
      if (sourceType) mapped = mapped.filter((e) => String(e.sourceType || "") === sourceType);
      if (isReconciledParam !== undefined && isReconciledParam !== null && isReconciledParam !== "") {
        const want = isReconciledParam === "true" || isReconciledParam === "1";
        mapped = mapped.filter((e) => Boolean(e.isReconciled) === want);
      }
      if (searchTerm) {
        const q = String(searchTerm).toLowerCase();
        mapped = mapped.filter((e) => String(e.description || "").toLowerCase().includes(q));
      }

      mapped = filterByOrg(mapped, c);
      mapped.forEach((e: any) => {
        if (e.platform === "GoRide") e.platform = "Roam";
        if (typeof e.description === "string") e.description = e.description.replace(/GoRide/g, "Roam");
      });

      if (minAmount !== undefined) {
        mapped = mapped.filter((e) => Math.abs(Number(e.netAmount) || 0) >= minAmount!);
      }
      if (maxAmount !== undefined) {
        mapped = mapped.filter((e) => Math.abs(Number(e.netAmount) || 0) <= maxAmount!);
      }

      const asc = sortDir === "asc";
      mapped.sort((a, b) => {
        let av: any = "";
        let bv: any = "";
        if (sortBy === "amount") {
          av = Math.abs(Number(a.netAmount) || 0);
          bv = Math.abs(Number(b.netAmount) || 0);
        } else if (sortBy === "createdAt") {
          av = String(a.createdAt || "");
          bv = String(b.createdAt || "");
        } else {
          av = String(a.date || "");
          bv = String(b.date || "");
        }
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });

      const total = mapped.length;
      const pageRows = mapped.slice(offset, offset + limit);
      return c.json({
        data: pageRows,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + limit < total,
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
      let ledgerQ = ul.from("ledger_entries").select("*", { count: "exact", head: true });
      if (orgId) ledgerQ = ledgerQ.eq("organization_id", orgId);

      let tripQ = fromKvStore()
        .select("*", { count: "exact", head: true })
        .like("key", "trip:%");
      let txQ = fromKvStore()
        .select("*", { count: "exact", head: true })
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

  // ─── GET /ledger/summary// ─── GET /ledger/summary — Aggregate totals for a filter set (`ledger_event:*` only) ──
  app.get(`${PREFIX}/ledger/summary`, requireAuth(), async (c) => {
    try {
      const driverId = c.req.query("driverId");
      const driverIdsParam = c.req.query("driverIds");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const eventType = c.req.query("eventType");
      const direction = c.req.query("direction");
      const platform = c.req.query("platform");

      const {
        listAllUnifiedCanonicalEvents,
        filterCanonicalEventsByPlatform,
      } = await import("../_shared/unifiedLedger/queries.ts");

      const driverIds = driverIdsParam
        ? String(driverIdsParam).split(",").map((x) => x.trim()).filter(Boolean)
        : driverId
          ? [driverId]
          : [];

      let entries = await listAllUnifiedCanonicalEvents({
        products: ["roam_driver", "roam_fleet"],
        entryTypes: eventType ? [eventType] : undefined,
        driverId: driverIds.length === 1 ? driverIds[0] : undefined,
        from: startDate ? `${startDate}T00:00:00.000Z` : undefined,
        to: endDate ? `${endDate}T23:59:59.999Z` : undefined,
        maxRows: 50_000,
      });

      if (driverIds.length > 1) {
        const want = new Set(driverIds.map((d) => d.toLowerCase()));
        entries = entries.filter((e) => want.has(String(e.driverId || "").toLowerCase()));
      }
      if (platform) entries = filterCanonicalEventsByPlatform(entries, platform);
      if (direction) entries = entries.filter((e) => String(e.direction || "") === direction);
      entries = filterByOrg(entries, c);

      let totalInflow = 0;
      let totalOutflow = 0;
      let reconciledCount = 0;
      let unreconciledCount = 0;
      const byEventType: Record<string, { count: number; total: number }> = {};
      const byPlatform: Record<string, { count: number; total: number }> = {};

      for (const e of entries) {
        const net = Number(e.netAmount) || 0;
        if (e.direction === "inflow" || net > 0) {
          totalInflow += Math.abs(net);
        } else {
          totalOutflow += Math.abs(net);
        }

        if (e.isReconciled === true || e.isReconciled === "true") {
          reconciledCount++;
        } else {
          unreconciledCount++;
        }

        const et = String(e.eventType || "other");
        if (!byEventType[et]) byEventType[et] = { count: 0, total: 0 };
        byEventType[et].count++;
        byEventType[et].total += net;

        const pl = (e.platform === "GoRide" ? "Roam" : e.platform) || "Unknown";
        if (!byPlatform[String(pl)]) byPlatform[String(pl)] = { count: 0, total: 0 };
        byPlatform[String(pl)].count++;
        byPlatform[String(pl)].total += net;
      }

      return c.json({
        success: true,
        summary: {
          totalInflow: Number(totalInflow.toFixed(2)),
          totalOutflow: Number(totalOutflow.toFixed(2)),
          netBalance: Number((totalInflow - totalOutflow).toFixed(2)),
          totalEntries: entries.length,
          entryCount: entries.length,
          reconciledCount,
          unreconciledCount,
          byEventType,
          byPlatform,
        },
        meta: { source: "ledger.entries" as const },
      });
    } catch (e: any) {
      console.log(`[Ledger Summary] Error: ${e.message}`);
      return c.json({ error: `Ledger summary failed: ${e.message}` }, 500);
    }
  });

  // ─── GET /ledger/statement-summary — Universal Statement Summary per platform ──
  // All platforms (Uber, Roam, InDrive): fare_earning, tip, promotion, toll_* from ledger.entries.
  // Uber also uses payout_cash/payout_bank for actual cash/bank totals from org import.
  app.get(`${PREFIX}/ledger/statement-summary`, requireAuth(), async (c) => {
    try {
      const platform = c.req.query("platform"); // Uber, Roam, InDrive, or 'all'
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const driverIdParam = c.req.query("driverId");

      if (!startDate || !endDate) {
        return c.json({ error: "startDate and endDate are required" }, 400);
      }

      const platforms =
        platform === "all" || !platform
          ? (["Uber", "Roam", "InDrive"] as const)
          : ([platform] as ("Uber" | "Roam" | "InDrive")[]);

      const summaries = await buildOrgStatementSummaries(c, {
        startDate,
        endDate,
        platforms: [...platforms],
        driverId: driverIdParam,
      });

      const fleetTollSnapshot = await buildFleetTollSnapshotForRange(c, {
        startDate,
        endDate,
        driverId: driverIdParam && String(driverIdParam).trim()
          ? String(driverIdParam).trim()
          : undefined,
      });

      return c.json({
        success: true,
        summaries,
        fleetTollSnapshot,
        periodStart: startDate,
        periodEnd: endDate,
        meta: { source: "ledger.entries" as const },
      });
    } catch (e: any) {
      console.error("[Statement Summary] Error: " + (e.message || e));
      return c.json({ error: "Statement summary failed: " + (e.message || e) }, 500);
    }
  });
}

/** Shared statement builder — Earnings + Wallet Balance SSOT. */
export async function buildOrgStatementSummaries(
  c: { get?: (k: string) => unknown },
  opts: {
    startDate: string;
    endDate: string;
    platforms?: string[];
    driverId?: string | null;
  },
): Promise<any[]> {
  const startDate = opts.startDate;
  const endDate = opts.endDate;
  const driverIdParam = opts.driverId;

  const driverIdVariants =
    driverIdParam && String(driverIdParam).trim()
      ? await expandStatementSummaryDriverIds(driverIdParam)
      : [];

  const platforms =
    opts.platforms && opts.platforms.length > 0
      ? opts.platforms
      : ["Uber", "Roam", "InDrive"];

  const {
    listAllUnifiedCanonicalEvents,
    filterCanonicalEventsByPlatform,
    dedupeOrgBankCanonicalEvents,
  } = await import("../_shared/unifiedLedger/queries.ts");

  const statementTypes = [
    "fare_earning",
    "tip",
    "promotion",
    "toll_charge",
    "toll_reimbursement",
    "toll_refund",
    "toll_support_adjustment",
    "toll_charge_offset",
    "prior_period_adjustment",
    "payout_cash",
    "payout_bank",
    "statement_line",
  ];
  const all = dedupeOrgBankCanonicalEvents(
    await listAllUnifiedCanonicalEvents({
      products: ["roam_driver", "roam_fleet"],
      entryTypes: statementTypes,
      maxRows: 100_000,
    }),
  );
  const scoped = filterByOrg(all, c as any).filter((e) => {
    if (driverIdVariants.length === 0) return true;
    const did = String(e.driverId || "");
    return driverIdVariants.some((v) => v === did || v.toLowerCase() === did.toLowerCase());
  });

  const summaries: any[] = [];
  for (const plat of platforms) {
    const raw = filterCanonicalEventsByPlatform(scoped, plat);
    const uberImportTypes = new Set(["promotion", "payout_cash", "payout_bank", "statement_line"]);
    const entries = raw.filter((e: any) => {
      const t = String(e.eventType || "");
      const d = String(e.date || "").slice(0, 10);
      const ps = String(e.periodStart || "").slice(0, 10);
      const pe = String(e.periodEnd || "").slice(0, 10);
      const inDate = !!(d && d >= startDate && d <= endDate);
      if (plat === "Uber" && uberImportTypes.has(t)) {
        const periodOverlap = !!(ps && pe && ps <= endDate && pe >= startDate);
        return inDate || periodOverlap;
      }
      return inDate;
    });

    let netFare = 0,
      promotions = 0,
      tips = 0;
    let tollBuckets = emptyStatementTollBuckets();
    let periodAdjustments = 0;
    let cashCollected = 0,
      bankTransfer = 0;
    let tripCount = 0;
    let hasPayoutEvents = false;

    for (const e of entries) {
      if (String(e.eventType || "") !== "toll_reimbursement") continue;
      const next = applyStatementTollEvent(tollBuckets, e, plat);
      if (next) tollBuckets = next;
    }

    for (const e of entries) {
      const net = Number(e.netAmount) || 0;
      const mag = Math.abs(net);
      const et = String(e.eventType || "");
      if (et === "toll_reimbursement") continue;

      const tollNext = applyStatementTollEvent(tollBuckets, e, plat);
      if (tollNext) {
        tollBuckets = tollNext;
        continue;
      }

      switch (et) {
        case "fare_earning":
          netFare += net;
          tripCount++;
          if (e.paymentMethod === "Cash") {
            const cashAmt =
              e.metadata?.cashCollected != null ? Number(e.metadata.cashCollected) : mag;
            cashCollected += cashAmt;
          }
          break;
        case "tip":
          tips += net;
          break;
        case "promotion":
          promotions += net;
          break;
        case "prior_period_adjustment":
          periodAdjustments += net;
          break;
        case "payout_cash":
          cashCollected = mag;
          hasPayoutEvents = true;
          break;
        case "payout_bank":
          bankTransfer = mag;
          hasPayoutEvents = true;
          break;
      }
    }

    const tollPres = presentStatementToll(tollBuckets, plat);
    const computedNetFare = plat === "Uber" ? netFare - promotions : netFare;
    const totalEarnings = computedNetFare + promotions + tips;
    if (!hasPayoutEvents) {
      bankTransfer = deriveStatementBankPlug(
        totalEarnings,
        tollPres.statementTollExpense,
        cashCollected,
      );
    }

    const totalPayout = cashCollected + bankTransfer;
    const payoutGap = statementPayoutReconciliationGap({
      totalEarnings,
      statementTollExpense: tollPres.statementTollExpense,
      periodAdjustments,
      totalPayout,
    });

    summaries.push({
      platform: plat,
      periodStart: startDate,
      periodEnd: endDate,
      sourceType: "computed",
      netFare: Number(computedNetFare.toFixed(2)),
      promotions: Number(promotions.toFixed(2)),
      tips: Number(tips.toFixed(2)),
      totalEarnings: Number(totalEarnings.toFixed(2)),
      tollStory: tollPres.tollStory,
      uberTollCredits: tollPres.uberTollCredits,
      platformTollCredits: tollPres.platformTollCredits,
      statementTollExpense: tollPres.statementTollExpense,
      tolls: tollPres.statementTollExpense,
      tollCharges: tollPres.tollCharges,
      tollRefunds: tollPres.tollRefunds,
      tollReimbursements: tollPres.tollReimbursements,
      tollAdjustments: tollPres.tollAdjustments,
      totalRefundsExpenses: tollPres.statementTollExpense,
      periodAdjustments: Number(periodAdjustments.toFixed(2)),
      cashCollected: Number(cashCollected.toFixed(2)),
      bankTransfer: Number(bankTransfer.toFixed(2)),
      totalPayout: Number(totalPayout.toFixed(2)),
      payoutObserved: hasPayoutEvents,
      payoutReconciliationGap:
        Math.abs(payoutGap) >= STATEMENT_TOLL_RECON_EPS ? payoutGap : 0,
      tripCount,
    });
  }

  return summaries;
}
