/**
 * Range-scoped canonical ledger fetches for driver overview / earnings history.
 * Kept out of index.tsx (A-7 light split) so date filters stay one place.
 */
import type { Context } from "npm:hono";
import { filterByOrg } from "./org_scope.ts";

export type LedgerDriverFetchOpts = {
  from?: string;
  to?: string;
  maxRows?: number;
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

/** Load org-scoped fare_earning rows from ledger.entries. */
export async function fetchCanonicalFareEarningAll(c: Context | any): Promise<any[]> {
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const rows = await listAllUnifiedCanonicalEvents({
    products: ["roam_driver", "roam_fleet"],
    entryTypes: ["fare_earning"],
    maxRows: 100_000,
  });
  return filterByOrg(rows, c);
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
