import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";

export type DashTransactionDualWrite = {
  transactionId: string;
  orderId: string;
  merchantId?: string | null;
  courierId?: string | null;
  amount: number;
  currency?: string;
  kind: "order_capture" | "order_refund" | "merchant_payout" | "courier_payout";
};

/** Resolve product based on transaction kind */
function resolveDashProduct(kind: DashTransactionDualWrite["kind"]): 
  "roam_dash" | "roam_partner" | "roam_courier" {
  switch (kind) {
    case "order_capture":
    case "order_refund":
      return "roam_dash";      // Customer-facing order payments
    case "merchant_payout":
      return "roam_partner";   // Merchant settlements
    case "courier_payout":
      return "roam_courier";   // Courier payouts
    default:
      return "roam_dash";
  }
}

/** Phase 10: mirror Dash payments row into ledger.entries. */
export async function dualWriteDashPayment(row: DashTransactionDualWrite): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;

  const amountMinor = majorToMinor(Math.abs(row.amount));
  if (amountMinor <= 0) return;

  let debitKey = "platform:clearing";
  let creditKey = "platform:receivable";
  let entryType = row.kind;

  if (row.kind === "order_capture" && row.merchantId) {
    debitKey = "platform:clearing";
    creditKey = `merchant:${row.merchantId}:receivable`;
    entryType = "order_capture";
  } else if (row.kind === "order_refund" && row.merchantId) {
    debitKey = `merchant:${row.merchantId}:receivable`;
    creditKey = "platform:clearing";
    entryType = "order_refund";
  } else if (row.kind === "merchant_payout" && row.merchantId) {
    debitKey = `merchant:${row.merchantId}:receivable`;
    creditKey = "platform:clearing";
  } else if (row.kind === "courier_payout" && row.courierId) {
    // Use proper courier payable account
    debitKey = "platform:clearing";
    creditKey = `courier:${row.courierId}:payable`;
  } else if (row.kind === "courier_payout") {
    // Fallback when no courierId
    debitKey = "platform:clearing";
    creditKey = "platform:receivable";
  }

  const product = resolveDashProduct(row.kind);

  await ledgerPostEntry({
    idempotencyKey: `dash_payments:${row.transactionId}`,
    entryType,
    debitAccountKey: debitKey,
    creditAccountKey: creditKey,
    amountMinor,
    currency: row.currency ?? "JMD",
    product,
    referenceType: "order",
    referenceId: row.orderId,
    metadata: { merchant_id: row.merchantId, courier_id: row.courierId, kind: row.kind },
    sourceSystem: "dash_payments",
    sourceId: row.transactionId,
  });
}
