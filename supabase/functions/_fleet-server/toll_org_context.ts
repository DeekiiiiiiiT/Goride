/**
 * Request-scoped org context for toll_controller.
 *
 * Routes rely on shared loaders (getAllTollLedgerEntries / loadMergedTollTxArray /
 * loadAllByPrefix). Binding Hono Context in AsyncLocalStorage lets those loaders
 * push organization_id into the SQL predicate without threading `c` through
 * every call site — covering all ~61 routes via one middleware.
 *
 * Ops note: live second-org staging verification remains an ops step when a
 * second tenant exists; unit tests prove the SQL/filter predicate isolates orgs.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "npm:hono@4.3.11";
import type { FleetQueryFilter } from "./repos/baseRepo.ts";
import { getOrgId } from "./org_scope.ts";

const tollRequestStore = new AsyncLocalStorage<Context>();

/** TR-M1: one ledger load per (from,to) per request — wizard opens hit ~5 endpoints. */
type LedgerBundle = { tollTx: any[]; trips: any[] };
type LedgerCacheState = {
  pageOpenId: string;
  loads: number;
  cache: Map<string, Promise<LedgerBundle>>;
};
const ledgerCacheStore = new AsyncLocalStorage<LedgerCacheState>();

/** Run the rest of the request with `c` available to shared toll loaders. */
export function runWithTollContext<T>(c: Context, fn: () => T | Promise<T>): T | Promise<T> {
  const ledgerState: LedgerCacheState = {
    pageOpenId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `page-${Date.now()}`,
    loads: 0,
    cache: new Map(),
  };
  return tollRequestStore.run(c, () => ledgerCacheStore.run(ledgerState, fn));
}

/** Current request Context, if inside toll_controller middleware. */
export function getTollContext(): Context | undefined {
  return tollRequestStore.getStore();
}

/**
 * Memoize loadTollLedgerWithTrips within a single request (TR-M1).
 * Returns null when not inside runWithTollContext (tests / CLI).
 */
export function getRequestLedgerCache(): LedgerCacheState | undefined {
  return ledgerCacheStore.getStore();
}

export async function cachedTollLedgerLoad(
  from: string | undefined,
  to: string | undefined,
  loader: (from?: string, to?: string) => Promise<LedgerBundle>,
): Promise<LedgerBundle> {
  const state = ledgerCacheStore.getStore();
  if (!state) return loader(from, to);
  const key = `${from ?? ""}|${to ?? ""}`;
  const hit = state.cache.get(key);
  if (hit) return hit;
  state.loads += 1;
  const pending = loader(from, to);
  state.cache.set(key, pending);
  return pending;
}

export function snapshotLedgerLoads(): { pageOpenId: string; loads: number } | null {
  const state = ledgerCacheStore.getStore();
  if (!state) return null;
  return { pageOpenId: state.pageOpenId, loads: state.loads };
}

/**
 * Resolve org for SQL filters: explicit Context wins, else ALS, else null
 * (platform / anon / system backfill → no org predicate).
 */
export function resolveTollOrgId(c?: Context | null): string | null {
  const ctx = c ?? getTollContext();
  if (!ctx) return null;
  return getOrgId(ctx);
}

/**
 * Legacy-compatible org SQL filter (exact org OR null OR roam-default-org).
 * Empty when no org context — platform roles must still see all tenants.
 */
export function tollOrgSqlFilters(organizationId: string | null | undefined): FleetQueryFilter[] {
  if (!organizationId) return [];
  return [{ op: "orOrg", orgId: organizationId }];
}

/** PostgREST `or` string matching orOrg — useful for tests without a live client. */
export function tollOrgOrClause(organizationId: string): string {
  return `organization_id.eq.${organizationId},organization_id.is.null,organization_id.eq.roam-default-org`;
}
