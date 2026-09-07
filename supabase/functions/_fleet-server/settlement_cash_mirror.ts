/**
 * Mirror Log Cash / Driver Payout txs into settlement_movements so Done always
 * has one ledger. Idempotent on source_transaction_id / idempotency_key.
 */
import { getServiceClient } from "./service_client.ts";

function ymd(v: unknown): string {
  return String(v || "").slice(0, 10);
}

function isClearedStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase().trim();
  return s === "completed" || s === "verified";
}

function isReversedOrVoid(status: unknown): boolean {
  const s = String(status || "").toLowerCase().trim();
  return s === "reversed" || s === "void" || s === "cancelled" || s === "canceled";
}

/** Map a wallet cash tx into a settlement_movements kind, or null if not mirrored. */
export function movementKindForCashTx(tx: Record<string, unknown>): "collect" | "pay" | null {
  const cat = String(tx.category || "");
  const type = String(tx.type || "");
  if (cat === "Cash Collection" || type === "Payment_Received") return "collect";
  if (cat === "Driver Payouts" || type === "Payout") return "pay";
  return null;
}

/**
 * After Log Cash / payout verify: ensure a posted settlement_movement exists.
 * When the tx is reversed, void any linked movement.
 */
export async function syncSettlementMovementFromCashTx(
  tx: unknown,
  organizationId: string | null | undefined,
): Promise<void> {
  if (!tx || typeof tx !== "object" || !organizationId) return;
  const rec = tx as Record<string, unknown>;
  const kind = movementKindForCashTx(rec);
  if (!kind) return;

  const txId = String(rec.id || "").trim();
  const driverId = String(rec.driverId || "").trim();
  const weekAnchor = ymd(
    (rec.metadata as { workPeriodStart?: string } | undefined)?.workPeriodStart || rec.date,
  );
  if (!txId || !driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor)) return;

  const sb = getServiceClient();
  const idempotencyKey = `log_cash_mirror:${txId}`;
  const amountMinor = Math.round(Math.abs(Number(rec.amount) || 0) * 100);
  if (amountMinor <= 0) return;

  if (isReversedOrVoid(rec.status)) {
    await sb
      .from("settlement_movements")
      .update({ status: "void", metadata: { mirroredFrom: "cash_tx", voidedBecause: "tx_reversed" } })
      .eq("organization_id", organizationId)
      .eq("source_transaction_id", txId)
      .neq("status", "void");
    return;
  }

  if (!isClearedStatus(rec.status)) return;

  const { data: existing } = await sb
    .from("settlement_movements")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("source_transaction_id", txId)
    .maybeSingle();

  if (existing?.id) {
    if (String(existing.status) !== "posted") {
      await sb
        .from("settlement_movements")
        .update({ status: "posted" })
        .eq("id", existing.id);
    }
    return;
  }

  const { error } = await sb.from("settlement_movements").insert({
    organization_id: organizationId,
    driver_id: driverId,
    period_anchor: weekAnchor,
    kind,
    amount_minor: amountMinor,
    method: String(rec.paymentMethod || "Cash") || "Cash",
    reference: rec.referenceNumber ? String(rec.referenceNumber) : null,
    reason: rec.description ? String(rec.description) : "Cash Payment from Driver",
    idempotency_key: idempotencyKey,
    approval_state: "none",
    status: "posted",
    source_transaction_id: txId,
    metadata: { mirroredFrom: "cash_tx", engine: "syncSettlementMovementFromCashTx@1" },
  });

  // Unique idempotency race — treat as success.
  if (error && !/duplicate|unique/i.test(error.message || "")) {
    console.warn("[settlement_mirror] insert failed", txId, error.message);
  }
}
