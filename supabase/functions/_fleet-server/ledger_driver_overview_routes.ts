/**
 * GET /ledger/driver-overview — Aggregated financials for Driver Detail.
 * Extracted from index.tsx (Phase D shell collapse). Behavior unchanged.
 */
import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { belongsToOrg } from "./org_scope.ts";
import {
  aggregateCanonicalEventsToLedgerDriverOverview,
  canonicalEventInSelectedWindow,
} from "./ledger_money_aggregate.ts";
import { fetchAllLedgerEventValuesForDrivers } from "./ledger_driver_events.ts";
import {
  getDriverFinancialPeriodDetail,
  isSingleFleetWeek,
  overlayOverviewFromPeriod,
  sumDriverFinancialPeriodLifetime,
} from "./driver_financial_periods.ts";
import {
  isFinanceReadProjectionOverview,
  isFinanceShadowProjection,
} from "../_shared/unifiedLedger/flags.ts";

const PREFIX = "/make-server-37f42386";

export function registerLedgerDriverOverviewRoutes(app: Hono) {
  // ─── GET /ledger/driver-overview — Aggregated financials for Driver Detail ──
  app.get(`${PREFIX}/ledger/driver-overview`, requireAuth(), async (c) => {
    try {
      const driverId = c.req.query("driverId");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      const platformsParam = c.req.query("platforms");

      if (!driverId || !startDate || !endDate) {
        return c.json({ error: "Missing required params: driverId, startDate, endDate" }, 400);
      }

      console.log(
        `[Ledger DriverOverview] driverId=${driverId} range=${startDate}..${endDate} platforms=${platformsParam || "all"} source=ledger.entries`,
      );

      const allDriverIdsCanon: string[] = [driverId];
      try {
        const driverRecord = await kv.get(`driver:${driverId}`);
        if (driverRecord && !belongsToOrg(driverRecord as Record<string, unknown>, c)) {
          return c.json({ error: "Forbidden" }, 403);
        }
        if (driverRecord) {
          if (driverRecord.uberDriverId) allDriverIdsCanon.push(driverRecord.uberDriverId);
          if (driverRecord.inDriveDriverId) allDriverIdsCanon.push(driverRecord.inDriveDriverId);
        }
      } catch (lookupErr) {
        console.warn(`[Ledger DriverOverview] driver lookup ${driverId}:`, lookupErr);
      }
      const allDriverIdsCanonExpanded: string[] = [];
      for (const id of allDriverIdsCanon) {
        allDriverIdsCanonExpanded.push(id);
        const lc = id.toLowerCase();
        if (lc !== id) allDriverIdsCanonExpanded.push(lc);
      }

      try {
        const startDC = new Date(startDate + "T00:00:00Z");
        const endDC = new Date(endDate + "T23:59:59Z");
        const daysDiffC = Math.round((endDC.getTime() - startDC.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const prevEndDC = new Date(startDC);
        prevEndDC.setUTCDate(prevEndDC.getUTCDate() - 1);
        const prevStartDC = new Date(prevEndDC);
        prevStartDC.setUTCDate(prevStartDC.getUTCDate() - daysDiffC + 1);
        const prevStartC = prevStartDC.toISOString().slice(0, 10);
        const prevEndC = prevEndDC.toISOString().slice(0, 10);

        // Windowed events cover selected period + previous only (lifetime comes from DFP SUM).
        const rangeFromC = prevStartC;

        const windowValsCanon = await fetchAllLedgerEventValuesForDrivers(allDriverIdsCanonExpanded, c, {
          from: `${rangeFromC}T00:00:00.000Z`,
          to: `${endDate}T23:59:59.999Z`,
        });

        const periodValsCanon = windowValsCanon.filter((v: any) =>
          canonicalEventInSelectedWindow(v as Record<string, unknown>, startDate, endDate),
        );
        const prevValsCanon = windowValsCanon.filter((v: any) =>
          canonicalEventInSelectedWindow(v as Record<string, unknown>, prevStartC, prevEndC),
        );

        // Lifetime KPIs: cheap all-time aggregate over driver_financial_periods (not event window).
        const lifetimeTotals = await sumDriverFinancialPeriodLifetime(driverId);

        const resultCanon = aggregateCanonicalEventsToLedgerDriverOverview(
          periodValsCanon,
          prevValsCanon,
          [],
          platformsParam || undefined,
        ) as Record<string, unknown>;

        const priorLifetime =
          resultCanon.lifetime && typeof resultCanon.lifetime === "object"
            ? (resultCanon.lifetime as Record<string, unknown>)
            : {};
        resultCanon.lifetime = {
          ...priorLifetime,
          earnings: lifetimeTotals.earnings,
          tripCount: lifetimeTotals.tripCount,
          cashCollected: lifetimeTotals.cashCollected,
          tolls: lifetimeTotals.tolls,
        };

        console.log(
          `[Ledger DriverOverview] OK — period earnings=${(resultCanon.period as any)?.earnings} events=${periodValsCanon.length} lifetimeTrips=${lifetimeTotals.tripCount}`,
        );

        if (isSingleFleetWeek(startDate, endDate) && isFinanceReadProjectionOverview()) {
          try {
            const periodRow = await getDriverFinancialPeriodDetail(driverId, startDate);
            if (periodRow) {
              const legacyCash = Number((resultCanon.period as { cashCollected?: number })?.cashCollected) || 0;
              const projCash = Number(periodRow.cashCollected) || 0;
              if (Math.abs(legacyCash - projCash) > 0.01) {
                console.warn(
                  `[FIN_SHADOW overview] driver=${driverId} week=${startDate} legacyCash=${legacyCash} projCash=${projCash}`,
                );
              }
              if (!isFinanceShadowProjection()) {
                const prevRow = await getDriverFinancialPeriodDetail(driverId, prevStartC);
                return c.json({
                  success: true,
                  data: overlayOverviewFromPeriod(resultCanon, periodRow, prevRow),
                });
              }
            }
          } catch (projErr) {
            console.warn("[Ledger DriverOverview] projection overlay skipped:", projErr);
          }
        }

        return c.json({ success: true, data: resultCanon });
      } catch (canonErr: any) {
        console.log(`[Ledger DriverOverview] Error: ${canonErr.message}`);
        return c.json({ error: `Canonical driver overview failed: ${canonErr.message}` }, 500);
      }
    } catch (e: any) {
      console.log(`[Ledger DriverOverview] Error: ${e.message}`);
      return c.json({ error: `Ledger driver overview failed: ${e.message}` }, 500);
    }
  });
}
