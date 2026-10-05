/**
 * One refund row, retried by id. The ledger is written only after WiPay confirms.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isWipayDemoMode } from "../wipayDemo.ts";
import { assertRefundAmount, refundableRemaining, orderRefundState, type RefundSlice } from "./refundEligibility.ts";
import { refundUnwindLines } from "./journalLines.ts";
import { merchantFundedAmount, reverseSplit } from "./reverseSplit.ts";

function paymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

function deliveryDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function publicDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function duplicateRefundKind(
  refund: { idempotency_key?: string | null; reason?: string | null },
  txn: { status?: string },
): "primary" | "duplicate" {
  const key = String(refund.idempotency_key || "");
  const reason = String(refund.reason || "").toLowerCase();
  if (key.startsWith("dup-capture:") || key.startsWith("late-capture:")) return "duplicate";
  if (String(txn.status || "") === "duplicate_superseded") return "duplicate";
  if (reason.includes("duplicate capture") || reason.includes("late or cancelled")) return "duplicate";
  return "primary";
}

async function postRefundJournal(orderId: string, amountMajor: number, refundId: string, courierAtFault: boolean, merchantAtFault: boolean) {
  const minor = Math.round(amountMajor * 100);
  if (minor <= 0) return;
  const delivery = deliveryDb();
  const { data: order } = await delivery.from("orders").select("money_state, merchant_id, courier_id, total, platform_fee, service_fee, processing_fee, delivery_fee, tip, courier_tip_net, subtotal, discount, merchant_commission_amount, delivery_fee_platform_amount, delivery_fee_courier_amount, peak_pay_amount, tax_food_jmd, tax_platform_jmd, small_order_fee").eq("id", orderId).maybeSingle();
  const settled = order && ["settled", "partially_refunded", "collected", "short_collected"].includes(String(order.money_state || ""));
  let lines = [
    { kind: "order_clearing", party_type: "order", party_id: orderId, component: "holding", amount_minor: minor },
    { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: -minor },
  ];
  if (settled && order) {
    const parts = reverseSplit({
      order,
      captureAmount: Number(order.total || amountMajor),
      refundAmount: amountMajor,
      courierAtFault,
      merchantAtFault,
    });
    const food = Math.round(merchantFundedAmount(parts) * 100);
    const courier = Math.round(parts.filter((line) => line.fundedBy === "courier").reduce((sum, line) => sum + line.amountJmd, 0) * 100);
    const platform = Math.max(0, minor - food - courier);
    lines = refundUnwindLines({
      orderId,
      merchantId: order.merchant_id ? String(order.merchant_id) : null,
      courierId: order.courier_id ? String(order.courier_id) : null,
      foodMinor: food,
      courierMinor: courier,
      platformMinor: platform,
    });
  }
  const { error } = await publicDb().rpc("rush_post_journal", {
    p_idempotency_key: `refund:${refundId}`,
    p_event_type: "refund_succeeded",
    p_order_id: orderId,
    p_correlation_id: refundId,
    p_lines: lines,
    p_actor_type: "system",
    p_reason: "Refund confirmed",
    p_evidence: {},
    p_policy_version: null,
  });
  if (error) console.error("[rush-money] refund journal", error.message);
}

async function markOrderRefunded(orderId: string, full: boolean) {
  const next = full ? "refunded" : "partially_refunded";
  await deliveryDb().from("orders").update({
    payment_status: next,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  const { error } = await publicDb().rpc("rush_transition_money_state", {
    p_order_id: orderId,
    p_to: next,
  });
  if (error) console.error("[rush-money] refund state", error.message);
}

export async function executeRefundById(refundId: string): Promise<{
  ok: boolean;
  status: string;
  error?: string;
  refund?: Record<string, unknown>;
}> {
  const pdb = paymentsDb();
  const { data: refund } = await pdb.from("refunds").select("*").eq("id", refundId).maybeSingle();
  if (!refund) return { ok: false, status: "missing", error: "Refund not found" };
  if (refund.status === "completed" || refund.status === "succeeded") {
    return { ok: true, status: "completed", refund };
  }

  const { data: txn } = await pdb.from("transactions").select("*").eq("id", refund.transaction_id).maybeSingle();
  if (!txn) return { ok: false, status: "failed", error: "Transaction not found" };

  if (refund.status === "submitted") {
    const age = Date.now() - new Date(String(refund.submitted_at || 0)).getTime();
    if (age < 15 * 60 * 1000) {
      return { ok: false, status: "submitted", error: "Refund is already being sent", refund };
    }
    await pdb.from("refunds").update({ status: "pending", last_error: "Retrying a stuck send" }).eq("id", refundId).eq("status", "submitted");
    refund.status = "pending";
  }

  const { data: siblings } = await pdb.from("refunds").select("id, amount, status").eq("transaction_id", refund.transaction_id);
  const room = refundableRemaining(Number(txn.amount) || 0, (siblings || []) as RefundSlice[], { ignoreRefundId: refundId });
  if (Number(refund.amount) > room + 0.001) {
    await pdb.from("refunds").update({
      status: "failed",
      last_error: "This charge was already refunded",
    }).eq("id", refundId);
    return { ok: false, status: "failed", error: "This charge was already refunded", refund };
  }

  const attempts = Number(refund.attempt_count || 0);
  if (attempts >= 8) {
    await pdb.from("refunds").update({ last_error: "Needs a person" }).eq("id", refundId);
    return { ok: false, status: "pending", error: "Refund needs a person", refund };
  }

  const { data: claimed } = await pdb.from("refunds").update({
    status: "submitted",
    attempt_count: attempts + 1,
    submitted_at: new Date().toISOString(),
  }).eq("id", refundId).eq("status", "pending").select().maybeSingle();
  if (!claimed) {
    return { ok: false, status: String(refund.status || "pending"), error: "Refund is already being sent", refund };
  }

  let providerRefundId: string | null = null;
  let providerError: string | undefined;

  if (isWipayDemoMode() || String(txn.provider_data?.demo || "") === "true" || txn.provider_data?.demo === true) {
    providerRefundId = `demo-refund-${refundId}`;
  } else if (String(txn.provider) === "wipay") {
    const refundUrl = Deno.env.get("WIPAY_REFUND_URL");
    const apiKey = Deno.env.get("WIPAY_API_KEY");
    if (!refundUrl || !apiKey) {
      providerError = "WiPay refund not configured";
      await pdb.from("refunds").update({ status: "pending", last_error: providerError }).eq("id", refundId);
      return { ok: false, status: "pending", error: providerError, refund };
    }
    const res = await fetch(refundUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": String(refund.idempotency_key || refundId),
      },
      body: JSON.stringify({
        transaction_id: txn.provider_transaction_id,
        amount: refund.amount,
        reason: refund.reason,
        idempotency_key: refund.idempotency_key || refundId,
      }),
    });
    const json = await res.json().catch(() => ({})) as { id?: string; refund_id?: string };
    if (!res.ok) {
      providerError = "WiPay refund failed";
      await pdb.from("refunds").update({ status: "pending", last_error: providerError }).eq("id", refundId);
      return { ok: false, status: "pending", error: providerError, refund };
    }
    providerRefundId = String(json.id || json.refund_id || refundId);
  } else {
    providerError = "Refund provider not supported";
    await pdb.from("refunds").update({ status: "failed", last_error: providerError }).eq("id", refundId);
    return { ok: false, status: "failed", error: providerError, refund };
  }

  const { data: updated } = await pdb.from("refunds").update({
    status: "completed",
    provider_refund_id: providerRefundId,
    completed_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", refundId).select().single();

  const orderId = String(refund.order_id || txn.order_id || "");
  if (orderId) {
    try {
      const { dualWriteDashPayment } = await import("../unifiedLedger/dualWriteDash.ts");
      const { data: order } = await deliveryDb().from("orders").select("merchant_id").eq("id", orderId).maybeSingle();
      await dualWriteDashPayment({
        transactionId: `refund:${refundId}`,
        orderId,
        merchantId: order?.merchant_id ? String(order.merchant_id) : null,
        amount: Number(refund.amount),
        currency: "JMD",
        kind: "order_refund",
      });
    } catch (e) {
      console.error("[rush-money] refund projection", e);
    }
    const fault = String((refund as { fault?: string }).fault || "");
    const primary = duplicateRefundKind(refund, txn) === "primary";
    await postRefundJournal(
      orderId,
      Number(refund.amount),
      refundId,
      primary && (fault === "courier" || fault === "courier_fault"),
      primary && (fault === "merchant" || fault === "merchant_fault"),
    );
    const kind = duplicateRefundKind(refund, txn);
    if (kind === "primary") {
      const { data: primary } = await pdb.from("transactions").select("id, amount")
        .eq("order_id", orderId).eq("status", "completed")
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const primaryId = String(primary?.id || txn.id);
      const { data: prior } = await pdb.from("refunds").select("amount, status")
        .eq("transaction_id", primaryId).in("status", ["completed", "succeeded"]);
      const refunded = (prior || []).reduce((sum, row) => sum + Number((row as { amount?: number }).amount || 0), 0);
      const next = orderRefundState({
        refundKind: "primary",
        primaryCaptured: Number(primary?.amount || txn.amount),
        primaryRefunded: refunded,
      });
      if (next !== "unchanged") await markOrderRefunded(orderId, next === "refunded");
    }
  }

  return { ok: true, status: "completed", refund: updated ?? refund };
}

export async function queueAndExecuteRefund(opts: {
  orderId: string;
  transactionId?: string;
  amount?: number | null;
  reason: string;
  fault?: string | null;
  initiatedBy: string;
  idempotencyKey: string;
}): Promise<{ ok: true; refund: Record<string, unknown>; payment_status: string; providerCompleted: boolean; providerError?: string } | { ok: false; status: number; error: string }> {
  const pdb = paymentsDb();
  const db = deliveryDb();

  const { data: existing } = await pdb.from("refunds").select("*").eq("idempotency_key", opts.idempotencyKey).maybeSingle();
  if (existing?.id) {
    const result = await executeRefundById(String(existing.id));
    return {
      ok: true,
      refund: result.refund ?? existing,
      payment_status: result.status === "completed" ? "refunded" : "refund_pending",
      providerCompleted: result.status === "completed",
      providerError: result.error,
    };
  }

  const { data: order } = await db.from("orders").select("id, payment_status").eq("id", opts.orderId).maybeSingle();
  if (!order) return { ok: false, status: 404, error: "Order not found" };
  const paymentStatus = String(order.payment_status || "");
  if (!["paid", "refund_pending", "partially_refunded"].includes(paymentStatus)) {
    return { ok: false, status: 400, error: `Cannot refund order with payment_status=${paymentStatus || "unknown"}` };
  }

  let transactionId = opts.transactionId;
  let captured = 0;
  if (!transactionId) {
    const { data: txn } = await pdb.from("transactions").select("id, amount").eq("order_id", opts.orderId).eq("status", "completed").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!txn?.id) return { ok: false, status: 400, error: "No completed payment transaction for this order" };
    transactionId = String(txn.id);
    captured = Number(txn.amount) || 0;
  } else {
    const { data: txn } = await pdb.from("transactions").select("id, amount").eq("id", transactionId).maybeSingle();
    if (!txn) return { ok: false, status: 404, error: "Transaction not found" };
    captured = Number(txn.amount) || 0;
  }

  const { data: prior } = await pdb.from("refunds").select("id, amount, status").eq("transaction_id", transactionId);
  const eligible = refundableRemaining(captured, (prior || []) as RefundSlice[]);
  const requested = opts.amount != null ? roundMoney(Number(opts.amount)) : eligible;
  const problem = assertRefundAmount(requested, eligible);
  if (problem) return { ok: false, status: 400, error: problem };

  const { data: inserted, error } = await pdb.from("refunds").insert({
    transaction_id: transactionId,
    order_id: opts.orderId,
    amount: requested,
    currency: "JMD",
    reason: opts.reason,
    fault: opts.fault ?? null,
    status: "pending",
    initiated_by: opts.initiatedBy,
    idempotency_key: opts.idempotencyKey,
  }).select().single();
  if (error || !inserted) return { ok: false, status: 500, error: error?.message || "Failed to queue refund" };

  await db.from("orders").update({ payment_status: "refund_pending", updated_at: new Date().toISOString() }).eq("id", opts.orderId);
  const result = await executeRefundById(String(inserted.id));
  return {
    ok: true,
    refund: result.refund ?? inserted,
    payment_status: result.status === "completed"
      ? (requested >= eligible - 0.001 ? "refunded" : "partially_refunded")
      : "refund_pending",
    providerCompleted: result.status === "completed",
    providerError: result.error,
  };
}

export type { SupabaseClient };
