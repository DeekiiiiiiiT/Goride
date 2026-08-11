import { unifiedLedgerClient } from "./postEntry.ts";

export type IslandReconciliation = {
  source_system: string;
  legacy_count: number;
  unified_count: number;
  delta: number;
};

/** Phase 15: per-island count reconciliation (legacy stores vs unified receipts). */
export async function reconcileLedgerIslands(): Promise<IslandReconciliation[]> {
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_reconcile_islands");

  if (error) {
    console.error("[reconcile] islands RPC failed:", error.message);
    throw new Error(`ledger_reconcile_islands failed: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    source_system: String(row.source_system ?? ""),
    legacy_count: Number(row.legacy_count ?? 0),
    unified_count: Number(row.unified_count ?? 0),
    delta: Number(row.delta ?? 0),
  }));
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

  const { data, error } = await client.rpc("ledger_reconcile_amounts");

  if (error) {
    console.error("[reconcile] amounts by source:", error.message);
    return await manualAmountReconciliation(client);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    source_system: String(row.source_system ?? ""),
    entry_count: Number(row.entry_count ?? 0),
    total_amount_minor: Number(row.total_amount_minor ?? 0),
    currency: String(row.currency ?? "JMD"),
  }));
}

async function manualAmountReconciliation(
  client: ReturnType<typeof unifiedLedgerClient>,
): Promise<AmountReconciliation[]> {
  const systems = [
    "rides_payment_journal",
    "kv_ledger_event",
    "kv_toll_ledger",
    "dash_payments",
    "financial_event",
    "rides_ledger_lines",
  ];

  const results: AmountReconciliation[] = [];

  for (const system of systems) {
    const { data, error } = await client
      .from("ledger_source_receipts")
      .select("ledger_entry_id")
      .eq("source_system", system);

    if (error) {
      console.error(`[reconcile] amounts ${system}:`, error.message);
      throw new Error(`ledger_source_receipts ${system}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      results.push({
        source_system: system,
        entry_count: 0,
        total_amount_minor: 0,
        currency: "JMD",
      });
      continue;
    }

    const entryIds = data.map((r: { ledger_entry_id: string }) => r.ledger_entry_id);

    const { data: entries, error: entriesError } = await client
      .from("ledger_entries")
      .select("amount_minor, currency")
      .in("id", entryIds.slice(0, 1000));

    if (entriesError) {
      console.error(`[reconcile] entry amounts ${system}:`, entriesError.message);
      throw new Error(`ledger_entries ${system}: ${entriesError.message}`);
    }

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
    "roam_enterprise",
    "platform",
  ];

  const results: BalanceCheck[] = [];

  for (const product of products) {
    const { data: entries, error } = await client
      .from("ledger_entries")
      .select("amount_minor, debit_account_id, credit_account_id")
      .eq("product", product)
      .limit(10000);

    if (error) {
      console.error(`[reconcile] balances ${product}:`, error.message);
      throw new Error(`ledger_entries balances ${product}: ${error.message}`);
    }

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

    // Real double-entry: every entry contributes equally to both sides by construction
    // of ledger.post_entry. Detect corruption where debit_account_id = credit_account_id
    // (self-ref) or amount <= 0.
    let totalDebits = 0;
    let totalCredits = 0;
    let selfRef = 0;
    for (const e of entries as Array<{
      amount_minor: number;
      debit_account_id: string;
      credit_account_id: string;
    }>) {
      const amt = Math.abs(e.amount_minor ?? 0);
      if (e.debit_account_id === e.credit_account_id) {
        selfRef += 1;
        continue;
      }
      totalDebits += amt;
      totalCredits += amt;
    }

    const balanced = selfRef === 0 && totalDebits === totalCredits;
    results.push({
      product,
      total_debits_minor: totalDebits,
      total_credits_minor: totalCredits,
      net_balance_minor: totalDebits - totalCredits,
      balanced,
    });
  }

  return results;
}

