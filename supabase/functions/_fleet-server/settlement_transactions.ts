/**
 * A-11: Indexed mirror for driver settlement transactions.
 * Dual-write on KV persist; read path switches via SETTLEMENT_TX_TABLE_READ=true.
 * PostgREST does not expose ledger — use public.driver_settlement_transactions view.
 */
import { getServiceClient } from "./service_client.ts";
import { periodKeyFor, DEFAULT_FLEET_TZ } from "../../../packages/finance-core/src/periodKey.ts";
import { isSettlementParticipantTransaction } from "../../../packages/finance-core/src/driverCashPayment.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";

function ledgerSb() {
  return getServiceClient();
}

/** @deprecated use isSettlementParticipantTransaction — kept as alias for call sites */
export function isSettlementMirrorTransaction(tx: Record<string, unknown>): boolean {
  return isSettlementParticipantTransaction(tx as Parameters<typeof isSettlementParticipantTransaction>[0]);
}

export function resolveTransactionPeriodAnchor(
  tx: Record<string, unknown>,
  timezone = DEFAULT_FLEET_TZ,
): string | null {
  const meta = (tx.metadata || {}) as Record<string, unknown>;
  const start = meta.workPeriodStart || meta.periodAnchor || meta.settlementWeek;
  if (start) return String(start).slice(0, 10);
  const date = tx.date;
  if (!date) return null;
  return periodKeyFor(String(date), timezone);
}

/** Upsert settlement-participant transaction into indexed table (idempotent). */
export async function mirrorSettlementTransaction(
  tx: Record<string, unknown>,
  timezone?: string,
): Promise<void> {
  if (!tx?.id || !tx?.driverId) return;
  if (!isSettlementParticipantTransaction(tx as Parameters<typeof isSettlementParticipantTransaction>[0])) {
    return;
  }
  const tz = timezone || (await getFleetTimezone());
  const periodAnchor = resolveTransactionPeriodAnchor(tx, tz);
  if (!periodAnchor) return;

  const { error } = await ledgerSb()
    .from("driver_settlement_transactions")
    .upsert(
      {
        driver_id: String(tx.driverId),
        period_anchor: periodAnchor,
        transaction_id: String(tx.id),
        payload: tx,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "driver_id,transaction_id" },
    );
  if (error) {
    console.error("[settlement_transactions] mirror failed:", error.message);
  }
}

/** Load all mirrored txs for a driver (bounded vs global KV scan). */
export async function loadMirroredDriverTransactions(
  driverId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await ledgerSb()
    .from("driver_settlement_transactions")
    .select("payload")
    .eq("driver_id", driverId);
  if (error) {
    console.error("[settlement_transactions] load failed:", error.message);
    return [];
  }
  return (data || []).map((r: { payload: Record<string, unknown> }) => r.payload).filter(Boolean);
}

/** Drop mirror row(s) when the source transaction is deleted (Undo Pay / Collect). */
export async function unmirrorSettlementTransactions(
  transactionIds: string[],
): Promise<void> {
  const ids = [
    ...new Set(
      transactionIds.map((x) => String(x || "").trim()).filter(Boolean),
    ),
  ];
  if (ids.length === 0) return;
  const { error } = await ledgerSb()
    .from("driver_settlement_transactions")
    .delete()
    .in("transaction_id", ids);
  if (error) {
    console.error("[settlement_transactions] unmirror failed:", error.message);
  }
}

export async function unmirrorSettlementTransaction(
  transactionId: string,
): Promise<void> {
  await unmirrorSettlementTransactions([transactionId]);
}

/**
 * Mirror rows whose KV/fleet source is gone keep settlement_paid inflated after Undo.
 * Purge those orphans and return Settlement Week anchors that need a cash re-sync.
 */
export async function purgeOrphanSettlementMirrorsForDriver(
  driverId: string,
): Promise<{ purgedCount: number; periodAnchors: string[] }> {
  const id = String(driverId || "").trim();
  if (!id) return { purgedCount: 0, periodAnchors: [] };

  const mirrored = await loadMirroredDriverTransactions(id);
  if (mirrored.length === 0) return { purgedCount: 0, periodAnchors: [] };

  const txIds = mirrored.map((t) => String(t.id || "").trim()).filter(Boolean);
  if (txIds.length === 0) return { purgedCount: 0, periodAnchors: [] };

  const kv = await import("./kv_store.tsx");
  const liveValues = await kv.mget(txIds.map((txId) => `transaction:${txId}`));

  const orphanIds: string[] = [];
  const anchors = new Set<string>();
  for (let i = 0; i < mirrored.length; i++) {
    if (liveValues[i]) continue;
    const txId = txIds[i];
    if (!txId) continue;
    orphanIds.push(txId);
    const anchor = resolveTransactionPeriodAnchor(mirrored[i]);
    if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) anchors.add(anchor);
  }

  if (orphanIds.length > 0) {
    await unmirrorSettlementTransactions(orphanIds);
    console.warn(
      `[settlement_transactions] purged ${orphanIds.length} orphan mirror(s) driver=${id}`,
    );
  }
  return { purgedCount: orphanIds.length, periodAnchors: [...anchors] };
}

/** Desk Refresh heal: purge orphans for drivers with settlement activity in range, then re-sync weeks. */
export async function repairOrphanSettlementMirrors(opts?: {
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
}): Promise<{ drivers: number; purged: number; weeksSynced: number }> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500);
  let q = ledgerSb()
    .from("driver_financial_periods")
    .select("driver_id")
    .gt("settlement_paid", 0.005)
    .limit(limit * 4);
  if (opts?.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodStart)) {
    q = q.gte("period_anchor", opts.periodStart);
  }
  if (opts?.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodEnd)) {
    q = q.lte("period_anchor", opts.periodEnd);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[settlement_transactions] repair driver list failed:", error.message);
    throw new Error(error.message);
  }

  const driverIds = [
    ...new Set((data || []).map((r: { driver_id: string }) => String(r.driver_id)).filter(Boolean)),
  ].slice(0, limit);

  const { syncPeriodCashFromTransactions } = await import("./driver_financial_periods.ts");
  let purged = 0;
  let weeksSynced = 0;
  for (const driverId of driverIds) {
    const result = await purgeOrphanSettlementMirrorsForDriver(driverId);
    purged += result.purgedCount;
    for (const anchor of result.periodAnchors) {
      await syncPeriodCashFromTransactions(driverId, anchor);
      weeksSynced += 1;
    }
  }
  return { drivers: driverIds.length, purged, weeksSynced };
}

export function settlementTxTableReadEnabled(): boolean {
  // Default ON after A-11 backfill+parity. Set SETTLEMENT_TX_TABLE_READ=false to roll back to fleet scan.
  const raw = Deno.env.get("SETTLEMENT_TX_TABLE_READ");
  if (raw === "false" || raw === "0") return false;
  return true;
}
