/**
 * Fluent native select for mapped fleet domains.
 * Drop-in shape for former `supabase.from("kv_store_37f42386").like("key", "trip:%")…`
 * chains — filters push to real SQL columns (no full-domain memory load).
 */
import {
  countBy,
  domainForPrefix,
  queryFleet,
  type FleetQueryFilter,
  type FleetQueryOpts,
} from "./repos/baseRepo.ts";
import type { FleetDomain } from "./fleet_table_flags.ts";

type OrderOpt = { ascending?: boolean };

export class FleetSelectBuilder {
  private filters: FleetQueryFilter[] = [];
  private orderOpt: FleetQueryOpts["order"];
  private limitN?: number;
  private offsetN?: number;
  private wantCount = false;
  private wantHead = false;
  private withKeys = false;
  private selectMode: "value" | "key" | "both" = "value";
  private legacyPrefix?: string;

  constructor(private domain: FleetDomain, prefix?: string) {
    if (prefix) this.legacyPrefix = prefix.endsWith(":") || prefix.includes(":") ? prefix : `${prefix}:`;
  }

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    const c = String(cols || "value");
    if (c.includes("key") && c.includes("value")) {
      this.selectMode = "both";
      this.withKeys = true;
    } else if (c.trim() === "key" || c.startsWith("key")) {
      this.selectMode = "key";
      this.withKeys = true;
    } else {
      this.selectMode = "value";
    }
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.wantHead = true;
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ op: "eq", col, value });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ op: "neq", col, value });
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push({ op: "gte", col, value });
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push({ op: "gt", col, value });
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push({ op: "lte", col, value });
    return this;
  }
  lt(col: string, value: unknown) {
    this.filters.push({ op: "lt", col, value });
    return this;
  }
  in(col: string, value: unknown[]) {
    this.filters.push({ op: "in", col, value });
    return this;
  }
  like(col: string, value: string) {
    // Ignore key-prefix likes — already scoped by domain/legacyPrefix
    if (col === "key") {
      const pat = String(value);
      if (pat.endsWith("%")) this.legacyPrefix = pat.slice(0, -1);
      else this.legacyPrefix = pat;
      return this;
    }
    this.filters.push({ op: "like", col, value });
    return this;
  }
  /** Soft org scope used by many list endpoints (include null + legacy placeholder). */
  orOrg(orgId: string) {
    this.filters.push({ op: "orOrg", orgId });
    return this;
  }
  or(expr: string) {
    // Only the org soft-or pattern is supported natively
    const m = expr.match(/organizationId\.eq\.([^,]+)/);
    if (m) {
      this.filters.push({ op: "orOrg", orgId: m[1] });
      return this;
    }
    console.warn("[fleetSelect] unsupported or() clause — ignored:", expr.slice(0, 120));
    return this;
  }
  order(col: string, opts?: OrderOpt) {
    this.orderOpt = { col, ascending: opts?.ascending === true };
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = Math.max(0, to - from + 1);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.limitN = 1;
    return this.execute().then((r) => ({
      data: Array.isArray(r.data) ? r.data[0] ?? null : r.data,
      error: r.error,
      count: r.count,
    }));
  }
  single() {
    this.limitN = 1;
    return this.execute().then((r) => {
      const first = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
      if (first == null) {
        return {
          data: null,
          error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          count: r.count,
        };
      }
      return { data: first, error: null, count: r.count };
    });
  }

  private async execute(): Promise<{ data: any; error: any; count: number | null }> {
    if (this.wantHead) {
      const n = await countBy(this.domain, {
        filters: this.filters,
        legacyPrefix: this.legacyPrefix,
        order: this.orderOpt,
      });
      return { data: null, error: null, count: n };
    }

    const res = await queryFleet(this.domain, {
      filters: this.filters,
      order: this.orderOpt ?? { col: "legacy_kv_id", ascending: true },
      limit: this.limitN ?? 5000,
      offset: this.offsetN ?? 0,
      count: this.wantCount,
      withKeys: this.withKeys,
      legacyPrefix: this.legacyPrefix,
    });
    if (res.error) return { data: null, error: res.error, count: null };

    let data: any = res.data;
    if (this.selectMode === "value" && this.withKeys === false) {
      data = res.data;
    } else if (this.selectMode === "key") {
      data = (res.data as Array<{ key: string }>).map((r) => ({ key: r.key }));
    } else if (this.selectMode === "both") {
      data = res.data;
    } else if (!this.withKeys) {
      // Default supabase shape often wraps as { value }
      data = (res.data as Record<string, unknown>[]).map((v) => ({ value: v }));
    }

    // When caller used .select("value") without withKeys, wrap as {value}
    if (this.selectMode === "value" && !this.withKeys) {
      data = (res.data as Record<string, unknown>[]).map((v) => ({ value: v }));
    }

    return { data, error: null, count: res.count };
  }

  then(onFulfilled: any, onRejected?: any) {
    return this.execute().then(onFulfilled, onRejected);
  }
  catch(onRejected: any) {
    return this.execute().catch(onRejected);
  }
}

/**
 * Start a native fleet select for a KV prefix (`trip:`, `fuel_entry`, …).
 * Throws if the prefix is not a mapped fleet domain — use real KV for ephemeral keys.
 */
export function fleetSelect(prefix: string): FleetSelectBuilder {
  const p = prefix.includes(":") ? prefix : `${prefix}:`;
  const def = domainForPrefix(p) || domainForPrefix(prefix);
  if (!def) {
    throw new Error(`[fleetSelect] unmapped prefix: ${prefix}`);
  }
  return new FleetSelectBuilder(def.domain, p);
}

/** True when prefix is a fleet-mapped domain. */
export function isFleetMappedPrefix(prefix: string): boolean {
  const p = prefix.includes(":") ? prefix : `${prefix}:`;
  return !!(domainForPrefix(p) || domainForPrefix(prefix));
}
