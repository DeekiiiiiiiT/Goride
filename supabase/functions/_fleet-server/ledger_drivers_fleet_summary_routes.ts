/**
 * Drivers + fleet ledger summary routes — peeled from index.tsx / behavior unchanged
 */
import type { Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { fetchCanonicalLedgerEventsInPeriod } from "./ledger_driver_events.ts";

const PREFIX = "/make-server-37f42386";

/** Same aggregation shape as GET /ledger/fleet-summary (canonical ledger_event rows). */
function aggregateFleetSummaryFromLedgerLikeEntries(entries: any[]): {
  totalEarnings: number;
  totalTripCount: number;
  totalCashCollected: number;
  dailyTrend: Array<{ date: string; earnings: number; tripCount: number }>;
  topDrivers: Array<{ driverId: string; driverName: string; earnings: number; tripCount: number }>;
  platformBreakdown: Array<{ platform: string; earnings: number; tripCount: number }>;
  revenueByType: { fare: number; tip: number; promotion: number; other: number };
} {
  let totalEarnings = 0;
  let totalTripCount = 0;
  let totalCashCollected = 0;
  const revenueByType: Record<string, number> = {
    fare: 0,
    tip: 0,
    promotion: 0,
    other: 0,
  };
  const dailyMap = new Map<string, { earnings: number; tripCount: number }>();
  const driverMap = new Map<string, { driverName: string; earnings: number; tripCount: number }>();
  const platformMap = new Map<string, { earnings: number; tripCount: number }>();

  for (const e of entries) {
    const eventType = e.eventType || "";
    const gross = Number(e.grossAmount) || 0;
    const net = Number(e.netAmount) || 0;
    const entryDate = (e.date || "").substring(0, 10);
    const platform = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
    const driverId = e.driverId || "unknown";
    const driverName = e.driverName || "Unknown";
    const paymentMethod = e.paymentMethod || "";

    if (eventType === "fare_earning") {
      totalEarnings += gross;
      totalTripCount += 1;
      if (paymentMethod === "Cash") {
        totalCashCollected += Math.abs(net);
      }
      revenueByType.fare += gross;
      if (entryDate && entryDate.length === 10) {
        let day = dailyMap.get(entryDate);
        if (!day) {
          day = { earnings: 0, tripCount: 0 };
          dailyMap.set(entryDate, day);
        }
        day.earnings += gross;
        day.tripCount += 1;
      }
      if (driverId && driverId !== "unknown") {
        let drv = driverMap.get(driverId);
        if (!drv) {
          drv = { driverName, earnings: 0, tripCount: 0 };
          driverMap.set(driverId, drv);
        }
        drv.earnings += gross;
        drv.tripCount += 1;
        if (driverName && driverName !== "Unknown") drv.driverName = driverName;
      }
      let plat = platformMap.get(platform);
      if (!plat) {
        plat = { earnings: 0, tripCount: 0 };
        platformMap.set(platform, plat);
      }
      plat.earnings += gross;
      plat.tripCount += 1;
    } else if (eventType === "tip") {
      revenueByType.tip += net;
      totalEarnings += net;
    } else if (eventType === "promotion" || eventType === "incentive") {
      revenueByType.promotion += net;
    } else if (net > 0) {
      revenueByType.other += net;
    }
  }

  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topDrivers = Array.from(driverMap.entries())
    .map(([id, d]) => ({
      driverId: id,
      driverName: d.driverName,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);

  const platformBreakdown = Array.from(platformMap.entries())
    .map(([plat, d]) => ({
      platform: plat,
      earnings: Number(d.earnings.toFixed(2)),
      tripCount: d.tripCount,
    }))
    .sort((a, b) => b.earnings - a.earnings);

  return {
    totalEarnings: Number(totalEarnings.toFixed(2)),
    totalTripCount,
    totalCashCollected: Number(totalCashCollected.toFixed(2)),
    dailyTrend,
    topDrivers,
    platformBreakdown,
    revenueByType: {
      fare: Number(revenueByType.fare.toFixed(2)),
      tip: Number(revenueByType.tip.toFixed(2)),
      promotion: Number(revenueByType.promotion.toFixed(2)),
      other: Number(revenueByType.other.toFixed(2)),
    },
  };
}

export function registerLedgerDriversFleetSummaryRoutes(app: Hono) {
  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: Per-Driver Ledger Summary Endpoint
  // Aggregates ALL fare_earning ledger entries per driver into
  // lifetime / monthly / today earnings & trip-count buckets.
  // Used by DriversPage.tsx to display ledger-sourced financials.
  // Phase 2: Use requireOrg to ensure organization context for data isolation
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(`${PREFIX}/ledger/drivers-summary`, requireAuth({ requireOrg: true }), async (c) => {
    const t0 = Date.now();
    try {
      // Date param (for "today" bucket) — defaults to server's current date
      const dateParam = c.req.query("date");
      const today = dateParam || new Date().toISOString().split("T")[0];
      const monthStart = today.substring(0, 7) + "-01"; // YYYY-MM-01
      // Last day of month: go to next month day-0
      const [yr, mo] = today.substring(0, 7).split("-").map(Number);
      const monthEndDate = new Date(yr, mo, 0); // day 0 of next month = last day of this month
      const monthEnd = monthEndDate.toISOString().split("T")[0];

      console.log(
        `[Ledger DriversSummary] Starting — SQL aggregate today=${today}, month=${monthStart}..${monthEnd}`,
      );

      // P-2: SQL GROUP BY / periods SUM — no 100k JS fare fold
      const { aggregateCanonicalFareEarningsByDriver } = await import("./ledger_driver_events.ts");
      const agg = await aggregateCanonicalFareEarningsByDriver(c, { today, preferPeriods: true });
      console.log(
        `[Ledger DriversSummary] source=${agg.source} drivers=${agg.byDriver.size} truncated=${agg.truncated} (${Date.now() - t0}ms)`,
      );

      const result: Record<string, any> = {};
      let totalLifetime = 0;
      for (const [driverId, bucket] of agg.byDriver) {
        result[driverId] = {
          lifetimeEarnings: Number(bucket.lifetimeEarnings.toFixed(2)),
          monthlyEarnings: Number(bucket.monthlyEarnings.toFixed(2)),
          todayEarnings: Number(bucket.todayEarnings.toFixed(2)),
          lifetimeTripCount: bucket.lifetimeTripCount,
          monthlyTripCount: bucket.monthlyTripCount,
          todayTripCount: bucket.todayTripCount,
        };
        totalLifetime += bucket.lifetimeEarnings;
      }

      const durationMs = Date.now() - t0;
      console.log(
        `[Ledger DriversSummary] Returning summaries for ${agg.byDriver.size} drivers, total lifetime earnings $${totalLifetime.toFixed(2)}, duration ${durationMs}ms`,
      );

      return c.json({
        success: true,
        data: result,
        meta: {
          totalDrivers: agg.byDriver.size,
          totalEntriesProcessed: agg.totalEntriesProcessed,
          dateUsed: today,
          monthRange: `${monthStart}..${monthEnd}`,
          durationMs,
          readModel: agg.source,
          truncated: agg.truncated,
        },
      });
    } catch (e: any) {
      const durationMs = Date.now() - t0;
      console.error(`[Ledger DriversSummary] FAILED after ${durationMs}ms: ${e.message}`);
      return c.json({ success: false, error: `Ledger drivers-summary failed: ${e.message}`, meta: { durationMs } }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: Fleet-Wide Ledger Summary Endpoint
  // Aggregates ALL ledger entries fleet-wide: total earnings, cash collected,
  // daily trend, top drivers, platform breakdown, revenue by type.
  // Backend for ExecutiveDashboard (Phase 4) and FinancialsView (Phase 5).
  // ═══════════════════════════════════════════════════════════════════════════
  app.get(`${PREFIX}/ledger/fleet-summary`, requireAuth(), async (c) => {
    const t0 = Date.now();
    try {
      // ── Parse query params ─────────────────────────────────────────
      const daysParam = c.req.query("days");
      const startDateParam = c.req.query("startDate");
      const endDateParam = c.req.query("endDate");

      let periodStart: string;
      let periodEnd: string;

      if (startDateParam && endDateParam) {
        periodStart = startDateParam;
        periodEnd = endDateParam;
      } else {
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const now = new Date();
        periodEnd = now.toISOString().split("T")[0];
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - (days - 1));
        periodStart = startDate.toISOString().split("T")[0];
      }

      console.log(`[Ledger FleetSummary] Starting — readModel=canonical period=${periodStart}..${periodEnd}`);

      const entries = await fetchCanonicalLedgerEventsInPeriod(c, periodStart, periodEnd);

      console.log(
        `[Ledger FleetSummary] Fetched ${entries.length} entries (ledger_event) for period ${periodStart}..${periodEnd} in ${Date.now() - t0}ms`,
      );

      const agg = aggregateFleetSummaryFromLedgerLikeEntries(entries);
      const { totalEarnings, totalTripCount, totalCashCollected, dailyTrend, topDrivers, platformBreakdown, revenueByType } = agg;

      const durationMs = Date.now() - t0;
      console.log(
        `[Ledger FleetSummary] Done — ${entries.length} entries, $${totalEarnings.toFixed(2)} total earnings, ${totalTripCount} trips, ${dailyTrend.length} days, ${topDrivers.length} top drivers, ${platformBreakdown.length} platforms, ${durationMs}ms`,
      );

      return c.json({
        success: true,
        data: {
          totalEarnings,
          totalTripCount,
          totalCashCollected,
          dailyTrend,
          topDrivers,
          platformBreakdown,
          revenueByType,
        },
        meta: {
          periodStart,
          periodEnd,
          totalEntriesProcessed: entries.length,
          durationMs,
          readModel: "ledger.entries",
        },
      });
    } catch (e: any) {
      const durationMs = Date.now() - t0;
      console.error(`[Ledger FleetSummary] FAILED after ${durationMs}ms: ${e.message}`);
      return c.json({ success: false, error: `Ledger fleet-summary failed: ${e.message}`, meta: { durationMs } }, 500);
    }
  });
}
