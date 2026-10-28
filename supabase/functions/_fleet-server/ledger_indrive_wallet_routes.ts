/**
 * InDrive wallet ledger routes — peeled from index.tsx / behavior unchanged
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import {
  computeIndriveWalletFeesFromLedgerEntries,
  computeIndriveWalletLoadsFromLedgerEntries,
  buildIndriveWalletFleetFromLedger,
} from "../../../packages/finance-core/src/indriveWalletMetrics.ts";

const PREFIX = "/make-server-37f42386";

export function registerLedgerIndriveWalletRoutes(app: Hono) {
  // ─── GET /ledger/driver-indrive-wallet — Period loads, fees, lifetime loads ──
  // Query: driverId, startDate, endDate (YYYY-MM-DD). Same multi-ID driver resolution as driver-overview.
  // Loads + fees from unified ledger.entries when LEDGER_READ_UNIFIED_FLEET=1 (else legacy ledger_event:*).
  // estimatedBalance = lifetimeLoads − lifetimeInDriveFees (fleet estimate only).
  // Read access: transactions.view. transaction:* "InDrive Wallet Credit" is write-path only.
  app.get(
    `${PREFIX}/ledger/driver-indrive-wallet`,
    requireAuth(),
    requirePermission("transactions.view"),
    async (c) => {
    const t0 = Date.now();
    try {
      const driverId = c.req.query("driverId");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");

      if (!driverId || !startDate || !endDate) {
        return c.json({ error: "Missing required params: driverId, startDate, endDate" }, 400);
      }

      const allDriverIds: string[] = [driverId];
      try {
        const driverRecord = await kv.get(`driver:${driverId}`);
        if (driverRecord) {
          if (driverRecord.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
          if (driverRecord.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
        }
      } catch (lookupErr) {
        console.warn(`[IndriveWallet] Could not look up driver ${driverId}:`, lookupErr);
      }

      let ledgerVals: Record<string, unknown>[] = [];
      let source: "ledger.entries" = "ledger.entries";

      {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required", code: "ORG_REQUIRED" }, 403);
        const { weekSummary } = await import("../_shared/unifiedLedger/readApi.ts");
        const { lastNWeeksRange } = await import("../_shared/unifiedLedger/dateRange.ts");
        // Lifetime ≈ last 52 weeks (never unbounded).
        const life = lastNWeeksRange(52);
        const summary = await weekSummary({
          organizationId: orgId,
          from: `${life.from}T00:00:00.000Z`,
          to: `${life.to}T23:59:59.999Z`,
          driverIds: allDriverIds,
          products: ["roam_driver", "roam_fleet"],
        });
        filterByOrg(
          summary.map((r) => ({ organizationId: r.organization_id })),
          c,
        );
        // Expand week_summary into synthetic canonical rows for shared fee/load math.
        ledgerVals = summary.map((r) => ({
          eventType: r.entry_type,
          date: r.week_start,
          netAmount: Number(r.sum_minor) / 100,
          grossAmount: Number(r.gross_minor || r.sum_minor) / 100,
          driverId: r.driver_id,
          platform: r.platform,
          direction: r.direction,
          organizationId: r.organization_id,
        }));
      }

      const { periodLoads, lifetimeLoads } = computeIndriveWalletLoadsFromLedgerEntries(
        ledgerVals,
        startDate,
        endDate,
      );
      const { periodFees, lifetimeInDriveFees } = computeIndriveWalletFeesFromLedgerEntries(
        ledgerVals,
        startDate,
        endDate,
      );
      const estimatedBalance = Number((lifetimeLoads - lifetimeInDriveFees).toFixed(2));
      const data = {
        periodLoads,
        periodFees,
        lifetimeLoads,
        estimatedBalance,
      };

      console.log(
        `[IndriveWallet] source=${source} driverId=${driverId} range=${startDate}..${endDate} periodLoads=${data.periodLoads} periodFees=${data.periodFees} lifetimeLoads=${data.lifetimeLoads} estimatedBalance=${data.estimatedBalance} ledgerVals=${ledgerVals.length} ${Date.now() - t0}ms`,
      );

      return c.json({
        success: true,
        meta: { source, durationMs: Date.now() - t0 },
        data,
      });
    } catch (e: any) {
      console.error("[IndriveWallet] Error:", e);
      return c.json({ error: `InDrive wallet summary failed: ${e.message}` }, 500);
    }
  });

  // ─── GET /ledger/indrive-wallet/fleet — Fleet-wide wallet summaries (replaces Wallet Center N+1) ──
  // Query: startDate, endDate (YYYY-MM-DD). Unified wallet_credit + InDrive fees when flag ON.
  app.get(
    `${PREFIX}/ledger/indrive-wallet/fleet`,
    requireAuth(),
    requirePermission("transactions.view"),
    async (c) => {
    const t0 = Date.now();
    try {
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      if (!startDate || !endDate) {
        return c.json({ error: "Missing required params: startDate, endDate" }, 400);
      }

      const orgId = getOrgId(c);
      const PAGE = 1000;
      const MAX_ROWS = 100000;
      const paginatedFetch = async (buildQuery: () => any): Promise<any[]> => {
        let all: any[] = [];
        let offset = 0;
        while (offset < MAX_ROWS) {
          const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
          if (error) throw error;
          const page = data || [];
          all = all.concat(page);
          if (page.length < PAGE) break;
          offset += PAGE;
        }
        return all;
      };

      const driverRows = await paginatedFetch(() => {
        let q = fromKvStore().select("value").like("key", "driver:%");
        if (orgId) q = q.eq("value->>organizationId", orgId);
        return q;
      });
      const driversRaw = (driverRows || []).map((r: any) => r.value).filter(Boolean);
      const drivers = await filterByOrgSafe(driversRaw, c, { endpoint: "/ledger/indrive-wallet/fleet" });

      let ledgerVals: Record<string, unknown>[] = [];
      let source: "ledger.entries" = "ledger.entries";

      {
        if (!orgId) return c.json({ error: "Organization required", code: "ORG_REQUIRED" }, 403);
        const { weekSummary } = await import("../_shared/unifiedLedger/readApi.ts");
        const { lastNWeeksRange } = await import("../_shared/unifiedLedger/dateRange.ts");
        const life = lastNWeeksRange(52);
        const summary = await weekSummary({
          organizationId: orgId,
          from: `${life.from}T00:00:00.000Z`,
          to: `${life.to}T23:59:59.999Z`,
          products: ["roam_driver", "roam_fleet"],
        });
        filterByOrg(
          summary.map((r) => ({ organizationId: r.organization_id })),
          c,
        );
        ledgerVals = summary.map((r) => ({
          eventType: r.entry_type,
          date: r.week_start,
          netAmount: Number(r.sum_minor) / 100,
          grossAmount: Number(r.gross_minor || r.sum_minor) / 100,
          driverId: r.driver_id,
          platform: r.platform,
          direction: r.direction,
          organizationId: r.organization_id,
        }));
      }

      const driverIdRecords = (drivers || [])
        .map((d: any) => ({
          id: String(d?.id || d?.roamId || "").trim(),
          uberDriverId: d?.uberDriverId ?? null,
          inDriveDriverId: d?.inDriveDriverId ?? null,
        }))
        .filter((d: { id: string }) => !!d.id);

      const { drivers: driverSummaries, totals } = buildIndriveWalletFleetFromLedger(
        driverIdRecords,
        ledgerVals,
        startDate,
        endDate,
      );

      console.log(
        `[IndriveWalletFleet] source=${source} range=${startDate}..${endDate} drivers=${driverSummaries.length} short=${totals.shortDriverCount} periodLoads=${totals.periodLoads} ledgerVals=${ledgerVals.length} ${Date.now() - t0}ms`,
      );

      return c.json({
        success: true,
        meta: { source, durationMs: Date.now() - t0 },
        totals,
        drivers: driverSummaries,
      });
    } catch (e: any) {
      console.error("[IndriveWalletFleet] Error:", e);
      return c.json({ error: `InDrive wallet fleet summary failed: ${e.message}` }, 500);
    }
  });
}
