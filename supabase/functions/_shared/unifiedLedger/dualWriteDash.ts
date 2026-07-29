import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";
import type { DashCaptureSplit } from "../dashMoneySplit.ts";

export type DashTransactionDualWrite = {
  transactionId: string;
  orderId: string;
  merchantId?: string | null;
  courierId?: string | null;
  amount: number;
  currency?: string;
  kind: "order_capture" | "order_refund" | "merchant_payout" | "courier_payout";
  /** Model A split — when set on order_capture, posts platform / courier / merchant lines. */
  split?: DashCaptureSplit | null;
};

/** Resolve product based on transaction kind */
function resolveDashProduct(kind: DashTransactionDualWrite["kind"]):
  "roam_dash" | "roam_partner" | "roam_courier" {
  switch (kind) {
    case "order_capture":
    case "order_refund":
      return "roam_dash";
    case "merchant_payout":
      return "roam_partner";
    case "courier_payout":
      return "roam_courier";
    default:
      return "roam_dash";
  }
}

/** Phase 10: mirror Dash payments row into ledger.entries. */
export async function dualWriteDashPayment(row: DashTransactionDualWrite): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;

  const currency = row.currency ?? "JMD";
  const product = resolveDashProduct(row.kind);

  // Model A capture: three accrual lines instead of full gross → merchant
  if (row.kind === "order_capture" && row.split) {
    const split = row.split;
    const baseMeta = {
      merchant_id: split.merchantId ?? row.merchantId,
      courier_id: split.courierId ?? row.courierId,
      kind: row.kind,
    };

    if (split.platformFee > 0) {
      await ledgerPostEntry({
        idempotencyKey: `dash_payments:${row.transactionId}:platform`,
        entryType: "order_capture_platform_fee",
        debitAccountKey: "platform:clearing",
        creditAccountKey: "platform:revenue",
        amountMinor: majorToMinor(split.platformFee),
        currency,
        product,
        referenceType: "order",
        referenceId: row.orderId,
        metadata: baseMeta,
        sourceSystem: "dash_payments",
        sourceId: row.transactionId,
      });
    }

    if (split.courierPayable > 0) {
      const courierKey = split.courierId
        ? `courier:${split.courierId}:payable`
        : "courier:unassigned:payable";
      await ledgerPostEntry({
        idempotencyKey: `dash_payments:${row.transactionId}:courier`,
        entryType: "order_capture_courier_payable",
        debitAccountKey: "platform:clearing",
        creditAccountKey: courierKey,
        amountMinor: majorToMinor(split.courierPayable),
        currency,
        product: "roam_courier",
        referenceType: "order",
        referenceId: row.orderId,
        metadata: baseMeta,
        sourceSystem: "dash_payments",
        sourceId: row.transactionId,
      });
    }

    if (split.merchantReceivable > 0 && (split.merchantId || row.merchantId)) {
      const mid = String(split.merchantId || row.merchantId);
      await ledgerPostEntry({
        idempotencyKey: `dash_payments:${row.transactionId}:merchant`,
        entryType: "order_capture",
        debitAccountKey: "platform:clearing",
        creditAccountKey: `merchant:${mid}:receivable`,
        amountMinor: majorToMinor(split.merchantReceivable),
        currency,
        product: "roam_partner",
        referenceType: "order",
        referenceId: row.orderId,
        metadata: baseMeta,
        sourceSystem: "dash_payments",
        sourceId: row.transactionId,
      });
    }
    return;
  }

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
    debitKey = "platform:clearing";
    creditKey = `courier:${row.courierId}:payable`;
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
    currency,
    product,
    referenceType: "order",
    referenceId: row.orderId,
    metadata: { merchant_id: row.merchantId, courier_id: row.courierId, kind: row.kind },
    sourceSystem: "dash_payments",
    sourceId: row.transactionId,
  });
}
