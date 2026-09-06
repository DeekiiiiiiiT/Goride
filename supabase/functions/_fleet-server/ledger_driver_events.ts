/**
 * Range-scoped canonical ledger fetches for driver overview / earnings history.
 * Kept out of index.tsx (A-7 light split) so date filters stay one place.
 *
 * P-2: roster / drivers-summary prefer SQL GROUP BY (periods or fare_earning)
 * instead of folding up to 100k mapped event rows in JS.
 */
import type { Context } from "npm:hono";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";

export type LedgerDriverFetchOpts = {
  from?: string;
  to?: string;
  maxRows?: number;
};

export type FareEarningsDriverBucket = {
  lifetimeEarnings: number;
  monthlyEarnings: number;
  todayEarnings: number;
  lifetimeTripCount: number;
  monthlyTripCount: number;
  todayTripCount: number;
};

export type FareEarningsAggregateResult = {
  byDriver: Map<string, FareEarningsDriverBucket>;
  truncated: boolean;
  /** How buckets were built. */
  source: "driver_financial_periods" | "ledger_entries_sql" | "ledger_entries_scan";
  totalEntriesProcessed: number;
};

/** Load ledger.entries for one or more driver IDs (aliases expanded by caller). */
export async function fetchAllLedgerEventValuesForDrivers(
  driverIds: string[],
  c: Context | any,
  opts?: LedgerDriverFetchOpts,
): Promise<any[]> {
  if (!driverIds.length) return [];
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const seen = new Set<string>();
  const all: any[] = [];
  const maxRows = opts?.maxRows ?? 50_000;
  const from = opts?.from;
  const to = opts?.to;
  for (const did of driverIds) {
    const rows = await listAllUnifiedCanonicalEvents({
      products: ["roam_driver", "roam_fleet"],
      driverId: did,
      from,
      to,
      maxRows,
    });
    for (const r of rows) {
      const id = String(r.id || "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      all.push(r);
    }
  }
  return filterByOrg(all, c);
}

function emptyBucket(): FareEarningsDriverBucket {
  return {
    lifetimeEarnings: 0,
    monthlyEarnings: 0,
    todayEarnings: 0,
    lifetimeTripCount: 0,
    monthlyTripCount: 0,
    todayTripCount: 0,
  };
}

function monthBounds(today: string): { monthStart: string; monthEnd: string } {
  const monthStart = today.substring(0, 7) + "-01";
  const [yr, mo] = today.substring(0, 7).split("-").map(Number);
  const monthEnd = new Date(yr, mo, 0).toISOString().split("T")[0];
  return { monthStart, monthEnd };
}

async function rpcFareEarningsByDriver(
  orgId: string | null,
  today: string,
  monthStart: string,
  monthEnd: string,
): Promise<Map<string, FareEarningsDriverBucket> | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc("fleet_fare_earnings_by_driver", {
    p_org_id: orgId,
    p_today: today,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) {
    console.warn("[ledger_driver_events] fleet_fare_earnings_by_driver failed:", error.message);
    return null;
  }
  const map = new Map<string, FareEarningsDriverBucket>();
  for (const row of data || []) {
    const id = String((row as any).driver_id || "").trim();
    if (!id) continue;
    map.set(id, {
      lifetimeEarnings: Number((row as any).lifetime_earnings) || 0,
      monthlyEarnings: Number((row as any).monthly_earnings) || 0,
      todayEarnings: Number((row as any).today_earnings) || 0,
      lifetimeTripCount: Number((row as any).lifetime_trip_count) || 0,
      monthlyTripCount: Number((row as any).monthly_trip_count) || 0,
      todayTripCount: Number((row as any).today_trip_count) || 0,
    });
  }
  return map;
}

async function rpcPeriodEarningsByDriver(
  orgId: string | null,
  today: string,
  monthStart: string,
  monthEnd: string,
): Promise<{
  map: Map<string, FareEarningsDriverBucket>;
  periodRowCount: number;
} | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc("fleet_period_earnings_by_driver", {
    p_org_id: orgId,
    p_today: today,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) {
    console.warn("[ledger_driver_events] fleet_period_earnings_by_driver failed:", error.message);
    return null;
  }
  const map = new Map<string, FareEarningsDriverBucket>();
  let periodRowCount = 0;
  for (const row of data || []) {
    const id = String((row as any).driver_id || "").trim();
    if (!id) continue;
    periodRowCount += Number((row as any).period_row_count) || 0;
    map.set(id, {
      lifetimeEarnings: Number((row as any).lifetime_earnings) || 0,
      monthlyEarnings: Number((row as any).monthly_earnings) || 0,
      todayEarnings: 0, // periods are weekly — today filled from fare SQL when needed
      lifetimeTripCount: Number((row as any).lifetime_trip_count) || 0,
      monthlyTripCount: Number((row as any).monthly_trip_count) || 0,
      todayTripCount: 0,
    });
  }
  return { map, periodRowCount };
}

/** Slim capped scan fallback when RPCs unavailable — sets truncated at maxRows. */
async function scanFareEarningsByDriver(
  c: Context | any,
  today: string,
  monthStart: string,
  monthEnd: string,
  maxRows = 100_000,
): Promise<FareEarningsAggregateResult> {
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const rows = await listAllUnifiedCanonicalEvents({
    products: ["roam_driver", "roam_fleet"],
    entryTypes: ["fare_earning"],
    maxRows,
  });
  const entryValues = filterByOrg(rows, c);
  const truncated = rows.length >= maxRows;
  const byDriver = new Map<string, FareEarningsDriverBucket>();

  for (const e of entryValues) {
    if (!e) continue;
    const driverId = String(e.driverId || "").trim();
    if (!driverId || driverId === "unknown") continue;
    const gross = Number(e.grossAmount) || 0;
    const entryDate = String(e.date || "").substring(0, 10);
    if (!entryDate || entryDate.length !== 10) continue;

    let bucket = byDriver.get(driverId);
    if (!bucket) {
      bucket = emptyBucket();
      byDriver.set(driverId, bucket);
    }
    bucket.lifetimeEarnings += gross;
    bucket.lifetimeTripCount += 1;
    if (entryDate >= monthStart && entryDate <= monthEnd) {
      bucket.monthlyEarnings += gross;
      bucket.monthlyTripCount += 1;
    }
    if (entryDate === today) {
      bucket.todayEarnings += gross;
      bucket.todayTripCount += 1;
    }
  }

  return {
    byDriver,
    truncated,
    source: "ledger_entries_scan",
    totalEntriesProcessed: entryValues.length,
  };
}

/**
 * Per-driver fare_earning aggregates for roster / drivers-summary.
 * Prefer driver_financial_periods SUM when periods cover earnings; else SQL GROUP BY;
 * last resort capped scan with truncated=true.
 */
export async function aggregateCanonicalFareEarningsByDriver(
  c: Context | any,
  opts: { today: string; preferPeriods?: boolean } = { today: new Date().toISOString().slice(0, 10) },
): Promise<FareEarningsAggregateResult> {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const { monthStart, monthEnd } = monthBounds(today);
  const orgId = getOrgId(c);

  // 1) Prefer periods SUM(earnings_gross)/trip_count when rebuilt weeks exist.
  if (opts.preferPeriods !== false) {
    const periods = await rpcPeriodEarningsByDriver(orgId, today, monthStart, monthEnd);
    if (periods && periods.map.size > 0 && periods.periodRowCount > 0) {
      // Overlay today from fare SQL (weekly periods cannot express "today").
      const fareToday = await rpcFareEarningsByDriver(orgId, today, monthStart, monthEnd);
      if (fareToday) {
        for (const [id, fare] of fareToday) {
          const existing = periods.map.get(id);
          if (!existing) {
            periods.map.set(id, { ...fare });
            continue;
          }
          // Weekly periods cannot express "today" — overlay from fare SQL.
          existing.todayEarnings = fare.todayEarnings;
          existing.todayTripCount = fare.todayTripCount;
          if (existing.lifetimeEarnings < 0.005 && fare.lifetimeEarnings > 0.005) {
            periods.map.set(id, { ...fare });
          }
        }
      }
      return {
        byDriver: periods.map,
        truncated: false,
        source: "driver_financial_periods",
        totalEntriesProcessed: periods.periodRowCount,
      };
    }
  }

  // 2) SQL GROUP BY on ledger.entries fare_earning
  const fareSql = await rpcFareEarningsByDriver(orgId, today, monthStart, monthEnd);
  if (fareSql) {
    let totalTrips = 0;
    for (const b of fareSql.values()) totalTrips += b.lifetimeTripCount;
    return {
      byDriver: fareSql,
      truncated: false,
      source: "ledger_entries_sql",
      totalEntriesProcessed: totalTrips,
    };
  }

  // 3) Capped scan — surface truncation in meta
  return scanFareEarningsByDriver(c, today, monthStart, monthEnd);
}

/** Load ledger.entries in [periodStart, periodEnd], org-scoped. */
export async function fetchCanonicalLedgerEventsInPeriod(
  c: Context | any,
  periodStart: string,
  periodEnd: string,
): Promise<any[]> {
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const rows = await listAllUnifiedCanonicalEvents({
    products: ["roam_driver", "roam_fleet"],
    from: `${periodStart}T00:00:00.000Z`,
    to: `${periodEnd}T23:59:59.999Z`,
    maxRows: 100_000,
  });
  return filterByOrg(rows, c);
}
