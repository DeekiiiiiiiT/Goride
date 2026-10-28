/**
 * Thin ledger read API — Postgres adds up; edge only maps DTOs.
 * Ledger read helpers — week summaries, keyset pages, batch totals. No OFFSET fetch-all.
 */
import { unifiedLedgerClient } from "./postEntry.ts";
import { mapUnifiedEntryToCanonicalEvent } from "./queries.ts";

export type WeekSummaryRow = {
  organization_id: string;
  week_start: string;
  driver_id: string | null;
  product: string;
  entry_type: string;
  platform: string | null;
  direction: string;
  sum_minor: number;
  abs_sum_minor: number;
  gross_minor: number;
  entry_count: number;
  reconciled_count: number;
  last_entry_at: string | null;
};

export type LedgerPageRow = {
  id: string;
  organization_id: string;
  entry_type: string;
  product: string;
  amount_minor: number;
  currency: string;
  effective_at: string;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  driver_id: string | null;
  platform: string | null;
  batch_id: string | null;
  direction: string;
  is_reconciled: boolean;
  vehicle_id: string | null;
  description: string | null;
  /** Narrow metadata from ledger.page (R4) — not full jsonb. */
  meta?: Record<string, unknown> | null;
  has_more: boolean;
};

export type RangeSummaryRow = {
  organization_id: string;
  day: string;
  driver_id: string | null;
  product: string;
  entry_type: string;
  platform: string | null;
  direction: string;
  sum_minor: number;
  abs_sum_minor: number;
  gross_minor: number;
  entry_count: number;
};

function requireOrg(org: string | null | undefined): string {
  const id = String(org || "").trim();
  if (!id) throw new Error("ledger read requires organization_id");
  return id;
}

function requireRange(from: string | null | undefined, to: string | null | undefined): {
  from: string;
  to: string;
} {
  const f = String(from || "").trim();
  const t = String(to || "").trim();
  if (!f || !t) throw new Error("ledger read requires date range (from, to)");
  return { from: f, to: t };
}

export async function weekSummary(opts: {
  organizationId: string;
  from: string;
  to: string;
  driverIds?: string[];
  entryTypes?: string[];
  platform?: string;
  direction?: string;
  products?: string[];
}): Promise<WeekSummaryRow[]> {
  const org = requireOrg(opts.organizationId);
  const { from, to } = requireRange(opts.from, opts.to);
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_week_summary", {
    p_org: org,
    p_from: from,
    p_to: to,
    p_driver_ids: opts.driverIds?.length ? opts.driverIds : null,
    p_entry_types: opts.entryTypes?.length ? opts.entryTypes : null,
    p_platform: opts.platform ?? null,
    p_direction: opts.direction ?? null,
    p_products: opts.products?.length ? opts.products : null,
  });
  if (error) throw new Error(`ledger_week_summary failed: ${error.message}`);
  return (data ?? []) as WeekSummaryRow[];
}

/** Day-grain signed totals for arbitrary calendar ranges (expense hub month views). */
export async function rangeSummary(opts: {
  organizationId: string;
  from: string;
  to: string;
  entryTypes?: string[];
  products?: string[];
  driverIds?: string[];
  platform?: string;
  direction?: string;
}): Promise<RangeSummaryRow[]> {
  const org = requireOrg(opts.organizationId);
  const { from, to } = requireRange(opts.from, opts.to);
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_range_summary", {
    p_org: org,
    p_from: from,
    p_to: to,
    p_entry_types: opts.entryTypes?.length ? opts.entryTypes : null,
    p_products: opts.products?.length ? opts.products : null,
    p_driver_ids: opts.driverIds?.length ? opts.driverIds : null,
    p_platform: opts.platform ?? null,
    p_direction: opts.direction ?? null,
  });
  if (error) throw new Error(`ledger_range_summary failed: ${error.message}`);
  return (data ?? []) as RangeSummaryRow[];
}

/** Sum week_summary rows to major currency units (÷100). */
export function sumWeekSummaryMinor(
  rows: WeekSummaryRow[],
  pick: "sum_minor" | "abs_sum_minor" | "gross_minor" = "sum_minor",
): number {
  return rows.reduce((acc, r) => acc + Number(r[pick] ?? 0), 0);
}

export function sumWeekSummaryMajor(
  rows: WeekSummaryRow[],
  pick: "sum_minor" | "abs_sum_minor" | "gross_minor" = "sum_minor",
): number {
  return sumWeekSummaryMinor(rows, pick) / 100;
}

