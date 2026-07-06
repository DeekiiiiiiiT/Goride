import { unifiedLedgerClient } from "./postEntry.ts";

export type IslandReconciliation = {
  source_system: string;
  legacy_count: number;
  unified_count: number;
  delta: number;
};

/** Phase 15: per-island count reconciliation (legacy source_receipts vs optional legacy counts). */
export async function reconcileLedgerIslands(
  legacyCounts?: Partial<Record<string, number>>,
): Promise<IslandReconciliation[]> {
  const client = unifiedLedgerClient();
  const systems = [
    "rides_payment_journal",
    "kv_ledger_event",
    "kv_toll_ledger",
    "dash_payments",
    "rides_ledger_lines",
  ];

  const results: IslandReconciliation[] = [];

  for (const system of systems) {
    const { count, error } = await client
      .from("ledger_source_receipts")
      .select("id", { count: "exact", head: true })
      .eq("source_system", system);

    if (error) {
      console.error(`[reconcile] ${system}:`, error.message);
      continue;
    }

    const unified = count ?? 0;
    const legacy = legacyCounts?.[system] ?? 0;
    results.push({
      source_system: system,
      legacy_count: legacy,
      unified_count: unified,
      delta: unified - legacy,
    });
  }

  return results;
}

export async function listUnifiedLedgerEntries(opts: {
  organizationId?: string;
  product?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  const client = unifiedLedgerClient();
  let q = client
    .from("ledger_entries")
    .select("*", { count: "exact" })
    .order("effective_at", { ascending: false });

  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  if (opts.product) q = q.eq("product", opts.product);
  if (opts.from) q = q.gte("effective_at", opts.from);
  if (opts.to) q = q.lte("effective_at", opts.to);

  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const { data, error, count } = await q.range(offset, offset + limit - 1);

  if (error) {
    console.error("[unifiedLedger] list entries:", error.message);
    return { entries: [], total: 0 };
  }

  return { entries: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
}
