/** The only way an order becomes cancelled. */
import { quoteCancel, type CancelQuote } from "../../_shared/rushMoney/cancelPolicy.ts";
import { codShortLines, settleLines } from "../../_shared/rushMoney/journalLines.ts";
import { postRushJournal, publicJournalClient, type JournalRpc } from "../../_shared/rushMoney/postJournal.ts";
import { reverseOrderOutputTax } from "../../_shared/gctLedger.ts";
import { notifyCustomerOrderStatus } from "../../_shared/dashOrderSms.ts";
import { maybeClawbackGrowthGuarantee } from "../growthGuarantee.ts";
import { orchestrateSystemOrderRefund } from "../admin/orderRefund.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };

const ORDER_FIELDS = "id, status, payment_status, payment_method, total, picked_up_at, courier_id, merchant_id, customer_id, policy_version, platform_fee, service_fee, processing_fee, delivery_fee, tip, courier_tip_net, subtotal, discount, merchant_commission_amount, delivery_fee_platform_amount, delivery_fee_courier_amount, peak_pay_amount, tax_food_jmd, tax_platform_jmd, small_order_fee";

export async function cancelOrder(
  sb: Sb,
  input: {
    orderId: string;
    actor: "customer" | "merchant" | "courier" | "admin" | "system";
    reason: string;
    actorId?: string | null;
    protocolValidated?: boolean;
  },
): Promise<{ ok: true; order: Record<string, unknown>; quote: CancelQuote; review?: boolean } | { ok: false; status: number; error: string }> {
  const { data: order } = await sb.from("orders").select(ORDER_FIELDS).eq("id", input.orderId).maybeSingle();
  if (!order) return { ok: false, status: 404, error: "Order not found" };
  if (String(order.status) === "cancelled" && order.policy_version) {
    return { ok: true, order, quote: quoteCancel({ order, actor: input.actor, reason: input.reason, protocolValidated: input.protocolValidated }) };
  }
  if (["delivered", "completed"].includes(String(order.status))) {
    return { ok: false, status: 409, error: "A delivered order is handled as a refund, not a cancel" };
  }

  const tender = String(order.payment_method || "") === "cash" ? "cod" : "card";
  const quote = quoteCancel({
    order,
    actor: input.actor,
    reason: input.reason,
    protocolValidated: input.protocolValidated,
    tender,
  });

  if (quote.redispatch) {
    return { ok: true, order, quote, review: false };
  }

  if (quote.customerDebtJmd > 0 && order.customer_id) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true })
      .eq("customer_id", order.customer_id)
      .eq("failed_delivery_outcome", "customer_unreachable")
      .gte("cancelled_at", since);
    if ((count || 0) >= 2) {
      await sb.from("order_events").insert({
        order_id: input.orderId,
        status: "issue_reported",
        actor_type: input.actor,
        actor_id: input.actorId ?? null,
        notes: "review:failed_delivery_cap",
      });
      return { ok: false, status: 409, error: "A person will review this. The customer was not refunded." };
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await sb.from("orders").update({
    status: "cancelled",
    cancelled_at: now,
    cancelled_by: input.actor,
    cancellation_reason: input.reason,
    cancel_stage: quote.stage,
    fault: quote.fault,
    policy_version: quote.policyVersion,
    failed_delivery_outcome: quote.customerDebtJmd > 0 ? "customer_unreachable" : null,
    updated_at: now,
  }).eq("id", input.orderId).neq("status", "cancelled").select().maybeSingle();
  if (error || !updated) return { ok: false, status: 409, error: error?.message || "This order was already updated" };

  if (tender === "card" && ["paid", "refund_pending"].includes(String(order.payment_status || "")) && quote.customerRefundJmd > 0) {
    await orchestrateSystemOrderRefund({
      orderId: input.orderId,
      reason: input.reason,
      initiatedBy: input.actor === "customer" ? "customer" : "system",
      actorId: input.actorId,
      idempotencyKey: `cancel:${input.orderId}`,
      amount: quote.customerRefundJmd,
    });
  }

  const books = publicJournalClient() as unknown as JournalRpc;
  const journalBase = {
    p_order_id: input.orderId,
    p_correlation_id: null,
    p_actor_type: input.actor,
    p_actor_id: input.actorId ?? null,
    p_reason: quote.summary,
    p_evidence: {},
    p_policy_version: quote.policyVersion,
  };
  const paidCard = tender === "card" && ["paid", "refund_pending"].includes(String(order.payment_status || ""));
  let clearingLeft = paidCard
    ? Math.max(0, Math.round((Number(order.total || 0) - quote.customerRefundJmd) * 100))
    : 0;
  const fundPay = (payMinor: number) => {
    const fromClearing = Math.min(clearingLeft, payMinor);
    clearingLeft -= fromClearing;
    const fromRoam = payMinor - fromClearing;
    const lines: Array<Record<string, unknown>> = [];
    if (fromClearing > 0) {
      lines.push({ kind: "order_clearing", party_type: "order", party_id: input.orderId, component: "holding", amount_minor: fromClearing });
    }
    if (fromRoam > 0) {
      lines.push({ kind: "platform_cost", party_type: "platform", party_id: null, component: "cancel", amount_minor: fromRoam });
    }
    return lines;
  };
  const keepCard = tender === "card"
    && quote.customerRefundJmd === 0
    && quote.merchantReceivesJmd > 0
    && ["paid", "refund_pending"].includes(String(order.payment_status || ""));
  if (keepCard) {
    await postRushJournal(books, {
      ...journalBase,
      p_idempotency_key: `cancel-keep:${input.orderId}`,
      p_event_type: "cancel_keep",
      p_lines: settleLines(order, input.orderId, Number(order.total || 0)),
    });
  } else if (quote.courierReceivesJmd > 0 && order.courier_id) {
    const minor = Math.round(quote.courierReceivesJmd * 100);
    const restaurantPays = quote.fault === "merchant" && order.merchant_id;
    await postRushJournal(books, {
      ...journalBase,
      p_idempotency_key: `cancel-courier:${input.orderId}`,
      p_event_type: "cancel_courier_pay",
      p_lines: restaurantPays
        ? [
          { kind: "merchant_payable", party_type: "merchant", party_id: order.merchant_id, component: "food", amount_minor: minor },
          { kind: "courier_earnings", party_type: "courier", party_id: order.courier_id, component: "delivery", amount_minor: -minor },
        ]
        : [
          ...fundPay(minor),
          { kind: "courier_earnings", party_type: "courier", party_id: order.courier_id, component: "delivery", amount_minor: -minor },
        ],
    });
  }

  if (!keepCard && quote.merchantReceivesJmd > 0 && order.merchant_id && (quote.customerRefundJmd > 0 || tender === "cod")) {
    const minor = Math.round(quote.merchantReceivesJmd * 100);
    await postRushJournal(books, {
      ...journalBase,
      p_idempotency_key: `cancel-merchant:${input.orderId}`,
      p_event_type: "cancel_merchant_pay",
      p_lines: tender === "cod"
        ? [
          { kind: "cod_clearing", party_type: "order", party_id: input.orderId, component: "collected", amount_minor: minor },
          { kind: "merchant_payable", party_type: "merchant", party_id: order.merchant_id, component: "food", amount_minor: -minor },
        ]
        : [
          ...fundPay(minor),
          { kind: "merchant_payable", party_type: "merchant", party_id: order.merchant_id, component: "food", amount_minor: -minor },
        ],
    });
  }

  const { data: walletFlag } = await publicJournalClient().schema("rush_money").from("runtime_flags").select("enabled").eq("key", "wallet_live").maybeSingle();
  if (quote.customerDebtJmd > 0 && order.customer_id && walletFlag?.enabled) {
    await postRushJournal(books, {
      ...journalBase,
      p_idempotency_key: `cancel-debt:${input.orderId}`,
      p_event_type: "wallet_debt",
      p_lines: codShortLines(String(order.customer_id), input.orderId, quote.customerDebtJmd),
    });
  }

  const priorStatus = String(order.status || "");
  const courierId = order.courier_id ? String(order.courier_id) : null;
  if (courierId) {
    await sb.from("courier_availability").update({ active_order_id: null }).eq("driver_id", courierId);
    await sb.from("courier_stack_legs").update({
      leg_status: "completed",
      completed_at: now,
    }).eq("courier_id", courierId).eq("order_id", input.orderId).eq("leg_status", "active");
  }
  await sb.from("courier_availability").update({ active_order_id: null }).eq("active_order_id", input.orderId);
  await sb.from("orders").update({ courier_compensation_amount: quote.courierReceivesJmd }).eq("id", input.orderId);
  await reverseOrderOutputTax(sb, input.orderId);
  try {
    await maybeClawbackGrowthGuarantee(sb, { orderId: input.orderId, priorStatus });
  } catch (e) {
    console.error("[gg-clawback] cancel", e);
  }
  await notifyCustomerOrderStatus(sb, input.orderId, "cancelled");
  const skippedProtocol = Boolean(order.picked_up_at)
    && input.protocolValidated !== true
    && /unavailable|wrong_address|address/.test(input.reason.toLowerCase());
  if (skippedProtocol) {
    await publicJournalClient().schema("risk").from("cases").insert({
      party_type: "order",
      party_id: input.orderId,
      reason_code: "failed_delivery_protocol_skipped",
      status: "open",
    });
  }

  await sb.from("order_events").insert({
    order_id: input.orderId,
    status: "cancelled",
    actor_type: input.actor,
    actor_id: input.actorId ?? null,
    notes: quote.summary,
  });

  return { ok: true, order: updated, quote };
}
