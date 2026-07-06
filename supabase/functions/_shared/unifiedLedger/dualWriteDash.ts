import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";

export type DashTransactionDualWrite = {
  transactionId: string;
  orderId: string;
  merchantId?: string | null;
  amount: number;
  currency?: string;
  kind: "order_capture" | "order_refund" | "merchant_payout" | "courier_payout";
};

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
  } else if (row.kind === "courier_payout") {
    debitKey = "platform:clearing";
    creditKey = "platform:receivable";
  }

  await ledgerPostEntry({
    idempotencyKey: `dash_payments:${row.transactionId}`,
    entryType,
    debitAccountKey: debitKey,
    creditAccountKey: creditKey,
    amountMinor,
    currency: row.currency ?? "JMD",
    product: "dash",
    referenceType: "order",
    referenceId: row.orderId,
    metadata: { merchant_id: row.merchantId, kind: row.kind },
    sourceSystem: "dash_payments",
    sourceId: row.transactionId,
  });
}