export async function ledgerPage(opts: {
  organizationId: string;
  from: string;
  to: string;
  entryTypes?: string[];
  products?: string[];
  platform?: string;
  direction?: string;
  driverIds?: string[];
  batchId?: string;
  vehicleId?: string;
  reconciled?: boolean;
  search?: string;
  amountMinMinor?: number;
  amountMaxMinor?: number;
  afterEffectiveAt?: string;
  afterId?: string;
  limit?: number;
}): Promise<{ rows: LedgerPageRow[]; hasMore: boolean; nextCursor: { effectiveAt: string; id: string } | null }> {
  const org = requireOrg(opts.organizationId);
  const { from, to } = requireRange(opts.from, opts.to);
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_page", {
    p_org: org,
    p_from: from,
    p_to: to,
    p_entry_types: opts.entryTypes?.length ? opts.entryTypes : null,
    p_products: opts.products?.length ? opts.products : null,
    p_platform: opts.platform ?? null,
    p_direction: opts.direction ?? null,
    p_driver_ids: opts.driverIds?.length ? opts.driverIds : null,
    p_batch_id: opts.batchId ?? null,
    p_vehicle_id: opts.vehicleId ?? null,
    p_reconciled: opts.reconciled ?? null,
    p_search: opts.search ?? null,
    p_amount_min_minor: opts.amountMinMinor ?? null,
    p_amount_max_minor: opts.amountMaxMinor ?? null,
    p_after_effective_at: opts.afterEffectiveAt ?? null,
    p_after_id: opts.afterId ?? null,
    p_limit: Math.min(opts.limit ?? 50, 200),
  });
  if (error) throw new Error(`ledger_page failed: ${error.message}`);
  const rows = (data ?? []) as LedgerPageRow[];
  const hasMore = rows.length > 0 ? !!rows[0].has_more || rows.some((r) => r.has_more) : false;
  // has_more is duplicated on each row; last row is the cursor when hasMore
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore,
    nextCursor: hasMore && last
      ? { effectiveAt: String(last.effective_at), id: String(last.id) }
      : null,
  };
}

export async function driverPage(opts: {
  organizationId: string;
  from: string;
  to: string;
  driverIds: string[];
  entryTypes?: string[];
  products?: string[];
  platform?: string;
  direction?: string;
  afterEffectiveAt?: string;
  afterId?: string;
  limit?: number;
}): Promise<{ rows: LedgerPageRow[]; hasMore: boolean; nextCursor: { effectiveAt: string; id: string } | null }> {
  const org = requireOrg(opts.organizationId);
  const { from, to } = requireRange(opts.from, opts.to);
  if (!opts.driverIds?.length) throw new Error("ledger driver_page requires driverIds");
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_driver_page", {
    p_org: org,
    p_from: from,
    p_to: to,
    p_driver_ids: opts.driverIds,
    p_entry_types: opts.entryTypes?.length ? opts.entryTypes : null,
    p_products: opts.products?.length ? opts.products : null,
    p_platform: opts.platform ?? null,
    p_direction: opts.direction ?? null,
    p_after_effective_at: opts.afterEffectiveAt ?? null,
    p_after_id: opts.afterId ?? null,
    p_limit: Math.min(opts.limit ?? 50, 200),
  });
  if (error) throw new Error(`ledger_driver_page failed: ${error.message}`);
  const rows = (data ?? []) as LedgerPageRow[];
  const hasMore = rows.length > 0 ? rows.some((r) => r.has_more) : false;
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore,
    nextCursor: hasMore && last
      ? { effectiveAt: String(last.effective_at), id: String(last.id) }
      : null,
  };
}

export async function entryDetail(opts: {
  organizationId: string;
  id: string;
}): Promise<Record<string, unknown> | null> {
  const org = requireOrg(opts.organizationId);
  const id = String(opts.id || "").trim();
  if (!id) throw new Error("ledger entry_detail requires id");
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_entry_detail", {
    p_org: org,
    p_id: id,
  });
  if (error) throw new Error(`ledger_entry_detail failed: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows[0] ?? null;
}

export async function batchTotals(opts: {
  organizationId: string;
  batchId: string;
}): Promise<Array<{
  organization_id: string;
  batch_id: string;
  driver_id: string | null;
  entry_type: string;
  entry_count: number;
  sum_minor: number;
}>> {
  const org = requireOrg(opts.organizationId);
  const batchId = String(opts.batchId || "").trim();
  if (!batchId) throw new Error("ledger_batch_totals requires batch_id");
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_batch_totals", {
    p_org: org,
    p_batch_id: batchId,
  });
  if (error) throw new Error(`ledger_batch_totals failed: ${error.message}`);
  return (data ?? []) as Array<{
    organization_id: string;
    batch_id: string;
    driver_id: string | null;
    entry_type: string;
    entry_count: number;
    sum_minor: number;
  }>;
}

export async function orgVersion(organizationId: string): Promise<{
  organization_id: string;
  entry_seq: number;
  changed_at: string;
} | null> {
  const org = requireOrg(organizationId);
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_org_version", { p_org: org });
  if (error) throw new Error(`ledger_org_version failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    organization_id: string;
    entry_seq: number;
    changed_at: string;
  }>;
  return rows[0] ?? null;
}

