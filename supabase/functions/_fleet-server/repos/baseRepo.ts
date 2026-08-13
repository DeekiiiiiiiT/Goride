/**
 * Thin repository helpers for fleet.* tables (via public.fleet_* views for PostgREST).
 * Native SQL filters/pagination — never load an entire domain into memory.
 */
import { getServiceClient } from "../service_client.ts";
import { FLEET_DOMAINS, type FleetDomainDef, resolveDomain } from "../fleet_domains.ts";
import type { FleetDomain } from "../fleet_table_flags.ts";
import { isFleetReadTableEnabled } from "../fleet_table_flags.ts";
import { resolveFleetColumn } from "./fleet_column_map.ts";

export { resolveFleetColumn };

export function fleetDb() {
  return getServiceClient();
}

export function fleetTable(table: string): string {
  return `fleet_${table}`;
}

export function getDomainDef(domain: FleetDomain): FleetDomainDef {
  const d = FLEET_DOMAINS.find((x) => x.domain === domain);
  if (!d) throw new Error(`Unknown fleet domain: ${domain}`);
  return d;
}

/** Row → legacy KV-like value (prefer payload_json). */
export function rowToKvValue(row: Record<string, unknown>): Record<string, unknown> {
  const payload =
    row.payload_json && typeof row.payload_json === "object" && !Array.isArray(row.payload_json)
      ? { ...(row.payload_json as Record<string, unknown>) }
      : {};
  if (!payload.id && row.id) payload.id = row.id;
  if (!payload.organizationId && row.organization_id) payload.organizationId = row.organization_id;
  // Mirror typed columns into camelCase fields clients already read
  if (!payload.assignedVehicleId && row.assigned_vehicle_id) {
    payload.assignedVehicleId = row.assigned_vehicle_id;
  }
  if (!payload.vehicleId && row.vehicle_id) payload.vehicleId = row.vehicle_id;
  if (!payload.currentDriverId && row.current_driver_id) {
    payload.currentDriverId = row.current_driver_id;
  }
  if (payload.value == null && row.reading != null) payload.value = row.reading;
  if (payload.odometer == null && row.odometer != null) payload.odometer = row.odometer;
  if (!payload.driverId && row.driver_id) payload.driverId = row.driver_id;
  if (!payload.weekStart && row.week_start) payload.weekStart = row.week_start;
  if (!payload.source && row.source) payload.source = row.source;
  if (!payload.referenceId && row.reference_id) payload.referenceId = row.reference_id;
  if (!payload.recordedAt && row.recorded_at) payload.recordedAt = row.recorded_at;
  if (payload.isVerified == null && row.is_verified != null) payload.isVerified = row.is_verified;
  if (payload.isVoided == null && row.is_voided != null) payload.isVoided = row.is_voided;
  if (payload.isAnomaly == null && row.is_anomaly != null) payload.isAnomaly = row.is_anomaly;
  if (payload.isHard == null && row.is_hard != null) payload.isHard = row.is_hard;
  if (!payload.transactionId && row.transaction_id) payload.transactionId = row.transaction_id;
  return payload;
}

export type FleetQueryFilter =
  | { op: "eq" | "neq" | "gte" | "gt" | "lte" | "lt"; col: string; value: unknown }
  | { op: "in"; col: string; value: unknown[] }
  | { op: "like"; col: string; value: string }
  | { op: "is"; col: string; value: null }
  | { op: "orOrg"; orgId: string }; // organization_id = org OR null OR roam-default-org

