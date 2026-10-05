/**
 * Versioned cancellation and fault rules.
 * Amounts are major JMD. Policy version is stamped on the order quote.
 */
import { computeDashCaptureSplit, type DashOrderFeeFields } from "../dashMoneySplit.ts";

export const POLICY_VERSION = "rush-money-2026-10-04";
export const CANCEL_FEE_JMD = 200;
export const REJECTION_FEE_AFTER = 5;
export const REJECTION_WINDOW_DAYS = 30;
export const CUSTOMER_FAULT_REVIEW_AFTER = 2;
export const AUTO_REFUND_CLAIM_CAP_JMD = 4000;
export const AUTO_REFUND_BUDGET_COUNT = 2;
export const AUTO_REFUND_BUDGET_JMD = 5000;
export const FINANCE_APPROVAL_JMD = 10000;
export const DEBT_BLOCK_ALL_ORDERS_JMD = 5000;
export const DEBT_BLOCK_ALL_ORDERS_DAYS = 30;
export const RETURN_FEE_JMD = 150;

export type CancelStage = "s1" | "s2a" | "s2b" | "s3" | "s4";
export type Fault = "customer" | "merchant" | "courier" | "platform" | "external" | "undetermined";
export type Tender = "card" | "cod";

export type PolicyOrder = DashOrderFeeFields & {
  status?: string | null;
  total?: number | null;
  picked_up_at?: string | null;
  courier_id?: string | null;
};

