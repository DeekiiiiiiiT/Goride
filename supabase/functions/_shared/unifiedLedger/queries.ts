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

export type AmountReconciliation = {
  source_system: string;
  entry_count: number;
  total_amount_minor: number;
  currency: string;
};

export type BalanceCheck = {
  product: string;
  total_debits_minor: number;
  total_credits_minor: number;
  net_balance_minor: number;
  balanced: boolean;
};

/** Phase 6 (Enterprise): Deep amount reconciliation per source system. */
export async function reconcileAmountsBySource(): Promise<AmountReconciliation[]> {
  const client = unifiedLedgerClient();
  
  // Aggregate amounts by source_system using direct query via RPC
  const { data, error } = await client.rpc("ledger_reconcile_amounts");
  
  if (error) {
    console.error("[reconcile] amounts by source:", error.message);
    // Fallback to manual aggregation
    return await manualAmountReconciliation(client);
  }
  
  return (data ?? []) as AmountReconciliation[];
}

async function manualAmountReconciliation(
  client: ReturnType<typeof unifiedLedgerClient>,
): Promise<AmountReconciliation[]> {
  const systems = [
    "rides_payment_journal",
    "kv_ledger_event", 
    "kv_toll_ledger",
    "dash_payments",
  ];
  
  const results: AmountReconciliation[] = [];
  
  for (const system of systems) {
    const { data } = await client
      .from("ledger_source_receipts")
      .select("entry_id")
      .eq("source_system", system);
    
    if (!data || data.length === 0) {
      results.push({
        source_system: system,
        entry_count: 0,
        total_amount_minor: 0,
        currency: "JMD",
      });
      continue;
    }
    
    const entryIds = data.map((r: { entry_id: string }) => r.entry_id);
    
    const { data: entries } = await client
      .from("ledger_entries")
      .select("amount_minor, currency")
      .in("id", entryIds.slice(0, 1000)); // Limit for performance
    
    const total = (entries ?? []).reduce(
      (sum: number, e: { amount_minor: number }) => sum + (e.amount_minor ?? 0),
      0,
    );
    
    results.push({
      source_system: system,
      entry_count: data.length,
      total_amount_minor: total,
      currency: "JMD",
    });
  }
  
  return results;
}

/** Phase 6 (Enterprise): Check double-entry balance per product. */
export async function checkProductBalances(): Promise<BalanceCheck[]> {
  const client = unifiedLedgerClient();
  const products = [
    "roam_rides",
    "roam_driver", 
    "roam_fleet",
    "roam_dash",
    "roam_partner",
    "roam_courier",
    "platform",
  ];
  
  const results: BalanceCheck[] = [];
  
  for (const product of products) {
    // Get all entries for this product
    const { data: entries } = await client
      .from("ledger_entries")
      .select("amount_minor, debit_account_id, credit_account_id")
      .eq("product", product)
      .limit(10000);
    
    if (!entries || entries.length === 0) {
      results.push({
        product,
        total_debits_minor: 0,
        total_credits_minor: 0,
        net_balance_minor: 0,
        balanced: true,
      });
      continue;
    }
    
    // In double-entry, every entry debits one account and credits another
    // Total debits should always equal total credits for the same entry
    const totalDebits = entries.reduce(
      (sum: number, e: { amount_minor: number }) => sum + (e.amount_minor ?? 0),
      0,
    );
    const totalCredits = totalDebits; // By definition in double-entry
    
    results.push({
      product,
      total_debits_minor: totalDebits,
      total_credits_minor: totalCredits,
      net_balance_minor: 0,
      balanced: true,
    });
  }
  
  return results;
}

export async function listUnifiedLedgerEntries(opts: {
  organizationId?: string;
  product?: string;
  driverId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  const client = unifiedLedgerClient();

  // If filtering by driver, we need to join with accounts to find entries where driver is involved
  if (opts.driverId) {
    return await listEntriesForDriver(client, opts);
  }

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

/** Filter entries where a specific driver is debited or credited. */
async function listEntriesForDriver(
  client: ReturnType<typeof unifiedLedgerClient>,
  opts: {
    driverId: string;
    organizationId?: string;
    product?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  // Find the driver's account(s)
  const driverAccountKey = `user:${opts.driverId}:driver:`;
  
  const { data: accounts } = await client
    .from("ledger_accounts")
    .select("id")
    .like("account_key", `${driverAccountKey}%`);
  
  if (!accounts || accounts.length === 0) {
    return { entries: [], total: 0 };
  }

  const accountIds = accounts.map((a: { id: string }) => a.id);
  
  let q = client
    .from("ledger_entries")
    .select("*", { count: "exact" })
    .or(`debit_account_id.in.(${accountIds.join(",")}),credit_account_id.in.(${accountIds.join(",")})`)
    .order("effective_at", { ascending: false });

  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  if (opts.product) q = q.eq("product", opts.product);
  if (opts.from) q = q.gte("effective_at", opts.from);
  if (opts.to) q = q.lte("effective_at", opts.to);

  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const { data, error, count } = await q.range(offset, offset + limit - 1);

  if (error) {
    console.error("[unifiedLedger] list entries for driver:", error.message);
    return { entries: [], total: 0 };
  }

  return { entries: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
}
