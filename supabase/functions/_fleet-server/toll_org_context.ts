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
import type { Context } from "npm:hono";
import type { FleetQueryFilter } from "./repos/baseRepo.ts";
import { getOrgId } from "./org_scope.ts";

const tollRequestStore = new AsyncLocalStorage<Context>();

/** Run the rest of the request with `c` available to shared toll loaders. */
export function runWithTollContext<T>(c: Context, fn: () => T | Promise<T>): T | Promise<T> {
  return tollRequestStore.run(c, fn);
}

/** Current request Context, if inside toll_controller middleware. */
export function getTollContext(): Context | undefined {
  return tollRequestStore.getStore();
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
