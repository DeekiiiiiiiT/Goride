/**
 * InDrive wallet ledger routes — peeled from index.tsx / behavior unchanged
 */
import type { Hono } from "npm:hono";
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
        const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
        // Primary Roam UUID is what dual-write account keys use.
        const unified = await listAllUnifiedCanonicalEvents({
          driverId,
          products: ["roam_driver", "roam_fleet"],
          maxRows: 50_000,
        });
        // Also include alias-id matches that may live in metadata.driverId only.
        const aliasSet = new Set(allDriverIds.map((id) => String(id).toLowerCase()));
        ledgerVals = filterByOrg(
          unified.filter((e) => {
            const did = String(e.driverId || "").toLowerCase();
            return !did || aliasSet.has(did) || did === String(driverId).toLowerCase();
          }),
          c,
        );
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
        const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
        const unified = await listAllUnifiedCanonicalEvents({
          products: ["roam_driver", "roam_fleet"],
          // Lifetime wallet/fee math needs full history (not just the request window).
          maxRows: 100_000,
        });
        ledgerVals = filterByOrg(unified, c);
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