export type FleetQueryOpts = {
  org?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null; // inclusive YMD — converts to lt(nextDay)
  filters?: FleetQueryFilter[];
  eq?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  order?: { col: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  /** When true, return exact count (and optionally head-only). */
  count?: boolean;
  head?: boolean;
  /** Return { key, value } rows instead of bare values. */
  withKeys?: boolean;
  /** Filter legacy_kv_id by this prefix (defaults to domain's first prefix). */
  legacyPrefix?: string;
};

export type FleetQueryResult = {
  data: Array<Record<string, unknown> | { key: string; value: Record<string, unknown> }>;
  count: number | null;
  error: Error | null;
};

function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const next = new Date(y, (m || 1) - 1, (d || 1) + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate(),
  ).padStart(2, "0")}`;
}

function applyFilter(q: any, f: FleetQueryFilter): any {
  if (f.op === "orOrg") {
    return q.or(
      `organization_id.eq.${f.orgId},organization_id.is.null,organization_id.eq.roam-default-org`,
    );
  }
  const col = resolveFleetColumn(f.col) ?? f.col;
  switch (f.op) {
    case "eq":
      return q.eq(col, f.value);
    case "neq":
      return q.neq(col, f.value);
    case "gte":
      return q.gte(col, f.value);
    case "gt":
      return q.gt(col, f.value);
    case "lte":
      return q.lte(col, f.value);
    case "lt":
      return q.lt(col, f.value);
    case "in":
      return q.in(col, f.value);
    case "like":
      return q.like(col, f.value);
    case "is":
      return q.is(col, f.value);
    default:
      return q;
  }
}

/**
 * Native filtered/paginated query against a fleet domain table.
 * Prefer this over any full-prefix load + JS filter.
 */
export async function queryFleet(
  domain: FleetDomain,
  opts: FleetQueryOpts = {},
): Promise<FleetQueryResult> {
  try {
    const def = getDomainDef(domain);
    const selectOpts = opts.count
      ? ({ count: "exact", head: !!opts.head } as const)
      : opts.head
        ? ({ count: "exact", head: true } as const)
        : undefined;
    let q = fleetDb().from(fleetTable(def.table)).select("*", selectOpts);

    if (opts.legacyPrefix) {
      q = q.like("legacy_kv_id", `${opts.legacyPrefix}%`);
    }
    if (opts.org) {
      q = q.eq("organization_id", opts.org);
    }
    if (opts.dateFrom) {
      q = q.gte("date", String(opts.dateFrom).slice(0, 10));
    }
    if (opts.dateTo) {
      q = q.lt("date", nextYmd(String(opts.dateTo).slice(0, 10)));
    }
    if (opts.eq) {
      for (const [col, value] of Object.entries(opts.eq)) {
        const resolved = resolveFleetColumn(col) ?? col;
        q = q.eq(resolved, value);
      }
    }
    if (opts.in) {
      for (const [col, value] of Object.entries(opts.in)) {
        const resolved = resolveFleetColumn(col) ?? col;
        q = q.in(resolved, value);
      }
    }
    if (opts.filters?.length) {
      for (const f of opts.filters) q = applyFilter(q, f);
    }

    const orderCol = opts.order
      ? resolveFleetColumn(opts.order.col) ?? opts.order.col
      : "updated_at";
    const ascending = opts.order?.ascending === true;
    q = q.order(orderCol, { ascending });

    if (opts.offset != null || opts.limit != null) {
      const from = opts.offset ?? 0;
      const to = from + (opts.limit ?? 1000) - 1;
      q = q.range(from, to);
    } else if (!opts.head) {
      // Safety cap — never silently pull unbounded tables into memory
      q = q.limit(5000);
    }

    const { data, error, count } = await q;
    if (error) return { data: [], count: null, error: new Error(error.message) };

    if (opts.head) {
      return { data: [], count: count ?? 0, error: null };
    }

    const rows = (data || []) as Record<string, unknown>[];
    if (opts.withKeys) {
      return {
        data: rows.map((r) => ({
          key: String(r.legacy_kv_id || `${def.prefixes[0]}${r.id}`),
          value: rowToKvValue(r),
        })),
        count: count ?? null,
        error: null,
      };
    }
    return {
      data: rows.map((r) => rowToKvValue(r)),
      count: count ?? null,
      error: null,
    };
  } catch (e) {
    return {
      data: [],
      count: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/** All rows for a batch_id (paged under the hood, returns KV values). */
export async function listByBatch(
  domain: FleetDomain,
  batchId: string,
  opts?: { withKeys?: boolean; limit?: number },
): Promise<Array<Record<string, unknown> | { key: string; value: Record<string, unknown> }>> {
  const PAGE = 1000;
  const out: Array<Record<string, unknown> | { key: string; value: Record<string, unknown> }> = [];
  let offset = 0;
  const max = opts?.limit ?? 50000;
  while (offset < max) {
    const res = await queryFleet(domain, {
      eq: { batch_id: batchId },
      order: { col: "legacy_kv_id", ascending: true },
      limit: Math.min(PAGE, max - offset),
      offset,
      withKeys: opts?.withKeys,
    });
    if (res.error) throw res.error;
    out.push(...res.data);
    if (res.data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

/** Exact count with optional filters (head-only). */
export async function countBy(
  domain: FleetDomain,
  opts: Omit<FleetQueryOpts, "head" | "count" | "limit" | "offset" | "withKeys"> = {},
): Promise<number> {
  const res = await queryFleet(domain, { ...opts, head: true, count: true, limit: 1 });
  if (res.error) throw res.error;
  return res.count ?? 0;
}

/**
 * Page through matching rows without loading unbound memory in callers that must stream.
 * Yields KV-shaped values (or {key,value} when withKeys).
 */
export async function* iterateFleet(
  domain: FleetDomain,
  opts: Omit<FleetQueryOpts, "limit" | "offset" | "head"> = {},
): AsyncGenerator<Record<string, unknown> | { key: string; value: Record<string, unknown> }> {
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const res = await queryFleet(domain, { ...opts, limit: PAGE, offset });
    if (res.error) throw res.error;
    for (const row of res.data) yield row;
    if (res.data.length < PAGE) break;
    offset += PAGE;
  }
}

/** Resolve domain from a KV prefix like `trip:` / `fuel_entry:`. */
export function domainForPrefix(prefix: string): FleetDomainDef | null {
  const exact = FLEET_DOMAINS.find((d) => d.prefixes.some((p) => p === prefix || p === `${prefix}`));
  if (exact) return exact;
  const withColon = prefix.endsWith(":") ? prefix : `${prefix}:`;
  return (
    FLEET_DOMAINS.find((d) => d.prefixes.some((p) => p === withColon)) ||
    FLEET_DOMAINS.find((d) => d.prefixes.some((p) => withColon.startsWith(p) || p.startsWith(withColon))) ||
    null
  );
}

export async function listByOrg(
  domain: FleetDomain,
  organizationId: string | null | undefined,
  opts?: { limit?: number },
): Promise<Record<string, unknown>[]> {
  const res = await queryFleet(domain, {
    org: organizationId || undefined,
    order: { col: "updated_at", ascending: false },
    limit: opts?.limit ?? 5000,
  });
  if (res.error) throw res.error;
  return res.data as Record<string, unknown>[];
}

export async function getById(
  domain: FleetDomain,
  id: string,
): Promise<Record<string, unknown> | null> {
  const def = getDomainDef(domain);
  const { data, error } = await fleetDb().from(fleetTable(def.table)).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToKvValue(data as Record<string, unknown>);
}

export async function countTable(domain: FleetDomain, organizationId?: string | null): Promise<number> {
  return countBy(domain, organizationId ? { org: organizationId } : {});
}

export async function getByLegacyKvId(
  domain: FleetDomain,
  legacyKvId: string,
): Promise<Record<string, unknown> | null> {
  const def = getDomainDef(domain);
  const { data, error } = await fleetDb()
    .from(fleetTable(def.table))
    .select("*")
    .eq("legacy_kv_id", legacyKvId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const id = legacyKvId.includes(":") ? legacyKvId.slice(legacyKvId.indexOf(":") + 1) : legacyKvId;
    return getById(domain, id);
  }
  return rowToKvValue(data as Record<string, unknown>);
}

/** Page through an entire fleet table as KV-shaped values. Prefer filtered helpers. */
export async function listAll(domain: FleetDomain): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const row of iterateFleet(domain, { order: { col: "legacy_kv_id", ascending: true } })) {
    out.push(row as Record<string, unknown>);
  }
  return out;
}

export function shouldReadTable(domain: FleetDomain): boolean {
  return isFleetReadTableEnabled(domain);
}

/** Convenience: domain from a concrete key. */
export function domainForKey(key: string): FleetDomainDef | null {
  return resolveDomain(key);
}