export type CancelQuote = {
  policyVersion: string;
  stage: CancelStage;
  fault: Fault;
  redispatch: boolean;
  customerRefundJmd: number;
  customerDebtJmd: number;
  merchantReceivesJmd: number;
  courierReceivesJmd: number;
  cancelFeeJmd: number;
  platformAbsorbsJmd: number;
  summary: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function stageFromStatus(status: string, pickedUpAt?: string | null): CancelStage {
  if (pickedUpAt || status === "picked_up") return "s3";
  if (status === "delivered" || status === "completed") return "s4";
  if (status === "placed") return "s1";
  if (status === "accepted") return "s2a";
  if (status === "preparing" || status === "ready" || status === "assigned") return "s2b";
  return "s2b";
}

export function merchantNet(order: PolicyOrder): number {
  return computeDashCaptureSplit(order, Number(order.total ?? 0)).merchantReceivable;
}

export function courierDeliveryShare(order: PolicyOrder): number {
  return Math.max(0, Number(order.delivery_fee_courier_amount ?? order.delivery_fee ?? 0));
}

export function quoteCancel(input: {
  order: PolicyOrder;
  actor: "customer" | "merchant" | "courier" | "admin" | "system";
  reason: string;
  protocolValidated?: boolean;
  tender?: Tender;
}): CancelQuote {
  const stage = stageFromStatus(String(input.order.status || "placed"), input.order.picked_up_at);
  const reason = input.reason.toLowerCase();
  const tender = input.tender ?? "card";
  const total = roundMoney(Math.max(0, Number(input.order.total ?? 0)));
  const food = merchantNet(input.order);
  const delivery = courierDeliveryShare(input.order);
  const assigned = Boolean(input.order.courier_id);
  const prePickupProblem = reason.includes("vehicle") || reason.includes("accident");

  let fault: Fault = "undetermined";
  if (input.actor === "customer") fault = "customer";
  else if (input.actor === "merchant") fault = "merchant";
  else if (reason.includes("restaurant") || reason.includes("closed") || reason.includes("stock")) fault = "merchant";
  else if (prePickupProblem || reason.includes("courier")) fault = "courier";
  else if (reason.includes("platform") || reason.includes("glitch")) fault = "platform";
  else if (input.actor === "courier") fault = "courier";
  else fault = "platform";

  const base: CancelQuote = {
    policyVersion: POLICY_VERSION,
    stage,
    fault,
    redispatch: false,
    customerRefundJmd: 0,
    customerDebtJmd: 0,
    merchantReceivesJmd: 0,
    courierReceivesJmd: 0,
    cancelFeeJmd: 0,
    platformAbsorbsJmd: 0,
    summary: "",
  };

  if (prePickupProblem && stage !== "s3" && stage !== "s4") {
    return { ...base, fault: "courier", redispatch: true, summary: "Hand this order to another courier. Nobody is charged." };
  }

  if (stage === "s1") {
    return { ...base, customerRefundJmd: total, summary: "Full refund. The restaurant has not started." };
  }

  if (stage === "s4") {
    return { ...base, summary: "This order was delivered. Use a dispute, not a cancel." };
  }

  if (fault === "merchant") {
    const courierPay = assigned ? delivery : 0;
    return {
      ...base,
      customerRefundJmd: total,
      merchantReceivesJmd: 0,
      courierReceivesJmd: courierPay,
      platformAbsorbsJmd: 0,
      summary: assigned
        ? "Full refund. The courier is paid by the restaurant."
        : "Full refund. The restaurant is not paid.",
    };
  }

  if (stage === "s2a" && fault === "customer") {
    const courierPay = assigned ? roundMoney(delivery * 0.5) : 0;
    return {
      ...base,
      customerRefundJmd: total,
      courierReceivesJmd: courierPay,
      platformAbsorbsJmd: courierPay,
      summary: assigned
        ? "Full refund. Roam pays the courier half the delivery share."
        : "Full refund.",
    };
  }

  if (stage === "s2b" && fault === "customer") {
    const courierPay = assigned ? delivery : 0;
    const fee = CANCEL_FEE_JMD;
    const refund = roundMoney(Math.max(0, total - food - courierPay - fee));
    return {
      ...base,
      customerRefundJmd: refund,
      merchantReceivesJmd: food,
      courierReceivesJmd: courierPay,
      cancelFeeJmd: fee,
      summary: `You get J$${refund.toFixed(2)} back. J$${food.toFixed(2)} covers food already started, J$${courierPay.toFixed(2)} covers the courier, and J$${fee.toFixed(2)} is the cancel fee.`,
    };
  }

  if (stage === "s3" && (reason.includes("unavailable") || reason.includes("wrong_address") || reason.includes("unreachable"))) {
    const validated = input.protocolValidated === true;
    if (!validated) {
      return {
        ...base,
        fault: "courier",
        customerRefundJmd: total,
        merchantReceivesJmd: food,
        summary: "The contact steps were not completed, so the customer is refunded in full.",
      };
    }
    const service = Math.max(0, Number(input.order.service_fee ?? input.order.platform_fee ?? 0));
    const debt = roundMoney(delivery + service);
    if (tender === "cod") {
      return {
        ...base,
        fault: "customer",
        customerRefundJmd: 0,
        customerDebtJmd: debt,
        merchantReceivesJmd: food,
        courierReceivesJmd: roundMoney(delivery + RETURN_FEE_JMD),
        summary: `Cash was not collected. The customer owes the delivery and service fee. The restaurant is paid for the food. The courier earns the delivery share plus a J$${RETURN_FEE_JMD} return fee.`,
      };
    }
    return {
      ...base,
      fault: "customer",
      customerRefundJmd: 0,
      merchantReceivesJmd: food,
      courierReceivesJmd: roundMoney(delivery + RETURN_FEE_JMD),
      summary: `No refund. The restaurant is paid for the food. The courier earns the delivery share plus a J$${RETURN_FEE_JMD} return fee.`,
    };
  }

  if (stage === "s3" && fault === "courier") {
    return {
      ...base,
      customerRefundJmd: total,
      merchantReceivesJmd: food,
      courierReceivesJmd: 0,
      platformAbsorbsJmd: roundMoney(Math.max(0, total - food)),
      summary: "Full refund. The restaurant is paid for food made. The courier is not paid.",
    };
  }

  if (fault === "platform") {
    return {
      ...base,
      customerRefundJmd: total,
      merchantReceivesJmd: food,
      courierReceivesJmd: assigned ? delivery : 0,
      platformAbsorbsJmd: total,
      summary: "Full refund. Roam covers the restaurant and the courier.",
    };
  }

  return {
    ...base,
    customerRefundJmd: stage === "s3" ? 0 : total,
    summary: stage === "s3" ? "No refund after pickup." : "Full refund.",
  };
}
