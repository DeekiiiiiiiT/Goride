import { shouldPostUnifiedLedger } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";
import { logDualWriteMetric } from "./metrics.ts";
import type { DashCaptureSplit } from "../dashMoneySplit.ts";

export type DashTransactionDualWrite = {
  transactionId: string;
  orderId: string;
  merchantId?: string | null;
  courierId?: string | null;
  amount: number;
  currency?: string;
  kind: "order_capture" | "order_refund" | "merchant_payout" | "merchant_payout_reversal" | "courier_payout";
  /** Marketplace capture split — when set on order_capture, posts platform / courier / merchant lines. */
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
    case "merchant_payout_reversal":
      return "roam_partner";
    case "courier_payout":
      return "roam_courier";
    default:
      return "roam_dash";
  }
}

/** Phase 10: mirror Dash payments row into ledger.entries. */
export async function dualWriteDashPayment(row: DashTransactionDualWrite): Promise<void> {
  if (!shouldPostUnifiedLedger("dash_payments")) {
    logDualWriteMetric({
      source_system: "dash_payments",
      status: "skipped",
      reason: "flag_off",
      source_id: row.transactionId,
      entry_type: row.kind,
    });
    return;
  }

  try {
    const outcome = await dualWriteDashPaymentInner(row);
    if (outcome === "ok") {
      logDualWriteMetric({
        source_system: "dash_payments",
        status: "ok",
        reason: "posted",
        source_id: row.transactionId,
        entry_type: row.kind,
      });
    }
  } catch (e) {
    logDualWriteMetric({
      source_system: "dash_payments",
      status: "fail",
      reason: e instanceof Error ? e.message : String(e),
      source_id: row.transactionId,
      entry_type: row.kind,
    });
    throw e;
  }
}

async function dualWriteDashPaymentInner(
  row: DashTransactionDualWrite,
): Promise<"ok" | "skipped"> {
  const currency = row.currency ?? "JMD";
  const product = resolveDashProduct(row.kind);

  // Marketplace capture: three accrual lines instead of full gross → merchant
  if (row.kind === "order_capture" && row.split) {
    const split = row.split;
    const baseMeta = {
      merchant_id: split.merchantId ?? row.merchantId,
      courier_id: split.courierId ?? row.courierId,
      kind: row.kind,
    };

    // Signed platform take: positive = revenue; negative = delivery subsidy / promo absorb.
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
    } else if (split.platformFee < 0) {
      await ledgerPostEntry({
        idempotencyKey: `dash_payments:${row.transactionId}:platform_subsidy`,
        entryType: "order_capture_platform_subsidy",
        debitAccountKey: "platform:revenue",
        creditAccountKey: "platform:clearing",
        amountMinor: majorToMinor(Math.abs(split.platformFee)),
        currency,
        product,
        referenceType: "order",
        referenceId: row.orderId,
        metadata: { ...baseMeta, subsidy: true },
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
    return "ok";
  }

  const amountMinor = majorToMinor(Math.abs(row.amount));
  if (amountMinor <= 0) {
    logDualWriteMetric({
      source_system: "dash_payments",
      status: "skipped",
      reason: "zero_amount",
      source_id: row.transactionId,
      entry_type: row.kind,
      amount_minor: amountMinor,
    });
    return "skipped";
  }

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
  } else if (row.kind === "merchant_payout_reversal" && row.merchantId) {
    debitKey = "platform:clearing";
    creditKey = `merchant:${row.merchantId}:receivable`;
  } else if (row.kind === "courier_payout" && row.courierId) {
    debitKey = `courier:${row.courierId}:payable`;
    creditKey = "platform:clearing";
  } else if (row.kind === "courier_payout") {
    debitKey = "platform:receivable";
    creditKey = "platform:clearing";
  }

  await ledgerPostEntry({
    idempotencyKey: `dash_payments:${row.transactionId}`,
    entryType,
    debitAccountKey: debitKey,
    creditAccountKey: creditKey,
    amountMinor,
    currency,
    product,
    referenceType: row.kind.includes("payout") ? "payout" : "order",
    referenceId: row.orderId,
    metadata: { merchant_id: row.merchantId, courier_id: row.courierId, kind: row.kind },
    sourceSystem: "dash_payments",
    sourceId: row.transactionId,
  });
  return "ok";
}

