/** Debit-positive journal lines. Every builder must sum to zero. */
import { computeDashCaptureSplit, type DashOrderFeeFields } from "../dashMoneySplit.ts";
import { scaleShortCollection } from "./shortCollection.ts";

export type JournalLine = {
  kind: string;
  party_type: "customer" | "courier" | "merchant" | "order" | "platform";
  party_id: string | null;
  component: string;
  amount_minor: number;
};

function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function linesBalance(lines: JournalLine[]): boolean {
  return lines.reduce((sum, line) => sum + line.amount_minor, 0) === 0 && lines.length >= 2;
}

export function walletDebtPayLines(customerId: string, amountMajor: number): JournalLine[] {
  const minor = toMinor(amountMajor);
  return [
    { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: minor },
    { kind: "customer_wallet", party_type: "customer", party_id: customerId, component: "", amount_minor: -minor },
  ];
}

export function captureLines(orderId: string, amountMajor: number): JournalLine[] {
  const minor = toMinor(amountMajor);
  return [
    { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: minor },
    { kind: "order_clearing", party_type: "order", party_id: orderId, component: "holding", amount_minor: -minor },
  ];
}

export function settleLines(order: DashOrderFeeFields, orderId: string, captureMajor: number): JournalLine[] {
  const split = computeDashCaptureSplit(order, captureMajor);
  const capture = toMinor(split.captureAmount);
  const merchant = toMinor(split.merchantReceivable);
  const courier = toMinor(split.courierPayable);
  const platform = capture - merchant - courier;
  const lines: JournalLine[] = [
    { kind: "order_clearing", party_type: "order", party_id: orderId, component: "holding", amount_minor: capture },
    { kind: "merchant_payable", party_type: "merchant", party_id: split.merchantId, component: "food", amount_minor: -merchant },
    { kind: "courier_earnings", party_type: "courier", party_id: split.courierId, component: "delivery", amount_minor: -courier },
  ];
  if (platform !== 0) {
    lines.push({
      kind: platform > 0 ? "platform_revenue" : "platform_cost",
      party_type: "platform",
      party_id: null,
      component: platform > 0 ? "fees" : "subsidy",
      amount_minor: -platform,
    });
  }
  return lines.filter((line) => line.amount_minor !== 0);
}

export function codShortLines(customerId: string, orderId: string, shortfallMajor: number): JournalLine[] {
  const minor = toMinor(shortfallMajor);
  return [
    { kind: "customer_wallet", party_type: "customer", party_id: customerId, component: "", amount_minor: minor },
    { kind: "cod_clearing", party_type: "order", party_id: orderId, component: "shortfall", amount_minor: -minor },
  ];
}

/** Cash the courier is holding. The remittance book uses this. The ledger does not scale the restaurant. */
export function allocatedCash(order: DashOrderFeeFields & { total?: number | null }, collectedMajor: number) {
  const fullTotal = Number(order.total ?? collectedMajor);
  const split = computeDashCaptureSplit(order, fullTotal);
  const bag = toMinor(fullTotal);
  const merchantFull = toMinor(split.merchantReceivable);
  const courierFull = toMinor(split.courierPayable);
  const platformFull = bag - merchantFull - courierFull;
  const scaled = scaleShortCollection({
    bagMinor: bag,
    platformMinor: platformFull,
    merchantMinor: merchantFull,
    courierMinor: courierFull,
    collectedMinor: toMinor(collectedMajor),
  });
  const merchant = scaled.merchantMinor;
  const courierKept = scaled.courierMinor;
  const collected = scaled.bagMinor;
  const platform = collected - merchant - courierKept;
  return { split, collected, merchant, courierKept, platform };
}

/** Cash the courier already kept is not courier earnings, so a later payout does not pay it again.
 *  The restaurant is credited its full food share. Roam's line is whatever is left, and may be negative.
 */
export function cashSettleLines(order: DashOrderFeeFields & { total?: number | null }, orderId: string, collectedMajor: number): JournalLine[] {
  const { split, collected, courierKept } = allocatedCash(order, collectedMajor);
  const merchant = toMinor(split.merchantReceivable);
  const platform = collected - merchant - courierKept;
  const lines: JournalLine[] = [
    { kind: "cod_clearing", party_type: "order", party_id: orderId, component: "collected", amount_minor: collected },
    { kind: "merchant_payable", party_type: "merchant", party_id: split.merchantId, component: "food", amount_minor: -merchant },
    { kind: "courier_cash_earned", party_type: "courier", party_id: split.courierId, component: "cash_kept", amount_minor: -courierKept },
  ];
  if (platform !== 0) {
    lines.push({
      kind: platform > 0 ? "platform_revenue" : "platform_cost",
      party_type: "platform",
      party_id: null,
      component: platform > 0 ? "fees" : "subsidy",
      amount_minor: -platform,
    });
  }
  return lines.filter((line) => line.amount_minor !== 0);
}

/** Top up a restaurant that was credited less than its full food share on a short cash order. */
export function merchantShortTopUpLines(
  order: DashOrderFeeFields & { total?: number | null },
  alreadyCreditedMinor: number,
): JournalLine[] {
  const split = computeDashCaptureSplit(order, Number(order.total ?? 0));
  const gap = toMinor(split.merchantReceivable) - Math.round(alreadyCreditedMinor);
  if (gap <= 0 || !split.merchantId) return [];
  return [
    { kind: "platform_cost", party_type: "platform", party_id: null, component: "subsidy", amount_minor: gap },
    { kind: "merchant_payable", party_type: "merchant", party_id: split.merchantId, component: "food", amount_minor: -gap },
  ];
}

/** Pay the party back. The dispute reserve stays closed, and Roam takes the cost. */
export function deductionReversalLines(original: JournalLine[]): JournalLine[] {
  return original.flatMap((row) => {
    const amount = -Number(row.amount_minor || 0);
    if (!row.kind || !amount) return [];
    if (row.kind === "chargeback_reserve") {
      return [{
        kind: "platform_cost",
        party_type: "platform" as const,
        party_id: null,
        component: "appeal",
        amount_minor: amount,
      }];
    }
    return [{
      kind: row.kind,
      party_type: row.party_type,
      party_id: row.party_id,
      component: row.component || "",
      amount_minor: amount,
    }];
  });
}

/** After delivery, a refund reduces what each party was already granted. */
export function refundUnwindLines(input: {
  orderId: string;
  merchantId: string | null;
  courierId: string | null;
  foodMinor: number;
  courierMinor: number;
  platformMinor: number;
}): JournalLine[] {
  const lines: JournalLine[] = [
    { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: -(input.foodMinor + input.courierMinor + input.platformMinor) },
  ];
  if (input.foodMinor) {
    lines.push({ kind: "merchant_payable", party_type: "merchant", party_id: input.merchantId, component: "food", amount_minor: input.foodMinor });
  }
  if (input.courierMinor) {
    lines.push({ kind: "courier_earnings", party_type: "courier", party_id: input.courierId, component: "delivery", amount_minor: input.courierMinor });
  }
  if (input.platformMinor) {
    lines.push({ kind: "platform_revenue", party_type: "platform", party_id: null, component: "fees", amount_minor: input.platformMinor });
  }
  const sum = lines.reduce((total, line) => total + line.amount_minor, 0);
  if (sum !== 0) {
    lines.push({ kind: "platform_cost", party_type: "platform", party_id: null, component: "refund_rounding", amount_minor: -sum });
  }
  return lines.filter((line) => line.amount_minor !== 0);
}
