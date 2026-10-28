import { unifiedLedgerClient } from "./postEntry.ts";
import { signedLedgerAmount } from "../../../../packages/finance-core/src/platformFeeRecognition.ts";

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
    throw new Error(`ledger_reconcile_amounts failed: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    source_system: String(row.source_system ?? ""),
    entry_count: Number(row.entry_count ?? 0),
    total_amount_minor: Number(row.total_amount_minor ?? 0),
    currency: String(row.currency ?? "JMD"),
  }));
}

/** Phase 6 (Enterprise): Check double-entry balance per product — sum in SQL only (L-13). */
export async function checkProductBalances(only?: string[]): Promise<BalanceCheck[]> {
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_product_balances", {
    p_products: only && only.length > 0 ? only : null,
  });

  if (error) {
    console.error("[reconcile] product balances RPC failed:", error.message);
    throw new Error(`ledger_product_balances failed: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    product: String(row.product ?? ""),
    total_debits_minor: Number(row.total_debits_minor ?? 0),
    total_credits_minor: Number(row.total_credits_minor ?? 0),
    net_balance_minor: Number(row.net_balance_minor ?? 0),
    balanced: Boolean(row.balanced),
  }));
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
  const batchId =
    (typeof meta.batchId === "string" && meta.batchId) ||
    (typeof e.batch_id === "string" && e.batch_id) ||
    undefined;
  const description =
    (typeof meta.description === "string" && meta.description) ||
    (typeof e.description === "string" && e.description) ||
    undefined;
  const vehicleId =
    (typeof meta.vehicleId === "string" && meta.vehicleId) || undefined;
  const isReconciled =
    meta.isReconciled === true ||
    meta.isReconciled === "true" ||
    e.is_reconciled === true;

  return {
    id: e.id,
    eventType: e.entry_type,
    netAmount: signedLedgerAmount({
      netAmount: Number(e.amount_minor ?? 0) / 100,
      metadata: meta,
    }),
    grossAmount: grossAmount ?? Math.abs(Number(e.amount_minor ?? 0) / 100),
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
    batchId,
    description,
    vehicleId,
    isReconciled,
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