/** Map a narrow page row to the legacy canonical event DTO (no full metadata). */
export function mapPageRowToCanonical(row: LedgerPageRow): Record<string, unknown> {
  const meta =
    row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? { ...row.meta }
      : {};
  return mapUnifiedEntryToCanonicalEvent({
    id: row.id,
    organization_id: row.organization_id,
    entry_type: row.entry_type,
    product: row.product,
    amount_minor: row.amount_minor,
    currency: row.currency,
    effective_at: row.effective_at,
    created_at: row.created_at,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    driver_id: row.driver_id,
    platform: row.platform,
    batch_id: row.batch_id,
    is_reconciled: row.is_reconciled,
    metadata: {
      ...meta,
      direction: row.direction,
      vehicleId: row.vehicle_id,
      description: row.description,
      isReconciled: row.is_reconciled,
      platform: row.platform,
      batchId: row.batch_id,
      driverId: row.driver_id,
    },
  });
}

/**
 * Load canonical events via keyset pages (max 200/page). Requires org + date range.
 * Prefer weekSummary for totals-only screens.
 * Hitting the cap with more rows available is an error (never a silent partial).
 */
export async function listCanonicalViaPage(opts: {
  organizationId: string;
  from: string;
  to: string;
  entryTypes?: string[];
  products?: string[];
  platform?: string;
  direction?: string;
  driverIds?: string[];
  batchId?: string;
  /** Hard cap on rows returned (default 1000, max 1000 — L-14). Prefer weekSummary for totals. */
  maxRows?: number;
}): Promise<Record<string, unknown>[]> {
  const maxRows = Math.min(opts.maxRows ?? 1000, 1000);
  const out: Record<string, unknown>[] = [];
  let afterEffectiveAt: string | undefined;
  let afterId: string | undefined;
  let lastHasMore = false;
  while (out.length < maxRows) {
    const page = await ledgerPage({
      ...opts,
      afterEffectiveAt,
      afterId,
      limit: Math.min(200, maxRows - out.length),
    });
    for (const row of page.rows) {
      out.push(mapPageRowToCanonical(row));
    }
    lastHasMore = page.hasMore;
    if (!page.hasMore || !page.nextCursor) break;
    afterEffectiveAt = page.nextCursor.effectiveAt;
    afterId = page.nextCursor.id;
  }
  assertCanonicalPageCap({ fetched: out.length, maxRows, hasMore: lastHasMore });
  return out;
}

/** Cap hit with more rows available is never a silent partial answer. */
export function assertCanonicalPageCap(opts: {
  fetched: number;
  maxRows: number;
  hasMore: boolean;
}): void {
  if (opts.fetched >= opts.maxRows && opts.hasMore) {
    throw new Error("Range too large — narrow the dates");
  }
}

/** Synthetic canonical-shaped rows from week_summary (sums-only screens). */
export function weekSummaryToCanonicalEvents(rows: WeekSummaryRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    eventType: r.entry_type,
    netAmount: Number(r.sum_minor ?? 0) / 100,
    grossAmount: Number(r.gross_minor ?? r.sum_minor ?? 0) / 100,
    date: String(r.week_start || "").slice(0, 10),
    eventAt: r.week_start,
    organizationId: r.organization_id,
    driverId: r.driver_id,
    platform: r.platform,
    direction: r.direction,
    product: r.product,
    entryCount: r.entry_count,
    eventKind: "week_summary",
    schemaVersion: 1,
  }));
}

/** Aggregate week_summary into per-driver / per-type maps for settlement/statement screens. */
export function foldWeekSummaryByDriverType(rows: WeekSummaryRow[]): Map<string, Map<string, number>> {
  const byDriver = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const driver = r.driver_id || "_none";
    let m = byDriver.get(driver);
    if (!m) {
      m = new Map();
      byDriver.set(driver, m);
    }
    const prev = m.get(r.entry_type) ?? 0;
    m.set(r.entry_type, prev + Number(r.sum_minor ?? 0) / 100);
  }
  return byDriver;
}
