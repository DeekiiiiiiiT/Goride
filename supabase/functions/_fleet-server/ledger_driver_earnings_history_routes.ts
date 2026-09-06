/**
 * GET /ledger/driver-earnings-history — extracted from index.tsx (Flawless R5 Phase 5).
 * Behavior unchanged.
 */
import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import {
  clampHistoryRange,
  emptyEarningsHistoryEnvelope,
  parseHistoryRangeParams,
} from "./earnings_history_limits.ts";
import { listDriverFinancialPeriods } from "./driver_financial_periods.ts";
import { fetchAllLedgerEventValuesForDrivers } from "./ledger_driver_events.ts";
import { aggregateCanonicalEventsToLedgerDriverOverview } from "./ledger_money_aggregate.ts";
import {
  resolveActiveEarningsBundleForDriverWeek,
  getQuotaTargetForPeriod,
  getTierForEarningsEH,
  mondayYmdFromYmd,
} from "./earnings_policy_runtime.ts";
import { isUnifiedTollSettlementEnabled } from "./driver_toll_charge.ts";
import {
  emptyTollDisposition,
  addToTollDisposition,
  roundTollDisposition,
} from "./driver_toll_disposition.ts";

const PREFIX = "/make-server-37f42386";

/** Roam UUID + linked Uber/InDrive IDs + lowercase variants. */
async function expandEarningsHistoryDriverIds(raw: string | undefined | null): Promise<string[]> {
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

export function registerLedgerDriverEarningsHistoryRoutes(app: Hono) {
  // ─── GET /ledger/driver-earnings-history — Phase 4: Server-Side Earnings History ──────
  // Computes the same weekly/daily/monthly earnings table as DriverEarningsHistory,
  // but from ledger entries instead of raw trips.
  // Query params: driverId (required), periodType (daily|weekly|monthly, default: weekly),
  //               startDate / endDate (default last 7 days when omitted),
  //               mode=periods|ledger, limit, cursor
  // Enterprise: date-scoped fetch + hard caps + hasMore envelope (no full lifetime).
  app.get(`${PREFIX}/ledger/driver-earnings-history`, requireAuth(), async (c) => {
    try {
      const startMs = Date.now();
      const driverId = c.req.query("driverId");
      const periodType = (c.req.query("periodType") || "weekly") as "daily" | "weekly" | "monthly";
      const startDateParam = c.req.query("startDate") || null;
      const endDateParam = c.req.query("endDate") || null;
      const mode = (c.req.query("mode") || "ledger") as "periods" | "ledger";
      const limitRaw = Number(c.req.query("limit") || 500);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(1, Math.floor(limitRaw)), 500)
        : 500;
      const cursor = c.req.query("cursor") || null;

      if (!driverId) {
        return c.json({ error: "Missing required param: driverId" }, 400);
      }

      // Phase 1: default last 7 days when range omitted (no full-lifetime auto-load)
      const range = parseHistoryRangeParams({
        startDate: startDateParam,
        endDate: endDateParam,
        defaultWhenMissing: true,
      });
      if (!range.scopedByRange || !range.startDate || !range.endDate) {
        return c.json({ ...emptyEarningsHistoryEnvelope(Date.now() - startMs) });
      }
      const clamped = clampHistoryRange(range.startDate, range.endDate, periodType);
      const startDate = clamped.startDate;
      const endDate = clamped.endDate;

      console.log(
        `[Ledger EarningsHistory] driverId=${driverId} periodType=${periodType} mode=${mode} range=${startDate}..${endDate} limit=${limit} cursor=${cursor || "none"}`,
      );

      // Phase 2: weekly periods SSOT when requested (fallback to ledger if empty)
      if (mode === "periods") {
        let rows = await listDriverFinancialPeriods(driverId);
        // Filter by range first (ascending by period_anchor)
        rows = rows.filter((r: any) => {
          const a = String(r.periodAnchor || "").slice(0, 10);
          return a >= startDate && a <= endDate;
        });
        rows = rows.sort((a: any, b: any) => String(a.periodAnchor).localeCompare(String(b.periodAnchor)));
        // Prefer periods for weekly history. If incomplete, fall through to ledger (below).
        // rows are ascending by period_anchor; UI expects newest-first.
        if (rows.length > 0) {
          // Newest first: reverse ascending list
          const newestFirst = rows.slice().reverse();
          // Continue older when cursor is provided (period_anchor of last returned)
          const pageSource = cursor
            ? newestFirst.filter((r: any) => String(r.periodAnchor || "") < String(cursor))
            : newestFirst;
          if (pageSource.length > limit) {
            const page = pageSource.slice(0, limit);
            const oldestInPage = page[page.length - 1];
            return c.json({
              success: true,
              data: page.map(mapPeriodRowToEarningsHistory),
              durationMs: Date.now() - startMs,
              readModel: "driver_financial_periods",
              hasMore: true,
              nextCursor: oldestInPage?.periodAnchor || null,
              truncated: false,
            });
          }
          return c.json({
            success: true,
            data: pageSource.map(mapPeriodRowToEarningsHistory),
            durationMs: Date.now() - startMs,
            readModel: "driver_financial_periods",
            hasMore: false,
            nextCursor: null,
            truncated: false,
          });
        }
        // Incomplete periods: fall through to date-scoped ledger path
      }

      // Mode ledger: date-scoped fetch only
      const driverIdsResolved = await expandEarningsHistoryDriverIds(driverId);
      const fromIso = `${startDate}T00:00:00.000Z`;
      const toIso = `${endDate}T23:59:59.999Z`;
      const allEntries = await fetchAllLedgerEventValuesForDrivers(driverIdsResolved, c, {
        from: fromIso,
        to: toIso,
        maxRows: 20_000,
      });
      console.log(`[Ledger EarningsHistory] Canonical ledger_event rows for driver(s): ${allEntries.length}`);

      // Buckets use the already-clamped startDate/endDate (Phase 1 range guardrails)
      const nowMs = Date.now();
      let minDateMs = new Date(startDate + "T00:00:00").getTime();
      let maxDateMs = new Date(endDate + "T23:59:59").getTime();
      if (minDateMs > maxDateMs) {
        const x = minDateMs;
        minDateMs = maxDateMs;
        maxDateMs = x;
      }
      maxDateMs = Math.min(maxDateMs, nowMs);
      if (minDateMs > maxDateMs) {
        return c.json({ ...emptyEarningsHistoryEnvelope(Date.now() - startMs) });
      }

      // ── Step 3: Generate period buckets ──
      const msPerDay = 86400000;

      function toDateStrEH(d: Date): string {
        return d.toISOString().split("T")[0];
      }
      function startOfDayMsEH(ms: number): number {
        const d = new Date(ms);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      }
      function endOfDayMsEH(ms: number): number {
        return startOfDayMsEH(ms) + msPerDay - 1;
      }
      function startOfMonthMsEH(ms: number): number {
        const d = new Date(ms);
        return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      }
      function endOfMonthMsEH(ms: number): number {
        const d = new Date(ms);
        return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      }
      function startOfWeekMsEH(ms: number): number {
        const d = new Date(ms);
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).getTime();
      }
      function endOfWeekMsEH(ms: number): number {
        return startOfWeekMsEH(ms) + 7 * msPerDay - 1;
      }

      interface BucketEH { startMs: number; endMs: number; startDate: string; endDate: string; }
      const buckets: BucketEH[] = [];

      if (periodType === "daily") {
        let cursor = startOfDayMsEH(minDateMs);
        const cap = endOfDayMsEH(maxDateMs);
        while (cursor <= cap) {
          const s = cursor;
          const e = endOfDayMsEH(cursor);
          buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(s)) });
          cursor += msPerDay;
        }
      } else if (periodType === "monthly") {
        let cursor = startOfMonthMsEH(minDateMs);
        const cap = endOfMonthMsEH(maxDateMs);
        while (cursor <= cap) {
          const s = cursor;
          const e = endOfMonthMsEH(cursor);
          buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(e)) });
          const d = new Date(cursor);
          cursor = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
        }
      } else {
        let cursor = startOfWeekMsEH(minDateMs);
        const cap = endOfWeekMsEH(maxDateMs);
        while (cursor <= cap) {
          const s = cursor;
          const e = endOfWeekMsEH(cursor);
          buckets.push({ startMs: s, endMs: e, startDate: toDateStrEH(new Date(s)), endDate: toDateStrEH(new Date(e)) });
          cursor += 7 * msPerDay;
        }
      }

      // ── Step 4: Load earnings policies + legacy prefs (dual-read) ──
      const prefsEH: any = (await kv.get("preferences:general")) || {};
      const policyItemsRaw = (await kv.getByPrefix("earnings_policy:")) || [];
      const earningsPoliciesEH = (Array.isArray(policyItemsRaw) ? policyItemsRaw : [])
        .filter((p: any) => p && typeof p === "object" && p.id);

      const defaultTiersEH = [
        { id: "tier_1", name: "Bronze", minEarnings: 0, maxEarnings: 75000, sharePercentage: 25, color: "#CD7F32" },
        { id: "tier_2", name: "Silver", minEarnings: 75000, maxEarnings: 150000, sharePercentage: 27, color: "#C0C0C0" },
        { id: "tier_3", name: "Gold", minEarnings: 150000, maxEarnings: null, sharePercentage: 30, color: "#FFD700" },
      ];
      const legacyEH = {
        tiers: (prefsEH.tiers && prefsEH.tiers.length > 0) ? prefsEH.tiers : defaultTiersEH,
        quotas: prefsEH.quotas || null,
        personalAllowance: prefsEH.personalAllowance || null,
      };

      // ── Step 5: Pre-index entries by date for fast bucket assignment ──
      const parsedEntries = allEntries.map((e: any) => ({
        ...e,
        _dateMs: e.date ? new Date(e.date + "T00:00:00").getTime() : NaN,
      })).filter((e: any) => !isNaN(e._dateMs));

      const fareEntriesEH = parsedEntries
        .filter((e: any) => e.eventType === "fare_earning")
        .sort((a: any, b: any) => a._dateMs - b._dateMs);

      // ── Unified toll settlement (flag-gated): load this driver's toll_ledger
      //    entries and bucket them by period into a reconciliation-aware
      //    disposition (cashWash / personal / fleet / unresolved). Additive —
      //    the client only reads it when the flag is ON. ──
      const unifiedTollOn = await isUnifiedTollSettlementEnabled();
      const driverIdSetEH = new Set<string>(Array.from(driverIdsResolved || []).map((d: any) => String(d)));
      let tollLedgerEH: any[] = [];
      if (unifiedTollOn) {
        const rawToll = await kv.getByPrefix("toll_ledger:");
        tollLedgerEH = (rawToll || [])
          .filter((e: any) => e && driverIdSetEH.has(String(e.driverId)))
          .map((e: any) => ({ ...e, _dateMs: e.date ? new Date(e.date + "T00:00:00").getTime() : NaN }))
          .filter((e: any) => !isNaN(e._dateMs));
      }

      // ── Step 6: Aggregate each bucket ──
      const expenseTypes = new Set(["fuel_expense", "maintenance", "insurance", "other_expense"]);

      const rowsEH: any[] = buckets.map((bucket) => {
        const { startMs: bStart, endMs: bEnd } = bucket;
        const periodEntries = parsedEntries.filter((e: any) => e._dateMs >= bStart && e._dateMs <= bEnd);

        const periodFares = periodEntries.filter((e: any) => e.eventType === "fare_earning");
        const grossRevenue = periodFares.reduce((s: number, e: any) => {
          const g = Number.isFinite(e.grossAmount) ? Number(e.grossAmount) : Math.abs(Number(e.netAmount) || 0);
          return s + g;
        }, 0);
        // Same money rollup as Driver Detail / Personal Allowance (tips, promo, prior, etc.)
        const periodOverview = aggregateCanonicalEventsToLedgerDriverOverview(periodEntries, [], []);
        const periodEarnings =
          Number((periodOverview as any)?.period?.earnings) || 0;
        const tripCount = periodFares.length;
        const ledgerEventCount = periodEntries.length;

        const tips = periodEntries
          .filter((e: any) => e.eventType === "tip")
          .reduce((s: number, e: any) => s + (e.netAmount || 0), 0);

        const tolls = periodEntries
          .filter((e: any) => e.eventType === "toll_charge" && e.sourceType !== "trip")
          .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

        const platformFees = periodEntries
          .filter((e: any) => e.eventType === "platform_fee")
          .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

        const expenses = periodEntries
          .filter((e: any) => expenseTypes.has(e.eventType) || (e.direction === "outflow" && e.category === "Expense"))
          .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

        const payouts = periodEntries
          .filter((e: any) => e.eventType === "driver_payout")
          .reduce((s: number, e: any) => s + Math.abs(e.netAmount || 0), 0);

        const transactionCount = periodEntries.filter((e: any) =>
          expenseTypes.has(e.eventType) || e.eventType === "driver_payout" || e.eventType === "adjustment"
        ).length;

        // Monthly-reset cumulative earnings for tier lookup
        const refMonthStartMs = startOfMonthMsEH(bStart);
        const refMonthEndMs = endOfMonthMsEH(bStart);
        const cumulativeCap = Math.min(bEnd, refMonthEndMs);

        const cumulativeEarnings = fareEntriesEH.reduce((s: number, e: any) => {
          if (e._dateMs >= refMonthStartMs && e._dateMs <= cumulativeCap) {
            const g = Number.isFinite(e.grossAmount) ? Number(e.grossAmount) : Math.abs(Number(e.netAmount) || 0);
            return s + g;
          }
          return s;
        }, 0);

        // Policy resolve key: Monday of bucket start (daily/weekly = that day/week; monthly = first day in bucket).
        const weekStartYmd = mondayYmdFromYmd(bucket.startDate);
        const bundleEH = resolveActiveEarningsBundleForDriverWeek({
          policies: earningsPoliciesEH,
          driverId,
          weekStartYmd,
          legacy: legacyEH,
        });
        const tier = getTierForEarningsEH(cumulativeEarnings, bundleEH.tiers || []);
        const quotaTargetEH = getQuotaTargetForPeriod(periodType, bundleEH.quotas);
        const driverShare = grossRevenue * (tier.sharePercentage / 100);
        const fleetShare = grossRevenue - driverShare;
        const netEarnings = driverShare - expenses;

        // Reconciliation-aware toll disposition for this period (flag-gated).
        const tollDisposition = emptyTollDisposition();
        if (unifiedTollOn && tollLedgerEH.length > 0) {
          for (const te of tollLedgerEH) {
            if (te._dateMs >= bStart && te._dateMs <= bEnd) addToTollDisposition(tollDisposition, te);
          }
        }

        const qPercent = (quotaTargetEH !== null && quotaTargetEH > 0) ? (periodEarnings / quotaTargetEH) * 100 : null;

        return {
          periodStart: bucket.startDate,
          periodEnd: bucket.endDate,
          grossRevenue: Math.round(grossRevenue * 100) / 100,
          /** Matches driver-overview period.earnings (PA + Period Earnings card SSOT). */
          periodEarnings: Math.round(periodEarnings * 100) / 100,
          driverShare: Math.round(driverShare * 100) / 100,
          fleetShare: Math.round(fleetShare * 100) / 100,
          expenses: Math.round(expenses * 100) / 100,
          tier: { id: tier.id, name: tier.name, sharePercentage: tier.sharePercentage, color: tier.color },
          netEarnings: Math.round(netEarnings * 100) / 100,
          payouts: Math.round(payouts * 100) / 100,
          tripCount,
          transactionCount,
          tips: Math.round(tips * 100) / 100,
          tolls: Math.round(tolls * 100) / 100,
          // Reconciliation-aware toll disposition (unified settlement). Zeroes when
          // the flag is OFF; the client only consumes it when ON.
          tollDisposition: roundTollDisposition(tollDisposition),
          platformFees: Math.round(platformFees * 100) / 100,
          quotaTarget: quotaTargetEH,
          quotaPercent: qPercent !== null ? Math.round(qPercent * 100) / 100 : null,
          ledgerEventCount,
          policyId: bundleEH.policyId,
          versionId: bundleEH.versionId,
          policyName: bundleEH.policyName,
          policySource: bundleEH.source,
        };
      });

      // Drop periods with no ledger-backed activity so we do not list empty weeks before CSV /
      // first payout or pad with trailing zeros up to "today".
      function rowHasActivityEH(r: any): boolean {
        if (r.tripCount > 0 || r.transactionCount > 0) return true;
        if ((r.ledgerEventCount || 0) > 0) return true;
        if (Math.abs(r.grossRevenue || 0) > 1e-6) return true;
        if (Math.abs(r.periodEarnings || 0) > 1e-6) return true;
        if (Math.abs(r.tips || 0) > 1e-6) return true;
        if (Math.abs(r.payouts || 0) > 1e-6) return true;
        if (Math.abs(r.tolls || 0) > 1e-6) return true;
        if (Math.abs(r.platformFees || 0) > 1e-6) return true;
        if (Math.abs(r.expenses || 0) > 1e-6) return true;
        const td = r.tollDisposition;
        if (td && (td.cashWash || td.personal || td.fleet || td.unresolved)) return true;
        return false;
      }

      const activeRows = rowsEH.filter(rowHasActivityEH).reverse();

      // Cap + hasMore when more periods would exist beyond limit.
      // Cursor = periodStart of the last returned (oldest) row.
      let data = activeRows;
      let hasMore = false;
      let nextCursor: string | null = null;
      if (cursor) {
        // Continue older periods after cursor
        data = data.filter((r: any) => String(r.periodStart || "") < String(cursor));
      }
      if (data.length > limit) {
        data = data.slice(0, limit);
        const last = data[data.length - 1];
        hasMore = true;
        nextCursor = last.periodStart || null;
      }

      const durationMs = Date.now() - startMs;
      const totalGross = data.reduce((s: number, r: any) => s + r.grossRevenue, 0);
      console.log(`[Ledger EarningsHistory] driverId=${driverId} periodType=${periodType} range=${startDate}..${endDate} — returned ${data.length} rows, total gross $${totalGross.toFixed(2)}, ${durationMs}ms`);

      return c.json({
        success: true,
        data,
        durationMs,
        readModel: "canonical",
        hasMore,
        nextCursor,
        truncated: hasMore || buckets.length > limit || activeRows.length > limit,
      });
    } catch (e: any) {
      console.error("[Ledger EarningsHistory] Error:", e);
      return c.json({ error: e.message }, 500);
    }
  });
}

/** Map weekly driver_financial_periods row → earnings-history shape. */
function mapPeriodRowToEarningsHistory(r: any) {
  return {
    periodStart: String(r.periodAnchor || "").slice(0, 10),
    periodEnd: String(r.periodEnd || r.periodAnchor || "").slice(0, 10),
    grossRevenue: Number(r.earningsGross) || 0,
    periodEarnings: Number(r.earningsGross) || 0,
    driverShare: Number(r.driverShare) || 0,
    fleetShare: Number(r.fleetShare) || 0,
    expenses: Number(r.fuelDeduction) || 0,
    tier: {
      id: r.tierId || "tier_1",
      name: r.tierName || "Bronze",
      sharePercentage: Number(r.driverSharePercent) || 25,
      color: "#CD7F32",
    },
    netEarnings: Number(r.payoutNet) || 0,
    payouts: Number(r.payoutNet) || 0,
    tripCount: Number(r.tripCount) || 0,
    transactionCount: 0,
    quotaTarget: null as number | null,
    quotaPercent: null as number | null,
    policyId: r.metadata?.policyId || null,
    versionId: r.metadata?.versionId || null,
    policyName: r.metadata?.policyName || null,
    policySource: r.metadata?.policySource || null,
  };
}
