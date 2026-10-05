/** Component lines for a refund. Merchant food is computed directly, never as a leftover. */
import { computeDashCaptureSplit, type DashOrderFeeFields } from "../dashMoneySplit.ts";

export type SplitComponent =
  | "food"
  | "commission"
  | "delivery_courier"
  | "delivery_platform"
  | "service"
  | "processing"
  | "small_order"
  | "tip"
  | "peak"
  | "gct_food"
  | "gct_platform";

export type ReverseLine = {
  component: SplitComponent;
  amountJmd: number;
  fundedBy: "customer" | "merchant" | "courier" | "platform";
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}

/** Proportional component refund. Tips reverse only when the courier is at fault. */
export function reverseSplit(input: {
  order: DashOrderFeeFields;
  captureAmount: number;
  refundAmount: number;
  courierAtFault: boolean;
  /** Only a restaurant-fault refund takes the food share from the restaurant. */
  merchantAtFault?: boolean;
}): ReverseLine[] {
  const capture = Math.max(0, Number(input.captureAmount) || 0);
  const refund = Math.min(capture, Math.max(0, Number(input.refundAmount) || 0));
  const share = ratio(refund, capture || refund || 1);
  const order = input.order;
  const forward = computeDashCaptureSplit(order, capture);
  const food = forward.merchantReceivable;
  const commission = Math.max(0, Number(order.merchant_commission_amount ?? 0));
  const lines: ReverseLine[] = [
    { component: "food", amountJmd: roundMoney(food * share), fundedBy: input.merchantAtFault ? "merchant" : "platform" },
    { component: "commission", amountJmd: roundMoney(commission * share), fundedBy: "platform" },
    { component: "delivery_courier", amountJmd: roundMoney(Math.max(0, Number(order.delivery_fee_courier_amount ?? 0)) * share), fundedBy: "courier" },
    { component: "delivery_platform", amountJmd: roundMoney(Number(order.delivery_fee_platform_amount ?? 0) * share), fundedBy: "platform" },
    { component: "service", amountJmd: roundMoney(Math.max(0, Number(order.service_fee ?? order.platform_fee ?? 0)) * share), fundedBy: "platform" },
    { component: "processing", amountJmd: roundMoney(Math.max(0, Number(order.processing_fee ?? 0)) * share), fundedBy: "platform" },
    { component: "small_order", amountJmd: roundMoney(Math.max(0, Number(order.small_order_fee ?? 0)) * share), fundedBy: "platform" },
    { component: "tip", amountJmd: input.courierAtFault ? roundMoney(Math.max(0, Number(order.courier_tip_net ?? order.tip ?? 0)) * share) : 0, fundedBy: "courier" },
    { component: "peak", amountJmd: roundMoney(Math.max(0, Number(order.peak_pay_amount ?? 0)) * share), fundedBy: "platform" },
    { component: "gct_food", amountJmd: roundMoney(Math.max(0, Number(order.tax_food_jmd ?? 0)) * share), fundedBy: "platform" },
    { component: "gct_platform", amountJmd: roundMoney(Math.max(0, Number(order.tax_platform_jmd ?? 0)) * share), fundedBy: "platform" },
  ];
  return lines.filter((line) => line.amountJmd !== 0);
}

export function merchantFundedAmount(lines: ReverseLine[]): number {
  return roundMoney(lines.filter((line) => line.fundedBy === "merchant").reduce((sum, line) => sum + line.amountJmd, 0));
}
