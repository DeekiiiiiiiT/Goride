/**
 * A-11: Indexed mirror for driver settlement transactions.
 * Dual-write on KV persist; read path switches via SETTLEMENT_TX_TABLE_READ=true.
 */
import { getServiceClientWithSchema } from "./service_client.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";
import { DEFAULT_FLEET_TZ } from "../../../packages/finance-core/src/periodKey.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";
import {
  isDriverCashPaymentTransaction,
  isDriverPayoutTransaction,
} from "../../../packages/finance-core/src/driverCashPayment.ts";

function ledgerSb() {
  return getServiceClientWithSchema("ledger");
}

export function isSettlementMirrorTransaction(tx: Record<string, unknown>): boolean {
  return isDriverCashPaymentTransaction(tx) || isDriverPayoutTransaction(tx);
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
  if (!isSettlementMirrorTransaction(tx)) return;
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

export function settlementTxTableReadEnabled(): boolean {
  return Deno.env.get("SETTLEMENT_TX_TABLE_READ") === "true";
}
