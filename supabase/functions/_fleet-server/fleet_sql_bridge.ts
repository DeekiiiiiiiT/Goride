/**
 * Explicit KV-table query bridge with SQL pushdown for mapped fleet domains.
 * Replaces the old full-prefix-in-memory proxy (WORKER_RESOURCE_LIMIT root cause).
 *
 * Prefer queryFleet / fleetSelect / kv.getByPrefix for new code.
 * Use fromKvStore() only when migrating legacy chained builders.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.49.8";
import { FLEET_DOMAINS, resolveDomain } from "./fleet_domains.ts";
import { isFleetReadTableEnabled } from "./fleet_table_flags.ts";
import {
  countBy,
  getByLegacyKvId,
  queryFleet,
  resolveFleetColumn,
  type FleetQueryFilter,
} from "./repos/baseRepo.ts";
import type { FleetDomain as FD } from "./fleet_table_flags.ts";

type Call = { method: string; args: unknown[] };

function findDomainForPrefix(prefix: string) {
  return (
    FLEET_DOMAINS.find((d) => d.prefixes.some((p) => p === prefix)) ||
    FLEET_DOMAINS.find((d) => d.prefixes.some((p) => prefix.startsWith(p) || p.startsWith(prefix))) ||
    null
  );
}

function rawClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function payloadPathToCol(col: string): string | null {
  return resolveFleetColumn(col);
}

async function executeMapped(calls: Call[]): Promise<{ data: unknown; error: unknown; count: number | null }> {
  const likeKey = calls.find((c) => c.method === "like" && c.args[0] === "key");
  const eqKey = calls.find((c) => c.method === "eq" && c.args[0] === "key");
  const inKey = calls.find((c) => c.method === "in" && c.args[0] === "key");

  let domain: FD | null = null;
  let legacyPrefix: string | undefined;

  if (eqKey) {
    const key = String(eqKey.args[1] ?? "");
    const def = resolveDomain(key);
    if (!def || !isFleetReadTableEnabled(def.domain)) {
      return { data: null, error: null, count: 0 };
    }
    const val = await getByLegacyKvId(def.domain, key);
    const selectCall = calls.find((c) => c.method === "select");
    const selectArg = String(selectCall?.args[0] ?? "value");
    const single = calls.some((c) => c.method === "maybeSingle" || c.method === "single");
    if (!val) {
      if (calls.some((c) => c.method === "single")) {
        return {
          data: null,
          error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          count: 0,
        };
      }
      return { data: single ? null : [], error: null, count: 0 };
    }
    const row =
      selectArg.includes("key") ? { key, value: val } : selectArg === "*" ? { key, value: val } : { value: val };
    return { data: single ? row : [row], error: null, count: 1 };
  }

  if (inKey) {
    const keys = (inKey.args[1] as string[]) || [];
    const rows: Array<{ key: string; value: Record<string, unknown> }> = [];
    for (const key of keys) {
      const def = resolveDomain(key);
      if (!def || !isFleetReadTableEnabled(def.domain)) continue;
      const val = await getByLegacyKvId(def.domain, key);
      if (val) rows.push({ key, value: val });
    }
    return shapeResult(calls, rows, rows.length);
  }

  if (likeKey) {
    const pattern = String(likeKey.args[1] ?? "");
    legacyPrefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
    const def = findDomainForPrefix(legacyPrefix);
    if (!def || !isFleetReadTableEnabled(def.domain)) {
      return { data: null, error: null, count: 0 };
    }
    domain = def.domain;
  } else {
    return { data: null, error: new Error("[fleetSqlBridge] mapped query missing key filter"), count: null };
  }

  const filters: FleetQueryFilter[] = [];
  for (const c of calls) {
    if (["select", "order", "range", "limit", "maybeSingle", "single"].includes(c.method)) continue;
    if (c.method === "like" && c.args[0] === "key") continue;
    if (c.method === "or") {
      const expr = String(c.args[0] ?? "");
      const orgM = expr.match(/organizationId\.eq\.([^,]+)/);
      if (orgM) {
        filters.push({ op: "orOrg", orgId: orgM[1] });
        continue;
      }
      // Trip Analytics date ORs: date.gte/lte OR requestTime.gte/lte → push date column only.
      // (requestTime lives in payload_json; fleet.trips.date is the indexed filter column.)
      const dateGte = expr.match(/value->>date\.gte\.([^,]+)/);
      if (dateGte && /requestTime\.gte\./.test(expr)) {
        filters.push({ op: "gte", col: "date", value: String(dateGte[1]).slice(0, 10) });
        continue;
      }
      const dateLte = expr.match(/value->>date\.lte\.([^,]+)/);
      if (dateLte && /requestTime\.lte\./.test(expr)) {
        filters.push({ op: "lte", col: "date", value: String(dateLte[1]).slice(0, 10) });
        continue;
      }
      // Multi-eq ORs → IN (status Processing variants, Roam/GoRide platform alias, etc.)
      const statusEqs = [...expr.matchAll(/value->>status\.eq\.([^,]+)/g)].map((m) => m[1]);
      if (statusEqs.length >= 2) {
        filters.push({ op: "in", col: "status", value: statusEqs });
        continue;
      }
      const platformEqs = [...expr.matchAll(/value->>platform\.eq\.([^,]+)/g)].map((m) => m[1]);
      if (platformEqs.length >= 2) {
        filters.push({ op: "in", col: "platform", value: platformEqs });
        continue;
      }
      console.warn("[fleetSqlBridge] unmapped or() filter (skipped):", expr.slice(0, 200));
      continue;
    }
    const col = String(c.args[0] ?? "");
    const sqlCol = payloadPathToCol(col);
    if (!sqlCol) {
      throw new Error(`[fleetSqlBridge] unmapped filter column: ${col}`);
    }
    if (c.method === "eq") filters.push({ op: "eq", col: sqlCol, value: c.args[1] });
    else if (c.method === "neq") filters.push({ op: "neq", col: sqlCol, value: c.args[1] });
    else if (c.method === "gte") filters.push({ op: "gte", col: sqlCol, value: c.args[1] });
    else if (c.method === "gt") filters.push({ op: "gt", col: sqlCol, value: c.args[1] });
    else if (c.method === "lte") filters.push({ op: "lte", col: sqlCol, value: c.args[1] });
    else if (c.method === "lt") filters.push({ op: "lt", col: sqlCol, value: c.args[1] });
    else if (c.method === "in") filters.push({ op: "in", col: sqlCol, value: (c.args[1] as unknown[]) || [] });
    else if (c.method === "like") filters.push({ op: "like", col: sqlCol, value: String(c.args[1] ?? "") });
    else if (c.method === "is") filters.push({ op: "is", col: sqlCol, value: null });
  }

  const selectCall = calls.find((c) => c.method === "select");
  const selectOpts = (selectCall?.args[1] || {}) as { count?: string; head?: boolean };
  const head = !!selectOpts.head;
  const wantCount = !!selectOpts.count || head;

  const orderCall = calls.find((c) => c.method === "order");
  let order: { col: string; ascending?: boolean } | undefined;
  if (orderCall) {
    const col = payloadPathToCol(String(orderCall.args[0] ?? "")) ?? "legacy_kv_id";
    const opts = (orderCall.args[1] || {}) as { ascending?: boolean };
    order = { col, ascending: opts.ascending === true };
  }

  const rangeCall = calls.find((c) => c.method === "range");
  const limitCall = calls.find((c) => c.method === "limit");
  let offset = 0;
  let limit = 5000;
  if (rangeCall) {
    offset = Number(rangeCall.args[0] ?? 0);
    const to = Number(rangeCall.args[1] ?? offset);
    limit = Math.max(0, to - offset + 1);
  } else if (limitCall) {
    limit = Number(limitCall.args[0] ?? 5000);
  }

  if (head) {
    const n = await countBy(domain!, { filters, legacyPrefix, order });
    return { data: null, error: null, count: n };
  }

  const selectArg = String(selectCall?.args[0] ?? "value");
  const withKeys = selectArg.includes("key");

  const res = await queryFleet(domain!, {
    filters,
    legacyPrefix,
    order: order ?? { col: "legacy_kv_id", ascending: true },
    limit,
    offset,
    count: wantCount,
    withKeys,
  });
  if (res.error) return { data: null, error: res.error, count: null };

  let rows: Array<{ key?: string; value: Record<string, unknown> }>;
  if (withKeys) {
    rows = res.data as Array<{ key: string; value: Record<string, unknown> }>;
  } else {
    rows = (res.data as Record<string, unknown>[]).map((v) => ({ value: v }));
  }

  // Key-only select
  if (selectArg.trim() === "key" || (selectArg.startsWith("key") && !selectArg.includes("value"))) {
    const keyed = withKeys
      ? (res.data as Array<{ key: string }>).map((r) => ({ key: r.key }))
      : rows.map((r, i) => ({ key: (r as any).key || `unknown:${i}` }));
    return shapeResult(calls, keyed as any, res.count);
  }

  return shapeResult(calls, rows, res.count);
}

function shapeResult(
  calls: Call[],
  rows: Array<Record<string, unknown>>,
  count: number | null,
): { data: unknown; error: unknown; count: number | null } {
  const single = calls.some((c) => c.method === "maybeSingle" || c.method === "single");
  if (single) {
    const first = rows[0] ?? null;
    if (calls.some((c) => c.method === "single") && first == null) {
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        count,
      };
    }
    return { data: first, error: null, count };
  }
  return { data: rows, error: null, count };
}

function isMappedKeyFilter(calls: Call[]): boolean {
  const likeKey = calls.find((c) => c.method === "like" && c.args[0] === "key");
  if (likeKey) {
    const pattern = String(likeKey.args[1] ?? "");
    const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
    const def = findDomainForPrefix(prefix);
    return !!(def && isFleetReadTableEnabled(def.domain));
  }
  const eqKey = calls.find((c) => c.method === "eq" && c.args[0] === "key");
  if (eqKey) {
    const def = resolveDomain(String(eqKey.args[1] ?? ""));
    return !!(def && isFleetReadTableEnabled(def.domain));
  }
  const inKey = calls.find((c) => c.method === "in" && c.args[0] === "key");
  if (inKey) {
    const keys = (inKey.args[1] as string[]) || [];
    return keys.some((k) => {
      const def = resolveDomain(k);
      return !!(def && isFleetReadTableEnabled(def.domain));
    });
  }
  return false;
}

const WRITE_METHODS = new Set(["insert", "upsert", "update", "delete"]);

async function replayRaw(raw: SupabaseClient, calls: Call[]) {
  let q: any = raw.from("kv_store_37f42386");
  for (const c of calls) {
    if (typeof q[c.method] !== "function") {
      throw new Error(`[fleetSqlBridge] unsupported method on raw replay: ${c.method}`);
    }
    q = q[c.method](...c.args);
  }
  return await q;
}

function createBuilder(raw: SupabaseClient) {
  const calls: Call[] = [];

  const run = async () => {
    try {
      const hasWrite = calls.some((c) => WRITE_METHODS.has(c.method));
      // Reads for mapped domains → SQL-pushdown on fleet_*. Writes / unmapped → real KV.
      if (!hasWrite && isMappedKeyFilter(calls)) {
        return await executeMapped(calls);
      }
      return await replayRaw(raw, calls);
    } catch (e) {
      return { data: null, error: e instanceof Error ? e : new Error(String(e)), count: null };
    }
  };

  const api: Record<string, unknown> = {};
  const methods = [
    "select", "like", "eq", "neq", "gte", "gt", "lte", "lt", "in", "or", "order", "range", "limit",
    "maybeSingle", "single", "insert", "upsert", "update", "delete", "match", "filter", "not", "is",
    "contains", "containedBy", "textSearch", "csv", "throwOnError",
  ];
  for (const m of methods) {
    api[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return api;
    };
  }
  (api as any).then = (onFulfilled: any, onRejected: any) => run().then(onFulfilled, onRejected);
  (api as any).catch = (onRejected: any) => run().catch(onRejected);
  return api;
}

/** Explicit entry for legacy chained KV queries (SQL pushdown when mapped). */
export function fromKvStore() {
  return createBuilder(rawClient());
}