export async function listUnifiedLedgerEntries(opts: {
  organizationId?: string;
  product?: string;
  /** Prefer this over product when multiple roam_* products apply */
  products?: string[];
  /** Filter by ledger.entries.entry_type (maps from canonical eventType). */
  entryTypes?: string[];
  sourceSystem?: string;
  driverId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  const client = unifiedLedgerClient();

  if (opts.driverId) {
    return await listEntriesForDriver(client, opts);
  }

  let q = client
    .from("ledger_entries")
    .select("*", { count: "exact" })
    .order("effective_at", { ascending: false });

  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  if (opts.products && opts.products.length > 0) {
    q = q.in("product", opts.products);
  } else if (opts.product) {
    q = q.eq("product", opts.product);
  }
  if (opts.entryTypes && opts.entryTypes.length === 1) {
    q = q.eq("entry_type", opts.entryTypes[0]);
  } else if (opts.entryTypes && opts.entryTypes.length > 1) {
    q = q.in("entry_type", opts.entryTypes);
  }
  if (opts.from) q = q.gte("effective_at", opts.from);
  if (opts.to) q = q.lte("effective_at", opts.to);

  // Optional filter via receipts (source island)
  if (opts.sourceSystem) {
    const { data: receipts, error: rErr } = await client
      .from("ledger_source_receipts")
      .select("ledger_entry_id")
      .eq("source_system", opts.sourceSystem)
      .limit(5000);
    if (rErr) throw new Error(rErr.message);
    const ids = (receipts ?? []).map((r: { ledger_entry_id: string }) => r.ledger_entry_id);
    if (ids.length === 0) return { entries: [], total: 0 };
    q = q.in("id", ids);
  }

  // Bank Deposits / Settlement page at 500; keep a hard cap for safety.
  const limit = Math.min(opts.limit ?? 50, 500);
  const offset = opts.offset ?? 0;
  const { data, error, count } = await q.range(offset, offset + limit - 1);

  if (error) {
    console.error("[unifiedLedger] list entries:", error.message);
    throw new Error(`ledger_entries list failed: ${error.message}`);
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
    products?: string[];
    entryTypes?: string[];
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: Record<string, unknown>[]; total: number }> {
  const driverAccountKey = `user:${opts.driverId}:driver:`;

  const { data: accounts, error: accountsError } = await client
    .from("ledger_accounts")
    .select("id")
    .like("account_key", `${driverAccountKey}%`);

  if (accountsError) {
    console.error("[unifiedLedger] driver accounts:", accountsError.message);
    throw new Error(`ledger_accounts lookup failed: ${accountsError.message}`);
  }

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
  if (opts.products && opts.products.length > 0) {
    q = q.in("product", opts.products);
  } else if (opts.product) {
    q = q.eq("product", opts.product);
  }
  if (opts.entryTypes && opts.entryTypes.length === 1) {
    q = q.eq("entry_type", opts.entryTypes[0]);
  } else if (opts.entryTypes && opts.entryTypes.length > 1) {
    q = q.in("entry_type", opts.entryTypes);
  }
  if (opts.from) q = q.gte("effective_at", opts.from);
  if (opts.to) q = q.lte("effective_at", opts.to);

  const limit = Math.min(opts.limit ?? 50, 500);
  const offset = opts.offset ?? 0;
  const { data, error, count } = await q.range(offset, offset + limit - 1);

  if (error) {
    console.error("[unifiedLedger] list entries for driver:", error.message);
    throw new Error(`ledger_entries driver list failed: ${error.message}`);
  }

  return { entries: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
}

/** Map unified ledger.entries row → legacy canonical ledger_event DTO (Bank Deposits / Settlement). */
export function mapUnifiedEntryToCanonicalEvent(
  e: Record<string, unknown>,
  opts?: { debitAccountKey?: string; creditAccountKey?: string },
): Record<string, unknown> {
  const meta =
    e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
      ? { ...(e.metadata as Record<string, unknown>) }
      : {};
  const date = String(e.effective_at ?? "").slice(0, 10);

  const driverFromAccounts =
    parseDriverIdFromAccountKey(opts?.creditAccountKey) ||
    parseDriverIdFromAccountKey(opts?.debitAccountKey) ||
    undefined;

  const driverId =
    (typeof meta.driverId === "string" && meta.driverId) ||
    (typeof e.driver_id === "string" && e.driver_id) ||
    driverFromAccounts ||
    undefined;

  const directionRaw = String(meta.direction || "").toLowerCase();
  let direction: "inflow" | "outflow" | "neutral" =
    directionRaw === "outflow" || directionRaw === "inflow" || directionRaw === "neutral"
      ? (directionRaw as "inflow" | "outflow" | "neutral")
      : "inflow";
  // Infer direction from GL legs when metadata missing: driver credit = inflow.
  if (!meta.direction && opts?.creditAccountKey && opts?.debitAccountKey) {
    const creditDriver = parseDriverIdFromAccountKey(opts.creditAccountKey);
    const debitDriver = parseDriverIdFromAccountKey(opts.debitAccountKey);
    if (creditDriver && !debitDriver) direction = "inflow";
    else if (debitDriver && !creditDriver) direction = "outflow";
  }

  const platform =
    (typeof meta.platform === "string" && meta.platform) ||
    (typeof e.platform === "string" && e.platform) ||
    undefined;
  const paymentMethod =
    (typeof meta.paymentMethod === "string" && meta.paymentMethod) || undefined;
  const grossAmount =
    meta.grossAmount != null && Number.isFinite(Number(meta.grossAmount))
      ? Number(meta.grossAmount)
      : undefined;
  const category = typeof meta.category === "string" ? meta.category : undefined;

  return {
    id: e.id,
    eventType: e.entry_type,
    netAmount: Number(e.amount_minor ?? 0) / 100,
    grossAmount,
    currency: e.currency ?? "JMD",
    date,
    eventAt: e.effective_at,
    createdAt: e.created_at,
    periodStart: meta.periodStart ?? undefined,
    periodEnd: meta.periodEnd ?? undefined,
    sourceType: e.reference_type,
    sourceId: e.reference_id,
    organizationId: e.organization_id,
    driverId,
    platform,
    paymentMethod,
    category,
    metadata: meta,
    direction,
    eventKind: "canonical",
    schemaVersion: 1,
  };
}

export function parseDriverIdFromAccountKey(accountKey: string | undefined | null): string | null {
  if (!accountKey) return null;
  const m = String(accountKey).match(/^user:([^:]+):driver(?::|$)/i);
  return m?.[1] || null;
}

/**
 * Page through unified ledger.entries and map to canonical event DTOs.
 * Enriches driverId/direction from account keys when metadata is thin.
 */
export async function listAllUnifiedCanonicalEvents(opts: {
  organizationId?: string;
  products?: string[];
  entryTypes?: string[];
  driverId?: string;
  from?: string;
  to?: string;
  /** Hard cap on rows scanned (default 50_000). */
  maxRows?: number;
}): Promise<Record<string, unknown>[]> {
  const client = unifiedLedgerClient();
  const pageSize = 500;
  const maxRows = opts.maxRows ?? 50_000;
  const out: Record<string, unknown>[] = [];
  const accountKeyById = new Map<string, string>();

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { entries, total } = await listUnifiedLedgerEntries({
      organizationId: opts.organizationId,
      products: opts.products ?? ["roam_driver", "roam_fleet"],
      entryTypes: opts.entryTypes,
      driverId: opts.driverId,
      from: opts.from,
      to: opts.to,
      limit: pageSize,
      offset,
    });
    if (entries.length === 0) break;

    const needIds = new Set<string>();
    for (const e of entries) {
      const d = String(e.debit_account_id || "");
      const c = String(e.credit_account_id || "");
      if (d && !accountKeyById.has(d)) needIds.add(d);
      if (c && !accountKeyById.has(c)) needIds.add(c);
    }
    if (needIds.size > 0) {
      const { data: accts } = await client
        .from("ledger_accounts")
        .select("id, account_key")
        .in("id", [...needIds]);
      for (const a of accts || []) {
        accountKeyById.set(String((a as { id: string }).id), String((a as { account_key: string }).account_key));
      }
    }

    for (const e of entries) {
      out.push(
        mapUnifiedEntryToCanonicalEvent(e, {
          debitAccountKey: accountKeyById.get(String(e.debit_account_id || "")),
          creditAccountKey: accountKeyById.get(String(e.credit_account_id || "")),
        }),
      );
    }
    if (entries.length < pageSize || out.length >= total) break;
  }

  return out;
}

/**
 * Org bank deposits can exist twice after re-import dual-writes (same Uber week/amount).
 * Keep the newest createdAt for each orgUuid+date+amount key.
 */
export function dedupeOrgBankCanonicalEvents(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const orgBest = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const isOrg =
      meta.recipient === "org" ||
      meta.source === "payments_organization" ||
      meta.bankRole === "org_deposit";
    if (!isOrg || String(row.eventType || "") !== "payout_bank") {
      out.push(row);
      continue;
    }
    const orgUuid = String(meta.organizationUuid || row.organizationId || "");
    const date = String(row.date || "").slice(0, 10);
    const amt = Math.round(Math.abs(Number(row.netAmount) || 0) * 100);
    const key = `${orgUuid}|${date}|${amt}`;
    const prev = orgBest.get(key);
    if (!prev) {
      orgBest.set(key, row);
      continue;
    }
    const prevCreated = String(prev.createdAt || "");
    const nextCreated = String(row.createdAt || "");
    if (nextCreated >= prevCreated) orgBest.set(key, row);
  }

  out.push(...orgBest.values());
  return out;
}

/** Filter mapped canonical events by platform label (Uber/Roam/InDrive; GoRide→Roam). */
export function filterCanonicalEventsByPlatform(
  rows: Record<string, unknown>[],
  platform: string,
): Record<string, unknown>[] {
  const want = String(platform || "").toLowerCase();
  return rows.filter((e) => {
    const raw = e.platform === "GoRide" ? "Roam" : e.platform;
    const p = String(raw || "").toLowerCase();
    if (want === "roam") return p === "roam" || p === "goride";
    if (want === "indrive") return p.includes("indrive") || p.includes("in_drive");
    if (want === "uber") return p.includes("uber");
    return p === want;
  });
}
