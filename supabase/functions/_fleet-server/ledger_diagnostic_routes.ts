/**
 * Remaining ledger diagnostics — peeled from index.tsx (L-2 / A-7).
 * Behavior unchanged.
 */
import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId, isLegacyOrgPlaceholder } from "./org_scope.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";

const PREFIX = "/make-server-37f42386";

export function registerLedgerDiagnosticRoutes(app: Hono) {
  /** Trip side of GET /ledger/diagnostic-trip-ledger-gap (shared with canonical + legacy fare rows). */
  type TripGapEligibleTrip = {
    id: string;
    platform: string;
    driverId: string;
    date: string;
    amount: number;
    organizationId: string | null;
  };

  function buildTripLedgerFareGapSection(
    eligible: TripGapEligibleTrip[],
    fareRaw: any[],
    readerOrgId: string | null,
    c: any,
    fareRowLabel: "ledger_event" | "ledger",
  ) {
    const fareScoped = filterByOrg(fareRaw, c);

    const ledgerOrgOnFare = {
      nullOrEmpty: 0,
      matchesReaderOrg: 0,
      legacyPlaceholderRoamDefaultOrg: 0,
      wrongOrg: 0,
    };
    const droppedWrongOrg: { id: string; sourceId?: string; platform?: string; ledgerOrg: string }[] = [];
    for (const e of fareRaw) {
      const oid =
        typeof e.organizationId === "string" && e.organizationId.trim() !== ""
          ? e.organizationId.trim()
          : null;
      if (!readerOrgId) {
        /* skip per-row org stats */
      } else if (oid == null) {
        ledgerOrgOnFare.nullOrEmpty++;
      } else if (oid === readerOrgId) {
        ledgerOrgOnFare.matchesReaderOrg++;
      } else if (isLegacyOrgPlaceholder(oid)) {
        ledgerOrgOnFare.legacyPlaceholderRoamDefaultOrg++;
      } else {
        ledgerOrgOnFare.wrongOrg++;
        if (droppedWrongOrg.length < 20) {
          droppedWrongOrg.push({
            id: e.id,
            sourceId: e.sourceId,
            platform: e.platform,
            ledgerOrg: oid,
          });
        }
      }
    }

    const sourceIdsRaw = new Set(fareRaw.map((e: any) => e.sourceId).filter(Boolean));
    const sourceIdsScoped = new Set(fareScoped.map((e: any) => e.sourceId).filter(Boolean));

    const missingFareLedgerEntirely = eligible.filter((t) => !sourceIdsRaw.has(t.id));
    const missingAfterOrgScope = eligible.filter((t) => !sourceIdsScoped.has(t.id));
    const fixedByScopeOnly = missingAfterOrgScope.filter((t) => sourceIdsRaw.has(t.id));

    const fareByPlatformRaw: Record<string, number> = {};
    const fareByPlatformScoped: Record<string, number> = {};
    for (const e of fareRaw) {
      const plat = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
      fareByPlatformRaw[plat] = (fareByPlatformRaw[plat] || 0) + 1;
    }
    for (const e of fareScoped) {
      const plat = (e.platform === "GoRide" ? "Roam" : e.platform) || "Other";
      fareByPlatformScoped[plat] = (fareByPlatformScoped[plat] || 0) + 1;
    }

    return {
      ledgerFareEarning: {
        fareRowSource: fareRowLabel,
        rawCount: fareRaw.length,
        afterFilterByOrgCount: fareScoped.length,
        droppedByFilterByOrg: fareRaw.length - fareScoped.length,
        organizationIdOnLedgerFareRows: ledgerOrgOnFare,
        byPlatformRaw: fareByPlatformRaw,
        byPlatformAfterScope: fareByPlatformScoped,
        sampleWrongOrgFareRows: droppedWrongOrg,
      },
      gap: {
        missingFareLedgerNoRowForTripId: missingFareLedgerEntirely.length,
        missingAfterOrgScope: missingAfterOrgScope.length,
        tripsHiddenOnlyByOrgFilter: fixedByScopeOnly.length,
        sampleMissingTripIdsNoLedgerAtAll: missingFareLedgerEntirely.slice(0, 25).map((t) => ({
          id: t.id,
          platform: t.platform,
          tripDriverId: t.driverId,
          date: t.date,
          tripOrganizationId: t.organizationId,
        })),
        sampleTripIdsPresentInRawButDroppedByOrgScope: fixedByScopeOnly.slice(0, 15).map((t) => ({
          id: t.id,
          platform: t.platform,
          date: t.date,
        })),
      },
    };
  }

  // ─── GET /ledger/diagnostic-trip-ledger-gap — Why trips ≠ fare_earning (org, missing writes, IDs) ──
  // Same date range + multi-driver-id resolution as driver-overview. Read-only. Fare rows: `ledger_event:*` only.
  app.get(`${PREFIX}/ledger/diagnostic-trip-ledger-gap`, requireAuth(), async (c) => {
    const t0 = Date.now();
    try {
      const driverId = c.req.query("driverId");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");
      if (!driverId || !startDate || !endDate) {
        return c.json({ error: "Missing driverId, startDate, or endDate" }, 400);
      }

      const readerOrgId = getOrgId(c);

      const allDriverIds: string[] = [driverId];
      try {
        const driverRecord = await kv.get(`driver:${driverId}`);
        if (driverRecord?.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
        if (driverRecord?.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
      } catch {
        /* ignore */
      }

      const driverIdOrFilter =
        allDriverIds.length === 1 ? null : allDriverIds.map((id) => `value->>driverId.eq.${id}`).join(",");

      const PAGE = 1000;
      const MAX_ROWS = 50000;
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

      const fetchFareEarningRows = async () => {
        const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
        const rows = await listAllUnifiedCanonicalEvents({
          products: ["roam_driver", "roam_fleet"],
          entryTypes: ["fare_earning"],
          from: `${startDate}T00:00:00.000Z`,
          to: `${endDate}T23:59:59.999Z`,
          maxRows: 50_000,
        });
        const want = new Set(allDriverIds.map((id) => String(id).toLowerCase()));
        return rows.filter((e) => want.has(String(e.driverId || "").toLowerCase()));
      };

      const tripRows = await paginatedFetch(() => {
        let q = fromKvStore()
          .select("value")
          .like("key", "trip:%")
          .eq("value->>status", "Completed")
          .gte("value->>date", startDate)
          .lte("value->>date", endDate);
        if (driverIdOrFilter) q = q.or(driverIdOrFilter);
        else q = q.eq("value->>driverId", driverId);
        return q;
      });

      const tripValues = tripRows.map((d: any) => d.value).filter(Boolean);

      const eligible: TripGapEligibleTrip[] = [];
      const tripOrgStats = {
        nullOrEmpty: 0,
        matchesReaderOrg: 0,
        legacyPlaceholderRoamDefaultOrg: 0,
        wrongOrg: 0,
        readerHasNoOrg: 0,
      };

      for (const v of tripValues) {
        const isUber = String(v.platform || "").toLowerCase() === "uber";
        const uberGross = isUber
          ? (Number(v.uberFareComponents) || 0) +
            (Number(v.uberTips) || 0) +
            (Number(v.uberPriorPeriodAdjustment) || 0)
          : 0;
        const hasTripAmount = !!v.amount && Number(v.amount) > 0;
        const hasMoney = isUber ? hasTripAmount || uberGross > 0 : hasTripAmount;
        if (!hasMoney) continue;

        const plat = isUber ? "Uber" : (v.platform === "GoRide" ? "Roam" : v.platform) || "Other";
        const oid =
          typeof v.organizationId === "string" && v.organizationId.trim() !== ""
            ? v.organizationId.trim()
            : null;

        if (!readerOrgId) {
          tripOrgStats.readerHasNoOrg++;
        } else if (oid == null) {
          tripOrgStats.nullOrEmpty++;
        } else if (oid === readerOrgId) {
          tripOrgStats.matchesReaderOrg++;
        } else if (isLegacyOrgPlaceholder(oid)) {
          tripOrgStats.legacyPlaceholderRoamDefaultOrg++;
        } else {
          tripOrgStats.wrongOrg++;
        }

        eligible.push({
          id: v.id,
          platform: plat,
          driverId: String(v.driverId || ""),
          date: typeof v.date === "string" ? v.date.slice(0, 10) : "",
          amount: Number(v.amount) || 0,
          organizationId: oid,
        });
      }

      const tripsByPlatform: Record<string, number> = {};
      for (const t of eligible) {
        tripsByPlatform[t.platform] = (tripsByPlatform[t.platform] || 0) + 1;
      }

      const tripsEligibleCompletedWithMoney = {
        count: eligible.length,
        byPlatform: tripsByPlatform,
        organizationIdOnTrip: tripOrgStats,
      };

      const sharedMeta = {
        startDate,
        endDate,
        readerOrgId: readerOrgId ?? null,
        resolvedDriverIds: allDriverIds,
        gapSource: "canonical" as const,
      };

      const hintsCommon = [
        "missingFareLedgerNoRowForTripId > 0 → no fare_earning row with sourceId = trip id (canonical append / import repair, or driverId mismatch).",
        "legacyPlaceholderRoamDefaultOrg → trips/ledger stamped with roam-default-org; filterByOrg treats that like unscoped for fleet UUID users.",
        "droppedByFilterByOrg with sampleWrongOrgFareRows (non-legacy org) → foreign-org rows excluded from this fleet.",
        "tripsHiddenOnlyByOrgFilter → raw row had sourceId but filterByOrg removed it (org mismatch).",
        "Compared to ledger_event:* fare_earning only.",
      ];

      const fareRaw = await fetchFareEarningRows();
      const section = buildTripLedgerFareGapSection(eligible, fareRaw, readerOrgId, c, "ledger_event"); // mapped from ledger.entries

      return c.json({
        success: true,
        meta: { ...sharedMeta, durationMs: Date.now() - t0 },
        tripsEligibleCompletedWithMoney,
        ledgerFareEarning: section.ledgerFareEarning,
        gap: section.gap,
        hints: hintsCommon,
      });
    } catch (e: any) {
      console.error("[diagnostic-trip-ledger-gap]", e);
      return c.json({ success: false, error: e.message || String(e) }, 500);
    }
  });

  // ─── GET /ledger/cash-diagnostic/:driverId — Phase 2 diagnostic ──────────────
  // Read-only: fetches all trips for a driver and returns a summary of cash-related
  // fields (cashCollected, paymentMethod) so the operator can verify stored data.
  app.get(`${PREFIX}/ledger/cash-diagnostic/:driverId`, requireAuth(), async (c) => {
      try {
          const startMs = Date.now();
          const driverId = c.req.param("driverId");
          if (!driverId) return c.json({ error: "Missing driverId" }, 400);

          // Resolve all known IDs for this driver
          const allDriverIds: string[] = [driverId];
          let resolvedDriverName = '';
          try {
              const driverRecord = await kv.get(`driver:${driverId}`);
              if (driverRecord) {
                  if (driverRecord.uberDriverId) allDriverIds.push(driverRecord.uberDriverId);
                  if (driverRecord.inDriveDriverId) allDriverIds.push(driverRecord.inDriveDriverId);
                  resolvedDriverName = driverRecord.name || [driverRecord.firstName, driverRecord.lastName].filter(Boolean).join(' ') || '';
              }
          } catch { /* ignore */ }

          // Build OR filter
          const orParts: string[] = [];
          for (const id of allDriverIds) {
              orParts.push(`value->>driverId.eq.${id}`);
          }
          if (resolvedDriverName) {
              orParts.push(`value->>driverName.ilike.${resolvedDriverName}`);
          }
          const orFilter = orParts.join(',');

          // Fetch all trips
          let allTrips: any[] = [];
          const PAGE = 1000;
          let offset = 0;
          while (offset < 50000) {
              const { data, error } = await fromKvStore()
                  .select("value")
                  .like("key", "trip:%")
                  .or(orFilter)
                  .range(offset, offset + PAGE - 1);
              if (error) throw error;
              const page = data || [];
              allTrips = allTrips.concat(page.map((d: any) => d.value).filter(Boolean));
              if (page.length < PAGE) break;
              offset += PAGE;
          }

          const completed = allTrips.filter((t: any) => t.status === 'Completed');

          // Group by platform
          const platforms: Record<string, any> = {};
          for (const t of completed) {
              const plat = t.platform || 'Unknown';
              if (!platforms[plat]) {
                  platforms[plat] = { total: 0, withCashCollectedGt0: 0, withPaymentMethodCash: 0, withEitherCashSignal: 0, samples: [] };
              }
              const p = platforms[plat];
              p.total++;
              const hasCashCollected = (t.cashCollected || 0) > 0;
              const hasPaymentMethodCash = (t.paymentMethod || '').toLowerCase() === 'cash';
              if (hasCashCollected) p.withCashCollectedGt0++;
              if (hasPaymentMethodCash) p.withPaymentMethodCash++;
              if (hasCashCollected || hasPaymentMethodCash) p.withEitherCashSignal++;
              // Keep up to 10 samples per platform
              if (p.samples.length < 10) {
                  p.samples.push({
                      id: t.id,
                      date: t.date,
                      amount: t.amount,
                      cashCollected: t.cashCollected ?? null,
                      paymentMethod: t.paymentMethod ?? null,
                      fareBreakdown: t.fareBreakdown ? { cashCollected: t.fareBreakdown.cashCollected ?? null } : null,
                  });
              }
          }

          const durationMs = Date.now() - startMs;
          return c.json({
              success: true,
              driverId,
              driverName: resolvedDriverName,
              allDriverIds,
              totalTrips: allTrips.length,
              completedTrips: completed.length,
              platforms,
              durationMs,
          });
      } catch (e: any) {
          console.error('[CashDiagnostic] Error:', e);
          return c.json({ error: `Cash diagnostic failed: ${e.message}` }, 500);
      }
  });
}
